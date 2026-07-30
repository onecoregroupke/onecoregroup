import { db, nowIso } from './serverClient'
import { assertBrandInScope, scopeByBrand } from './finance'
import { sumMoney, addMoney, subMoney, roundMoney } from './money'
import { snapshotVersion } from './recordVersions'
import { auditEvent } from './audit'
import type { Actor } from './api-auth'
import type { PettyCashAccountRow, PettyCashTransactionRow, PettyCashReconciliationRow, PettyCashState } from '@ocg/db'

// =============================================================================
// Petty cash service (Part 7). Brand-scoped floats with income/expense lines,
// decimal-safe charges (incl. ZIIDI secondary charge), running balances,
// reconciliation, and a draft→…→closed workflow. Every mutation is brand-scope
// checked, version-snapshotted and audited.
// =============================================================================

export const PETTY_CASH_STATES: PettyCashState[] = [
  'draft', 'submitted', 'reviewed', 'approved', 'rejected', 'reconciled', 'closed',
]

export async function listPettyCashAccounts(allowed: string[] | null): Promise<PettyCashAccountRow[]> {
  const { data } = await db()
    .from('petty_cash_accounts')
    .select('*')
    .eq('is_active', true)
    .order('name', { ascending: true })
  return scopeByBrand((data as PettyCashAccountRow[] | null) ?? [], allowed)
}

