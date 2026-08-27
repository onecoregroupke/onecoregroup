import type {
  InventoryItemRow,
  InventoryMovementRow,
  InventoryStockCountItemRow,
  InventoryStockCountRow,
  InventoryStoreRow,
} from '@ocg/db'
import { assertBrandInScope } from './finance'
import { recordStockMovement } from './inventory'
import {
  buildStockTakeAdjustment,
  STOCK_TAKE_REASON_CODES,
  stockTakeVariance,
  validateStockTakeForPosting,
} from './inventoryStockTakeModel'
import { db, mintReference, nowIso, todayInEat } from './serverClient'
import { scopedBrandIds } from './stockCards'

export interface StockTakeLine extends InventoryStockCountItemRow {
  item: InventoryItemRow
  estimated_cost_impact_ksh: number
  retail_sales_impact_ksh: number
  wholesale_sales_impact_ksh: number
}

export interface StockTakeDetail {
  count: InventoryStockCountRow
  store: InventoryStoreRow | null
  lines: StockTakeLine[]
  movements: InventoryMovementRow[]
  summary: StockTakeSummary
  unsafeMovementCount: number
}

export interface StockTakeSummary {
  total: number
  counted: number
  exact: number
  positive: number
  negative: number
  missing: number
  material: number
  estimatedCostImpactKsh: number
  retailSalesImpactKsh: number
  wholesaleSalesImpactKsh: number
}

export async function listStores(allowed: string[] | null, brandId?: string): Promise<InventoryStoreRow[]> {
  const brands = scopedBrandIds(allowed, brandId)
  let q = db().from('inventory_stores').select('*').eq('active', true).order('store_type').order('name')
  if (brands !== null) q = q.in('brand_id', brands)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data as InventoryStoreRow[] | null) ?? []
}

export async function listStockCounts(allowed: string[] | null, opts: { brandId?: string; storeId?: string; limit?: number } = {}): Promise<InventoryStockCountRow[]> {
  const brands = scopedBrandIds(allowed, opts.brandId)
  let q = db()
    .from('inventory_stock_counts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 40)
  if (brands !== null) q = q.in('brand_id', brands)
  if (opts.storeId) q = q.eq('store_id', opts.storeId)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data as InventoryStockCountRow[] | null) ?? []
}

