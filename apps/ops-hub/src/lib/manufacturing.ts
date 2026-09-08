import { db, nowIso, mintReference } from './serverClient'
import { scopedBrandIds } from './stockCards'
import {
  expectedFromBom, reconcileMaterial, suggestProduction,
  validateProductionOutput,
  awaitingTransferQuantity,
  type ProductionSuggestion,
} from './manufacturingModel'
import { evaluateRequirementGroups } from './packagingCompatibility'
import {
  listProductionCustodyEvents,
  productionStateForItem,
  resolveProductionStore,
  type ProductionCustodyState,
} from './productionCustody'
import { toInventoryBaseQuantity } from './inventoryUnits'
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
// The pure rules live in manufacturingModel.ts and are unit-tested. This module
// records transformation and reconciliation. It never moves STORE stock:
// GIN/GTN authority stays in procurementChain.ts. Execution does, however,
// transform quantities already held in the separate Production custody ledger.
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
  run_type?: 'normal_production' | 'rework' | 'repackaging' | 'quality_recovery'
  run_reason?: string
  source_product_item_id?: string | null
  source_batch_number?: string
  source_custody?: string
  output_state?: 'bulk_wip' | 'packaged_output' | 'quality_hold' | 'rework'
  quality_incident_id?: string | null
}): Promise<ProductionRunRow> {
  if (!input.product_item_id) throw new Error('Choose the product being made.')
  if (!(Number(input.planned_quantity) > 0)) throw new Error('Planned quantity must be greater than zero.')
  if ((input.run_type ?? 'normal_production') !== 'normal_production') {
    if (!input.source_product_item_id) throw new Error('Choose the source product for this rework/repackaging run.')
    if (!input.run_reason?.trim()) throw new Error('Record the quality/rework reason.')
  }

  const validationIds = [input.product_item_id, input.source_product_item_id].filter(Boolean) as string[]
  const [{ data: itemRows, error: itemError }, { data: incident, error: incidentError }] = await Promise.all([
    db().from('inventory_items').select('id,brand_id,item_type').in('id', validationIds),
    input.quality_incident_id
      ? db().from('inventory_quality_incidents').select('id,brand_id,status').eq('id', input.quality_incident_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])
  if (itemError) throw new Error(itemError.message)
  if (incidentError) throw new Error(incidentError.message)
  const items = (itemRows as Array<{ id: string; brand_id: string | null; item_type: string }> | null) ?? []
  const product = items.find((item) => item.id === input.product_item_id)
  if (!product) throw new Error('Production output item not found.')
  if ((product.brand_id ?? null) !== (input.brand_id ?? null)) throw new Error('The production run and output item must belong to the same brand.')
  if (input.source_product_item_id) {
    const source = items.find((item) => item.id === input.source_product_item_id)
    if (!source || (source.brand_id ?? null) !== (input.brand_id ?? null)) {
      throw new Error('The rework source product must belong to the production run brand.')
    }
  }
  if (input.quality_incident_id && (!incident || (incident.brand_id ?? null) !== (input.brand_id ?? null))) {
    throw new Error('The linked quality incident must belong to the production run brand.')
  }
  if (input.quality_incident_id && incident?.status !== 'disposition_approved') {
    throw new Error('The linked quality incident needs an approved disposition before the run is created.')
  }

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
    run_type: input.run_type ?? 'normal_production',
    run_reason: input.run_reason ?? '',
    source_product_item_id: input.source_product_item_id || null,
    source_batch_number: input.source_batch_number ?? '',
    source_custody: input.source_custody ?? '',
    output_state: input.output_state ?? 'packaged_output',
    quality_incident_id: input.quality_incident_id || null,
  }).select('*').single()
  if (error) throw new Error(error.message)
  if (input.quality_incident_id) {
    const { error: linkError } = await db().from('inventory_quality_incidents').update({
      linked_run_id: data.id,
      updated_at: nowIso(),
    }).eq('id', input.quality_incident_id).is('linked_run_id', null)
    if (linkError) throw new Error(linkError.message)
  }
  return data as ProductionRunRow
}

/** Record what Production transformed. This never changes a store balance.
 * It creates Production output positions; a linked GTN later moves accepted
 * output from Production custody to the Finished Goods Store. */
