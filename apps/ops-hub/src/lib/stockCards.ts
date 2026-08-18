import { db } from './serverClient'
import type { InventoryItemRow } from '@ocg/db'

/**
 * STOCK CARDS (§30) — Opening · In · Out · Closing, derived from the ledger.
 *
 * `inventory_stock_cards` is a VIEW over inventory_movements (migration 060), so
 * a stock card cannot be hand-edited and cannot drift from the ledger. This
 * module only reads it and folds it into period balances; it never writes.
 *
 * The opening balance for a window is computed by replaying every movement
 * BEFORE the window rather than trusting a stored figure, which is what makes
 * opening + in − out = closing verifiable instead of asserted.
 */

export interface StockCardRow {
  movement_id: string
  item_id: string
  item_name: string
  sku: string
  unit: string
  item_type: string
  brand_id: string | null
  store_id: string | null
  batch_number: string
  movement_date: string
  created_at: string
  direction: 'in' | 'out'
  quantity_in: number
  quantity_out: number
  recorded_balance: number
  running_balance: number
  reason: string
  reference: string
  source: string
  source_document_type: string
  source_document_id: string | null
  production_run_id: string | null
  actioned_by: string
  notes: string
}

export interface StockCardFilter {
  /** Brand ids the CALLER may see. null = unrestricted (founding admin). */
  allowed: string[] | null
  brandId?: string
  itemId?: string
  itemType?: string
  storeId?: string
  from?: string
  to?: string
  limit?: number
}

/** Never-matching sentinel: an empty permitted set must select nothing. */
const NO_BRAND = '00000000-0000-0000-0000-000000000000'

/**
 * The brand ids a query may read, given the caller's grant and an optional
 * filter. Returns null for "no brand restriction at all" (founding admin with
 * no filter). A requested brand can only ever NARROW the permitted set — asking
 * for a brand you do not hold returns the sentinel, not everything.
 */
export function scopedBrandIds(allowed: string[] | null, brandId?: string): string[] | null {
  if (allowed === null) return brandId ? [brandId] : null
  const ids = brandId ? allowed.filter((b) => b === brandId) : allowed
  return ids.length > 0 ? ids : [NO_BRAND]
}