export async function createPettyCashAccount(
  input: Partial<PettyCashAccountRow> & { name: string },
  allowed: string[] | null,
): Promise<PettyCashAccountRow> {
  assertBrandInScope(input.brand_id ?? null, allowed, 'create a petty cash float')
  if (!input.name?.trim()) throw new Error('Float name is required')
  const { data, error } = await db()
    .from('petty_cash_accounts')
    .insert({
      brand_id: input.brand_id ?? null,
      operating_unit: input.operating_unit ?? '',
      department: input.department ?? '',
      branch: input.branch ?? '',
      custodian: input.custodian ?? '',
      name: input.name.trim(),
      opening_float_ksh: roundMoney(Number(input.opening_float_ksh ?? 0)),
      current_balance_ksh: roundMoney(Number(input.opening_float_ksh ?? 0)),
      notes: input.notes ?? '',
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as PettyCashAccountRow
}

export async function listPettyCashTransactions(
  allowed: string[] | null,
  opts: { accountId?: string; brandId?: string; limit?: number } = {},
): Promise<PettyCashTransactionRow[]> {
  let q = db().from('petty_cash_transactions').select('*').order('transaction_date', { ascending: true }).order('created_at', { ascending: true })
  if (opts.accountId) q = q.eq('account_id', opts.accountId)
  if (opts.brandId) q = q.eq('brand_id', opts.brandId)
  q = q.limit(opts.limit ?? 5000)
  const { data } = await q
  return scopeByBrand((data as PettyCashTransactionRow[] | null) ?? [], allowed)
}

export interface PettyCashInput {
  account_id?: string | null
  brand_id?: string | null
  department?: string
  branch?: string
  custodian?: string
  entry_kind: 'opening' | 'income' | 'expense'
  transaction_date?: string
  opening_float_ksh?: number
  cash_received_ksh?: number
  source_of_funds?: string
  expense_amount_ksh?: number
  expense_category?: string
  payee?: string
  description?: string
  transaction_charge_ksh?: number
  withdrawal_charge_ksh?: number
  secondary_charge_ksh?: number
  secondary_charge_label?: string
  reference?: string
  receipt_url?: string
  state?: PettyCashState
  notes?: string
  source_workbook?: string
  source_sheet?: string
  source_row?: number | null
  import_id?: string | null
}

/** Current derived float balance for an account: opening + income − cash-out. */
export async function pettyCashBalance(accountId: string): Promise<number> {
  const { data } = await db().from('petty_cash_transactions').select('*').eq('account_id', accountId)
  const rows = (data as PettyCashTransactionRow[] | null) ?? []
  const income = sumMoney(rows.map((r) => addMoney(r.opening_float_ksh, r.cash_received_ksh)))
  const out = sumMoney(rows.map((r) => r.total_cash_out_ksh))
  return subMoney(income, out)
}

export async function recordPettyCashTransaction(
  input: PettyCashInput,
  allowed: string[] | null,
  actor: Pick<Actor, 'userId' | 'email' | 'name'>,
): Promise<PettyCashTransactionRow> {
  assertBrandInScope(input.brand_id ?? null, allowed, 'record petty cash')
  const supabase = db()

  // Running balance = prior balance for this account + this row's net effect.
  const prior = input.account_id ? await pettyCashBalance(input.account_id) : 0
  const net = subMoney(
    addMoney(Number(input.opening_float_ksh ?? 0), Number(input.cash_received_ksh ?? 0)),
    sumMoney([
      Number(input.expense_amount_ksh ?? 0),
      Number(input.transaction_charge_ksh ?? 0),
      Number(input.withdrawal_charge_ksh ?? 0),
      Number(input.secondary_charge_ksh ?? 0),
    ]),
  )
  const running = addMoney(prior, net)

  const { data, error } = await supabase
    .from('petty_cash_transactions')
    .insert({
      account_id: input.account_id ?? null,
      brand_id: input.brand_id ?? null,
      department: input.department ?? '',
      branch: input.branch ?? '',
      custodian: input.custodian ?? '',
      entry_kind: input.entry_kind,
      transaction_date: input.transaction_date || nowIso().slice(0, 10),
      opening_float_ksh: roundMoney(Number(input.opening_float_ksh ?? 0)),
      cash_received_ksh: roundMoney(Number(input.cash_received_ksh ?? 0)),
      source_of_funds: input.source_of_funds ?? '',
      expense_amount_ksh: roundMoney(Number(input.expense_amount_ksh ?? 0)),
      expense_category: input.expense_category ?? '',
      payee: input.payee ?? '',
      description: input.description ?? '',
      transaction_charge_ksh: roundMoney(Number(input.transaction_charge_ksh ?? 0)),
      withdrawal_charge_ksh: roundMoney(Number(input.withdrawal_charge_ksh ?? 0)),
      secondary_charge_ksh: roundMoney(Number(input.secondary_charge_ksh ?? 0)),
      secondary_charge_label: input.secondary_charge_label ?? '',
      running_balance_ksh: running,
      reference: input.reference ?? '',
      receipt_url: input.receipt_url ?? '',
      state: input.state ?? 'draft',
      notes: input.notes ?? '',
      source_workbook: input.source_workbook ?? '',
      source_sheet: input.source_sheet ?? '',
      source_row: input.source_row ?? null,
      import_id: input.import_id ?? null,
      created_by: actor.name || actor.email || 'unknown',
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  const row = data as PettyCashTransactionRow

  if (input.account_id) {
    await supabase
      .from('petty_cash_accounts')
      .update({ current_balance_ksh: running, updated_at: nowIso() })
      .eq('id', input.account_id)
  }

  await snapshotVersion({
    record_type: 'petty_cash_transactions',
    record_id: row.id,
    action: 'create',
    snapshot: row as unknown as Record<string, unknown>,
    brand_id: row.brand_id,
    changed_by: actor.name || actor.email || '',
    import_id: input.import_id ?? null,
  })
  await auditEvent({
    actor,
    action: 'petty_cash.record',
    entity_table: 'petty_cash_transactions',
    entity_id: row.id,
    entity_label: `${row.entry_kind} ${row.payee || row.source_of_funds}`.trim(),
    after_data: row as unknown as Record<string, unknown>,
  })
  return row
}

/** Move a petty-cash line through the workflow (draft→submitted→…→closed). */
export async function setPettyCashState(
  id: string,
  state: PettyCashState,
  allowed: string[] | null,
  actor: Pick<Actor, 'userId' | 'email' | 'name'>,
): Promise<PettyCashTransactionRow> {
  const supabase = db()
  const { data: existing } = await supabase.from('petty_cash_transactions').select('*').eq('id', id).maybeSingle()
  if (!existing) throw new Error('Petty cash entry not found')
  const before = existing as PettyCashTransactionRow
  assertBrandInScope(before.brand_id ?? null, allowed, 'update petty cash')
  const patch: Record<string, unknown> = { state, modified_by: actor.name || actor.email || '', updated_at: nowIso() }
  if (state === 'approved') { patch['approved_by'] = actor.name || actor.email || ''; patch['approved_at'] = nowIso() }
  const { data, error } = await supabase.from('petty_cash_transactions').update(patch).eq('id', id).select('*').single()
  if (error) throw new Error(error.message)
  const after = data as PettyCashTransactionRow
  await snapshotVersion({
    record_type: 'petty_cash_transactions', record_id: id, action: 'update',
    snapshot: after as unknown as Record<string, unknown>,
    previous_snapshot: before as unknown as Record<string, unknown>,
    brand_id: after.brand_id, changed_by: actor.name || actor.email || '', reason: `state → ${state}`,
  })
  await auditEvent({
    actor, action: `petty_cash.${state}`, entity_table: 'petty_cash_transactions', entity_id: id,
    before_data: before as unknown as Record<string, unknown>, after_data: after as unknown as Record<string, unknown>,
  })
  return after
}

export interface PettyCashSummary {
  opening: number
  received: number
  expenses: number
  charges: number
  expectedClosing: number
  count: number
}

/** Totals for an account or brand set — decimal-safe. */
export function summarisePettyCash(rows: PettyCashTransactionRow[]): PettyCashSummary {
  const opening = sumMoney(rows.map((r) => r.opening_float_ksh))
  const received = sumMoney(rows.map((r) => r.cash_received_ksh))
  const expenses = sumMoney(rows.map((r) => r.expense_amount_ksh))
  const charges = sumMoney(
    rows.map((r) => sumMoney([r.transaction_charge_ksh, r.withdrawal_charge_ksh, r.secondary_charge_ksh])),
  )
  const expectedClosing = subMoney(addMoney(opening, received), addMoney(expenses, charges))
  return { opening, received, expenses, charges, expectedClosing, count: rows.length }
}

export async function listReconciliations(allowed: string[] | null, accountId?: string): Promise<PettyCashReconciliationRow[]> {
  let q = db().from('petty_cash_reconciliations').select('*').order('created_at', { ascending: false })
  if (accountId) q = q.eq('account_id', accountId)
  const { data } = await q
  return scopeByBrand((data as PettyCashReconciliationRow[] | null) ?? [], allowed)
}
