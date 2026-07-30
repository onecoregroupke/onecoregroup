import { NextResponse, type NextRequest } from 'next/server'
import { requireApiSection } from '@/lib/api-auth'
import {
  listPettyCashAccounts,
  listPettyCashTransactions,
  createPettyCashAccount,
  recordPettyCashTransaction,
  setPettyCashState,
  summarisePettyCash,
} from '@/lib/pettyCash'
import type { PettyCashState } from '@ocg/db'

/**
 * Petty cash API (Part 7). Brand-scoped: writes require `finance` edit and are
 * checked against the caller's allowed brands (enforced in the service layer,
 * not just hidden in the UI).
 */

function allowedFor(actor: Awaited<ReturnType<typeof requireApiSection>>): string[] | null {
  if (actor instanceof NextResponse) return null
  return actor.permissions === null || actor.isSuperAdmin ? null : (actor.allowedBrandIds('finance') ?? [])
}

export async function GET(req: NextRequest) {
  const gate = await requireApiSection(req, 'finance', 'view')
  if (gate instanceof NextResponse) return gate
  const actor = gate
  const allowed = actor.permissions === null || actor.isSuperAdmin ? null : (actor.allowedBrandIds('finance') ?? [])
  const url = new URL(req.url)
  const brandId = url.searchParams.get('brand') || undefined
  const accountId = url.searchParams.get('account') || undefined
  const [accounts, transactions] = await Promise.all([
    listPettyCashAccounts(allowed),
    listPettyCashTransactions(allowed, { brandId, accountId, limit: 5000 }),
  ])
  return NextResponse.json({ ok: true, accounts, transactions, summary: summarisePettyCash(transactions) })
}

export async function POST(req: NextRequest) {
  const gate = await requireApiSection(req, 'finance', 'edit')
  if (gate instanceof NextResponse) return gate
  const actor = gate
  const allowed = allowedFor(actor)
  try {
    const body = await req.json()
    const action = String(body?.action ?? '')
    const values = (body?.values ?? {}) as Record<string, unknown>

    if (action === 'create-account') {
      const account = await createPettyCashAccount(
        {
          name: String(values.name ?? ''),
          brand_id: (values.brand_id as string) || null,
          operating_unit: (values.operating_unit as string) ?? '',
          department: (values.department as string) ?? '',
          custodian: (values.custodian as string) ?? '',
          opening_float_ksh: Number(values.opening_float_ksh ?? 0),
          notes: (values.notes as string) ?? '',
        },
        allowed,
      )
      return NextResponse.json({ ok: true, account }, { status: 201 })
    }

    if (action === 'record') {
      const tx = await recordPettyCashTransaction(
        {
          account_id: (values.account_id as string) || null,
          brand_id: (values.brand_id as string) || null,
          department: (values.department as string) ?? '',
          custodian: (values.custodian as string) ?? '',
          entry_kind: (values.entry_kind as 'opening' | 'income' | 'expense') || 'expense',
          transaction_date: (values.transaction_date as string) || undefined,
          opening_float_ksh: Number(values.opening_float_ksh ?? 0),
          cash_received_ksh: Number(values.cash_received_ksh ?? 0),
          source_of_funds: (values.source_of_funds as string) ?? '',
          expense_amount_ksh: Number(values.expense_amount_ksh ?? 0),
          expense_category: (values.expense_category as string) ?? '',
          payee: (values.payee as string) ?? '',
          description: (values.description as string) ?? '',
          transaction_charge_ksh: Number(values.transaction_charge_ksh ?? 0),
          withdrawal_charge_ksh: Number(values.withdrawal_charge_ksh ?? 0),
          secondary_charge_ksh: Number(values.secondary_charge_ksh ?? 0),
          secondary_charge_label: (values.secondary_charge_label as string) ?? '',
          reference: (values.reference as string) ?? '',
          receipt_url: (values.receipt_url as string) ?? '',
          state: (values.state as PettyCashState) || 'draft',
          notes: (values.notes as string) ?? '',
        },
        allowed,
        actor,
      )
      return NextResponse.json({ ok: true, transaction: tx }, { status: 201 })
    }

    if (action === 'set-state') {
      const tx = await setPettyCashState(String(values.id ?? ''), values.state as PettyCashState, allowed, actor)
      return NextResponse.json({ ok: true, transaction: tx })
    }

    return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}