export async function updateRunExecution(input: {
  run_id: string
  actual_quantity: number
  accepted_quantity: number
  rejected_quantity?: number
  waste_quantity?: number
  quality_result?: string
  quality_approved_by?: string
  expiry_date?: string | null
  notes?: string
  recorded_by: string
  recorded_by_id?: string | null
  production_store_id?: string | null
}): Promise<ProductionRunRow> {
  const run = await getRun(input.run_id)
  if (!run) throw new Error('Production run not found.')
  if (['closed', 'cancelled'].includes(run.status)) throw new Error(`This run is ${run.status}.`)
  const output = {
    produced_quantity: Number(input.actual_quantity),
    accepted_quantity: Number(input.accepted_quantity),
    rejected_quantity: Number(input.rejected_quantity ?? 0),
    waste_quantity: Number(input.waste_quantity ?? 0),
  }
  const problems = validateProductionOutput(output)
  if (problems.length > 0) throw new Error(problems.join(' '))
  if (output.waste_quantity > 0) {
    throw new Error('Put rejected output on Quality hold, then use an approved Quality Incident disposal. Run output cannot silently write stock off.')
  }
  if (!run.product_item_id) throw new Error('The run has no output SKU.')

  const { data: item, error: itemError } = await db().from('inventory_items').select('*').eq('id', run.product_item_id).single()
  if (itemError || !item) throw new Error(itemError?.message ?? 'Production output item not found.')
  const stock = item as InventoryItemRow
  const baseUnit = stock.base_unit || stock.unit || run.unit
  const remainingWip = output.produced_quantity - output.accepted_quantity - output.rejected_quantity
  const productionStoreId = await resolveProductionStore(run.brand_id, input.production_store_id)
  type OutputRpc = Promise<{ data: ProductionRunRow | null; error: { message: string } | null }>
  const call = db().rpc as unknown as (name: string, args: Record<string, unknown>) => OutputRpc
  const { data, error } = await call('post_production_run_output', {
    p_run_id: run.id,
    p_production_store_id: productionStoreId,
    p_actual_quantity: output.produced_quantity,
    p_accepted_quantity: output.accepted_quantity,
    p_rejected_quantity: output.rejected_quantity,
    p_wip_quantity: remainingWip,
    p_unit: run.unit,
    p_accepted_base_quantity: output.accepted_quantity > 0 ? toInventoryBaseQuantity(output.accepted_quantity, run.unit, baseUnit) : 0,
    p_rejected_base_quantity: output.rejected_quantity > 0 ? toInventoryBaseQuantity(output.rejected_quantity, run.unit, baseUnit) : 0,
    p_wip_base_quantity: remainingWip > 0 ? toInventoryBaseQuantity(remainingWip, run.unit, baseUnit) : 0,
    p_quality_result: input.quality_result ?? run.quality_result,
    p_quality_approved_by: input.quality_approved_by ?? run.quality_approved_by,
    p_expiry_date: input.expiry_date ?? run.expiry_date,
    p_notes: input.notes ?? run.notes,
    p_recorded_by: input.recorded_by,
    p_recorded_by_id: input.recorded_by_id ?? null,
  })
  if (error || !data) throw new Error(error?.message ?? 'Production output was not posted.')
  return data
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

/** Record what a run actually consumed. Unused material remains in Production;
 * returns require a GTN, and waste requires an approved Quality Incident. */
export async function recordConsumption(input: {
  material_id: string
  consumed_quantity: number
  waste_quantity?: number
  returned_quantity?: number
  notes?: string
  recorded_by: string
  recorded_by_id?: string | null
  production_store_id?: string | null
}): Promise<ProductionRunMaterialRow> {
  const { data: existing, error: existingError } = await db().from('production_run_materials')
    .select('*').eq('id', input.material_id).single()
  if (existingError || !existing) throw new Error(existingError?.message ?? 'Production material line not found.')
  const material = existing as ProductionRunMaterialRow
  const consumed = Number(input.consumed_quantity)
  const waste = Number(input.waste_quantity ?? 0)
  const returned = Number(input.returned_quantity ?? 0)
  if ([consumed, waste, returned].some((value) => value < 0)) throw new Error('Consumption quantities cannot be negative.')
  if (consumed + waste + returned > Number(material.issued_quantity) + 0.0001) {
    throw new Error('Consumed, wasted and returned quantities cannot exceed the amount issued to Production.')
  }
  if (waste > 0) throw new Error('Material waste requires an approved Quality Incident disposal; it cannot be written off from run reconciliation.')
  if (returned > 0) throw new Error('Return unused material with a Production → Store GTN; a run field cannot move custody.')
  if (material.consumption_posted_at) {
    const unchanged = Math.abs(Number(material.consumed_quantity) - consumed) < 0.0001
      && Math.abs(Number(material.waste_quantity) - waste) < 0.0001
      && Math.abs(Number(material.returned_quantity) - returned) < 0.0001
    if (!unchanged) throw new Error('Consumption is already posted. Use an auditable correcting event instead of overwriting it.')
    return material
  }
  const { data: item, error: itemError } = await db().from('inventory_items').select('*').eq('id', material.item_id).single()
  if (itemError || !item) throw new Error(itemError?.message ?? 'Material item not found.')
  const stock = item as InventoryItemRow
  const state = (material.production_state || productionStateForItem(stock)) as ProductionCustodyState
  const unit = material.unit || stock.base_unit || stock.unit
  const baseUnit = stock.base_unit || stock.unit || unit
  const productionStoreId = await resolveProductionStore(stock.brand_id, input.production_store_id)
  type ConsumptionRpc = Promise<{ data: ProductionRunMaterialRow | null; error: { message: string } | null }>
  const call = db().rpc as unknown as (name: string, args: Record<string, unknown>) => ConsumptionRpc
  const { data, error } = await call('post_production_material_consumption', {
    p_material_id: material.id,
    p_production_store_id: productionStoreId,
    p_consumed_quantity: consumed,
    p_base_quantity: consumed > 0 ? toInventoryBaseQuantity(consumed, unit, baseUnit) : 0,
    p_custody_state: state,
    p_event_kind: stock.item_type === 'packaging' ? 'packaging_consumption' : 'material_consumption',
    p_notes: input.notes ?? '',
    p_recorded_by: input.recorded_by,
    p_recorded_by_id: input.recorded_by_id ?? null,
  })
  if (error || !data) throw new Error(error?.message ?? 'Production consumption was not posted.')
  return data
}

/** Material reconciliation for a run — expected vs issued vs consumed. */
export async function reconcileRun(runId: string) {
  const [materials, custodyEvents] = await Promise.all([
    listRunMaterials(runId),
    listProductionCustodyEvents({ runId, limit: 500 }),
  ])
  if (materials.length === 0) return []

  // item_type comes from the item master — §25 reconciles packaging separately
  // from raw ingredients, so the class has to travel with each material line.
  const { data } = await db().from('inventory_items').select('*')
    .in('id', materials.map((m) => m.item_id))
  const items = new Map(((data as InventoryItemRow[] | null) ?? []).map((i) => [i.id, i]))

  return materials.map((m) => {
    const item = items.get(m.item_id)
    const returnedFromGtn = custodyEvents
      .filter((event) => event.item_id === m.item_id && event.event_kind === 'return_to_store' && event.direction === 'out')
      .reduce((sum, event) => sum + Number(event.quantity), 0)
    const reconciled = { ...m, returned_quantity: returnedFromGtn || m.returned_quantity }
    return {
      material: reconciled,
      item,
      ...reconcileMaterial({ ...reconciled, item_type: item?.item_type ?? 'consumable' }),
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

/** Authoritative run reconciliation. Material issues come only from posted
 * linked GIN lines; finished goods transferred come only from posted linked
 * GTNs. Legacy FGT rows are intentionally excluded and shown separately. */
export async function productionRunSummary(runId: string) {
  const run = await getRun(runId)
  if (!run) throw new Error('Production run not found.')
  const [bom, issuedRows, requisitions, issueDocs, transferDocs, custodyEvents, recoveredResult, lossResult] = await Promise.all([
    run.product_item_id ? listBom(run.product_item_id) : Promise.resolve([]),
    listRunMaterials(run.id),
    db().from('procurement_requisitions').select('id,reference,status')
      .eq('production_run_id', run.id).order('created_at', { ascending: true }),
    db().from('procurement_goods_issues').select('id,reference,document_number,status')
      .eq('production_run_id', run.id).eq('kind', 'issue').order('created_at', { ascending: true }),
    db().from('procurement_goods_issues').select('id,reference,document_number,status')
      .eq('production_run_id', run.id).eq('kind', 'transfer').eq('status', 'posted'),
    listProductionCustodyEvents({ runId: run.id, limit: 500 }),
    db().from('production_recovered_packaging').select('*').eq('production_run_id', run.id).order('created_at'),
    db().from('inventory_disposal_loss_events').select('*').eq('production_run_id', run.id).order('created_at'),
  ])
  const requisitionRows = (requisitions.data as Array<{ id: string; reference: string | null; status: string }> | null) ?? []
  const { data: requestedRows } = requisitionRows.length > 0
    ? await db().from('procurement_requisition_items').select('*').in('requisition_id', requisitionRows.map((row) => row.id))
    : { data: [] as Array<{ inventory_item_id: string | null; quantity_requested: number }> }
  const requested = (requestedRows as Array<{ inventory_item_id: string | null; quantity_requested: number }> | null) ?? []
  const materialIds = [...new Set([
    ...bom.map((line) => line.component_item_id),
    ...issuedRows.map((line) => line.item_id),
    ...requested.flatMap((line) => line.inventory_item_id ? [line.inventory_item_id] : []),
  ])]
  const { data: itemRows } = materialIds.length > 0
    ? await db().from('inventory_items').select('*').in('id', materialIds)
    : { data: [] as InventoryItemRow[] }
  const itemById = new Map(((itemRows as InventoryItemRow[] | null) ?? []).map((item) => [item.id, item]))
  const requestedByItem = new Map<string, number>()
  for (const line of requested) {
    if (line.inventory_item_id) requestedByItem.set(line.inventory_item_id, (requestedByItem.get(line.inventory_item_id) ?? 0) + Number(line.quantity_requested ?? 0))
  }
  const activityByItem = new Map<string, { issued: number; consumed: number; returned: number; waste: number; roles: Set<string> }>()
  for (const line of issuedRows) {
    const activity = activityByItem.get(line.item_id) ?? { issued: 0, consumed: 0, returned: 0, waste: 0, roles: new Set<string>() }
    activity.issued += Number(line.issued_quantity ?? 0)
    activity.consumed += Number(line.consumed_quantity ?? 0)
    activity.returned += Number(line.returned_quantity ?? 0)
    activity.waste += Number(line.waste_quantity ?? 0)
    activity.roles.add(line.material_role || 'material')
    activityByItem.set(line.item_id, activity)
  }
  const returnedByItem = new Map<string, number>()
  for (const event of custodyEvents.filter((event) => event.event_kind === 'return_to_store' && event.direction === 'out')) {
    returnedByItem.set(event.item_id, (returnedByItem.get(event.item_id) ?? 0) + Number(event.quantity ?? 0))
  }
  const expectedByItem = new Map<string, number>()
  for (const line of bom) {
    const expected = Number(line.quantity_per_unit ?? 0) * Number(run.planned_quantity ?? 0)
      * (1 + Number(line.wastage_percent ?? 0) / 100)
    expectedByItem.set(line.component_item_id, (expectedByItem.get(line.component_item_id) ?? 0) + expected)
  }
  const summaryItemIds = [...new Set([...materialIds, ...expectedByItem.keys(), ...activityByItem.keys(), ...requestedByItem.keys()])]
  const materialLines = summaryItemIds.map((itemId) => {
    const activity = activityByItem.get(itemId) ?? { issued: 0, consumed: 0, returned: 0, waste: 0, roles: new Set<string>() }
    const returned = returnedByItem.get(itemId) ?? activity.returned
    const remaining = activity.issued - activity.consumed - returned - activity.waste
    const expected = expectedByItem.get(itemId) ?? 0
    return {
      itemId,
      item: itemById.get(itemId),
      expected,
      requested: requestedByItem.get(itemId) ?? 0,
      issued: activity.issued,
      consumed: activity.consumed,
      returned,
      waste: activity.waste,
      remaining,
      roles: [...activity.roles],
      variance: activity.issued - expected,
    }
  })

  const docRows = (transferDocs.data as Array<{ id: string; reference: string | null; document_number: string; status: string }> | null) ?? []
  const transferred = custodyEvents
    .filter((event) => event.direction === 'out' && event.event_kind === 'gtn_transfer')
    .reduce((sum, event) => sum + Number(event.base_quantity ?? 0), 0)
  const outputRemaining = custodyEvents.reduce((sum, event) => {
    if (!['run_output', 'gtn_transfer', 'disposal'].includes(event.event_kind)) return sum
    return sum + (event.direction === 'in' ? Number(event.base_quantity ?? 0) : -Number(event.base_quantity ?? 0))
  }, 0)
  const qualityHold = custodyEvents.reduce((sum, event) => {
    if (event.custody_state !== 'quality_hold' || !['run_output', 'disposal', 'state_transfer'].includes(event.event_kind)) return sum
    return sum + (event.direction === 'in' ? Number(event.base_quantity ?? 0) : -Number(event.base_quantity ?? 0))
  }, 0)
  const losses = (lossResult.data as Array<{ id: string; item_id: string; quantity: number; unit: string; loss_value_ksh: number; reason: string }> | null) ?? []
  const recovered = (recoveredResult.data as Array<{ id: string; component_item_id: string; component_kind: string; quantity: number; unit: string; condition_status: string }> | null) ?? []
  return {
    run,
    materials: materialLines,
    transferred,
    awaitingTransfer: awaitingTransferQuantity(Number(run.accepted_quantity ?? 0), transferred),
    outputRemaining,
    qualityHold,
    losses,
    recovered,
    custodyEvents,
    mrfs: requisitionRows,
    gins: (issueDocs.data as Array<{ id: string; reference: string | null; document_number: string; status: string }> | null) ?? [],
    gtns: docRows,
  }
}
