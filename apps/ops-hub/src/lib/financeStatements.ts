import { db, nowIso } from './serverClient'
import { recordMoneyMovement } from './finance'
import type {
  FinanceAccountRow,
  FinanceStatementImportRow,
  FinanceStatementLineRow,
  FinanceTransactionRow,
} from '@ocg/db'

const BUCKET = 'finance-statements'
const SIGNED_URL_TTL = 60 * 60 * 24 * 365

export type StatementType = 'mpesa' | 'bank'

export interface CandidateLine {
  statement_date: string | null
  raw_description: string
  reference: string
  counterparty_name: string
  counterparty_account_hint: string
  direction: 'inflow' | 'outflow'
  amount_ksh: number
  transaction_cost_ksh: number
  running_balance_ksh: number | null
  suggested_category: string
  suggested_internal_account_id: string | null
  suggested_counterparty_brand_id: string | null
  matched_transaction_id: string | null
  confidence: number
  raw_payload: Record<string, unknown>
}

export interface StatementImportDetails extends FinanceStatementImportRow {
  lines: FinanceStatementLineRow[]
  file_url: string | null
}

function slugifyFile(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9.]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 90) || 'statement.pdf'
  )
}

async function ensureBucket(): Promise<void> {
  const { error } = await db().storage.createBucket(BUCKET, { public: false })
  if (error && !/exist/i.test(error.message)) {
    // Best-effort: upload will surface real storage failures.
  }
}

export async function uploadStatementFile(input: {
  accountId: string
  filename: string
  bytes: Buffer
  contentType: string
}): Promise<{ bucket: string; path: string }> {
  await ensureBucket()
  const path = `${input.accountId}/${Date.now()}-${slugifyFile(input.filename)}`
  const { error } = await db().storage
    .from(BUCKET)
    .upload(path, input.bytes, { contentType: input.contentType || 'application/pdf', upsert: false })
  if (error) throw new Error(`Statement upload failed: ${error.message}`)
  return { bucket: BUCKET, path }
}

export async function signedStatementUrl(path: string): Promise<string | null> {
  if (!path) return null
  const { data } = await db().storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL)
  return data?.signedUrl ?? null
}

export async function extractPdfText(bytes: Buffer): Promise<string> {
  const { PDFParse } = await import('pdf-parse')
  const parser = new PDFParse({ data: bytes })
  try {
    const result = await parser.getText()
    return result.text ?? ''
  } finally {
    await parser.destroy().catch(() => undefined)
  }
}

export function parseStatementText(input: {
  text: string
  statementType: StatementType
  brandId: string
  account: FinanceAccountRow
  accounts: FinanceAccountRow[]
  existingTransactions: FinanceTransactionRow[]
}): CandidateLine[] {
  const lines = input.text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length >= 12)

  const candidates: CandidateLine[] = []
  for (const line of lines) {
    const parsed = input.statementType === 'mpesa'
      ? parseMpesaLine(line)
      : parseBankLine(line)
    if (!parsed) continue
    candidates.push(classifyCandidate({
      candidate: parsed,
      brandId: input.brandId,
      account: input.account,
      accounts: input.accounts,
      existingTransactions: input.existingTransactions,
    }))
  }
  return dedupeCandidates(candidates).slice(0, 500)
}

function parseMpesaLine(line: string): CandidateLine | null {
  const date = parseDate(line)
  const amounts = moneyValues(line)
  if (!date || amounts.length === 0) return null
  const reference = referenceFrom(line)
  const lower = line.toLowerCase()
  const cost = /cost|charge|transaction fee/.test(lower) && amounts.length > 1 ? amounts[0] : 0
  const amount = amounts.length > 1 && cost > 0 ? amounts[1] : amounts[0]
  const direction = /received|deposit|paid in|customer payment|funds received/.test(lower) && !/withdraw|sent to|paybill|buy goods|payment to/.test(lower)
    ? 'inflow'
    : 'outflow'
  return {
    statement_date: date,
    raw_description: line,
    reference,
    counterparty_name: counterpartyFrom(line),
    counterparty_account_hint: accountHintFrom(line),
    direction,
    amount_ksh: amount,
    transaction_cost_ksh: cost,
    running_balance_ksh: amounts.length >= 3 ? amounts.at(-1)! : null,
    suggested_category: '',
    suggested_internal_account_id: null,
    suggested_counterparty_brand_id: null,
    matched_transaction_id: null,
    confidence: 0,
    raw_payload: { source: 'mpesa_parser', line },
  }
}