export async function getStockTakeDetail(allowed: string[] | null, countId: string): Promise<StockTakeDetail> {
  const supabase = db()
  const { data: countRow, error: countError } = await supabase
    .from('inventory_stock_counts')
    .select('*')
    .eq('id', countId)
    .maybeSingle()
  if (countError) throw new Error(countError.message)
  if (!countRow) throw new Error('Stock take not found')
  const count = countRow as InventoryStockCountRow
  if (count.brand_id) assertBrandInScope(count.brand_id, allowed, 'view stock take')

  const [{ data: storeRow }, { data: lineRows }, { data: movementRows }] = await Promise.all([
    count.store_id
      ? supabase.from('inventory_stores').select('*').eq('id', count.store_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('inventory_stock_count_items').select('*').eq('count_id', count.id).order('created_at'),
    supabase.from('inventory_movements').select('*').eq('stock_count_id', count.id).order('created_at'),
  ])

  const rawLines = (lineRows as InventoryStockCountItemRow[] | null) ?? []
  const itemIds = rawLines.map((line) => line.item_id)
  const { data: itemRows } = itemIds.length
    ? await supabase.from('inventory_items').select('*').in('id', itemIds)
    : { data: [] }
  const items = new Map(((itemRows as InventoryItemRow[] | null) ?? []).map((item) => [item.id, item]))
  const lines = rawLines.flatMap((line) => {
    const item = items.get(line.item_id)
    if (!item) return []
    const variance = stockTakeVariance(Number(line.expected_quantity), line.counted_quantity == null ? null : Number(line.counted_quantity))
    return [{
      ...line,
      expected_quantity: Number(line.expected_quantity),
      counted_quantity: line.counted_quantity == null ? null : Number(line.counted_quantity),
      variance_quantity: Number(line.variance_quantity),
      expected_unit_value_ksh: Number(line.expected_unit_value_ksh ?? 0),
      expected_retail_price_ksh: Number(line.expected_retail_price_ksh ?? 0),
      expected_wholesale_price_ksh: Number(line.expected_wholesale_price_ksh ?? 0),
      item,
      estimated_cost_impact_ksh: round2(variance * Number(line.expected_unit_value_ksh ?? 0)),
      retail_sales_impact_ksh: round2(variance * Number(line.expected_retail_price_ksh ?? 0)),
      wholesale_sales_impact_ksh: round2(variance * Number(line.expected_wholesale_price_ksh ?? 0)),
    }]
  })
  const unsafeMovementCount = count.frozen_at ? (await movementsAfterFreeze(count, rawLines)).length : 0

  return {
    count,
    store: (storeRow as InventoryStoreRow | null) ?? null,
    lines,
    movements: (movementRows as InventoryMovementRow[] | null) ?? [],
    summary: summarise(lines),
    unsafeMovementCount,
  }
}

export async function startStockTake(input: {
  store_id: string
  effective_date?: string
  notes?: string
  counted_by: string
  allowed: string[] | null
}): Promise<InventoryStockCountRow> {
  const supabase = db()
  const { data: storeRow } = await supabase.from('inventory_stores').select('*').eq('id', input.store_id).maybeSingle()
  if (!storeRow) throw new Error('Store not found')
  const store = storeRow as InventoryStoreRow
  if (store.brand_id) assertBrandInScope(store.brand_id, input.allowed, 'start stock take')

  const { data: itemRows, error: itemError } = await supabase
    .from('inventory_items')
    .select('*')
    .eq('store_id', store.id)
    .eq('is_active', true)
    .order('category')
    .order('name')
  if (itemError) throw new Error(itemError.message)
  const items = (itemRows as InventoryItemRow[] | null) ?? []
  if (items.length === 0) throw new Error('This store has no active inventory items to count.')

  const frozenAt = nowIso()
  const effectiveDate = input.effective_date || todayInEat()
  const ym = effectiveDate.slice(0, 7)
  const code = (store.code || store.store_type || 'STORE').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '')
  const countRef = await mintReference(`stock_count:${store.id}:${ym}`, `ICELAND-ST-${ym}-${code}-`, 2)
  const balances = await ledgerBalances(items.map((item) => item.id))

  const { data: countRow, error: countError } = await supabase
    .from('inventory_stock_counts')
    .insert({
      count_ref: countRef,
      brand_id: store.brand_id,
      store_id: store.id,
      location: store.location,
      scope_note: `${store.name} monthly stock take`,
      status: 'counting',
      effective_date: effectiveDate,
      frozen_at: frozenAt,
      counted_by: input.counted_by,
      notes: input.notes ?? '',
    })
    .select('*')
    .single()
  if (countError) throw new Error(countError.message)
  const count = countRow as InventoryStockCountRow

  const inserts = items.map((item) => ({
    count_id: count.id,
    item_id: item.id,
    expected_quantity: round3(balances.get(item.id) ?? 0),
    counted_quantity: null,
    reason: '',
    reason_code: '',
    notes: '',
    status: 'pending',
    counted_by: '',
    reviewed_by: '',
    expected_unit_value_ksh: Number(item.unit_value_ksh ?? 0),
    expected_retail_price_ksh: Number(item.selling_price_ksh ?? 0),
    expected_wholesale_price_ksh: Number(item.wholesale_price_ksh ?? 0),
  }))
  const { error: lineError } = await supabase.from('inventory_stock_count_items').insert(inserts)
  if (lineError) throw new Error(lineError.message)

  return count
}

export async function updateStockTakeLines(input: {
  count_id: string
  lines: Array<{ id: string; counted_quantity: number | null; reason_code?: string; reason?: string; notes?: string }>
  actor_name: string
  allowed: string[] | null
}): Promise<StockTakeDetail> {
  const detail = await getStockTakeDetail(input.allowed, input.count_id)
  if (detail.count.status === 'posted') throw new Error('Posted stock takes are immutable.')
  if (detail.count.status === 'approved') throw new Error('Approved stock takes cannot be edited; cancel and start a new count if needed.')

  const allowedReasons = new Set<string>(STOCK_TAKE_REASON_CODES.map((reason) => reason.value))
  for (const line of input.lines) {
    const counted = line.counted_quantity
    if (counted != null && (!Number.isFinite(Number(counted)) || Number(counted) < 0)) {
      throw new Error('Counted quantity must be zero or greater.')
    }
    const reasonCode = line.reason_code && allowedReasons.has(line.reason_code) ? line.reason_code : ''
    const patch = {
      counted_quantity: counted == null ? null : Number(counted),
      reason_code: reasonCode,
      reason: line.reason || (reasonCode ? reasonLabel(reasonCode) : ''),
      notes: line.notes ?? '',
      status: counted == null ? 'pending' : 'counted',
      counted_by: counted == null ? '' : input.actor_name,
      updated_at: nowIso(),
    }
    const { error } = await db().from('inventory_stock_count_items').update(patch).eq('id', line.id).eq('count_id', input.count_id)
    if (error) throw new Error(error.message)
  }
  return getStockTakeDetail(input.allowed, input.count_id)
}

