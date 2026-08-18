import { db, nowIso, todayInEat, mintReference } from './serverClient'
import { recordStockMovement } from './inventory'
import { scopedBrandIds } from './stockCards'
import type {
  SalesCustomerRow, SalesInvoiceRow, SalesInvoiceItemRow,
  SalesPaymentRow, DocumentSeriesRow, SalesAccountApplicationRow,
} from '@ocg/db'

// =============================================================================
// ICELAND SALES — customers → invoices → payments (migration 066).
//
// The invoice is the document that moves finished goods off the shelf, so it
// posts through the SAME ledger as every other movement. Nothing here writes
// inventory_movements directly; it all goes via recordStockMovement(), and the
// partial unique index on sales_invoice_item_id makes a second post impossible.
//
// An invoice is created as a DRAFT and moves stock only when POSTED. Drafting
// an invoice must never quietly deplete a store.
// =============================================================================

export const VAT_RATE_PERCENT = 16

// ─── Document series (the physical pad numbers) ─────────────────────────────

export async function listSeries(brandId?: string | null): Promise<DocumentSeriesRow[]> {
  let q = db().from('document_series').select('*').eq('active', true).order('doc_type')
  if (brandId !== undefined) q = brandId === null ? q.is('brand_id', null) : q.eq('brand_id', brandId)
  const { data } = await q
  return (data as DocumentSeriesRow[] | null) ?? []
}

/**
 * The next number to suggest on a pad-numbered document.
 *
 * This DOES NOT reserve the number — pads are filled by hand, out of order, and
 * with gaps. It suggests; the operator confirms or overrides. The system's own
 * reference is minted separately and is never taken from here, so a historical
 * document can never collide with a new one.
 */
export async function suggestPadNumber(docType: string, brandId: string | null): Promise<string> {
  const { data } = await db().from('document_series').select('*')
    .eq('doc_type', docType)
    .eq('active', true)
    .or(brandId ? `brand_id.eq.${brandId},brand_id.is.null` : 'brand_id.is.null')
    .limit(1)
  const series = ((data as DocumentSeriesRow[] | null) ?? [])[0]
  if (!series) return ''
  const next = Number(series.current_number ?? 0) + 1
  const body = series.pad_width > 0 ? String(next).padStart(series.pad_width, '0') : String(next)
  return `${series.prefix}${body}${series.suffix}`
}

/** Record that a pad number has been used, so the next suggestion moves on. */
export async function advanceSeries(docType: string, brandId: string | null, usedNumber: string, by: string) {
  const digits = Number((usedNumber.match(/\d+/g) ?? []).join('') || 0)
  if (!Number.isFinite(digits) || digits <= 0) return
  const { data } = await db().from('document_series').select('*')
    .eq('doc_type', docType)
    .or(brandId ? `brand_id.eq.${brandId},brand_id.is.null` : 'brand_id.is.null')
    .limit(1)
  const series = ((data as DocumentSeriesRow[] | null) ?? [])[0]
  if (!series) return
  // Only ever move FORWARD. Back-dating a document must not rewind the pad.
  if (digits <= Number(series.current_number ?? 0)) return
  await db().from('document_series')
    .update({ current_number: digits, updated_by: by, updated_at: nowIso() })
    .eq('id', series.id)
}

export async function upsertSeries(input: {
  id?: string
  brand_id: string | null
  doc_type: string
  label?: string
  prefix?: string
  pad_width?: number
  current_number: number
  updated_by: string
}): Promise<DocumentSeriesRow> {
  const payload = {
    brand_id: input.brand_id,
    doc_type: input.doc_type,
    label: input.label ?? '',
    prefix: input.prefix ?? '',
    pad_width: Number(input.pad_width ?? 0),
    current_number: Number(input.current_number),
    updated_by: input.updated_by,
    updated_at: nowIso(),
    active: true,
  }
  const { data, error } = input.id
    ? await db().from('document_series').update(payload).eq('id', input.id).select('*').single()
    : await db().from('document_series').insert(payload).select('*').single()
  if (error) throw new Error(error.message)
  return data as DocumentSeriesRow
}

// ─── Customers ──────────────────────────────────────────────────────────────

export async function listCustomers(allowed: string[] | null, brandId?: string): Promise<SalesCustomerRow[]> {
  const brands = scopedBrandIds(allowed, brandId)
  let q = db().from('sales_customers').select('*').order('business_name')
  if (brands !== null) q = q.in('brand_id', brands)
  const { data } = await q
  return (data as SalesCustomerRow[] | null) ?? []
}

