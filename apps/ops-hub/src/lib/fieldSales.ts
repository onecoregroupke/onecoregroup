import { db, nowIso, mintReference } from './serverClient'
import { recordStockMovement } from './inventory'
import { scopedBrandIds } from './stockCards'
import { reconcileWeek, type CustodyMovementKind } from './fieldSalesModel'
import { currentCustodyBalance, recordCustodyMovement } from './fieldSalesCustody'
import { advanceSeries } from './sales'
import type {
  FieldSalesAllocationRow, FieldSalesAllocationItemRow, FieldSalesCustodyMovementRow,
  FieldSalesDailyReturnRow, FieldSalesDailyReturnItemRow,
  FieldSalesReturnNoteRow, FieldSalesReturnNoteItemRow,
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
    row.balance += m.direction === 'in' ? q2 : -q2
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
      idempotency_key: `field-allocation-store:${line.id}`,
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
      idempotency_key: `field-allocation-custody:${line.id}`,
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
  opts: { allocationId?: string; salespersonId?: string; limit?: number } = {},
): Promise<FieldSalesDailyReturnRow[]> {
  const brands = scopedBrandIds(allowed, undefined)
  let q = db().from('field_sales_daily_returns').select('*')
    .order('return_date', { ascending: false }).limit(opts.limit ?? 60)
  if (brands !== null) q = q.in('brand_id', brands)
  if (opts.allocationId) q = q.eq('allocation_id', opts.allocationId)
  if (opts.salespersonId) q = q.eq('salesperson_id', opts.salespersonId)
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
    quantity_sample?: number; quantity_on_hand?: number | null
    selling_price_ksh?: number; customer?: string; batch_number?: string
    payment_method?: string; payment_reference?: string
    amount_received_ksh?: number; credit_amount_ksh?: number; notes?: string
  }>
  submitted_by: string
}): Promise<FieldSalesDailyReturnRow> {
  if (!input.allocation_id) throw new Error('A delivery note is required for daily activity.')
  const allocation = await getAllocation(input.allocation_id)
  if (!allocation) throw new Error('Delivery note not found.')
  if (!['issued', 'active', 'partially_reconciled', 'awaiting_returns'].includes(allocation.allocation.status)) {
    throw new Error('Daily activity can only be recorded against an issued delivery note.')
  }
  const allocationLines = new Map(allocation.items.map((line) => [line.item_id, line]))
  for (const line of input.lines) {
    if (!allocationLines.has(line.item_id)) {
      throw new Error('Daily activity contains an item that was not on this delivery note.')
    }
    const quantities = [line.quantity_sold, line.quantity_damaged, line.quantity_sample, line.quantity_on_hand]
      .map((value) => Number(value ?? 0))
    if (quantities.some((value) => value < 0)) throw new Error('Daily activity quantities cannot be negative.')
  }
  const leavingByItem = new Map<string, number>()
  for (const line of input.lines) {
    const leaving = Number(line.quantity_sold ?? 0) + Number(line.quantity_damaged ?? 0) + Number(line.quantity_sample ?? 0)
    leavingByItem.set(line.item_id, (leavingByItem.get(line.item_id) ?? 0) + leaving)
  }
  for (const [itemId, leaving] of leavingByItem) {
    const held = await currentCustodyBalance(input.salesperson_id, itemId)
    if (leaving > held + 0.0001) throw new Error(`Only ${held} in custody for one of the reported items; ${leaving} cannot leave custody.`)
  }

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
    const allocatedLine = allocationLines.get(line.item_id)!
    const sold = Number(line.quantity_sold ?? 0)
    const damaged = Number(line.quantity_damaged ?? 0)
    const sampled = Number(line.quantity_sample ?? 0)
    if (sold <= 0 && damaged <= 0 && sampled <= 0 && Number(line.quantity_on_hand ?? 0) <= 0) continue

    const { data: lineRow, error: lineError } = await db().from('field_sales_daily_return_items').insert({
      daily_return_id: dailyReturn.id,
      item_id: line.item_id,
      batch_number: line.batch_number || allocatedLine.batch_number,
      quantity_sold: sold,
      quantity_damaged: damaged,
      quantity_sample: sampled,
      quantity_on_hand: Number(line.quantity_on_hand ?? 0),
      on_hand_reported: line.quantity_on_hand != null,
      selling_price_ksh: Number(allocatedLine.selling_price_ksh ?? 0),
      customer: line.customer ?? '',
      payment_method: line.payment_method ?? '',
      payment_reference: line.payment_reference ?? '',
      amount_received_ksh: Number(line.amount_received_ksh ?? 0),
      credit_amount_ksh: Number(line.credit_amount_ksh ?? 0),
      notes: line.notes ?? '',
    }).select('*').single()
    if (lineError) throw new Error(lineError.message)
    const activityLine = lineRow as FieldSalesDailyReturnItemRow

    const custody = (kind: CustodyMovementKind, quantity: number) =>
      quantity > 0
        ? recordCustodyMovement({
            allocation_id: input.allocation_id,
            salesperson_id: input.salesperson_id,
            item_id: line.item_id,
            brand_id: input.brand_id,
            movement_kind: kind,
            quantity,
            batch_number: line.batch_number || allocatedLine.batch_number,
            movement_date: input.return_date,
            reference: dailyReturn.return_ref,
            daily_return_id: dailyReturn.id,
            daily_return_item_id: activityLine.id,
            idempotency_key: `field-activity:${activityLine.id}:${kind}`,
            recorded_by: input.submitted_by,
          })
        : Promise.resolve(null)

    await custody('sale', sold)
    await custody('damage', damaged)
    await custody('sample', sampled)
  }
  return dailyReturn
}

