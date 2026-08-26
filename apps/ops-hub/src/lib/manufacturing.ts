import { db, nowIso, todayInEat, mintReference } from './serverClient'
import { recordStockMovement } from './inventory'
import { scopedBrandIds } from './stockCards'
import {
  validateFgTransfer, expectedFromBom, reconcileMaterial, suggestProduction,
  type ProductionSuggestion,
} from './manufacturingModel'
import { evaluateRequirementGroups } from './packagingCompatibility'
import type {
  InventoryItemRow, InventoryStoreRow, ProductionRunRow, ProductionRunMaterialRow,
  ProductionFgTransferRow, ProductionBomLineRow,
} from '@ocg/db'

// Canonical row types live in @ocg/db (migration 060). Re-exported here so
// callers import one name for the table and its accessors.
export type {
  InventoryStoreRow, ProductionRunRow, ProductionRunMaterialRow,
  ProductionFgTransferRow, ProductionBomLineRow,
}

// =============================================================================
// MANUFACTURING (§§19–28) — data access over migration 060.
//
// The pure rules live in manufacturingModel.ts and are unit-tested; this module
// only reads and writes. It NEVER creates a second stock ledger: every stock
// effect goes through recordStockMovement(), so quantity_after, the item's live
// quantity and the once-only partial indexes all keep working.
// =============================================================================

// ─── Stores ─────────────────────────────────────────────────────────────────

export async function listStores(allowed: string[] | null, brandId?: string): Promise<InventoryStoreRow[]> {
  const brands = scopedBrandIds(allowed, brandId)
  let q = db().from('inventory_stores').select('*').eq('active', true).order('name')
  if (brands !== null) q = q.in('brand_id', brands)
  const { data } = await q
  return (data as InventoryStoreRow[] | null) ?? []
}

export async function createStore(input: {
  brand_id: string | null
  name: string
  code?: string
  store_type?: string
  location?: string
  keeper_id?: string | null
  notes?: string
}): Promise<InventoryStoreRow> {
  if (!input.name.trim()) throw new Error('A store name is required.')
  const { data, error } = await db().from('inventory_stores').insert({
    brand_id: input.brand_id,
    name: input.name.trim(),
    code: input.code ?? '',
    store_type: input.store_type ?? 'general',
    location: input.location ?? '',
    keeper_id: input.keeper_id || null,
    notes: input.notes ?? '',
  }).select('*').single()
  if (error) throw new Error(error.message)
  return data as InventoryStoreRow
}

// ─── Bills of material ──────────────────────────────────────────────────────

export async function listBom(productItemId: string): Promise<ProductionBomLineRow[]> {
  const { data } = await db().from('production_bom_lines').select('*')
    .eq('product_item_id', productItemId).eq('active', true)
  return (data as ProductionBomLineRow[] | null) ?? []
}

export async function listBomForProducts(productItemIds: string[]): Promise<ProductionBomLineRow[]> {
  if (productItemIds.length === 0) return []
  const { data, error } = await db().from('production_bom_lines').select('*')
    .in('product_item_id', productItemIds).eq('active', true)
  if (error) throw new Error(error.message)
  return (data as ProductionBomLineRow[] | null) ?? []
}

export async function setBomLine(input: {
  product_item_id: string
  component_item_id: string
  quantity_per_unit: number
  unit?: string
  wastage_percent?: number
  notes?: string
  requirement_group?: string
  selection_mode?: 'all_required' | 'one_of'
  compatibility_status?: 'compatible' | 'preferred' | 'approved_alternative'
}): Promise<ProductionBomLineRow> {
  if (input.product_item_id === input.component_item_id) {
    throw new Error('A product cannot be a component of itself.')
  }
  if (!(Number(input.quantity_per_unit) > 0)) {
    throw new Error('Quantity per unit must be greater than zero.')
  }
  // One active line per (product, component) — the partial unique index — so an
  // edit updates rather than stacking a second line for the same component.
  const { data: existing } = await db().from('production_bom_lines').select('id')
    .eq('product_item_id', input.product_item_id)
    .eq('component_item_id', input.component_item_id)
    .eq('active', true).maybeSingle()

  const payload = {
    product_item_id: input.product_item_id,
    component_item_id: input.component_item_id,
    quantity_per_unit: Number(input.quantity_per_unit),
    unit: input.unit ?? '',
    wastage_percent: Number(input.wastage_percent ?? 0),
    notes: input.notes ?? '',
    requirement_group: input.requirement_group || `component-${input.component_item_id}`,
    selection_mode: input.selection_mode ?? 'all_required',
    compatibility_status: input.compatibility_status ?? 'compatible',
    active: true,
  }
  const q = existing
    ? db().from('production_bom_lines').update(payload).eq('id', (existing as { id: string }).id)
    : db().from('production_bom_lines').insert(payload)
  const { data, error } = await q.select('*').single()
  if (error) throw new Error(error.message)
  return data as ProductionBomLineRow
}