function parseBankLine(line: string): CandidateLine | null {
  const date = parseDate(line)
  const amounts = moneyValues(line)
  if (!date || amounts.length === 0) return null
  const lower = line.toLowerCase()
  const direction = /\b(cr|credit|deposit)\b/.test(lower) && !/\b(dr|debit|charge|fee)\b/.test(lower)
    ? 'inflow'
    : 'outflow'
  return {
    statement_date: date,
    raw_description: line,
    reference: referenceFrom(line),
    counterparty_name: counterpartyFrom(line),
    counterparty_account_hint: accountHintFrom(line),
    direction,
    amount_ksh: amounts[0],
    transaction_cost_ksh: /charge|fee|commission/.test(lower) ? amounts[0] : 0,
    running_balance_ksh: amounts.length >= 2 ? amounts.at(-1)! : null,
    suggested_category: '',
    suggested_internal_account_id: null,
    suggested_counterparty_brand_id: null,
    matched_transaction_id: null,
    confidence: 0,
    raw_payload: { source: 'bank_parser', line },
  }
}

function classifyCandidate(input: {
  candidate: CandidateLine
  brandId: string
  account: FinanceAccountRow
  accounts: FinanceAccountRow[]
  existingTransactions: FinanceTransactionRow[]
}): CandidateLine {
  const candidate = { ...input.candidate, brand_id: input.brandId } as CandidateLine
  const haystack = `${candidate.raw_description} ${candidate.counterparty_name} ${candidate.counterparty_account_hint}`.toLowerCase()
  const internal = input.accounts.find((account) => {
    if (account.id === input.account.id) return false
    const id = account.account_identifier?.replace(/\D/g, '')
    const owner = account.owner_person?.toLowerCase()
    const name = account.account_name?.toLowerCase()
    const visibleTail = id && id.length >= 4 ? id.slice(-4) : ''
    return Boolean(
      (visibleTail && haystack.includes(visibleTail)) ||
      (owner && owner.length >= 4 && haystack.includes(owner)) ||
      (name && name.length >= 4 && haystack.includes(name)),
    )
  })
  if (internal) {
    candidate.suggested_category = 'Internal transfer'
    candidate.suggested_internal_account_id = internal.id
    candidate.suggested_counterparty_brand_id = internal.brand_id
    candidate.confidence = 0.86
  } else if (/fatma|nelson/.test(haystack)) {
    candidate.suggested_category = 'Owner funding / director transfer'
    candidate.confidence = 0.72
  } else if (/charge|fee|commission|transaction cost/.test(haystack) || candidate.transaction_cost_ksh > 0) {
    candidate.suggested_category = 'Transaction costs'
    candidate.confidence = 0.78
  } else {
    candidate.suggested_category = candidate.direction === 'inflow' ? 'Statement income' : 'Statement expense'
    candidate.confidence = 0.4
  }

  const matched = input.existingTransactions.find((tx) => {
    const sameRef = candidate.reference && tx.reference && tx.reference.toLowerCase() === candidate.reference.toLowerCase()
    const sameAmount = Math.abs(Number(tx.amount_ksh ?? 0) - candidate.amount_ksh) < 0.01
    const sameDate = !candidate.statement_date || !tx.transaction_date || tx.transaction_date === candidate.statement_date
    return (sameRef || (sameAmount && sameDate)) && tx.account_id === input.account.id
  })
  if (matched) {
    candidate.matched_transaction_id = matched.id
    candidate.suggested_category = candidate.suggested_category || matched.category
    candidate.confidence = Math.max(candidate.confidence, 0.9)
  }
  return candidate
}

function parseDate(line: string): string | null {
  const match = line.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/)
  if (!match) return null
  const day = match[1].padStart(2, '0')
  const month = match[2].padStart(2, '0')
  const year = match[3].length === 2 ? `20${match[3]}` : match[3]
  return `${year}-${month}-${day}`
}

function moneyValues(line: string): number[] {
  return [...line.matchAll(/(?:KES|KSH|KSh|Ksh)?\s*(-?\d{1,3}(?:,\d{3})*(?:\.\d{2})|-?\d+(?:\.\d{2}))/g)]
    .map((match) => Number(match[1].replace(/,/g, '')))
    .filter((value) => Number.isFinite(value) && Math.abs(value) > 0)
}

function referenceFrom(line: string): string {
  return line.match(/\b[A-Z0-9]{8,12}\b/)?.[0] ?? ''
}

function accountHintFrom(line: string): string {
  return line.match(/\b(?:\*{2,}|x{2,})?\d{3,}(?:\*{2,}|x{2,})?\d{0,4}\b/i)?.[0] ?? ''
}

function counterpartyFrom(line: string): string {
  const cleaned = line
    .replace(/\b\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}\b/g, '')
    .replace(/\b[A-Z0-9]{8,12}\b/g, '')
    .replace(/(?:KES|KSH|KSh|Ksh)?\s*-?\d{1,3}(?:,\d{3})*(?:\.\d{2})/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned.slice(0, 120)
}