export async function createCustomer(input: Partial<SalesCustomerRow> & { business_name: string }): Promise<SalesCustomerRow> {
  const name = (input.business_name ?? '').trim()
  if (!name) throw new Error('Business name is required.')
  const ref = await mintReference('sales_customer', 'CUST-')
  const { data, error } = await db().from('sales_customers').insert({
    ...input,
    customer_ref: ref,
    business_name: name,
  }).select('*').single()
  if (error) {
    // The duplicate guards are unique indexes, so surface them as advice.
    if (error.message.includes('idx_sales_customer_pin')) {
      throw new Error('A customer with that PIN already exists.')
    }
    if (error.message.includes('idx_sales_customer_name')) {
      throw new Error('A customer with that business name already exists for this brand.')
    }
    throw new Error(error.message)
  }
  return data as SalesCustomerRow
}

/** Outstanding balance per customer — invoiced minus allocated payments. */
export async function customerBalances(allowed: string[] | null, brandId?: string) {
  const brands = scopedBrandIds(allowed, brandId)
  let q = db().from('sales_invoices').select('*').neq('status', 'draft').neq('status', 'cancelled')
  if (brands !== null) q = q.in('brand_id', brands)
  const { data } = await q
  const invoices = (data as SalesInvoiceRow[] | null) ?? []

  const byCustomer = new Map<string, { invoiced: number; paid: number; outstanding: number; count: number; overdue: number }>()
  const today = todayInEat()
  for (const inv of invoices) {
    const key = inv.customer_id ?? 'walk-in'
    const row = byCustomer.get(key) ?? { invoiced: 0, paid: 0, outstanding: 0, count: 0, overdue: 0 }
    const total = Number(inv.total_amount_ksh ?? 0)
    const paid = Number(inv.amount_paid_ksh ?? 0)
    row.invoiced += total
    row.paid += paid
    row.outstanding += total - paid
    row.count += 1
    if (total - paid > 0.005 && inv.due_date && inv.due_date < today) row.overdue += total - paid
    byCustomer.set(key, row)
  }
  return byCustomer
}

// ─── Account opening applications ───────────────────────────────────────────

export async function listAccountApplications(allowed: string[] | null): Promise<SalesAccountApplicationRow[]> {
  const brands = scopedBrandIds(allowed, undefined)
  let q = db().from('sales_account_applications').select('*').order('created_at', { ascending: false }).limit(200)
  if (brands !== null) q = q.in('brand_id', brands)
  const { data } = await q
  return (data as SalesAccountApplicationRow[] | null) ?? []
}

export async function createAccountApplication(
  input: Partial<SalesAccountApplicationRow>,
): Promise<SalesAccountApplicationRow> {
  const ref = await mintReference('account_application', 'AOA-')
  const { data, error } = await db().from('sales_account_applications')
    .insert({ ...input, application_ref: ref }).select('*').single()
  if (error) throw new Error(error.message)
  return data as SalesAccountApplicationRow
}

/**
 * Approve an account-opening application and give the customer their terms.
 * The verifier cannot be the approver — enforced by a CHECK in migration 066
 * as well as here, so it holds for any caller.
 */
export async function decideAccountApplication(input: {
  id: string
  decision: 'verify' | 'approve' | 'reject'
  actor: string
  terms_days?: number
  reason?: string
}): Promise<SalesAccountApplicationRow> {
  const { data: existing } = await db().from('sales_account_applications')
    .select('*').eq('id', input.id).maybeSingle()
  if (!existing) throw new Error('Application not found.')
  const app = existing as SalesAccountApplicationRow

  if (input.decision === 'approve') {
    if (app.verified_by && app.verified_by.trim().toLowerCase() === input.actor.trim().toLowerCase()) {
      throw new Error('You verified this application, so you cannot also approve it.')
    }
    if (!app.verified_by) throw new Error('This application must be verified before it can be approved.')
  }

  const today = todayInEat()
  const patch: Partial<SalesAccountApplicationRow> =
    input.decision === 'verify'
      ? { status: 'verified', verified_by: input.actor, verified_date: today }
      : input.decision === 'approve'
        ? {
            status: 'approved', approved_by: input.actor, approved_date: today,
            approved_terms_days: input.terms_days ?? app.approved_terms_days ?? 0,
          }
        : { status: 'rejected', rejection_reason: input.reason ?? '' }

  const { data, error } = await db().from('sales_account_applications')
    .update({ ...patch, updated_at: nowIso() }).eq('id', input.id).select('*').single()
  if (error) throw new Error(error.message)
  const row = data as SalesAccountApplicationRow

  // An approval writes the terms onto the live customer record.
  if (input.decision === 'approve' && row.customer_id) {
    await db().from('sales_customers').update({
      credit_approved: true,
      payment_terms_days: row.approved_terms_days ?? 0,
      credit_limit_ksh: Number(row.amount_intended_ksh ?? 0),
      updated_at: nowIso(),
    }).eq('id', row.customer_id)
  }
  return row
}