// ─── Physical stock return ──────────────────────────────────────────────────

export async function listReturnNotes(
  allowed: string[] | null,
  opts: { salespersonId?: string; status?: string; limit?: number } = {},
): Promise<FieldSalesReturnNoteRow[]> {
  const brands = scopedBrandIds(allowed, undefined)
  let q = db().from('field_sales_return_notes').select('*')
    .order('return_date', { ascending: false }).limit(opts.limit ?? 100)
  if (brands !== null) q = q.in('brand_id', brands)
  if (opts.salespersonId) q = q.eq('salesperson_id', opts.salespersonId)
  if (opts.status) q = q.eq('status', opts.status)
  const { data } = await q
  return (data as FieldSalesReturnNoteRow[] | null) ?? []
}

export async function getReturnNote(id: string): Promise<{
  note: FieldSalesReturnNoteRow
  items: FieldSalesReturnNoteItemRow[]
} | null> {
  const [{ data: note }, { data: items }] = await Promise.all([
    db().from('field_sales_return_notes').select('*').eq('id', id).maybeSingle(),
    db().from('field_sales_return_note_items').select('*').eq('return_note_id', id),
  ])
  if (!note) return null
  return { note: note as FieldSalesReturnNoteRow, items: (items as FieldSalesReturnNoteItemRow[] | null) ?? [] }
}

/** A salesperson reports stock they are physically presenting for return.
 * Nothing leaves custody and nothing enters store until a receiving manager
 * counts, accepts/rejects, and posts the note. */
export async function createReturnRequest(input: {
  allocation_id: string | null
  brand_id: string | null
  return_date: string
  salesperson_id: string | null
  destination_store_id?: string | null
  lines: Array<{
    item_id: string; quantity_returned: number; condition?: string; reason?: string; batch_number?: string
  }>
  requested_by: string
  notes?: string
}): Promise<FieldSalesReturnNoteRow> {
  const lines = input.lines.filter((line) => line.item_id && Number(line.quantity_returned) > 0)
  if (lines.length === 0) throw new Error('Add at least one item being physically returned.')
  if (!input.allocation_id) throw new Error('A delivery note is required for a physical return.')
  const allocation = await getAllocation(input.allocation_id)
  if (!allocation) throw new Error('Delivery note not found.')
  const allowedItems = new Set(allocation.items.map((line) => line.item_id))
  const returningByItem = new Map<string, number>()
  for (const line of lines) {
    if (!allowedItems.has(line.item_id)) throw new Error('A return contains an item that was not on this delivery note.')
    const quantity = Number(line.quantity_returned)
    returningByItem.set(line.item_id, (returningByItem.get(line.item_id) ?? 0) + quantity)
  }
  for (const [itemId, returning] of returningByItem) {
    const held = await currentCustodyBalance(input.salesperson_id, itemId)
    if (returning > held + 0.0001) throw new Error(`Only ${held} is in custody for one of the returned items.`)
  }
  const ref = await mintReference('fs_return_note', 'RTN-')
  const { data, error } = await db().from('field_sales_return_notes').insert({
    note_ref: ref,
    allocation_id: input.allocation_id,
    brand_id: input.brand_id,
    return_date: input.return_date,
    salesperson_id: input.salesperson_id,
    destination_store_id: input.destination_store_id ?? null,
    status: 'submitted',
    requested_by: input.requested_by,
    requested_at: nowIso(),
    notes: input.notes ?? '',
  }).select('*').single()
  if (error) throw new Error(error.message)
  const note = data as FieldSalesReturnNoteRow

  const { error: lineError } = await db().from('field_sales_return_note_items').insert(lines.map((line) => ({
      return_note_id: note.id,
      item_id: line.item_id,
      batch_number: line.batch_number ?? '',
      quantity_returned: Number(line.quantity_returned),
      quantity_accepted: 0,
      quantity_rejected: 0,
      condition_note: line.reason || line.condition || '',
    })))
  if (lineError) throw new Error(lineError.message)
  return note
}

