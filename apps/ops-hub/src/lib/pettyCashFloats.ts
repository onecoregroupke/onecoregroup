import { db, nowIso, todayInEat, mintReference } from './serverClient'
import { scopedBrandIds } from './stockCards'
import {
  calculatedClosingBalance, checkFloatClosure, openNextFloat,
  checkDocumentCompleteness, DEFAULT_DOCUMENT_RULES,
  type CarryForwardDecision, type FloatActivity, type DocumentType,
} from './pettyCashFloatModel'
import type {
  PettyCashFloatRow, PettyCashDocumentRow, PettyCashDocumentRuleRow,
  PettyCashTransactionRow,
} from '@ocg/db'

// =============================================================================
// PETTY-CASH FLOAT LIFECYCLE (migration 062) — data access.
//
// A float is a cycle: opened with cash → spent against → closed with a physical
// count → its remaining balance is carried, returned, reimbursed or written off.
//
// The two rules that matter, both enforced in the database as well as here:
//   · ONE ACTIVE FLOAT PER CUSTODIAN — otherwise spending has no unambiguous home.
//   · ONE SUCCESSOR PER FLOAT — the carry-forward double-count guard. A balance
//     that is carried into a new float cannot ALSO be reimbursed or returned.
// =============================================================================

export async function listFloats(
  allowed: string[] | null,
  opts: { brandId?: string; custodianId?: string; status?: string; limit?: number } = {},
): Promise<PettyCashFloatRow[]> {
  const brands = scopedBrandIds(allowed, opts.brandId)
  let q = db().from('petty_cash_floats').select('*')
    .order('opened_on', { ascending: false }).limit(opts.limit ?? 60)
  if (brands !== null) q = q.in('brand_id', brands)
  if (opts.custodianId) q = q.eq('custodian_id', opts.custodianId)
  if (opts.status) q = q.eq('status', opts.status)
  const { data } = await q
  return (data as PettyCashFloatRow[] | null) ?? []
}

export async function getFloat(id: string): Promise<PettyCashFloatRow | null> {
  const { data } = await db().from('petty_cash_floats').select('*').eq('id', id).maybeSingle()
  return (data as PettyCashFloatRow | null) ?? null
}

/** Transactions charged to a float. */
export async function floatTransactions(floatId: string): Promise<PettyCashTransactionRow[]> {
  const { data } = await db().from('petty_cash_transactions').select('*')
    .eq('float_id', floatId)
    .order('transaction_date', { ascending: true })
    .order('created_at', { ascending: true })
  return (data as PettyCashTransactionRow[] | null) ?? []
}

/** Roll a float's transactions into the activity shape the model expects. */
export async function floatActivity(floatId: string): Promise<FloatActivity> {
  const rows = await floatTransactions(floatId)
  let expenses = 0
  let transaction_charges = 0
  let refunds = 0
  for (const t of rows) {
    if (t.entry_kind === 'expense') {
      expenses += Number(t.expense_amount_ksh ?? 0)
      // §7: the sheets record the transaction charge APART from the expense,
      // and folding them together would lose a distinction finance already
      // maintains on paper. The model takes them as separate inputs.
      transaction_charges += Number(t.transaction_charge_ksh ?? 0)
        + Number(t.withdrawal_charge_ksh ?? 0)
        + Number(t.secondary_charge_ksh ?? 0)
    } else {
      refunds += Number(t.cash_received_ksh ?? 0)
    }
  }
  return {
    expenses: Number(expenses.toFixed(2)),
    transaction_charges: Number(transaction_charges.toFixed(2)),
    refunds: Number(refunds.toFixed(2)),
    // Manual adjustments are not yet a separate transaction kind; kept at zero
    // rather than folded into refunds, where it would be indistinguishable.
    adjustments: 0,
  }
}