// ─── Invoices ───────────────────────────────────────────────────────────────

export async function listInvoices(
  allowed: string[] | null,
  opts: { brandId?: string; customerId?: string; status?: string; limit?: number } = {},
): Promise<SalesInvoiceRow[]> {
  const brands = scopedBrandIds(allowed, opts.brandId)
  let q = db().from('sales_invoices').select('*')
    .order('invoice_date', { ascending: false }).limit(opts.limit ?? 100)
  if (brands !== null) q = q.in('brand_id', brands)
  if (opts.customerId) q = q.eq('customer_id', opts.customerId)
  if (opts.status) q = q.eq('status', opts.status)
  const { data } = await q
  return (data as SalesInvoiceRow[] | null) ?? []
}

export async function getInvoice(id: string) {
  const [{ data: head }, { data: lines }] = await Promise.all([
    db().from('sales_invoices').select('*').eq('id', id).maybeSingle(),
    db().from('sales_invoice_items').select('*').eq('invoice_id', id).order('sort_order'),
  ])
  if (!head) return null
  return {
    invoice: head as SalesInvoiceRow,
    items: (lines as SalesInvoiceItemRow[] | null) ?? [],
  }
}

export interface InvoiceLineInput {
  item_id?: string | null
  item_code?: string
  description: string
  /** The pad's UNIT column — pack count, e.g. "8PC". Verbatim, for printing. */
  pad_unit_text?: string
  /** The pad's QTY column — pack size, e.g. "1ltr". Verbatim, for printing. */
  pad_qty_text?: string
  /** The real numeric quantity. This is what moves stock. */
  quantity: number
  uom?: string
  rate_ksh: number
  batch_number?: string
}

/** Recompute the header totals from the stored (generated) line values. */
async function refreshInvoiceTotals(invoiceId: string): Promise<SalesInvoiceRow> {
  const { data } = await db().from('sales_invoice_items').select('*').eq('invoice_id', invoiceId)
  const lines = (data as SalesInvoiceItemRow[] | null) ?? []
  const sum = (k: 'line_net_ksh' | 'line_vat_ksh' | 'line_total_ksh') =>
    Number(lines.reduce((acc, l) => acc + Number(l[k] ?? 0), 0).toFixed(2))

  const { data: updated, error } = await db().from('sales_invoices').update({
    net_amount_ksh: sum('line_net_ksh'),
    vat_amount_ksh: sum('line_vat_ksh'),
    total_amount_ksh: sum('line_total_ksh'),
    updated_at: nowIso(),
  }).eq('id', invoiceId).select('*').single()
  if (error) throw new Error(error.message)
  return updated as SalesInvoiceRow
}

/**
 * Create a DRAFT invoice. No stock moves here — see postInvoice().
 *
 * VAT: rates are taken as VAT-INCLUSIVE by default, matching the physical pad
 * (invoice 1261: 2568.97 + 411.03 = 2980.00). The convention is stored on every
 * line, so re-rating VAT later cannot restate this invoice.
 */