export async function deactivateBomLine(id: string): Promise<void> {
  // Deactivated, never deleted — historical runs still reference the formula.
  const { error } = await db().from('production_bom_lines').update({ active: false }).eq('id', id)
  if (error) throw new Error(error.message)
}

// ─── Production runs ────────────────────────────────────────────────────────

export async function listRuns(
  allowed: string[] | null,
  opts: { brandId?: string; status?: string; limit?: number } = {},
): Promise<ProductionRunRow[]> {
  const brands = scopedBrandIds(allowed, opts.brandId)
  let q = db().from('production_runs').select('*')
    .order('created_at', { ascending: false }).limit(opts.limit ?? 100)
  if (brands !== null) q = q.in('brand_id', brands)
  if (opts.status) q = q.eq('status', opts.status)
  const { data } = await q
  return (data as ProductionRunRow[] | null) ?? []
}

export async function getRun(id: string): Promise<ProductionRunRow | null> {
  const { data } = await db().from('production_runs').select('*').eq('id', id).maybeSingle()
  return (data as ProductionRunRow | null) ?? null
}

export async function createRun(input: {
  brand_id: string | null
  product_item_id: string
  planned_quantity: number
  unit?: string
  batch_number?: string
  supervisor_id?: string | null
  production_team?: string
  notes?: string
  created_by: string
}): Promise<ProductionRunRow> {
  if (!input.product_item_id) throw new Error('Choose the product being made.')
  if (!(Number(input.planned_quantity) > 0)) throw new Error('Planned quantity must be greater than zero.')

  const runRef = await mintReference('production_run', 'RUN-')
  const { data, error } = await db().from('production_runs').insert({
    run_ref: runRef,
    batch_number: input.batch_number ?? '',
    brand_id: input.brand_id,
    product_item_id: input.product_item_id,
    planned_quantity: Number(input.planned_quantity),
    unit: input.unit ?? 'pcs',
    supervisor_id: input.supervisor_id || null,
    production_team: input.production_team ?? '',
    status: 'planned',
    notes: input.notes ?? '',
    created_by: input.created_by,
  }).select('*').single()
  if (error) throw new Error(error.message)
  return data as ProductionRunRow
}

export async function listRunMaterials(runId: string): Promise<ProductionRunMaterialRow[]> {
  const { data } = await db().from('production_run_materials').select('*').eq('run_id', runId)
  return ((data as ProductionRunMaterialRow[] | null) ?? []).map((m) => ({
    ...m,
    expected_quantity: Number(m.expected_quantity ?? 0),
    issued_quantity: Number(m.issued_quantity ?? 0),
    returned_quantity: Number(m.returned_quantity ?? 0),
    consumed_quantity: Number(m.consumed_quantity ?? 0),
    waste_quantity: Number(m.waste_quantity ?? 0),
  }))
}

/**
 * Issue raw material / packaging to a run. This is the ONLY place production
 * consumes stock, and it deducts through the shared ledger — so an over-issue
 * is refused by recordStockMovement() rather than driving a store negative.
 *
 * Rows are created when the issue is FINALISED, never at planning time.
 */
export async function issueMaterials(input: {
  run_id: string
  lines: Array<{ item_id: string; quantity: number; expected_quantity?: number; unit?: string; notes?: string }>
  issued_by: string
  movement_date?: string
}): Promise<ProductionRunMaterialRow[]> {
  const run = await getRun(input.run_id)
  if (!run) throw new Error('Production run not found.')
  if (run.status === 'closed' || run.status === 'cancelled') {
    throw new Error(`This run is ${run.status} — materials can no longer be issued to it.`)
  }

  const out: ProductionRunMaterialRow[] = []
  for (const line of input.lines) {
    const qty = Number(line.quantity)
    if (!(qty > 0)) continue

    // Deduct first: if stock is short this throws and no material row is written.
    await recordStockMovement({
      item_id: line.item_id,
      direction: 'out',
      quantity: qty,
      movement_date: input.movement_date ?? todayInEat(),
      reason: `Issued to production ${run.run_ref}`,
      reference: run.run_ref,
      source: 'production_issue',
      production_run_id: run.id,
      batch_number: run.batch_number,
      recorded_by: input.issued_by,
    })

    const { data, error } = await db().from('production_run_materials').insert({
      run_id: run.id,
      item_id: line.item_id,
      expected_quantity: Number(line.expected_quantity ?? 0),
      issued_quantity: qty,
      unit: line.unit ?? '',
      notes: line.notes ?? '',
    }).select('*').single()
    if (error) throw new Error(error.message)
    out.push(data as ProductionRunMaterialRow)
  }

  await db().from('production_runs')
    .update({ status: 'materials_issued', started_at: run.started_at ?? nowIso(), updated_at: nowIso() })
    .eq('id', run.id)
  return out
}