function dedupeCandidates(rows: CandidateLine[]): CandidateLine[] {
  const seen = new Set<string>()
  return rows.filter((row) => {
    const key = [row.statement_date, row.reference, row.amount_ksh, row.raw_description.slice(0, 60)].join('|')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export async function listStatementImports(allowed: string[] | null): Promise<FinanceStatementImportRow[]> {
  let q = db().from('finance_statement_imports').select('*').order('created_at', { ascending: false }).limit(25)
  if (allowed !== null) q = q.in('brand_id', allowed)
  const { data } = await q
  return (data as FinanceStatementImportRow[] | null) ?? []
}

export async function getStatementImport(id: string): Promise<StatementImportDetails | null> {
  const supabase = db()
  const [{ data: row }, { data: lines }] = await Promise.all([
    supabase.from('finance_statement_imports').select('*').eq('id', id).maybeSingle(),
    supabase.from('finance_statement_lines').select('*').eq('import_id', id).order('statement_date', { ascending: true }),
  ])
  if (!row) return null
  const importRow = row as FinanceStatementImportRow
  return {
    ...importRow,
    lines: (lines as FinanceStatementLineRow[] | null) ?? [],
    file_url: await signedStatementUrl(importRow.storage_path),
  }
}

export async function approveStatementImport(input: {
  importId: string
  reviewedBy: string
  lines: Array<Partial<FinanceStatementLineRow> & { id: string }>
}): Promise<{ posted: number; matched: number }> {
  const detail = await getStatementImport(input.importId)
  if (!detail) throw new Error('Statement import not found')
  const byId = new Map(detail.lines.map((line) => [line.id, line]))
  let posted = 0
  let matched = 0

  for (const patch of input.lines) {
    const line = byId.get(patch.id)
    if (!line) continue
    const reviewStatus = patch.review_status ?? line.review_status
    const merged = { ...line, ...patch }
    await db().from('finance_statement_lines').update({
      statement_date: merged.statement_date,
      raw_description: merged.raw_description,
      reference: merged.reference,
      counterparty_name: merged.counterparty_name,
      counterparty_account_hint: merged.counterparty_account_hint,
      direction: merged.direction,
      amount_ksh: merged.amount_ksh,
      transaction_cost_ksh: merged.transaction_cost_ksh,
      running_balance_ksh: merged.running_balance_ksh,
      suggested_category: merged.suggested_category,
      suggested_votehead_id: merged.suggested_votehead_id,
      suggested_counterparty_brand_id: merged.suggested_counterparty_brand_id,
      suggested_internal_account_id: merged.suggested_internal_account_id,
      matched_transaction_id: merged.matched_transaction_id,
      review_status: reviewStatus,
      notes: merged.notes,
      updated_at: nowIso(),
    }).eq('id', line.id)

    if (reviewStatus === 'match_existing' && merged.matched_transaction_id) {
      await db().from('finance_transactions').update({
        statement_import_id: detail.id,
        statement_line_id: line.id,
        transaction_cost_ksh: Number(merged.transaction_cost_ksh ?? 0),
        updated_at: nowIso(),
      }).eq('id', merged.matched_transaction_id)
      await db().from('finance_statement_lines').update({
        review_status: 'matched',
        ledger_transaction_id: merged.matched_transaction_id,
        updated_at: nowIso(),
      }).eq('id', line.id)
      matched++
      continue
    }

    if (reviewStatus === 'approve_new') {
      const result = await recordMoneyMovement({
        brand_id: detail.brand_id ?? merged.brand_id ?? '',
        account_id: detail.account_id,
        direction: merged.direction === 'inflow' ? 'inflow' : 'outflow',
        amount_ksh: Number(merged.amount_ksh ?? 0),
        transaction_date: merged.statement_date ?? undefined,
        reference: merged.reference,
        category: merged.suggested_category || undefined,
        description: merged.raw_description || merged.suggested_category || 'Statement transaction',
        counterparty_name: merged.counterparty_name,
        payment_channel: detail.statement_type,
        source_document_url: detail.storage_path,
        statement_import_id: detail.id,
        statement_line_id: line.id,
        transaction_cost_ksh: Number(merged.transaction_cost_ksh ?? 0),
        notes: merged.notes,
        recorded_by: input.reviewedBy,
      })
      await db().from('finance_statement_lines').update({
        review_status: 'posted',
        ledger_transaction_id: result.transaction.id,
        updated_at: nowIso(),
      }).eq('id', line.id)
      posted++
    }
  }

  await db().from('finance_statement_imports').update({
    parse_status: 'approved',
    reviewed_by: input.reviewedBy,
    approved_at: nowIso(),
    updated_at: nowIso(),
  }).eq('id', input.importId)

  return { posted, matched }
}