export async function createInvoice(input: {
  brand_id: string | null
  customer_id?: string | null
  bill_to_name?: string
  invoice_number?: string
  invoice_date?: string
  due_date?: string | null
  sale_type?: 'cash' | 'credit'
  salesperson_id?: string | null
  allocation_id?: string | null
  source_store_id?: string | null
  delivery_note_no?: string
  lpo_number?: string
  vat_rate_percent?: number
  prices_include_vat?: boolean
  notes?: string
  lines: InvoiceLineInput[]
  created_by: string
}): Promise<SalesInvoiceRow> {
  const lines = input.lines.filter((l) => (l.description ?? '').trim() && Number(l.quantity) > 0)
  if (lines.length === 0) throw new Error('An invoice needs at least one line with a quantity.')
  if (input.sale_type === 'credit' && !input.customer_id) {
    throw new Error('A credit sale must name the customer being given credit.')
  }

  const vatRate = Number(input.vat_rate_percent ?? VAT_RATE_PERCENT)
  const inclusive = input.prices_include_vat !== false
  const ref = await mintReference('sales_invoice', 'INV-')

  const { data, error } = await db().from('sales_invoices').insert({
    invoice_ref: ref,
    invoice_number: (input.invoice_number ?? '').trim(),
    brand_id: input.brand_id,
    customer_id: input.customer_id ?? null,
    bill_to_name: input.bill_to_name ?? '',
    invoice_date: input.invoice_date ?? todayInEat(),
    due_date: input.due_date ?? null,
    vat_rate_percent: vatRate,
    prices_include_vat: inclusive,
    sale_type: input.sale_type ?? 'cash',
    salesperson_id: input.salesperson_id ?? null,
    allocation_id: input.allocation_id ?? null,
    source_store_id: input.source_store_id ?? null,
    delivery_note_no: input.delivery_note_no ?? '',
    lpo_number: input.lpo_number ?? '',
    status: 'draft',
    notes: input.notes ?? '',
    created_by: input.created_by,
  }).select('*').single()
  if (error) {
    if (error.message.includes('idx_sales_invoice_number')) {
      throw new Error(`Invoice number "${input.invoice_number}" has already been used for this brand.`)
    }
    throw new Error(error.message)
  }
  const invoice = data as SalesInvoiceRow

  const { error: lineError } = await db().from('sales_invoice_items').insert(
    lines.map((l, idx) => ({
      invoice_id: invoice.id,
      item_id: l.item_id ?? null,
      item_code: l.item_code ?? '',
      description: l.description.trim(),
      pad_unit_text: l.pad_unit_text ?? '',
      pad_qty_text: l.pad_qty_text ?? '',
      quantity: Number(l.quantity),
      uom: l.uom ?? 'pcs',
      rate_ksh: Number(l.rate_ksh),
      vat_rate_percent: vatRate,
      prices_include_vat: inclusive,
      batch_number: l.batch_number ?? '',
      sort_order: idx,
    })),
  )
  if (lineError) throw new Error(lineError.message)

  return refreshInvoiceTotals(invoice.id)
}

/**
 * Issue the invoice and move the goods.
 *
 * Every line that names an inventory item deducts finished goods through the
 * shared ledger. Lines with no linked item (a service, or an ad-hoc
 * description) move nothing — deliberately, because inventing an item to make
 * the ledger balance would be worse than recording that nothing moved.
 *
 * Idempotent: the status guard catches the ordinary double-click, and the
 * partial unique index on inventory_movements.sales_invoice_item_id catches a
 * genuine concurrent replay.
 */
export async function postInvoice(invoiceId: string, postedBy: string): Promise<SalesInvoiceRow> {
  const loaded = await getInvoice(invoiceId)
  if (!loaded) throw new Error('Invoice not found.')
  const { invoice, items } = loaded
  if (invoice.status !== 'draft') throw new Error(`This invoice is already ${invoice.status}.`)

  for (const line of items) {
    if (!line.item_id || Number(line.quantity) <= 0) continue
    await recordStockMovement({
      item_id: line.item_id,
      direction: 'out',
      quantity: Number(line.quantity),
      movement_date: invoice.invoice_date,
      reason: `Sold on invoice ${invoice.invoice_number || invoice.invoice_ref}`,
      reference: invoice.invoice_number || invoice.invoice_ref,
      source: 'sales_invoice',
      sales_invoice_id: invoice.id,
      sales_invoice_item_id: line.id,
      batch_number: line.batch_number,
      store_id: invoice.source_store_id,
      recorded_by: postedBy,
    })
  }

  const { data, error } = await db().from('sales_invoices').update({
    status: 'issued',
    posted_at: nowIso(),
    posted_by: postedBy,
    reconciliation_status: 'ready',
    updated_at: nowIso(),
  }).eq('id', invoice.id).select('*').single()
  if (error) throw new Error(error.message)

  if (invoice.invoice_number) {
    await advanceSeries('invoice', invoice.brand_id, invoice.invoice_number, postedBy)
  }
  return data as SalesInvoiceRow
}

// ─── Payments ───────────────────────────────────────────────────────────────

