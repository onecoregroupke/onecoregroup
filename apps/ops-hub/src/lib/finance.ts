import { db, mintReference, nowIso } from './serverClient'
import { safeRows } from './management'
import type {
  Brand,
  FinanceAccountRow,
  FinanceTransactionRow,
  FinanceVoteheadRow,
  FinanceJournalRow,
  FinanceJournalLineRow,
} from '@ocg/db'

// =============================================================================
// Finance ledger — voteheads, money-in / money-out recording with a running
// account balance, and brand compartmentalization helpers. Every entry point
// here trusts the caller (API route / server page) to have already resolved
// the actor; brand-scope enforcement lives in `assertBrandInScope`, which the
// routes MUST call with the actor's `allowedBrandIds('finance')`.
// =============================================================================

/** Throw unless the brand is inside the caller's allowed set (null = all). */
export function assertBrandInScope(
  brandId: string | null | undefined,
  allowed: string[] | null,
  what = 'record',
): void {
  if (allowed === null) return
  if (!brandId || !allowed.includes(brandId)) {
    throw new Error(`You do not have access to ${what} for this brand.`)
  }
}

/** Filter rows that carry a brand_id down to the caller's allowed brands.
 *  Scoped users do NOT see group-wide rows (brand_id null) — those belong to
 *  the full-view managers. */
export function scopeByBrand<T extends { brand_id: string | null }>(
  rows: T[],
  allowed: string[] | null,
): T[] {
  if (allowed === null) return rows
  return rows.filter((r) => r.brand_id !== null && allowed.includes(r.brand_id))
}

export function scopeBrands(brands: Brand[], allowed: string[] | null): Brand[] {
  if (allowed === null) return brands
  return brands.filter((b) => allowed.includes(b.id))
}

export async function listVoteheads(allowed: string[] | null): Promise<FinanceVoteheadRow[]> {
  let q = db()
    .from('finance_voteheads')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (allowed !== null) q = q.in('brand_id', allowed)
  const { data } = await q
  return (data as FinanceVoteheadRow[] | null) ?? []
}

export interface RecordMovementInput {
  brand_id: string
  direction: 'inflow' | 'outflow'
  amount_ksh: number
  transaction_date?: string
  account_id?: string | null
  votehead_id?: string | null
  category?: string
  reference?: string
  /** Reason for the movement — "Reason for expenditure" / "Source of income". */
  description: string
  counterparty_name?: string
  payment_channel?: string
  source_document_url?: string
  statement_import_id?: string | null
  statement_line_id?: string | null
  transaction_cost_ksh?: number
  notes?: string
  recorded_by: string
  source_type?: string
  source_id?: string
  source_reference?: string
  posting_status?: 'draft' | 'submitted' | 'approved' | 'posted'
  idempotency_key?: string
  approved_by?: string
  import_id?: string | null
}

/**
 * Record a money-in or money-out movement. When the movement hits a payment
 * account, the account's current balance is updated atomically-enough for a
 * single-operator ledger and the post-movement balance is stored on the
 * transaction (`balance_after_ksh` — the "new balance" column accountants ask
 * for). The votehead must belong to the same brand.
 */