/** Receiving manager posts the physical return. All received units leave
 * custody; only accepted/sellable units re-enter the destination store. */
export async function postReturnNote(input: {
  id: string
  destination_store_id?: string | null
  lines: Array<{ line_id: string; quantity_accepted: number; quantity_rejected: number; condition_note?: string }>
  received_by: string
}): Promise<FieldSalesReturnNoteRow> {
  const loaded = await getReturnNote(input.id)
  if (!loaded) throw new Error('Return note not found.')
  if (loaded.note.status === 'posted') throw new Error('This return note has already been posted.')
  const decisions = new Map(input.lines.map((line) => [line.line_id, line]))
  const validated = loaded.items.map((line) => {
    const decision = decisions.get(line.id)
    if (!decision) throw new Error('Every returned line must be counted and classified.')
    const returned = Number(line.quantity_returned)
    const accepted = Number(decision.quantity_accepted)
    const rejected = Number(decision.quantity_rejected)
    if (accepted < 0 || rejected < 0 || Math.abs(accepted + rejected - returned) > 0.0001) {
      throw new Error('Accepted plus rejected must equal the quantity physically received.')
    }
    return { line, decision, returned, accepted, rejected }
  })
  if (validated.some((entry) => entry.accepted > 0)
    && !(input.destination_store_id ?? loaded.note.destination_store_id)) {
    throw new Error('Choose the store receiving accepted stock.')
  }

  for (const { line, decision, returned, accepted, rejected } of validated) {

    // Everything returned leaves custody.
    await recordCustodyMovement({
      allocation_id: loaded.note.allocation_id,
      salesperson_id: loaded.note.salesperson_id,
      item_id: line.item_id,
      brand_id: loaded.note.brand_id,
      movement_kind: 'return',
      quantity: returned,
      batch_number: line.batch_number,
      movement_date: loaded.note.return_date,
      reference: loaded.note.note_ref,
      return_note_id: loaded.note.id,
      idempotency_key: `field-return-custody:${line.id}`,
      recorded_by: input.received_by,
    })

    // Only ACCEPTED units go back into sellable stock.
    if (accepted > 0) {
      await recordStockMovement({
        item_id: line.item_id,
        direction: 'in',
        quantity: accepted,
        movement_date: loaded.note.return_date,
        reason: `Accepted field-sales return (${loaded.note.note_ref})`,
        reference: loaded.note.note_ref,
        source: 'field_sales_return',
        allocation_id: loaded.note.allocation_id,
        return_note_item_id: line.id,
        idempotency_key: `field-return-store:${line.id}`,
        batch_number: line.batch_number,
        store_id: input.destination_store_id ?? loaded.note.destination_store_id,
        recorded_by: input.received_by,
      })
    }
    const { error: lineUpdateError } = await db().from('field_sales_return_note_items').update({
      quantity_accepted: accepted,
      quantity_rejected: rejected,
      condition_note: decision.condition_note ?? line.condition_note,
    }).eq('id', line.id)
    if (lineUpdateError) throw new Error(lineUpdateError.message)
  }

  const { data, error } = await db().from('field_sales_return_notes').update({
    status: 'posted',
    destination_store_id: input.destination_store_id ?? loaded.note.destination_store_id,
    received_by: input.received_by,
    posted_by: input.received_by,
    posted_at: nowIso(),
  }).eq('id', loaded.note.id).select('*').single()
  if (error) throw new Error(error.message)
  return data as FieldSalesReturnNoteRow
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

  const [{ data: returnRows }, { data: custodyRows }, { data: invoiceRows }] = await Promise.all([
    db().from('field_sales_daily_returns').select('*').eq('allocation_id', allocationId),
    db().from('field_sales_custody_movements').select('*').eq('allocation_id', allocationId),
    db().from('sales_invoices').select('total_amount_ksh,daily_return_id,status')
      .eq('allocation_id', allocationId).neq('status', 'cancelled'),
  ])
  const returns = (returnRows as FieldSalesDailyReturnRow[] | null) ?? []
  const custody = (custodyRows as FieldSalesCustodyMovementRow[] | null) ?? []

  const { data: itemRows } = returns.length > 0
    ? await db().from('field_sales_daily_return_items').select('*')
        .in('daily_return_id', returns.map((r) => r.id))
    : { data: [] as FieldSalesDailyReturnItemRow[] }
  const returnItems = (itemRows as FieldSalesDailyReturnItemRow[] | null) ?? []
  const returnDateById = new Map(returns.map((row) => [row.id, row.return_date]))
  const latestPhysicalByItem = new Map<string, { date: string; quantity: number }>()
  for (const item of returnItems) {
    if (!item.on_hand_reported) continue
    const date = returnDateById.get(item.daily_return_id) ?? ''
    const existing = latestPhysicalByItem.get(item.item_id)
    const quantity = Number(item.quantity_on_hand ?? 0)
    if (!existing || date > existing.date) latestPhysicalByItem.set(item.item_id, { date, quantity })
    else if (date === existing.date) existing.quantity = Math.max(existing.quantity, quantity)
  }

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
    row.salesValue += Number(ri.line_total_ksh ?? 0)
  }
  for (const m of custody) {
    const row = perItem.get(m.item_id)
    if (!row) continue
    if (m.movement_kind === 'sale') row.sold += Number(m.quantity ?? 0)
    if (m.movement_kind === 'damage') row.damaged += Number(m.quantity ?? 0)
    if (m.movement_kind === 'sample' || m.movement_kind === 'promotion') row.sampled += Number(m.quantity ?? 0)
    if (m.movement_kind === 'return') row.returned += Number(m.quantity ?? 0)
    row.inCustody += m.direction === 'in' ? Number(m.quantity ?? 0) : -Number(m.quantity ?? 0)
  }

  const standaloneInvoiceValue = ((invoiceRows as Array<{ total_amount_ksh: number; daily_return_id: string | null }> | null) ?? [])
    .filter((invoice) => !invoice.daily_return_id)
    .reduce((sum, invoice) => sum + Number(invoice.total_amount_ksh ?? 0), 0)
  const cashExpected = [...perItem.values()].reduce((s, r) => s + r.salesValue, standaloneInvoiceValue)
  const cashSubmitted = returns.reduce(
    (s, r) => s + Number(r.cash_received_ksh ?? 0) + Number(r.mobile_money_ksh ?? 0) + Number(r.bank_ksh ?? 0),
    0,
  )
  const creditSales = returns.reduce((s, r) => s + Number(r.credit_sales_ksh ?? 0), 0)

  return {
    allocation: loaded.allocation,
    lines: [...perItem.values()].map((r) => ({
      ...r,
      reportedOnHand: latestPhysicalByItem.get(r.itemId)?.quantity ?? null,
      // A physical count is an observation only. It never changes custody; it
      // reveals the variance between ledger custody and stock actually counted.
      unaccounted: latestPhysicalByItem.has(r.itemId)
        ? Number((r.inCustody - (latestPhysicalByItem.get(r.itemId)?.quantity ?? 0)).toFixed(3))
        : 0,
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

/** Manager sign-off never rewrites either ledger. A non-zero physical or cash
 * variance requires an explicit reason and records who accepted it. */
export async function approveAllocationReconciliation(input: {
  allocationId: string
  approvedBy: string
  reason?: string
}): Promise<FieldSalesAllocationRow> {
  const reconciliation = await reconcileAllocation(input.allocationId)
  if (['reconciled', 'closed', 'cancelled'].includes(reconciliation.allocation.status)) {
    throw new Error(`This allocation is already ${reconciliation.allocation.status}.`)
  }
  const hasStockVariance = reconciliation.lines.some((line) => Math.abs(line.unaccounted) > 0.001)
  const hasCashVariance = Math.abs(reconciliation.cash.shortfall) > 0.005
  const hasVariance = hasStockVariance || hasCashVariance
  const reason = input.reason?.trim() ?? ''
  if (hasVariance && !reason) throw new Error('A manager reason is required when stock or cash has a variance.')

  const { data, error } = await db().from('field_sales_allocations').update({
    status: 'reconciled',
    variance_approved_by: hasVariance ? input.approvedBy : '',
    variance_reason: hasVariance ? reason : '',
    updated_at: nowIso(),
  }).eq('id', input.allocationId).select('*').single()
  if (error) throw new Error(error.message)
  return data as FieldSalesAllocationRow
}

export { reconcileWeek }
