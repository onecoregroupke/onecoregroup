import { db, nowIso } from './serverClient'
import type { InventoryItemRow, InventoryMovementRow } from '@ocg/db'
import { toBaseQuantity } from './inventoryIntegrity'
import { scopedBrandIds } from './stockCards'

// =============================================================================
// Inventory — per-brand stock registers with in/out movements. Every movement
// stores the post-movement quantity (`quantity_after`) and keeps the item's
// live quantity in sync, so the register is auditable line by line.
// Brand-scope enforcement (assertBrandInScope) is the API route's job.
// =============================================================================

/**
 * Active items, optionally narrowed to one brand.
 *
 * `brandId` can only ever NARROW what `allowed` already permits. The previous
 * form applied the brand filter INSTEAD of the allow-list, so a brand-scoped
 * user passing ?brand=<another-brand> read that brand's stock. scopedBrandIds()
 * intersects the two, and answers with the sentinel no-brand id when the
 * intersection is empty — so an out-of-scope request returns nothing rather
 * than everything (§30, §40.3).
 */
export async function listItems(allowed: string[] | null, brandId?: string): Promise<InventoryItemRow[]> {
  const brands = scopedBrandIds(allowed, brandId)
  let q = db()
    .from('inventory_items')
    .select('*')
    .eq('is_active', true)
    .order('category', { ascending: true })
    .order('name', { ascending: true })
  if (brands !== null) q = q.in('brand_id', brands)
  const { data } = await q
  return (data as InventoryItemRow[] | null) ?? []
}

/** Movements, newest first. `brandId` narrows within `allowed`, never past it. */
export async function listMovements(
  allowed: string[] | null,
  opts: { brandId?: string; itemId?: string; limit?: number } = {},
): Promise<InventoryMovementRow[]> {
  const brands = scopedBrandIds(allowed, opts.brandId)
  let q = db()
    .from('inventory_movements')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 100)
  if (opts.itemId) q = q.eq('item_id', opts.itemId)
  if (brands !== null) q = q.in('brand_id', brands)
  const { data } = await q
  return (data as InventoryMovementRow[] | null) ?? []
}

// Valid values for inventory_items.item_type (inventory_items_type_check, 060).
const ITEM_TYPES = ['raw_material', 'packaging', 'work_in_progress', 'finished_good', 'damaged', 'returned', 'sample', 'consumable'] as const
export type InventoryItemType = (typeof ITEM_TYPES)[number]