/** Record what a run actually consumed, wasted and returned. */
export async function recordConsumption(input: {
  material_id: string
  consumed_quantity: number
  waste_quantity?: number
  returned_quantity?: number
  notes?: string
}): Promise<ProductionRunMaterialRow> {
  const { data, error } = await db().from('production_run_materials').update({
    consumed_quantity: Number(input.consumed_quantity),
    waste_quantity: Number(input.waste_quantity ?? 0),
    returned_quantity: Number(input.returned_quantity ?? 0),
    notes: input.notes ?? '',
  }).eq('id', input.material_id).select('*').single()
  if (error) throw new Error(error.message)
  return data as ProductionRunMaterialRow
}

/** Material reconciliation for a run — expected vs issued vs consumed. */
export async function reconcileRun(runId: string) {
  const materials = await listRunMaterials(runId)
  if (materials.length === 0) return []

  // item_type comes from the item master — §25 reconciles packaging separately
  // from raw ingredients, so the class has to travel with each material line.
  const { data } = await db().from('inventory_items').select('*')
    .in('id', materials.map((m) => m.item_id))
  const items = new Map(((data as InventoryItemRow[] | null) ?? []).map((i) => [i.id, i]))

  return materials.map((m) => {
    const item = items.get(m.item_id)
    return {
      material: m,
      item,
      ...reconcileMaterial({ ...m, item_type: item?.item_type ?? 'consumable' }),
    }
  })
}

// ─── Finished goods ─────────────────────────────────────────────────────────

export async function listFgTransfers(runId?: string, limit = 100): Promise<ProductionFgTransferRow[]> {
  let q = db().from('production_fg_transfers').select('*')
    .order('created_at', { ascending: false }).limit(limit)
  if (runId) q = q.eq('run_id', runId)
  const { data } = await q
  return (data as ProductionFgTransferRow[] | null) ?? []
}

/**
 * Move finished goods from production into the finished-goods store.
 *
 * §26: only ACCEPTED units reach available stock. Rejected units are recorded
 * on the transfer and never stocked. The transfer is created `draft` and posted
 * separately, so the once-only index on fg_transfer_id is the final guard
 * against a double post.
 */
export async function createFgTransfer(input: {
  run_id: string | null
  brand_id: string | null
  item_id: string
  produced_quantity: number
  accepted_quantity: number
  rejected_quantity?: number
  batch_number?: string
  unit?: string
  destination_store_id?: string | null
  source_store_id?: string | null
  supervisor?: string
  receiver?: string
  quality_approved_by?: string
  production_date?: string
  expiry_date?: string | null
  remarks?: string
}): Promise<ProductionFgTransferRow> {
  const accepted = Number(input.accepted_quantity)
  const transfer = {
    produced_quantity: Number(input.produced_quantity),
    accepted_quantity: accepted,
    rejected_quantity: Number(input.rejected_quantity ?? 0),
    transferred_quantity: accepted,
  }
  const problems = validateFgTransfer(transfer)
  if (problems.length > 0) throw new Error(problems.join(' '))

  const ref = await mintReference('fg_transfer', 'FGT-')
  const { data, error } = await db().from('production_fg_transfers').insert({
    transfer_ref: ref,
    run_id: input.run_id,
    brand_id: input.brand_id,
    item_id: input.item_id,
    batch_number: input.batch_number ?? '',
    ...transfer,
    unit: input.unit ?? 'pcs',
    source_store_id: input.source_store_id || null,
    destination_store_id: input.destination_store_id || null,
    supervisor: input.supervisor ?? '',
    receiver: input.receiver ?? '',
    quality_approved_by: input.quality_approved_by ?? '',
    production_date: input.production_date ?? todayInEat(),
    expiry_date: input.expiry_date || null,
    status: 'draft',
    remarks: input.remarks ?? '',
  }).select('*').single()
  if (error) throw new Error(error.message)
  return data as ProductionFgTransferRow
}

/** Post a finished-goods transfer to stock. Idempotent by construction: the
 *  status guard catches the ordinary case and the partial unique index on
 *  inventory_movements.fg_transfer_id catches a concurrent replay. */
