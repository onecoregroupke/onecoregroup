import { NextResponse, type NextRequest } from 'next/server'
import { requireApiSection } from '@/lib/api-auth'
import { assertBrandInScope, createVotehead, recordMoneyMovement } from '@/lib/finance'

/**
 * Finance ledger endpoint.
 *   POST { action: 'record',   values: RecordMovementInput-ish }  — money in / money out
 *   POST { action: 'votehead', values: { brand_id, name, kind } } — add a votehead
 * Requires `finance` edit; brand-scoped finance users can only write within
 * their allowed brands (enforced here, not just hidden in the UI).
 */
export async function POST(req: NextRequest) {
  const gate = await requireApiSection(req, 'finance', 'edit')
  if (gate instanceof NextResponse) return gate
  const actor = gate

  try {
    const body = await req.json()
    const action = body?.action as string
    const values = (body?.values ?? {}) as Record<string, unknown>
    const allowed = actor.allowedBrandIds('finance')

    if (action === 'record') {
      assertBrandInScope(values.brand_id as string, allowed, 'record money')
      const direction = values.direction === 'inflow' ? 'inflow' : 'outflow'
      const result = await recordMoneyMovement({
        brand_id: String(values.brand_id ?? ''),
        direction,
        amount_ksh: Number(values.amount_ksh ?? 0),
        transaction_date: (values.transaction_date as string) || undefined,
        account_id: (values.account_id as string) || null,
        votehead_id: (values.votehead_id as string) || null,
        reference: (values.reference as string) ?? '',
        description: String(values.description ?? ''),
        counterparty_name: (values.counterparty_name as string) ?? '',
        payment_channel: (values.payment_channel as string) ?? '',
        source_document_url: (values.source_document_url as string) ?? '',
        notes: (values.notes as string) ?? '',
        recorded_by: actor.name || actor.email || 'unknown',
      })
      return NextResponse.json({ ok: true, ...result }, { status: 201 })
    }

    if (action === 'votehead') {
      assertBrandInScope(values.brand_id as string, allowed, 'manage voteheads')
      const kind = ['income', 'expense', 'both'].includes(String(values.kind))
        ? (String(values.kind) as 'income' | 'expense' | 'both')
        : 'expense'
      const votehead = await createVotehead({
        brand_id: String(values.brand_id ?? ''),
        name: String(values.name ?? ''),
        kind,
        description: (values.description as string) ?? '',
      })
      return NextResponse.json({ ok: true, votehead }, { status: 201 })
    }

    return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}