/** Ledger lines within a window, newest first. */
export async function listStockCardRows(filter: StockCardFilter): Promise<StockCardRow[]> {
  const brands = scopedBrandIds(filter.allowed, filter.brandId)
  let q = db().from('inventory_stock_cards').select('*')
  if (brands !== null) q = q.in('brand_id', brands)
  if (filter.itemId) q = q.eq('item_id', filter.itemId)
  if (filter.itemType) q = q.eq('item_type', filter.itemType)
  if (filter.storeId) q = q.eq('store_id', filter.storeId)
  if (filter.from) q = q.gte('movement_date', filter.from)
  if (filter.to) q = q.lte('movement_date', filter.to)

  const { data, error } = await q
    .order('movement_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(filter.limit ?? 500)
  if (error) throw new Error(error.message)
  return ((data as StockCardRow[] | null) ?? []).map(normalise)
}

function normalise(r: StockCardRow): StockCardRow {
  return {
    ...r,
    quantity_in: Number(r.quantity_in ?? 0),
    quantity_out: Number(r.quantity_out ?? 0),
    recorded_balance: Number(r.recorded_balance ?? 0),
    running_balance: Number(r.running_balance ?? 0),
  }
}

export interface PeriodBalance {
  item_id: string
  item_name: string
  sku: string
  unit: string
  item_type: string
  brand_id: string | null
  opening: number
  quantity_in: number
  quantity_out: number
  closing: number
  /** inventory_items.quantity — the live figure the rest of the app reads. */
  current: number
  /** closing − current. Non-zero means the ledger and the item row disagree. */
  drift: number
  movements: number
  last_movement: string | null
  unit_value_ksh: number
  value_ksh: number
}

/**
 * Opening / In / Out / Closing per item for a window — the filterable balance
 * table management asked for.
 *
 * `drift` is deliberately surfaced rather than hidden: if the replayed ledger
 * closing does not equal `inventory_items.quantity`, somebody needs to know.
 */
export async function periodBalances(filter: StockCardFilter): Promise<PeriodBalance[]> {
  const from = filter.from
  const to = filter.to

  // Everything up to the end of the window, so one read serves both the
  // opening replay and the in-window totals.
  const rows = await listStockCardRows({ ...filter, from: undefined, to, limit: 20000 })

  const brands = scopedBrandIds(filter.allowed, filter.brandId)
  let itemQuery = db().from('inventory_items').select('*').eq('is_active', true)
  if (brands !== null) itemQuery = itemQuery.in('brand_id', brands)
  if (filter.itemId) itemQuery = itemQuery.eq('id', filter.itemId)
  if (filter.itemType) itemQuery = itemQuery.eq('item_type', filter.itemType)
  if (filter.storeId) itemQuery = itemQuery.eq('store_id', filter.storeId)
  const { data: itemRows } = await itemQuery
  const items = (itemRows as InventoryItemRow[] | null) ?? []

  const byItem = new Map<string, PeriodBalance>()
  const ensure = (r: { item_id: string; item_name?: string; sku?: string; unit?: string; item_type?: string; brand_id?: string | null }) => {
    let bal = byItem.get(r.item_id)
    if (!bal) {
      bal = {
        item_id: r.item_id,
        item_name: r.item_name ?? '',
        sku: r.sku ?? '',
        unit: r.unit ?? '',
        item_type: r.item_type ?? '',
        brand_id: r.brand_id ?? null,
        opening: 0, quantity_in: 0, quantity_out: 0, closing: 0,
        current: 0, drift: 0, movements: 0, last_movement: null,
        unit_value_ksh: 0, value_ksh: 0,
      }
      byItem.set(r.item_id, bal)
    }
    return bal
  }

  // Seed from the item master so a product with no movement in the window
  // still appears, with its opening balance intact.
  for (const item of items) {
    const bal = ensure({
      item_id: item.id, item_name: item.name, sku: item.sku,
      unit: item.unit, item_type: (item as { item_type?: string }).item_type, brand_id: item.brand_id,
    })
    bal.current = Number(item.quantity ?? 0)
    bal.unit_value_ksh = Number(item.unit_value_ksh ?? 0)
  }

  for (const row of rows) {
    const bal = ensure(row)
    const inWindow = !from || row.movement_date >= from
    if (inWindow) {
      bal.quantity_in += row.quantity_in
      bal.quantity_out += row.quantity_out
      bal.movements += 1
      if (!bal.last_movement || row.movement_date > bal.last_movement) bal.last_movement = row.movement_date
    } else {
      // Before the window → contributes to the opening balance.
      bal.opening += row.quantity_in - row.quantity_out
    }
  }

  for (const bal of byItem.values()) {
    bal.closing = bal.opening + bal.quantity_in - bal.quantity_out
    bal.drift = Number((bal.closing - bal.current).toFixed(3))
    bal.value_ksh = Number((bal.closing * bal.unit_value_ksh).toFixed(2))
  }

  return [...byItem.values()].sort((a, b) => a.item_name.localeCompare(b.item_name))
}

/** Totals across a balance set, for the header cards. */
export function summariseBalances(rows: PeriodBalance[]) {
  return rows.reduce(
    (acc, r) => ({
      items: acc.items + 1,
      opening: acc.opening + r.opening,
      quantity_in: acc.quantity_in + r.quantity_in,
      quantity_out: acc.quantity_out + r.quantity_out,
      closing: acc.closing + r.closing,
      value_ksh: acc.value_ksh + r.value_ksh,
      drifting: acc.drifting + (Math.abs(r.drift) > 0.001 ? 1 : 0),
    }),
    { items: 0, opening: 0, quantity_in: 0, quantity_out: 0, closing: 0, value_ksh: 0, drifting: 0 },
  )
}