export async function postFgTransfer(transferId: string, postedBy: string): Promise<ProductionFgTransferRow> {
  const { data: row } = await db().from('production_fg_transfers').select('*').eq('id', transferId).maybeSingle()
  if (!row) throw new Error('Transfer not found.')
  const transfer = row as ProductionFgTransferRow
  if (transfer.status === 'posted') throw new Error('This transfer has already been posted to stock.')

  const qty = Number(transfer.transferred_quantity)
  if (qty > 0) {
    await recordStockMovement({
      item_id: transfer.item_id,
      direction: 'in',
      quantity: qty,
      movement_date: transfer.production_date ?? todayInEat(),
      reason: 'Finished goods from production',
      reference: transfer.transfer_ref,
      source: 'production_output',
      production_run_id: transfer.run_id,
      fg_transfer_id: transfer.id,
      batch_number: transfer.batch_number,
      store_id: transfer.destination_store_id,
      recorded_by: postedBy,
    })
  }

  const { data, error } = await db().from('production_fg_transfers').update({
    status: 'posted', posted_by: postedBy, posted_at: nowIso(), updated_at: nowIso(),
  }).eq('id', transfer.id).select('*').single()
  if (error) throw new Error(error.message)

  if (transfer.run_id) {
    await db().from('production_runs').update({
      actual_quantity: transfer.accepted_quantity,
      rejected_quantity: transfer.rejected_quantity,
      status: 'completed',
      completed_at: nowIso(),
      updated_at: nowIso(),
    }).eq('id', transfer.run_id)
  }
  return data as ProductionFgTransferRow
}

// ─── Production planning (§28) ──────────────────────────────────────────────

/**
 * What to make next, per finished-goods SKU. Suggestions only — a manager
 * approves one into a real run; nothing here starts production by itself.
 */
export async function productionSuggestions(
  allowed: string[] | null,
  brandId?: string,
): Promise<Array<ProductionSuggestion & { item: InventoryItemRow }>> {
  const brands = scopedBrandIds(allowed, brandId)
  let q = db().from('inventory_items').select('*')
    .eq('is_active', true).eq('item_type', 'finished_good')
  if (brands !== null) q = q.in('brand_id', brands)
  const { data } = await q
  const items = (data as InventoryItemRow[] | null) ?? []

  return items
    .map((item) => {
      const i = item as InventoryItemRow & {
        minimum_stock?: number; maximum_stock?: number | null; production_threshold?: number
      }
      const onHand = Number(item.quantity ?? 0)
      return {
        item,
        ...suggestProduction({
          item_id: item.id,
          name: item.name,
          available_quantity: onHand,
          // Reservation and demand signals land here once the sales order book
          // exists (see the mapping report §8). Until then a suggestion is
          // driven purely by on-hand vs threshold, which is honest rather than
          // fabricated demand.
          reserved_quantity: 0,
          unfulfilled_order_quantity: 0,
          production_threshold: Number(i.production_threshold ?? i.minimum_stock ?? 0),
          recent_daily_sales: 0,
          lead_time_days: 0,
          open_production_quantity: 0,
        }),
      }
    })
    .filter((s) => s.suggestedQuantity > 0)
    .sort((a, b) => b.suggestedQuantity - a.suggestedQuantity)
}

/** Expected material requirement for a planned quantity, from the BOM. */
export async function bomRequirement(productItemId: string, quantity: number) {
  const lines = await listBom(productItemId)
  const itemIds = lines.map((l) => l.component_item_id)
  const { data } = itemIds.length > 0
    ? await db().from('inventory_items').select('*').in('id', itemIds)
    : { data: [] as InventoryItemRow[] }
  const byId = new Map(((data as InventoryItemRow[] | null) ?? []).map((i) => [i.id, i]))

  // expectedFromBom returns one figure per line, in order, including wastage.
  const expected = expectedFromBom(
    lines.map((l) => ({
      quantity_per_unit: Number(l.quantity_per_unit),
      wastage_percent: Number(l.wastage_percent ?? 0),
    })),
    Number(quantity),
  )

  const lineViews = lines.map((line, idx) => {
    const component = byId.get(line.component_item_id)
    const need = expected[idx] ?? 0
    const onHand = Number(component?.quantity ?? 0)
    return {
      line,
      component,
      expected: need,
      on_hand: onHand,
      // Negative = short. Surfaced so a run is not started against stock that
      // is not there; the issue itself is still refused by the ledger.
      shortfall: Number((onHand - need).toFixed(3)),
    }
  })

  return {
    lines: lineViews,
    groups: evaluateRequirementGroups(
      lines.map((line) => ({
        ...line,
        quantity_per_unit: Number(line.quantity_per_unit),
        wastage_percent: Number(line.wastage_percent ?? 0),
        requirement_group: line.requirement_group || `line:${line.id}`,
        selection_mode: line.selection_mode || 'all_required',
        compatibility_status: line.compatibility_status || 'compatible',
      })),
      [...byId.values()].map((component) => ({
        id: component.id,
        name: component.name,
        quantity: Number(component.quantity ?? 0),
        unit: component.base_unit || component.unit,
        packaging_role: component.packaging_role,
        is_active: component.is_active,
      })),
      Number(quantity),
    ),
  }
}