export async function recordMoneyMovement(
  input: RecordMovementInput,
): Promise<{ transaction: FinanceTransactionRow; newBalance: number | null }> {
  const supabase = db()
  const amount = Number(input.amount_ksh)
  if (!input.brand_id) throw new Error('brand_id is required')
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Amount must be greater than 0')
  if (!input.description?.trim()) throw new Error('Reason / description is required')

  if (input.idempotency_key) {
    const { data: replay } = await supabase
      .from('finance_transactions')
      .select('*')
      .eq('idempotency_key', input.idempotency_key)
      .maybeSingle()
    if (replay) {
      return {
        transaction: replay as FinanceTransactionRow,
        newBalance: (replay as FinanceTransactionRow).balance_after_ksh,
      }
    }
  }

  let category = input.category?.trim() || 'uncategorized'
  if (input.votehead_id) {
    const { data: votehead } = await supabase
      .from('finance_voteheads')
      .select('*')
      .eq('id', input.votehead_id)
      .maybeSingle()
    if (!votehead) throw new Error('Votehead not found')
    if ((votehead as FinanceVoteheadRow).brand_id !== input.brand_id) {
      throw new Error('Votehead belongs to a different brand')
    }
    category = (votehead as FinanceVoteheadRow).name
  }

  let balanceAfter: number | null = null
  const postingStatus = input.posting_status ?? 'posted'
  if (input.account_id && postingStatus === 'posted') {
    const { data: account } = await supabase
      .from('finance_accounts')
      .select('*')
      .eq('id', input.account_id)
      .maybeSingle()
    if (!account) throw new Error('Payment account not found')
    const current = Number((account as FinanceAccountRow).current_balance_ksh ?? 0)
    balanceAfter = input.direction === 'inflow' ? current + amount : current - amount
  }

  const { data, error } = await supabase
    .from('finance_transactions')
    .insert({
      brand_id: input.brand_id,
      account_id: input.account_id || null,
      votehead_id: input.votehead_id || null,
      transaction_date: input.transaction_date || nowIso().slice(0, 10),
      direction: input.direction,
      category,
      description: input.description.trim(),
      amount_ksh: amount,
      payment_channel: input.payment_channel ?? '',
      reference: input.reference ?? '',
      counterparty_name: input.counterparty_name ?? '',
      source_document_url: input.source_document_url ?? '',
      statement_import_id: input.statement_import_id || null,
      statement_line_id: input.statement_line_id || null,
      transaction_cost_ksh: Number(input.transaction_cost_ksh ?? 0),
      notes: input.notes ?? '',
      balance_after_ksh: balanceAfter,
      recorded_by: input.recorded_by,
      source_type: input.source_type ?? 'manual',
      source_id: input.source_id ?? '',
      source_reference: input.source_reference ?? input.reference ?? '',
      posting_status: postingStatus,
      idempotency_key: input.idempotency_key ?? '',
      approved_by: input.approved_by ?? '',
      import_id: input.import_id ?? null,
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)

  if (input.account_id && balanceAfter !== null && postingStatus === 'posted') {
    await supabase
      .from('finance_accounts')
      .update({ current_balance_ksh: balanceAfter, updated_at: nowIso() })
      .eq('id', input.account_id)
  }

  return { transaction: data as FinanceTransactionRow, newBalance: balanceAfter }
}

export async function createVotehead(input: {
  brand_id: string
  name: string
  kind: 'income' | 'expense' | 'both'
  description?: string
}): Promise<FinanceVoteheadRow> {
  if (!input.brand_id) throw new Error('brand_id is required')
  if (!input.name?.trim()) throw new Error('Votehead name is required')
  const { data, error } = await db()
    .from('finance_voteheads')
    .insert({
      brand_id: input.brand_id,
      name: input.name.trim(),
      kind: input.kind,
      description: input.description ?? '',
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as FinanceVoteheadRow
}

/** All voteheads (active) keyed by id — used to label ledger rows. */
export async function voteheadMap(allowed: string[] | null): Promise<Map<string, FinanceVoteheadRow>> {
  const rows = await listVoteheads(allowed)
  return new Map(rows.map((r) => [r.id, r]))
}

/** Recent brand-scoped ledger rows, newest first. */
export async function listLedger(
  allowed: string[] | null,
  opts: { brandId?: string; limit?: number } = {},
): Promise<FinanceTransactionRow[]> {
  const rows = await safeRows<FinanceTransactionRow>('finance_transactions', {
    limit: opts.limit ?? 2000,
    order: 'created_at',
  })
  const scoped = scopeByBrand(rows, allowed).filter((row) => row.posting_status === 'posted')
  return opts.brandId ? scoped.filter((r) => r.brand_id === opts.brandId) : scoped
}

export interface FinanceJournalInput {
  brand_id: string
  effective_date?: string
  source_type: string
  source_id: string
  source_reference?: string
  description?: string
  idempotency_key: string
  import_id?: string | null
  created_by: string
  lines: Array<{
    account_id?: string | null
    account_code?: string
    description?: string
    debit_ksh?: number
    credit_ksh?: number
  }>
}

function journalTotals(lines: FinanceJournalInput['lines']) {
  const debit = lines.reduce((sum, line) => sum + Number(line.debit_ksh ?? 0), 0)
  const credit = lines.reduce((sum, line) => sum + Number(line.credit_ksh ?? 0), 0)
  return { debit: Math.round(debit * 100) / 100, credit: Math.round(credit * 100) / 100 }
}

/** Create one submitted, balanced journal. The stable key makes retries return
 * the original journal rather than creating another set of lines. */
export async function createFinanceJournal(input: FinanceJournalInput): Promise<FinanceJournalRow> {
  if (!input.brand_id) throw new Error('brand_id is required')
  if (!input.source_type || !input.source_id) throw new Error('Journal source type and source ID are required')
  if (!input.idempotency_key) throw new Error('A journal idempotency key is required')
  if (input.lines.length < 2) throw new Error('A journal needs at least two lines')
  const totals = journalTotals(input.lines)
  if (totals.debit <= 0 || totals.debit !== totals.credit) throw new Error('Journal debits and credits must balance')

  const supabase = db()
  const { data: replay } = await supabase.from('finance_journals').select('*')
    .eq('idempotency_key', input.idempotency_key).maybeSingle()
  if (replay) return replay as FinanceJournalRow

  const reference = await mintReference('finance_journal', 'JRN-')
  const { data, error } = await supabase.from('finance_journals').insert({
    brand_id: input.brand_id,
    journal_ref: reference,
    effective_date: input.effective_date ?? nowIso().slice(0, 10),
    source_type: input.source_type,
    source_id: input.source_id,
    source_reference: input.source_reference ?? '',
    posting_status: 'submitted',
    idempotency_key: input.idempotency_key,
    description: input.description ?? '',
    created_by: input.created_by,
    import_id: input.import_id ?? null,
  }).select('*').single()
  if (error) throw new Error(error.message)
  const journal = data as FinanceJournalRow
  const { error: lineError } = await supabase.from('finance_journal_lines').insert(
    input.lines.map((line, index) => ({
      journal_id: journal.id,
      line_no: index + 1,
      account_id: line.account_id ?? null,
      account_code: line.account_code ?? '',
      description: line.description ?? '',
      debit_ksh: Number(line.debit_ksh ?? 0),
      credit_ksh: Number(line.credit_ksh ?? 0),
    })),
  )
  if (lineError) {
    await supabase.from('finance_journals').delete().eq('id', journal.id)
    throw new Error(lineError.message)
  }
  return journal
}

export async function approveFinanceJournal(id: string, approvedBy: string): Promise<FinanceJournalRow> {
  const { data: existing } = await db().from('finance_journals').select('*').eq('id', id).maybeSingle()
  if (!existing) throw new Error('Journal not found')
  const before = existing as FinanceJournalRow
  if (before.created_by.toLowerCase() === approvedBy.toLowerCase()) throw new Error('A journal cannot approve itself')
  if (before.posting_status !== 'submitted') throw new Error('Only a submitted journal can be approved')
  const { data, error } = await db().from('finance_journals').update({
    posting_status: 'approved', approved_by: approvedBy, approved_at: nowIso(), updated_at: nowIso(),
  }).eq('id', id).select('*').single()
  if (error) throw new Error(error.message)
  return data as FinanceJournalRow
}

export async function postFinanceJournal(id: string, postedBy: string): Promise<FinanceJournalRow> {
  const { data, error } = await db().rpc('post_finance_journal', { p_journal_id: id, p_posted_by: postedBy })
  if (error) throw new Error(error.message)
  return data as FinanceJournalRow
}

/** A reversal is a new, linked, balanced journal with debit/credit swapped.
 * The original stays intact and is marked reversed only after the reversal posts. */
export async function reverseFinanceJournal(id: string, reversedBy: string, reason: string): Promise<FinanceJournalRow> {
  const supabase = db()
  const [{ data: source }, { data: sourceLines }] = await Promise.all([
    supabase.from('finance_journals').select('*').eq('id', id).maybeSingle(),
    supabase.from('finance_journal_lines').select('*').eq('journal_id', id).order('line_no'),
  ])
  if (!source) throw new Error('Journal not found')
  const original = source as FinanceJournalRow
  if (original.posting_status !== 'posted') throw new Error('Only a posted journal can be reversed')
  const lines = (sourceLines as FinanceJournalLineRow[] | null) ?? []
  const reversal = await createFinanceJournal({
    brand_id: original.brand_id,
    effective_date: nowIso().slice(0, 10),
    source_type: 'journal_reversal',
    source_id: original.id,
    source_reference: original.journal_ref,
    description: reason || `Reversal of ${original.journal_ref}`,
    idempotency_key: `journal-reversal:${original.id}`,
    created_by: reversedBy,
    lines: lines.map((line) => ({
      account_id: line.account_id,
      account_code: line.account_code,
      description: line.description,
      debit_ksh: Number(line.credit_ksh),
      credit_ksh: Number(line.debit_ksh),
    })),
  })
  await supabase.from('finance_journals').update({
    posting_status: 'approved', approved_by: reversedBy, approved_at: nowIso(),
    reversal_of_id: original.id, updated_at: nowIso(),
  }).eq('id', reversal.id)
  const posted = await postFinanceJournal(reversal.id, reversedBy)
  await supabase.from('finance_journals').update({ posting_status: 'reversed', updated_at: nowIso() }).eq('id', original.id)
  return posted
}