/** The funding side of a float, in the shape the model expects. */
function fundingOf(float: PettyCashFloatRow) {
  return {
    opening_amount: Number(float.opening_amount_ksh ?? 0),
    balance_brought_forward: Number(float.balance_brought_forward_ksh ?? 0),
    additional_funding: Number(float.additional_funding_ksh ?? 0),
  }
}

/** Opening + carried + top-ups − (spend + charges) + income. */
export async function floatBalance(floatId: string): Promise<{
  float: PettyCashFloatRow
  activity: FloatActivity
  calculated: number
}> {
  const float = await getFloat(floatId)
  if (!float) throw new Error('Float not found.')
  const activity = await floatActivity(floatId)
  const calculated = calculatedClosingBalance(fundingOf(float), activity)
  return { float, activity, calculated }
}

/**
 * Open a float. Refuses a second ACTIVE float for the same custodian — the
 * database has a partial unique index, and this catches it first with an
 * explanation rather than a constraint-violation string.
 */
export async function openFloat(input: {
  brand_id: string | null
  account_id?: string | null
  custodian: string
  custodian_id?: string | null
  opened_on?: string
  opening_amount_ksh: number
  funding_source?: string
  funding_reference?: string
  purpose?: string
  created_by: string
}): Promise<PettyCashFloatRow> {
  if (!(Number(input.opening_amount_ksh) > 0)) {
    throw new Error('An opening amount is required.')
  }
  if (input.custodian_id) {
    const { data: open } = await db().from('petty_cash_floats').select('id, float_ref')
      .eq('custodian_id', input.custodian_id)
      .in('status', ['open', 'active', 'awaiting_documents', 'awaiting_review', 'reopened'])
      .limit(1)
    const existing = ((open as { float_ref: string }[] | null) ?? [])[0]
    if (existing) {
      throw new Error(`${input.custodian} already holds an open float (${existing.float_ref}). Close it first.`)
    }
  }

  const ref = await mintReference('petty_float', 'FLT-')
  const { data, error } = await db().from('petty_cash_floats').insert({
    float_ref: ref,
    brand_id: input.brand_id,
    account_id: input.account_id ?? null,
    custodian: input.custodian,
    custodian_id: input.custodian_id ?? null,
    opened_on: input.opened_on ?? todayInEat(),
    opening_amount_ksh: Number(input.opening_amount_ksh),
    funding_source: input.funding_source ?? '',
    funding_reference: input.funding_reference ?? '',
    purpose: input.purpose ?? '',
    status: 'active',
    created_by: input.created_by,
  }).select('*').single()
  if (error) throw new Error(error.message)
  return data as PettyCashFloatRow
}

/** Add money to a live float without opening a new cycle. */
export async function topUpFloat(input: {
  float_id: string
  amount_ksh: number
  reference?: string
  by: string
}): Promise<PettyCashFloatRow> {
  const float = await getFloat(input.float_id)
  if (!float) throw new Error('Float not found.')
  if (['closed', 'reconciled', 'cancelled'].includes(float.status)) {
    throw new Error(`This float is ${float.status} — open a new one instead of topping it up.`)
  }
  const { data, error } = await db().from('petty_cash_floats').update({
    additional_funding_ksh: Number(float.additional_funding_ksh ?? 0) + Number(input.amount_ksh),
    funding_reference: input.reference || float.funding_reference,
    updated_at: nowIso(),
  }).eq('id', float.id).select('*').single()
  if (error) throw new Error(error.message)
  return data as PettyCashFloatRow
}

/**
 * Close a float against a physical cash count.
 *
 * The variance between calculated and counted must be EXPLAINED — a float
 * cannot be closed on a difference nobody has accounted for. That rule lives in
 * checkFloatClosure() and is unit-tested.
 */