export async function listPayments(allowed: string[] | null, limit = 100): Promise<SalesPaymentRow[]> {
  const brands = scopedBrandIds(allowed, undefined)
  let q = db().from('sales_payments').select('*')
    .order('payment_date', { ascending: false }).limit(limit)
  if (brands !== null) q = q.in('brand_id', brands)
  const { data } = await q
  return (data as SalesPaymentRow[] | null) ?? []
}

/**
 * Record a payment and allocate it across invoices.
 *
 * Over-allocation is refused: you cannot allocate more than was received, and
 * you cannot allocate more to an invoice than it still owes. Both are checked
 * before anything is written, so a bad allocation leaves no partial state.
 */
export async function recordPayment(input: {
  brand_id: string | null
  customer_id?: string | null
  payment_date?: string
  method?: string
  amount_ksh: number
  reference?: string
  mpesa_code?: string
  received_by: string
  allocations?: Array<{ invoice_id: string; amount_ksh: number }>
  notes?: string
  created_by: string
}): Promise<SalesPaymentRow> {
  const amount = Number(input.amount_ksh)
  if (!(amount > 0)) throw new Error('A payment amount is required.')

  const allocations = (input.allocations ?? []).filter((a) => Number(a.amount_ksh) > 0)
  const allocated = allocations.reduce((s, a) => s + Number(a.amount_ksh), 0)
  if (allocated - amount > 0.005) {
    throw new Error(`Allocated KSh ${allocated.toFixed(2)} is more than the KSh ${amount.toFixed(2)} received.`)
  }

  // Check every target invoice BEFORE writing anything.
  for (const alloc of allocations) {
    const { data } = await db().from('sales_invoices').select('*').eq('id', alloc.invoice_id).maybeSingle()
    if (!data) throw new Error('One of the invoices being paid could not be found.')
    const inv = data as SalesInvoiceRow
    const owing = Number(inv.total_amount_ksh ?? 0) - Number(inv.amount_paid_ksh ?? 0)
    if (Number(alloc.amount_ksh) - owing > 0.005) {
      throw new Error(
        `Invoice ${inv.invoice_number || inv.invoice_ref} only owes KSh ${owing.toFixed(2)}.`,
      )
    }
  }

  const ref = await mintReference('sales_payment', 'PMT-')
  const { data, error } = await db().from('sales_payments').insert({
    payment_ref: ref,
    brand_id: input.brand_id,
    customer_id: input.customer_id ?? null,
    payment_date: input.payment_date ?? todayInEat(),
    method: input.method ?? 'cash',
    amount_ksh: amount,
    reference: input.reference ?? '',
    mpesa_code: (input.mpesa_code ?? '').trim(),
    received_by: input.received_by,
    reconciliation_status: 'ready',
    notes: input.notes ?? '',
    created_by: input.created_by,
  }).select('*').single()
  if (error) {
    if (error.message.includes('idx_sales_payment_mpesa')) {
      throw new Error('That M-Pesa code has already been recorded against another payment.')
    }
    throw new Error(error.message)
  }
  const payment = data as SalesPaymentRow

  for (const alloc of allocations) {
    await db().from('sales_payment_allocations').insert({
      payment_id: payment.id,
      invoice_id: alloc.invoice_id,
      amount_ksh: Number(alloc.amount_ksh),
    })
    await refreshInvoicePaid(alloc.invoice_id)
  }
  return payment
}

/** Re-derive an invoice's paid amount and status from its allocations. */
async function refreshInvoicePaid(invoiceId: string): Promise<void> {
  const { data } = await db().from('sales_payment_allocations')
    .select('amount_ksh').eq('invoice_id', invoiceId)
  const paid = ((data as { amount_ksh: number }[] | null) ?? [])
    .reduce((s, a) => s + Number(a.amount_ksh ?? 0), 0)

  const { data: invRow } = await db().from('sales_invoices').select('*').eq('id', invoiceId).maybeSingle()
  if (!invRow) return
  const inv = invRow as SalesInvoiceRow
  const total = Number(inv.total_amount_ksh ?? 0)

  // Statuses are derived, never typed — a paid invoice cannot be marked unpaid
  // by hand, and a part-paid one cannot be marked paid.
  const status = inv.status === 'cancelled' || inv.status === 'credited'
    ? inv.status
    : paid <= 0.005 ? 'issued'
      : total - paid <= 0.005 ? 'paid'
        : 'part_paid'

  await db().from('sales_invoices')
    .update({ amount_paid_ksh: Number(paid.toFixed(2)), status, updated_at: nowIso() })
    .eq('id', invoiceId)
}