export async function createItem(input: {
  brand_id: string
  name: string
  sku?: string
  category?: string
  unit?: string
  quantity?: number
  unit_value_ksh?: number
  reorder_level?: number
  location?: string
  notes?: string
  recorded_by?: string
  // Canonical identity (§15) — classification, home store, and what the item
  // may be used for. All optional so the plain brand "New item" form keeps
  // working without every caller knowing the manufacturing model.
  item_type?: string
  store_id?: string | null
  purchasable?: boolean
  producible?: boolean
  sellable?: boolean
}): Promise<InventoryItemRow> {
  if (!input.brand_id) throw new Error('brand_id is required')
  if (!input.name?.trim()) throw new Error('Item name is required')
  const openingQty = Number(input.quantity ?? 0)
  const itemType: InventoryItemType = (ITEM_TYPES as readonly string[]).includes(input.item_type ?? '')
    ? (input.item_type as InventoryItemType)
    : 'consumable'
  const { data, error } = await db()
    .from('inventory_items')
    .insert({
      brand_id: input.brand_id,
      name: input.name.trim(),
      sku: input.sku ?? '',
      category: input.category ?? '',
      unit: input.unit || 'pcs',
      canonical_name: input.name.trim(),
      base_unit: input.unit || 'pcs',
      pack_size: 1,
      quantity: openingQty,
      unit_value_ksh: Number(input.unit_value_ksh ?? 0),
      reorder_level: Number(input.reorder_level ?? 0),
      location: input.location ?? '',
      notes: input.notes ?? '',
      item_type: itemType,
      store_id: input.store_id ?? null,
      purchasable: input.purchasable ?? (itemType !== 'finished_good'),
      producible: input.producible ?? (itemType === 'finished_good' || itemType === 'work_in_progress'),
      sellable: input.sellable ?? (itemType === 'finished_good'),
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  const item = data as InventoryItemRow

  // Opening stock is itself an auditable "in" movement.
  if (openingQty > 0) {
    await db().from('inventory_movements').insert({
      item_id: item.id,
      brand_id: item.brand_id,
      direction: 'in',
      quantity: openingQty,
      movement_unit: item.base_unit || item.unit,
      conversion_rate: 1,
      base_quantity: openingQty,
      effective_at: nowIso(),
      unit_value_ksh: item.unit_value_ksh,
      reason: 'Opening stock',
      source: 'manual',
      quantity_after: openingQty,
      recorded_by: input.recorded_by ?? '',
    })
  }
  return item
}

export interface RecordStockInput {
  item_id: string
  direction: 'in' | 'out'
  quantity: number
  unit_value_ksh?: number
  movement_date?: string
  reason?: string
  reference?: string
  source?: string
  purchase_id?: string | null
  notes?: string
  recorded_by: string
  // Source document (054). The *_item_id columns carry partial UNIQUE indexes,
  // so a re-posted goods receipt or issue note raises instead of double-moving
  // stock — the database, not application code, is the last line of defence.
  goods_receipt_id?: string | null
  receipt_item_id?: string | null
  goods_issue_id?: string | null
  issue_item_id?: string | null
  // Production (060) and field-sales custody (061). fg_transfer_id and
  // allocation_item_id also carry partial UNIQUE indexes, so a finished-goods
  // transfer or a weekly allocation line posts to stock exactly once.
  production_run_id?: string | null
  fg_transfer_id?: string | null
  allocation_id?: string | null
  allocation_item_id?: string | null
  // Sales (066). sales_invoice_item_id also carries a partial UNIQUE index, so
  // an invoice line moves finished goods out of stock exactly once.
  sales_invoice_id?: string | null
  sales_invoice_item_id?: string | null
  batch_number?: string
  store_id?: string | null
  movement_unit?: string
  conversion_rate?: number
  source_table?: string
  source_record_id?: string
  idempotency_key?: string
  approved_by?: string
  import_id?: string | null
}

/** Record a stock movement and update the item's live quantity. Stock-out
 *  cannot exceed what is on hand; stock-in with a unit value refreshes the
 *  item's valuation to the latest cost. Returns the movement + updated item. */
export async function recordStockMovement(
  input: RecordStockInput,
): Promise<{ movement: InventoryMovementRow; item: InventoryItemRow }> {
  const supabase = db()
  const qty = Number(input.quantity)
  if (!Number.isFinite(qty) || qty <= 0) throw new Error('Quantity must be greater than 0')
  const conversionRate = Number(input.conversion_rate ?? 1)
  const baseQty = toBaseQuantity(qty, conversionRate)

  if (input.idempotency_key) {
    const { data: replay } = await supabase
      .from('inventory_movements')
      .select('*')
      .eq('idempotency_key', input.idempotency_key)
      .maybeSingle()
    if (replay) {
      const { data: replayItem } = await supabase.from('inventory_items').select('*').eq('id', input.item_id).single()
      return { movement: replay as InventoryMovementRow, item: replayItem as InventoryItemRow }
    }
  }

  const { data: itemRow } = await supabase
    .from('inventory_items')
    .select('*')
    .eq('id', input.item_id)
    .maybeSingle()
  if (!itemRow) throw new Error('Inventory item not found')
  const item = itemRow as InventoryItemRow

  const current = Number(item.quantity ?? 0)
  const after = input.direction === 'in' ? current + baseQty : current - baseQty
  if (after < 0) {
    throw new Error(`Only ${current} ${item.base_unit || item.unit} of "${item.name}" in stock — cannot issue ${baseQty}.`)
  }

  const unitValue = input.unit_value_ksh != null && input.unit_value_ksh !== 0
    ? Number(input.unit_value_ksh)
    : Number(item.unit_value_ksh ?? 0)

  const { data: movementRow, error } = await supabase
    .from('inventory_movements')
    .insert({
      item_id: item.id,
      brand_id: item.brand_id,
      direction: input.direction,
      quantity: qty,
      movement_unit: input.movement_unit || item.base_unit || item.unit,
      conversion_rate: conversionRate,
      base_quantity: baseQty,
      effective_at: input.movement_date ? `${input.movement_date}T00:00:00.000Z` : nowIso(),
      unit_value_ksh: unitValue,
      movement_date: input.movement_date || nowIso().slice(0, 10),
      reason: input.reason ?? '',
      reference: input.reference ?? '',
      source: input.source ?? 'manual',
      source_table: input.source_table ?? '',
      source_record_id: input.source_record_id ?? '',
      idempotency_key: input.idempotency_key ?? '',
      approved_by: input.approved_by ?? '',
      import_id: input.import_id ?? null,
      purchase_id: input.purchase_id ?? null,
      goods_receipt_id: input.goods_receipt_id ?? null,
      receipt_item_id: input.receipt_item_id ?? null,
      goods_issue_id: input.goods_issue_id ?? null,
      issue_item_id: input.issue_item_id ?? null,
      production_run_id: input.production_run_id ?? null,
      fg_transfer_id: input.fg_transfer_id ?? null,
      allocation_id: input.allocation_id ?? null,
      allocation_item_id: input.allocation_item_id ?? null,
      sales_invoice_id: input.sales_invoice_id ?? null,
      sales_invoice_item_id: input.sales_invoice_item_id ?? null,
      batch_number: input.batch_number ?? '',
      store_id: input.store_id ?? item.store_id ?? null,
      quantity_after: after,
      recorded_by: input.recorded_by,
      notes: input.notes ?? '',
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)

  const patch: Record<string, unknown> = { quantity: after, updated_at: nowIso() }
  if (input.direction === 'in' && input.unit_value_ksh != null && Number(input.unit_value_ksh) > 0) {
    patch.unit_value_ksh = Number(input.unit_value_ksh)
  }
  const { data: updated } = await supabase
    .from('inventory_items')
    .update(patch)
    .eq('id', item.id)
    .select('*')
    .single()

  return {
    movement: movementRow as InventoryMovementRow,
    item: (updated as InventoryItemRow | null) ?? item,
  }
}