export async function closeFloat(input: {
  float_id: string
  physical_balance_ksh: number
  variance_explanation?: string
  carry_forward_decision: CarryForwardDecision
  amount_returned_ksh?: number
  amount_reimbursed_ksh?: number
  closure_notes?: string
  closed_by: string
}): Promise<PettyCashFloatRow> {
  const { float, activity, calculated } = await floatBalance(input.float_id)
  if (float.status === 'closed' || float.status === 'reconciled') {
    throw new Error('This float is already closed.')
  }

  // §9 gates closure on more than arithmetic: documents outstanding and
  // unreconciled transactions both block it, so count them first.
  const transactions = await floatTransactions(input.float_id)
  let missingDocuments = 0
  for (const t of transactions) {
    if (t.entry_kind !== 'expense') continue
    const completeness = await documentCompleteness(t.id)
    if (!completeness.complete) missingDocuments += 1
  }
  const unreconciled = transactions.filter(
    (t) => (t.reconciliation_status ?? 'not_ready') !== 'reconciled',
  ).length

  const check = checkFloatClosure({
    funding: fundingOf(float),
    activity,
    physicalBalance: Number(input.physical_balance_ksh),
    varianceExplanation: input.variance_explanation ?? '',
    transactionsMissingDocuments: missingDocuments,
    transactionsUnreconciled: unreconciled,
    reviewedBy: input.closed_by,
    // QuickBooks reconciliation is not a precondition for closing the physical
    // cash box — it happens after the export arrives. Documents still are.
    requireReconciliation: false,
  })
  if (!check.canClose) throw new Error(check.problems.join(' '))

  const { data, error } = await db().from('petty_cash_floats').update({
    status: 'closed',
    closed_on: todayInEat(),
    calculated_balance_ksh: calculated,
    physical_balance_ksh: Number(input.physical_balance_ksh),
    variance_ksh: check.variance,
    variance_explanation: input.variance_explanation ?? '',
    carry_forward_decision: input.carry_forward_decision,
    amount_returned_ksh: Number(input.amount_returned_ksh ?? 0),
    amount_reimbursed_ksh: Number(input.amount_reimbursed_ksh ?? 0),
    closure_notes: input.closure_notes ?? '',
    reviewed_by: input.closed_by,
    reviewed_at: nowIso(),
    reconciliation_status: 'ready',
    updated_at: nowIso(),
  }).eq('id', float.id).select('*').single()
  if (error) throw new Error(error.message)
  return data as PettyCashFloatRow
}

/**
 * Open the next float, carrying forward the closed one's balance.
 *
 * The double-count guard: a float may have exactly ONE successor (unique index),
 * and a balance that was RETURNED, REIMBURSED or WRITTEN OFF is not also
 * carried. openNextFloat() decides how much legitimately carries; the index
 * stops it happening twice.
 */
export async function carryForward(input: {
  previous_float_id: string
  opening_amount_ksh?: number
  funding_source?: string
  funding_reference?: string
  created_by: string
}): Promise<PettyCashFloatRow> {
  const previous = await getFloat(input.previous_float_id)
  if (!previous) throw new Error('Previous float not found.')
  if (previous.status !== 'closed' && previous.status !== 'reconciled') {
    throw new Error('Close the previous float before carrying it forward.')
  }
  if (previous.succeeding_float_id) {
    throw new Error('This float has already been carried forward.')
  }

  const next = openNextFloat({
    decision: previous.carry_forward_decision as CarryForwardDecision,
    previousClosingBalance: Number(previous.physical_balance_ksh ?? previous.calculated_balance_ksh ?? 0),
    newFundingAmount: Number(input.opening_amount_ksh ?? 0),
  })

  const ref = await mintReference('petty_float', 'FLT-')
  const { data, error } = await db().from('petty_cash_floats').insert({
    float_ref: ref,
    brand_id: previous.brand_id,
    account_id: previous.account_id,
    custodian: previous.custodian,
    custodian_id: previous.custodian_id,
    opened_on: todayInEat(),
    opening_amount_ksh: Number(input.opening_amount_ksh ?? 0),
    balance_brought_forward_ksh: next.balance_brought_forward,
    previous_float_id: previous.id,
    funding_source: input.funding_source ?? previous.funding_source,
    funding_reference: input.funding_reference ?? '',
    purpose: previous.purpose,
    status: 'active',
    created_by: input.created_by,
  }).select('*').single()
  if (error) throw new Error(error.message)
  const created = data as PettyCashFloatRow

  const { error: linkError } = await db().from('petty_cash_floats')
    .update({ succeeding_float_id: created.id, updated_at: nowIso() })
    .eq('id', previous.id)
  if (linkError) throw new Error(linkError.message)

  return created
}