export async function submitStockTakeForReview(input: { count_id: string; actor_name: string; allowed: string[] | null }) {
  const detail = await getStockTakeDetail(input.allowed, input.count_id)
  if (detail.count.status === 'posted') throw new Error('Posted stock takes are immutable.')
  const errors = readinessErrors(detail.lines)
  if (errors.length) throw new Error(errors.join(' '))
  const { error } = await db().from('inventory_stock_counts').update({
    status: 'variance_review',
    reviewed_by: input.actor_name,
    submitted_for_review_at: nowIso(),
    updated_at: nowIso(),
  }).eq('id', input.count_id)
  if (error) throw new Error(error.message)
  return getStockTakeDetail(input.allowed, input.count_id)
}

export async function approveStockTake(input: { count_id: string; actor_name: string; allowed: string[] | null }) {
  const detail = await getStockTakeDetail(input.allowed, input.count_id)
  if (detail.count.status === 'posted') throw new Error('Posted stock takes are immutable.')
  if (!['variance_review', 'approved'].includes(detail.count.status)) throw new Error('Submit the count for review before approval.')
  const errors = readinessErrors(detail.lines)
  if (errors.length) throw new Error(errors.join(' '))

  const now = nowIso()
  const { error: lineError } = await db().from('inventory_stock_count_items').update({
    approved: true,
    approved_by: input.actor_name,
    reviewed_by: input.actor_name,
    status: 'approved',
    updated_at: now,
  }).eq('count_id', input.count_id)
  if (lineError) throw new Error(lineError.message)

  const { error } = await db().from('inventory_stock_counts').update({
    status: 'approved',
    reviewed_by: input.actor_name,
    reviewed_at: now,
    approved_by: input.actor_name,
    approved_at: now,
    updated_at: now,
  }).eq('id', input.count_id)
  if (error) throw new Error(error.message)
  return getStockTakeDetail(input.allowed, input.count_id)
}

export async function postStockTake(input: { count_id: string; actor_name: string; allowed: string[] | null }) {
  const detail = await getStockTakeDetail(input.allowed, input.count_id)
  const movements = await movementsAfterFreeze(detail.count, detail.lines)
  const errors = validateStockTakeForPosting(detail.count, detail.lines, movements)
  if (errors.length) throw new Error(errors.join(' '))

  const itemBalances = await ledgerBalances(detail.lines.map((line) => line.item_id))
  const itemDrift = detail.lines.find((line) => Math.abs((itemBalances.get(line.item_id) ?? 0) - Number(line.expected_quantity)) > 0.001)
  if (itemDrift) throw new Error('Ledger balance no longer matches the frozen expected quantity. Start a new stock take.')

  for (const line of detail.lines) {
    const adjustment = buildStockTakeAdjustment(line)
    if (!adjustment) {
      await db().from('inventory_stock_count_items').update({
        status: 'posted',
        posted_at: nowIso(),
        updated_at: nowIso(),
      }).eq('id', line.id).is('movement_id', null)
      continue
    }
    const movement = await recordStockMovement({
      item_id: line.item_id,
      direction: adjustment.direction,
      quantity: adjustment.quantity,
      unit_value_ksh: line.expected_unit_value_ksh,
      movement_date: detail.count.effective_date,
      reason: `Stock Take Adjustment - ${reasonLabel(line.reason_code)}`,
      reference: detail.count.count_ref,
      source: 'stock_take_adjustment',
      source_table: 'inventory_stock_counts',
      source_record_id: detail.count.id,
      idempotency_key: `stock-count:${line.id}`,
      approved_by: detail.count.approved_by,
      recorded_by: input.actor_name,
      notes: [line.reason, line.notes].filter(Boolean).join(' - '),
      store_id: detail.count.store_id,
      stock_count_id: detail.count.id,
      stock_count_item_id: line.id,
    })
    await db().from('inventory_stock_count_items').update({
      movement_id: movement.movement.id,
      status: 'posted',
      posted_at: nowIso(),
      updated_at: nowIso(),
    }).eq('id', line.id)
  }

  const finalBalances = await ledgerBalances(detail.lines.map((line) => line.item_id))
  const mismatch = detail.lines.find((line) => {
    const counted = Number(line.counted_quantity ?? 0)
    return Math.abs((finalBalances.get(line.item_id) ?? 0) - counted) > 0.001
  })
  if (mismatch) throw new Error('Stock-take posting did not reconcile one or more ledger balances to the approved physical quantity.')

  const { error } = await db().from('inventory_stock_counts').update({
    status: 'posted',
    posted_by: input.actor_name,
    posted_at: nowIso(),
    updated_at: nowIso(),
  }).eq('id', detail.count.id)
  if (error) throw new Error(error.message)
  return getStockTakeDetail(input.allowed, input.count_id)
}

