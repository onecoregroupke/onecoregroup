import { NextResponse, type NextRequest } from 'next/server'
import { requireApiSection } from '@/lib/api-auth'
import {
  approveFinanceJournal, assertBrandInScope, createFinanceJournal, createVotehead,
  postFinanceJournal, recordMoneyMovement, reverseFinanceJournal,
} from '@/lib/finance'
import { memberForEmail } from '@/lib/team'
import { hasAuthority } from '@/lib/governanceModel'
import { db } from '@/lib/serverClient'
import type { EmployeeAuthorityRow } from '@ocg/db'

async function hasFinanceAuthority(actor: Exclude<Awaited<ReturnType<typeof requireApiSection>>, NextResponse>, action: string, brandId: string) {
  if (actor.permissions === null) return true
  const member = await memberForEmail(actor.email)
  if (!member) return false
  const { data } = await db().from('employee_authorities').select('*').eq('member_id', member.id).eq('active', true)
  return hasAuthority((data as EmployeeAuthorityRow[] | null) ?? [], action, { brandId, operationalArea: 'finance' })
}

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
    const allowed = actor.permissions === null || actor.isSuperAdmin ? null : (actor.allowedBrandIds('finance') ?? [])

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
        category: (values.category as string) ?? '',
        reference: (values.reference as string) ?? '',
        description: String(values.description ?? ''),
        counterparty_name: (values.counterparty_name as string) ?? '',
        payment_channel: (values.payment_channel as string) ?? '',
        source_document_url: (values.source_document_url as string) ?? '',
        statement_import_id: (values.statement_import_id as string) || null,
        statement_line_id: (values.statement_line_id as string) || null,
        transaction_cost_ksh: Number(values.transaction_cost_ksh ?? 0),
        notes: (values.notes as string) ?? '',
        recorded_by: actor.name || actor.email || 'unknown',
        source_type: (values.source_type as string) ?? 'manual',
        source_id: (values.source_id as string) ?? '',
        source_reference: (values.source_reference as string) ?? (values.reference as string) ?? '',
        posting_status: ['draft', 'submitted', 'approved', 'posted'].includes(String(values.posting_status))
          ? values.posting_status as 'draft' | 'submitted' | 'approved' | 'posted'
          : 'posted',
        idempotency_key: (values.idempotency_key as string) ?? '',
        approved_by: (values.approved_by as string) ?? '',
        import_id: (values.import_id as string) || null,
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

    if (action === 'journal-create') {
      const brandId = String(values.brand_id ?? '')
      assertBrandInScope(brandId, allowed, 'create journals')
      const journal = await createFinanceJournal({
        brand_id: brandId,
        effective_date: (values.effective_date as string) || undefined,
        source_type: String(values.source_type ?? ''),
        source_id: String(values.source_id ?? ''),
        source_reference: (values.source_reference as string) ?? '',
        description: (values.description as string) ?? '',
        idempotency_key: String(values.idempotency_key ?? ''),
        import_id: (values.import_id as string) || null,
        created_by: actor.email || actor.name,
        lines: Array.isArray(values.lines) ? values.lines : [],
      })
      return NextResponse.json({ ok: true, journal }, { status: 201 })
    }

    if (['journal-approve', 'journal-post', 'journal-reverse'].includes(action)) {
      const id = String(values.id ?? '')
      const { data: existing } = await db().from('finance_journals').select('*').eq('id', id).maybeSingle()
      if (!existing) return NextResponse.json({ ok: false, error: 'Journal not found' }, { status: 404 })
      const brandId = String((existing as { brand_id: string }).brand_id)
      assertBrandInScope(brandId, allowed, 'manage journals')
      const authority = action === 'journal-approve' ? 'approve' : action === 'journal-post' ? 'post' : 'reverse'
      if (!await hasFinanceAuthority(actor, authority, brandId)) {
        return NextResponse.json({ ok: false, error: `Explicit finance ${authority} authority is required.` }, { status: 403 })
      }
      const who = actor.email || actor.name
      const journal = action === 'journal-approve'
        ? await approveFinanceJournal(id, who)
        : action === 'journal-post'
          ? await postFinanceJournal(id, who)
          : await reverseFinanceJournal(id, who, String(values.reason ?? ''))
      return NextResponse.json({ ok: true, journal })
    }

    return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}
