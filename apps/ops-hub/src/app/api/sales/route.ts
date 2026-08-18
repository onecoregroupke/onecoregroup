import { NextResponse, type NextRequest } from 'next/server'
import { requireApiSection, getApiActor } from '@/lib/api-auth'
import {
  listCustomers, createCustomer, customerBalances,
  listInvoices, getInvoice, createInvoice, postInvoice,
  listPayments, recordPayment,
  listAccountApplications, createAccountApplication, decideAccountApplication,
  listSeries, upsertSeries, suggestPadNumber,
} from '@/lib/sales'
import { auditEvent } from '@/lib/audit'

/**
 * Iceland sales — customers, account applications, invoices and payments.
 *
 * Gated on `finance`, brand-scoped. An invoice moves finished goods, so posting
 * one requires edit; reading the order book requires view.
 */
export async function GET(req: NextRequest) {
  const actor = await getApiActor(req)
  if (!actor) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  if (!actor.can('finance', 'view')) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }

  const url = new URL(req.url)
  const view = url.searchParams.get('view') ?? 'invoices'
  const allowed = actor.allowedBrandIds('finance')
  const brandId = url.searchParams.get('brand') ?? undefined

  try {
    switch (view) {
      case 'customers':
        return NextResponse.json({ ok: true, customers: await listCustomers(allowed, brandId) })
      case 'balances': {
        const map = await customerBalances(allowed, brandId)
        return NextResponse.json({ ok: true, balances: Object.fromEntries(map) })
      }
      case 'invoices':
        return NextResponse.json({
          ok: true,
          invoices: await listInvoices(allowed, {
            brandId,
            customerId: url.searchParams.get('customer') ?? undefined,
            status: url.searchParams.get('status') ?? undefined,
          }),
        })
      case 'invoice': {
        const id = url.searchParams.get('id') ?? ''
        const loaded = id ? await getInvoice(id) : null
        if (!loaded) return NextResponse.json({ ok: false, error: 'Invoice not found' }, { status: 404 })
        return NextResponse.json({ ok: true, ...loaded })
      }
      case 'payments':
        return NextResponse.json({ ok: true, payments: await listPayments(allowed) })
      case 'applications':
        return NextResponse.json({ ok: true, applications: await listAccountApplications(allowed) })
      case 'series':
        return NextResponse.json({ ok: true, series: await listSeries() })
      case 'next-number':
        return NextResponse.json({
          ok: true,
          number: await suggestPadNumber(
            url.searchParams.get('doc') ?? 'invoice',
            url.searchParams.get('brand') ?? null,
          ),
        })
      default:
        return NextResponse.json({ ok: false, error: `Unknown view "${view}"` }, { status: 400 })
    }
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireApiSection(req, 'finance', 'edit')
  if (gate instanceof NextResponse) return gate
  const actor = gate
  const who = actor.name || actor.email || actor.userId
  const allowed = actor.allowedBrandIds('finance')

  const assertBrand = (brandId: string | null) => {
    if (allowed === null) return
    if (!brandId || !allowed.includes(brandId)) {
      throw new Error('That brand is outside the brands you manage.')
    }
  }

  try {
    const body = await req.json()
    const action = String(body?.action ?? '')

    switch (action) {
      case 'create-customer': {
        assertBrand(body.brand_id ?? null)
        const row = await createCustomer({ ...body, created_by: who })
        await auditEvent({ actor, action: 'sales.customer.create', entity_table: 'sales_customers', entity_id: row.id, entity_label: row.business_name, after_data: row as unknown as Record<string, unknown> })
        return NextResponse.json({ ok: true, row }, { status: 201 })
      }

      case 'create-application': {
        const row = await createAccountApplication({ ...body, created_by: who })
        await auditEvent({ actor, action: 'sales.application.create', entity_table: 'sales_account_applications', entity_id: row.id, entity_label: row.business_name, after_data: row as unknown as Record<string, unknown> })
        return NextResponse.json({ ok: true, row }, { status: 201 })
      }

      case 'decide-application': {
        // The verifier cannot also approve — enforced in the service and by a
        // CHECK constraint, so it holds for any caller.
        const row = await decideAccountApplication({
          id: body.id,
          decision: body.decision,
          actor: who,
          terms_days: body.terms_days,
          reason: body.reason,
        })
        await auditEvent({ actor, action: `sales.application.${body.decision}`, entity_table: 'sales_account_applications', entity_id: row.id, after_data: row as unknown as Record<string, unknown> })
        return NextResponse.json({ ok: true, row })
      }

      case 'create-invoice': {
        assertBrand(body.brand_id ?? null)
        // Created as a DRAFT. Drafting must never deplete a store.
        const row = await createInvoice({ ...body, created_by: who })
        await auditEvent({ actor, action: 'sales.invoice.create', entity_table: 'sales_invoices', entity_id: row.id, entity_label: row.invoice_number || row.invoice_ref, after_data: row as unknown as Record<string, unknown> })
        return NextResponse.json({ ok: true, row }, { status: 201 })
      }

      case 'post-invoice': {
        if (!body?.id) return NextResponse.json({ ok: false, error: 'id is required' }, { status: 400 })
        // THIS is what moves finished goods out of stock, exactly once.
        const row = await postInvoice(body.id, who)
        await auditEvent({ actor, action: 'sales.invoice.post', entity_table: 'sales_invoices', entity_id: row.id, entity_label: row.invoice_number || row.invoice_ref, after_data: row as unknown as Record<string, unknown> })
        return NextResponse.json({ ok: true, row })
      }

      case 'record-payment': {
        assertBrand(body.brand_id ?? null)
        const row = await recordPayment({ ...body, received_by: who, created_by: who })
        await auditEvent({ actor, action: 'sales.payment.record', entity_table: 'sales_payments', entity_id: row.id, entity_label: row.payment_ref, after_data: row as unknown as Record<string, unknown> })
        return NextResponse.json({ ok: true, row }, { status: 201 })
      }

      case 'set-series': {
        // The operator tells the system where the physical pad has reached.
        const row = await upsertSeries({ ...body, updated_by: who })
        await auditEvent({ actor, action: 'sales.series.set', entity_table: 'document_series', entity_id: row.id, entity_label: `${row.doc_type} → ${row.current_number}`, after_data: row as unknown as Record<string, unknown> })
        return NextResponse.json({ ok: true, row })
      }

      default:
        return NextResponse.json({ ok: false, error: `Unknown action "${action}"` }, { status: 400 })
    }
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}
