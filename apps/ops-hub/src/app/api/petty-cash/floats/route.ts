import { NextResponse, type NextRequest } from 'next/server'
import { requireApiSection, getApiActor } from '@/lib/api-auth'
import {
  listFloats, getFloat, floatBalance, floatTransactions,
  openFloat, topUpFloat, closeFloat, carryForward,
  listDocuments, documentCompleteness, attachDocument,
} from '@/lib/pettyCashFloats'
import { auditEvent } from '@/lib/audit'

/**
 * Petty-cash float lifecycle. Gated on `finance`, brand-scoped.
 *
 * The two guarantees worth knowing: one active float per custodian, and one
 * successor per float. The second is the carry-forward double-count guard — a
 * balance that is carried cannot also be returned or reimbursed.
 */
export async function GET(req: NextRequest) {
  const actor = await getApiActor(req)
  if (!actor) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  if (!actor.can('finance', 'view')) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }

  const url = new URL(req.url)
  const view = url.searchParams.get('view') ?? 'floats'
  const allowed = actor.allowedBrandIds('finance')
  const id = url.searchParams.get('id') ?? ''

  try {
    switch (view) {
      case 'floats':
        return NextResponse.json({
          ok: true,
          floats: await listFloats(allowed, {
            brandId: url.searchParams.get('brand') ?? undefined,
            status: url.searchParams.get('status') ?? undefined,
          }),
        })
      case 'float': {
        if (!id) return NextResponse.json({ ok: false, error: 'id is required' }, { status: 400 })
        const float = await getFloat(id)
        if (!float) return NextResponse.json({ ok: false, error: 'Float not found' }, { status: 404 })
        const [balance, transactions, documents] = await Promise.all([
          floatBalance(id),
          floatTransactions(id),
          listDocuments({ floatId: id }),
        ])
        return NextResponse.json({
          ok: true,
          float,
          activity: balance.activity,
          calculated: balance.calculated,
          transactions,
          documents,
        })
      }
      case 'documents': {
        const txnId = url.searchParams.get('transaction') ?? ''
        if (!txnId) return NextResponse.json({ ok: false, error: 'transaction is required' }, { status: 400 })
        return NextResponse.json({
          ok: true,
          documents: await listDocuments({ transactionId: txnId }),
          completeness: await documentCompleteness(txnId),
        })
      }
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
      case 'open-float': {
        assertBrand(body.brand_id ?? null)
        const row = await openFloat({ ...body, created_by: who })
        await auditEvent({ actor, action: 'petty_cash.float.open', entity_table: 'petty_cash_floats', entity_id: row.id, entity_label: row.float_ref, after_data: row as unknown as Record<string, unknown> })
        return NextResponse.json({ ok: true, row }, { status: 201 })
      }

      case 'top-up': {
        const row = await topUpFloat({ float_id: body.float_id, amount_ksh: body.amount_ksh, reference: body.reference, by: who })
        await auditEvent({ actor, action: 'petty_cash.float.top_up', entity_table: 'petty_cash_floats', entity_id: row.id, entity_label: row.float_ref, after_data: row as unknown as Record<string, unknown> })
        return NextResponse.json({ ok: true, row })
      }

      case 'close-float': {
        // Refuses an unexplained variance, and refuses to close while documents
        // are still outstanding. Both checks live in checkFloatClosure().
        const row = await closeFloat({ ...body, closed_by: who })
        await auditEvent({ actor, action: 'petty_cash.float.close', entity_table: 'petty_cash_floats', entity_id: row.id, entity_label: row.float_ref, after_data: row as unknown as Record<string, unknown> })
        return NextResponse.json({ ok: true, row })
      }

      case 'carry-forward': {
        const row = await carryForward({ ...body, created_by: who })
        await auditEvent({ actor, action: 'petty_cash.float.carry_forward', entity_table: 'petty_cash_floats', entity_id: row.id, entity_label: row.float_ref, after_data: row as unknown as Record<string, unknown> })
        return NextResponse.json({ ok: true, row }, { status: 201 })
      }

      case 'attach-document': {
        const row = await attachDocument({ ...body, uploaded_by: who })
        await auditEvent({ actor, action: 'petty_cash.document.attach', entity_table: 'petty_cash_documents', entity_id: row.id, entity_label: row.document_type, after_data: row as unknown as Record<string, unknown> })
        return NextResponse.json({ ok: true, row }, { status: 201 })
      }

      default:
        return NextResponse.json({ ok: false, error: `Unknown action "${action}"` }, { status: 400 })
    }
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}
