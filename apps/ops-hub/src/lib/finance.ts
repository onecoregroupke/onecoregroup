import { db, nowIso } from './serverClient'
import { safeRows } from './management'
import type {
  Brand,
  FinanceAccountRow,
  FinanceTransactionRow,
  FinanceVoteheadRow,
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
  if (input.account_id) {
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
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)

  if (input.account_id && balanceAfter !== null) {
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
  const scoped = scopeByBrand(rows, allowed)
  return opts.brandId ? scoped.filter((r) => r.brand_id === opts.brandId) : scoped
}