function readinessErrors(lines: StockTakeLine[]): string[] {
  const errors: string[] = []
  if (lines.some((line) => line.counted_quantity == null)) errors.push('Every item must be counted, including physical zero.')
  if (lines.some((line) => stockTakeVariance(Number(line.expected_quantity), line.counted_quantity) !== 0 && !(line.reason_code || line.reason || '').trim())) {
    errors.push('Every non-zero variance needs a reason.')
  }
  return errors
}

async function movementsAfterFreeze(count: InventoryStockCountRow, lines: Array<{ item_id: string }>) {
  if (!count.frozen_at || lines.length === 0) return []
  const { data, error } = await db()
    .from('inventory_movements')
    .select('id,item_id,effective_at,created_at,source,stock_count_id')
    .in('item_id', lines.map((line) => line.item_id))
    .gt('effective_at', count.frozen_at)
    .limit(5000)
  if (error) throw new Error(error.message)
  return ((data as Array<{ id: string; item_id: string; effective_at: string; created_at: string; source: string; stock_count_id: string | null }> | null) ?? [])
    .filter((movement) => movement.stock_count_id !== count.id)
}

async function ledgerBalances(itemIds: string[]): Promise<Map<string, number>> {
  const ids = [...new Set(itemIds)]
  const balances = new Map(ids.map((id) => [id, 0]))
  if (ids.length === 0) return balances
  const { data, error } = await db()
    .from('inventory_movements')
    .select('item_id,direction,base_quantity,quantity')
    .in('item_id', ids)
    .limit(50000)
  if (error) throw new Error(error.message)
  for (const row of (data as Array<{ item_id: string; direction: string; base_quantity?: number | null; quantity: number }> | null) ?? []) {
    const qty = Number(row.base_quantity ?? row.quantity ?? 0)
    balances.set(row.item_id, round3((balances.get(row.item_id) ?? 0) + (row.direction === 'in' ? qty : -qty)))
  }
  return balances
}

function summarise(lines: StockTakeLine[]): StockTakeSummary {
  return lines.reduce((acc, line) => {
    const counted = line.counted_quantity != null
    const variance = stockTakeVariance(Number(line.expected_quantity), line.counted_quantity)
    return {
      total: acc.total + 1,
      counted: acc.counted + (counted ? 1 : 0),
      exact: acc.exact + (counted && variance === 0 ? 1 : 0),
      positive: acc.positive + (variance > 0 ? 1 : 0),
      negative: acc.negative + (variance < 0 ? 1 : 0),
      missing: acc.missing + (counted ? 0 : 1),
      material: acc.material + (Math.abs(line.estimated_cost_impact_ksh) >= 1000 ? 1 : 0),
      estimatedCostImpactKsh: round2(acc.estimatedCostImpactKsh + line.estimated_cost_impact_ksh),
      retailSalesImpactKsh: round2(acc.retailSalesImpactKsh + line.retail_sales_impact_ksh),
      wholesaleSalesImpactKsh: round2(acc.wholesaleSalesImpactKsh + line.wholesale_sales_impact_ksh),
    }
  }, {
    total: 0, counted: 0, exact: 0, positive: 0, negative: 0, missing: 0, material: 0,
    estimatedCostImpactKsh: 0, retailSalesImpactKsh: 0, wholesaleSalesImpactKsh: 0,
  })
}

function reasonLabel(code: string): string {
  return STOCK_TAKE_REASON_CODES.find((reason) => reason.value === code)?.label ?? 'Other'
}

function round2(n: number): number {
  return Number(n.toFixed(2))
}

function round3(n: number): number {
  return Number(n.toFixed(3))
}