// ─── Supporting document packets ────────────────────────────────────────────

export async function listDocuments(opts: { floatId?: string; transactionId?: string }): Promise<PettyCashDocumentRow[]> {
  let q = db().from('petty_cash_documents').select('*').order('created_at')
  if (opts.floatId) q = q.eq('float_id', opts.floatId)
  if (opts.transactionId) q = q.eq('transaction_id', opts.transactionId)
  const { data } = await q
  return (data as PettyCashDocumentRow[] | null) ?? []
}

export async function listDocumentRules(brandId: string | null): Promise<PettyCashDocumentRuleRow[]> {
  let q = db().from('petty_cash_document_rules').select('*').eq('active', true)
  q = brandId ? q.or(`brand_id.eq.${brandId},brand_id.is.null`) : q.is('brand_id', null)
  const { data } = await q
  return (data as PettyCashDocumentRuleRow[] | null) ?? []
}

/**
 * Which supporting documents a transaction still needs.
 *
 * Rules come from petty_cash_document_rules where configured, and fall back to
 * DEFAULT_DOCUMENT_RULES otherwise — so a category nobody has configured still
 * demands a receipt rather than silently demanding nothing.
 */
export async function documentCompleteness(transactionId: string) {
  const { data: txnRow } = await db().from('petty_cash_transactions')
    .select('*').eq('id', transactionId).maybeSingle()
  if (!txnRow) throw new Error('Transaction not found.')
  const txn = txnRow as PettyCashTransactionRow

  const [docs, rules] = await Promise.all([
    listDocuments({ transactionId }),
    listDocumentRules(txn.brand_id),
  ])

  const category = txn.expense_category || 'default'
  const rule = rules.find((r) => r.category.toLowerCase() === category.toLowerCase())
  const required = (rule
    ? rule.required_documents
    : (DEFAULT_DOCUMENT_RULES[category] ?? DEFAULT_DOCUMENT_RULES['default'] ?? [])) as DocumentType[]

  // A rule may only bite above a threshold — a KSh 50 matatu fare should not
  // demand a supplier invoice. Below it, nothing is required.
  const amount = Number(txn.expense_amount_ksh ?? 0)
  const threshold = rule ? Number(rule.minimum_amount_ksh ?? 0) : 0
  if (threshold > 0 && amount < threshold) {
    return { status: 'complete' as const, missing: [], complete: true }
  }

  return checkDocumentCompleteness(
    required,
    docs.filter((d) => d.status !== 'rejected').map((d) => d.document_type as DocumentType),
  )
}

export async function attachDocument(input: {
  transaction_id?: string | null
  float_id?: string | null
  document_type: string
  file_name?: string
  file_url?: string
  storage_bucket?: string
  storage_path?: string
  uploaded_by: string
  notes?: string
}): Promise<PettyCashDocumentRow> {
  const { data, error } = await db().from('petty_cash_documents').insert({
    transaction_id: input.transaction_id ?? null,
    float_id: input.float_id ?? null,
    document_type: input.document_type,
    status: 'attached',
    file_name: input.file_name ?? '',
    file_url: input.file_url ?? '',
    storage_bucket: input.storage_bucket ?? '',
    storage_path: input.storage_path ?? '',
    uploaded_by: input.uploaded_by,
    uploaded_at: nowIso(),
    notes: input.notes ?? '',
  }).select('*').single()
  if (error) throw new Error(error.message)
  return data as PettyCashDocumentRow
}
