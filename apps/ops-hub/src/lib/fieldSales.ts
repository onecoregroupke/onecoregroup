import { db, nowIso, todayInEat, mintReference } from './serverClient'
import { recordStockMovement } from './inventory'
import { scopedBrandIds } from './stockCards'
import { custodyDirectionFor, reconcileWeek, type CustodyMovementKind } from './fieldSalesModel'
import { advanceSeries } from './sales'
import type {
  FieldSalesAllocationRow, FieldSalesAllocationItemRow, FieldSalesCustodyMovementRow,
  FieldSalesDailyReturnRow, FieldSalesDailyReturnItemRow,
  FieldSalesReturnNoteRow,
} from '@ocg/db'

// =============================================================================
// FIELD-SALES CUSTODY (migration 061) — data access.
//
// TWO ledgers, on purpose:
//   inventory_movements            — company stock
//   field_sales_custody_movements  — stock physically held by a salesperson
//
// The weekly allocation (the delivery note) deducts the MAIN STORE once and
// opens custody. A daily sale then reduces CUSTODY ONLY. That is what stops the
// classic double-deduction: allocate 500, sell 300, and the main store must be
// down 500, not 800.
// =============================================================================

// ─── Custody ledger ─────────────────────────────────────────────────────────

/** Current custody balance for one salesperson + item. */
async function custodyBalanceFor(salespersonId: string | null, itemId: string): Promise<number> {
  let q = db().from('field_sales_custody_movements').select('*')
    .eq('item_id', itemId)
    .order('movement_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
  q = salespersonId ? q.eq('salesperson_id', salespersonId) : q.is('salesperson_id', null)
  const { data } = await q
  const last = ((data as FieldSalesCustodyMovementRow[] | null) ?? [])[0]
  return last ? Number(last.balance_after ?? 0) : 0
}

/**
 * Append to the custody ledger. Mirrors recordStockMovement(): direction +
 * quantity + balance_after, one row per event, pointing at its source document.
 *
 * Custody can never be written negative — the database has a CHECK, and this
 * refuses first with a message that says how much is actually held.
 */
export async function recordCustodyMovement(input: {
  allocation_id?: string | null
  allocation_item_id?: string | null
  daily_return_id?: string | null
  return_note_id?: string | null
  salesperson_id: string | null
  item_id: string
  brand_id: string | null
  movement_kind: CustodyMovementKind
  quantity: number
  batch_number?: string
  movement_date?: string
  reference?: string
  recorded_by: string
  notes?: string
}): Promise<FieldSalesCustodyMovementRow> {
  const qty = Number(input.quantity)
  if (!(qty > 0)) throw new Error('Quantity must be greater than zero.')

  const direction = custodyDirectionFor(input.movement_kind)
  const current = await custodyBalanceFor(input.salesperson_id, input.item_id)
  const after = direction === 'in' ? current + qty : current - qty
  if (after < 0) {
    throw new Error(`Only ${current} in custody for this item — cannot record ${qty}.`)
  }

  const { data, error } = await db().from('field_sales_custody_movements').insert({
    allocation_id: input.allocation_id ?? null,
    allocation_item_id: input.allocation_item_id ?? null,
    daily_return_id: input.daily_return_id ?? null,
    return_note_id: input.return_note_id ?? null,
    salesperson_id: input.salesperson_id,
    item_id: input.item_id,
    brand_id: input.brand_id,
    batch_number: input.batch_number ?? '',
    movement_kind: input.movement_kind,
    direction,
    quantity: qty,
    balance_after: after,
    movement_date: input.movement_date ?? todayInEat(),
    invoice_ref: input.reference ?? '',
    recorded_by: input.recorded_by,
    notes: input.notes ?? '',
  }).select('*').single()
  if (error) throw new Error(error.message)
  return data as FieldSalesCustodyMovementRow
}

/** Live custody position per salesperson + item. */
export async function custodyBalances(allowed: string[] | null, salespersonId?: string) {
  const brands = scopedBrandIds(allowed, undefined)
  let q = db().from('field_sales_custody_movements').select('*')
    .order('movement_date', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(20000)
  if (brands !== null) q = q.in('brand_id', brands)
  if (salespersonId) q = q.eq('salesperson_id', salespersonId)
  const { data } = await q
  const rows = (data as FieldSalesCustodyMovementRow[] | null) ?? []

  const byKey = new Map<string, {
    salespersonId: string | null; itemId: string; issued: number; sold: number
    returned: number; damaged: number; sampled: number; balance: number
  }>()
  for (const m of rows) {
    const key = `${m.salesperson_id ?? ''}:${m.item_id}`
    const row = byKey.get(key) ?? {
      salespersonId: m.salesperson_id, itemId: m.item_id,
      issued: 0, sold: 0, returned: 0, damaged: 0, sampled: 0, balance: 0,
    }
    const q2 = Number(m.quantity ?? 0)
    if (m.movement_kind === 'issue') row.issued += q2
    if (m.movement_kind === 'sale') row.sold += q2
    if (m.movement_kind === 'return') row.returned += q2
    if (m.movement_kind === 'damage') row.damaged += q2
    if (m.movement_kind === 'sample') row.sampled += q2
    row.balance = Number(m.balance_after ?? 0)
    byKey.set(key, row)
  }
  return [...byKey.values()]
}

// ─── Weekly allocation (the outbound delivery note) ─────────────────────────

export async function listAllocations(
  allowed: string[] | null,
  opts: { brandId?: string; salespersonId?: string; limit?: number } = {},
): Promise<FieldSalesAllocationRow[]> {
  const brands = scopedBrandIds(allowed, opts.brandId)
  let q = db().from('field_sales_allocations').select('*')
    .order('week_start', { ascending: false }).limit(opts.limit ?? 50)
  if (brands !== null) q = q.in('brand_id', brands)
  if (opts.salespersonId) q = q.eq('salesperson_id', opts.salespersonId)
  const { data } = await q
  return (data as FieldSalesAllocationRow[] | null) ?? []
}

export async function getAllocation(id: string) {
  const [{ data: head }, { data: lines }] = await Promise.all([
    db().from('field_sales_allocations').select('*').eq('id', id).maybeSingle(),
    db().from('field_sales_allocation_items').select('*').eq('allocation_id', id),
  ])
  if (!head) return null
  return {
    allocation: head as FieldSalesAllocationRow,
    items: (lines as FieldSalesAllocationItemRow[] | null) ?? [],
  }
}

/** Create a DRAFT allocation. No stock moves until it is issued. */
export async function createAllocation(input: {
  brand_id: string | null
  week_start: string
  week_end: string
  salesperson_id: string | null
  sales_team?: string
  vehicle_route?: string
  source_store_id?: string | null
  delivery_note_no?: string
  notes?: string
  lines: Array<{ item_id: string; quantity_issued: number; unit?: string; selling_price_ksh?: number; batch_number?: string }>
  created_by: string
}): Promise<FieldSalesAllocationRow> {
  const lines = input.lines.filter((l) => l.item_id && Number(l.quantity_issued) > 0)
  if (lines.length === 0) throw new Error('A delivery note needs at least one line.')

  const ref = await mintReference('fs_allocation', 'ALC-')
  const { data, error } = await db().from('field_sales_allocations').insert({
    allocation_ref: ref,
    delivery_note_no: (input.delivery_note_no ?? '').trim(),
    brand_id: input.brand_id,
    week_start: input.week_start,
    week_end: input.week_end,
    salesperson_id: input.salesperson_id,
    sales_team: input.sales_team ?? '',
    vehicle_route: input.vehicle_route ?? '',
    source_store_id: input.source_store_id ?? null,
    status: 'draft',
    notes: input.notes ?? '',
  }).select('*').single()
  if (error) {
    if (error.message.includes('idx_fs_allocation_dn')) {
      throw new Error(`Delivery note "${input.delivery_note_no}" has already been used for this brand.`)
    }
    throw new Error(error.message)
  }
  const allocation = data as FieldSalesAllocationRow

  const { error: lineError } = await db().from('field_sales_allocation_items').insert(
    lines.map((l) => ({
      allocation_id: allocation.id,
      item_id: l.item_id,
      quantity_issued: Number(l.quantity_issued),
      unit: l.unit ?? 'pcs',
      selling_price_ksh: Number(l.selling_price_ksh ?? 0),
      batch_number: l.batch_number ?? '',
    })),
  )
  if (lineError) throw new Error(lineError.message)
  return allocation
}

/**
 * Issue the allocation: deduct the main store ONCE and open custody.
 *
 * Both effects are keyed to the allocation LINE — inventory_movements has a
 * partial unique index on allocation_item_id, and so does the custody ledger's
 * source link — so issuing twice is impossible rather than merely discouraged.
 */
export async function issueAllocation(id: string, issuedBy: string): Promise<FieldSalesAllocationRow> {
  const loaded = await getAllocation(id)
  if (!loaded) throw new Error('Delivery note not found.')
  const { allocation, items } = loaded
  if (allocation.status !== 'draft' && allocation.status !== 'prepared') {
    throw new Error(`This delivery note is already ${allocation.status}.`)
  }

  for (const line of items) {
    const qty = Number(line.quantity_issued)
    if (!(qty > 0)) continue

    // 1. Out of the main store, exactly once.
    await recordStockMovement({
      item_id: line.item_id,
      direction: 'out',
      quantity: qty,
      movement_date: allocation.week_start,
      reason: `Issued to sales custody (${allocation.delivery_note_no || allocation.allocation_ref})`,
      reference: allocation.delivery_note_no || allocation.allocation_ref,
      source: 'field_sales_allocation',
      allocation_id: allocation.id,
      allocation_item_id: line.id,
      batch_number: line.batch_number,
      store_id: allocation.source_store_id,
      recorded_by: issuedBy,
    })

    // 2. Into the salesperson's custody.
    await recordCustodyMovement({
      allocation_id: allocation.id,
      allocation_item_id: line.id,
      salesperson_id: allocation.salesperson_id,
      item_id: line.item_id,
      brand_id: allocation.brand_id,
      movement_kind: 'issue',
      quantity: qty,
      batch_number: line.batch_number,
      movement_date: allocation.week_start,
      reference: allocation.delivery_note_no || allocation.allocation_ref,
      recorded_by: issuedBy,
    })
  }

  const { data, error } = await db().from('field_sales_allocations').update({
    status: 'issued', issued_by: issuedBy, issued_at: nowIso(), updated_at: nowIso(),
  }).eq('id', allocation.id).select('*').single()
  if (error) throw new Error(error.message)

  if (allocation.delivery_note_no) {
    await advanceSeries('delivery_note', allocation.brand_id, allocation.delivery_note_no, issuedBy)
  }
  return data as FieldSalesAllocationRow
}

// ─── Daily returns ──────────────────────────────────────────────────────────

export async function listDailyReturns(
  allowed: string[] | null,
  opts: { allocationId?: string; limit?: number } = {},
): Promise<FieldSalesDailyReturnRow[]> {
  const brands = scopedBrandIds(allowed, undefined)
  let q = db().from('field_sales_daily_returns').select('*')
    .order('return_date', { ascending: false }).limit(opts.limit ?? 60)
  if (brands !== null) q = q.in('brand_id', brands)
  if (opts.allocationId) q = q.eq('allocation_id', opts.allocationId)
  const { data } = await q
  return (data as FieldSalesDailyReturnRow[] | null) ?? []
}

/**
 * A day's selling: what was sold, damaged, sampled and still on hand, plus the
 * cash brought back.
 *
 * Sold / damaged / sampled reduce CUSTODY ONLY. The main store was already
 * reduced when the allocation was issued; touching it again here is exactly the
 * double-deduction this model exists to prevent.
 */
export async function submitDailyReturn(input: {
  allocation_id: string | null
  brand_id: string | null
  return_date: string
  salesperson_id: string | null
  sales_team?: string
  cash_received_ksh?: number
  mobile_money_ksh?: number
  bank_ksh?: number
  credit_sales_ksh?: number
  amount_submitted_ksh?: number
  payment_references?: string
  notes?: string
  lines: Array<{
    item_id: string; quantity_sold?: number; quantity_damaged?: number
    quantity_sample?: number; quantity_on_hand?: number
    selling_price_ksh?: number; customer?: string; batch_number?: string
  }>
  submitted_by: string
}): Promise<FieldSalesDailyReturnRow> {
  const ref = await mintReference('fs_daily_return', 'DR-')
  const { data, error } = await db().from('field_sales_daily_returns').insert({
    return_ref: ref,
    allocation_id: input.allocation_id,
    brand_id: input.brand_id,
    return_date: input.return_date,
    sales_team: input.sales_team ?? '',
    salesperson_id: input.salesperson_id,
    cash_received_ksh: Number(input.cash_received_ksh ?? 0),
    mobile_money_ksh: Number(input.mobile_money_ksh ?? 0),
    bank_ksh: Number(input.bank_ksh ?? 0),
    credit_sales_ksh: Number(input.credit_sales_ksh ?? 0),
    amount_submitted_ksh: Number(input.amount_submitted_ksh ?? 0),
    payment_references: input.payment_references ?? '',
    status: 'submitted',
    submitted_by: input.submitted_by,
    submitted_at: nowIso(),
    notes: input.notes ?? '',
  }).select('*').single()
  if (error) {
    if (error.message.includes('idx_fs_daily_return_once')) {
      throw new Error('A daily return has already been recorded for this salesperson on this date.')
    }
    throw new Error(error.message)
  }
  const dailyReturn = data as FieldSalesDailyReturnRow

  for (const line of input.lines) {
    const sold = Number(line.quantity_sold ?? 0)
    const damaged = Number(line.quantity_damaged ?? 0)
    const sampled = Number(line.quantity_sample ?? 0)
    if (sold <= 0 && damaged <= 0 && sampled <= 0 && Number(line.quantity_on_hand ?? 0) <= 0) continue

    await db().from('field_sales_daily_return_items').insert({
      daily_return_id: dailyReturn.id,
      item_id: line.item_id,
      batch_number: line.batch_number ?? '',
      quantity_sold: sold,
      quantity_damaged: damaged,
      quantity_sample: sampled,
      quantity_on_hand: Number(line.quantity_on_hand ?? 0),
      selling_price_ksh: Number(line.selling_price_ksh ?? 0),
      customer: line.customer ?? '',
    })

    const custody = (kind: CustodyMovementKind, quantity: number) =>
      quantity > 0
        ? recordCustodyMovement({
            allocation_id: input.allocation_id,
            salesperson_id: input.salesperson_id,
            item_id: line.item_id,
            brand_id: input.brand_id,
            movement_kind: kind,
            quantity,
            batch_number: line.batch_number,
            movement_date: input.return_date,
            reference: dailyReturn.return_ref,
            daily_return_id: dailyReturn.id,
            recorded_by: input.submitted_by,
          })
        : Promise.resolve(null)

    await custody('sale', sold)
    await custody('damage', damaged)
    await custody('sample', sampled)
  }
  return dailyReturn
}

// ─── Unsold stock return note ───────────────────────────────────────────────

/**
 * Unsold stock coming back to the store at the end of the week.
 *
 * Accepted units leave custody AND return to the main store. Rejected units
 * leave custody but do NOT re-enter sellable stock — damaged goods coming off a
 * van must not silently become inventory again.
 */
export async function postReturnNote(input: {
  allocation_id: string | null
  brand_id: string | null
  return_date: string
  salesperson_id: string | null
  destination_store_id?: string | null
  lines: Array<{
    item_id: string; quantity_returned: number; quantity_accepted: number
    quantity_rejected?: number; condition?: string; reason?: string; batch_number?: string
  }>
  received_by: string
}): Promise<FieldSalesReturnNoteRow> {
  const ref = await mintReference('fs_return_note', 'RTN-')
  const { data, error } = await db().from('field_sales_return_notes').insert({
    note_ref: ref,
    allocation_id: input.allocation_id,
    brand_id: input.brand_id,
    return_date: input.return_date,
    salesperson_id: input.salesperson_id,
    destination_store_id: input.destination_store_id ?? null,
    received_by: input.received_by,
    status: 'posted',
    posted_at: nowIso(),
  }).select('*').single()
  if (error) throw new Error(error.message)
  const note = data as FieldSalesReturnNoteRow

  for (const line of input.lines) {
    const returned = Number(line.quantity_returned)
    const accepted = Number(line.quantity_accepted)
    const rejected = Number(line.quantity_rejected ?? 0)
    if (!(returned > 0)) continue
    if (accepted + rejected - returned > 0.0001) {
      throw new Error('Accepted plus rejected cannot exceed the quantity returned.')
    }

    await db().from('field_sales_return_note_items').insert({
      return_note_id: note.id,
      item_id: line.item_id,
      batch_number: line.batch_number ?? '',
      quantity_returned: returned,
      quantity_accepted: accepted,
      quantity_rejected: rejected,
      condition_note: line.reason || line.condition || 'good',
    })

    // Everything returned leaves custody.
    await recordCustodyMovement({
      allocation_id: input.allocation_id,
      salesperson_id: input.salesperson_id,
      item_id: line.item_id,
      brand_id: input.brand_id,
      movement_kind: 'return',
      quantity: returned,
      batch_number: line.batch_number,
      movement_date: input.return_date,
      reference: note.note_ref,
      return_note_id: note.id,
      recorded_by: input.received_by,
    })

    // Only ACCEPTED units go back into sellable stock.
    if (accepted > 0) {
      await recordStockMovement({
        item_id: line.item_id,
        direction: 'in',
        quantity: accepted,
        movement_date: input.return_date,
        reason: `Unsold stock returned (${note.note_ref})`,
        reference: note.note_ref,
        source: 'field_sales_return',
        allocation_id: input.allocation_id,
        batch_number: line.batch_number,
        store_id: input.destination_store_id ?? null,
        recorded_by: input.received_by,
      })
    }
  }
  return note
}

// ─── Weekly reconciliation ──────────────────────────────────────────────────

/**
 * Reconcile a week: issued vs sold vs returned vs damaged vs still-in-custody,
 * and cash expected vs cash submitted. The arithmetic lives in
 * fieldSalesModel.reconcileWeek() and is unit-tested; this only gathers.
 */
export async function reconcileAllocation(allocationId: string) {
  const loaded = await getAllocation(allocationId)
  if (!loaded) throw new Error('Delivery note not found.')

  const [{ data: returnRows }, { data: custodyRows }] = await Promise.all([
    db().from('field_sales_daily_returns').select('*').eq('allocation_id', allocationId),
    db().from('field_sales_custody_movements').select('*').eq('allocation_id', allocationId),
  ])
  const returns = (returnRows as FieldSalesDailyReturnRow[] | null) ?? []
  const custody = (custodyRows as FieldSalesCustodyMovementRow[] | null) ?? []

  const { data: itemRows } = returns.length > 0
    ? await db().from('field_sales_daily_return_items').select('*')
        .in('daily_return_id', returns.map((r) => r.id))
    : { data: [] as FieldSalesDailyReturnItemRow[] }
  const returnItems = (itemRows as FieldSalesDailyReturnItemRow[] | null) ?? []

  const perItem = new Map<string, {
    itemId: string; issued: number; sold: number; damaged: number
    sampled: number; returned: number; inCustody: number; salesValue: number
  }>()
  for (const line of loaded.items) {
    perItem.set(line.item_id, {
      itemId: line.item_id,
      issued: Number(line.quantity_issued ?? 0),
      sold: 0, damaged: 0, sampled: 0, returned: 0, inCustody: 0, salesValue: 0,
    })
  }
  for (const ri of returnItems) {
    const row = perItem.get(ri.item_id)
    if (!row) continue
    row.sold += Number(ri.quantity_sold ?? 0)
    row.damaged += Number(ri.quantity_damaged ?? 0)
    row.sampled += Number(ri.quantity_sample ?? 0)
    row.salesValue += Number(ri.line_total_ksh ?? 0)
  }
  for (const m of custody) {
    const row = perItem.get(m.item_id)
    if (!row) continue
    if (m.movement_kind === 'return') row.returned += Number(m.quantity ?? 0)
    row.inCustody = Number(m.balance_after ?? 0)
  }

  const cashExpected = [...perItem.values()].reduce((s, r) => s + r.salesValue, 0)
  const cashSubmitted = returns.reduce(
    (s, r) => s + Number(r.cash_received_ksh ?? 0) + Number(r.mobile_money_ksh ?? 0) + Number(r.bank_ksh ?? 0),
    0,
  )
  const creditSales = returns.reduce((s, r) => s + Number(r.credit_sales_ksh ?? 0), 0)

  return {
    allocation: loaded.allocation,
    lines: [...perItem.values()].map((r) => ({
      ...r,
      // Stock that left custody with no explanation: issued, not sold, not
      // damaged, not sampled, not returned, and not still held.
      unaccounted: Number((r.issued - r.sold - r.damaged - r.sampled - r.returned - r.inCustody).toFixed(3)),
    })),
    cash: {
      expected: Number(cashExpected.toFixed(2)),
      submitted: Number(cashSubmitted.toFixed(2)),
      credit: Number(creditSales.toFixed(2)),
      // Cash owed but not handed in. Credit sales are legitimately not cash.
      shortfall: Number((cashExpected - cashSubmitted - creditSales).toFixed(2)),
    },
    dailyReturns: returns,
  }
}

export { reconcileWeek }
