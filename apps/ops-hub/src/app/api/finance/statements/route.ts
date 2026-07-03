import { NextResponse, type NextRequest } from 'next/server'
import { requireApiSection } from '@/lib/api-auth'
import { db } from '@/lib/serverClient'
import { assertBrandInScope } from '@/lib/finance'
import {
  approveStatementImport,
  extractPdfText,
  getStatementImport,
  listStatementImports,
  parseStatementText,
  uploadStatementFile,
  type StatementType,
} from '@/lib/financeStatements'
import type { FinanceAccountRow, FinanceTransactionRow } from '@ocg/db'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const gate = await requireApiSection(req, 'finance', 'view')
  if (gate instanceof NextResponse) return gate
  const actor = gate
  const allowed = actor.permissions === null || actor.isSuperAdmin ? null : (actor.allowedBrandIds('finance') ?? [])
  const id = new URL(req.url).searchParams.get('id')
  if (id) {
    const detail = await getStatementImport(id)
    if (!detail) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
    assertBrandInScope(detail.brand_id, allowed, 'statement import')
    return NextResponse.json({ ok: true, import: detail })
  }
  const imports = await listStatementImports(allowed)
  return NextResponse.json({ ok: true, imports })
}

export async function POST(req: NextRequest) {
  const gate = await requireApiSection(req, 'finance', 'edit')
  if (gate instanceof NextResponse) return gate
  const actor = gate
  const allowed = actor.permissions === null || actor.isSuperAdmin ? null : (actor.allowedBrandIds('finance') ?? [])

  try {
    const form = await req.formData()
    const file = form.get('file')
    const statementType = String(form.get('statement_type') ?? 'mpesa') as StatementType
    const accountId = String(form.get('account_id') ?? '')
    const brandId = String(form.get('brand_id') ?? '')
    if (!(file instanceof File)) throw new Error('Upload a PDF statement file.')
    if (!accountId) throw new Error('Choose the payment account this statement belongs to.')
    if (!brandId) throw new Error('Choose the brand this statement belongs to.')
    assertBrandInScope(brandId, allowed, 'statement import')

    const supabase = db()
    const { data: account } = await supabase.from('finance_accounts').select('*').eq('id', accountId).maybeSingle()
    if (!account) throw new Error('Payment account not found.')
    const accountRow = account as FinanceAccountRow
    if (accountRow.brand_id) assertBrandInScope(accountRow.brand_id, allowed, 'statement account')

    const bytes = Buffer.from(await file.arrayBuffer())
    const uploaded = await uploadStatementFile({
      accountId,
      filename: file.name,
      bytes,
      contentType: file.type || 'application/pdf',
    })
    const text = file.type.includes('pdf') || file.name.toLowerCase().endsWith('.pdf')
      ? await extractPdfText(bytes)
      : bytes.toString('utf8')

    const [{ data: accountRows }, { data: existingRows }] = await Promise.all([
      supabase.from('finance_accounts').select('*').eq('is_active', true),
      supabase.from('finance_transactions').select('*').eq('account_id', accountId).limit(2500),
    ])
    const candidates = parseStatementText({
      text,
      statementType: statementType === 'bank' ? 'bank' : 'mpesa',
      brandId,
      account: accountRow,
      accounts: (accountRows as FinanceAccountRow[] | null) ?? [],
      existingTransactions: (existingRows as FinanceTransactionRow[] | null) ?? [],
    })

    const { data: importRow, error: importError } = await supabase
      .from('finance_statement_imports')
      .insert({
        brand_id: brandId,
        account_id: accountId,
        statement_type: statementType === 'bank' ? 'bank' : 'mpesa',
        source_filename: file.name,
        storage_bucket: uploaded.bucket,
        storage_path: uploaded.path,
        parse_status: candidates.length ? 'pending_review' : 'needs_manual_review',
        imported_by: actor.name || actor.email || 'finance',
        extracted_text: text.slice(0, 250000),
        notes: String(form.get('notes') ?? ''),
      })
      .select('*')
      .single()
    if (importError) throw new Error(importError.message)

    if (candidates.length > 0) {
      const { error: lineError } = await supabase.from('finance_statement_lines').insert(
        candidates.map((line) => ({
          ...line,
          import_id: importRow.id,
          brand_id: brandId,
          account_id: accountId,
        })),
      )
      if (lineError) throw new Error(lineError.message)
    }

    const detail = await getStatementImport(importRow.id)
    return NextResponse.json({ ok: true, import: detail, candidateCount: candidates.length }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}

export async function PATCH(req: NextRequest) {
  const gate = await requireApiSection(req, 'finance', 'edit')
  if (gate instanceof NextResponse) return gate
  const actor = gate
  const allowed = actor.permissions === null || actor.isSuperAdmin ? null : (actor.allowedBrandIds('finance') ?? [])

  try {
    const body = await req.json()
    const importId = String(body?.import_id ?? '')
    const detail = await getStatementImport(importId)
    if (!detail) throw new Error('Statement import not found.')
    assertBrandInScope(detail.brand_id, allowed, 'statement import')
    const result = await approveStatementImport({
      importId,
      reviewedBy: actor.name || actor.email || 'finance',
      lines: Array.isArray(body?.lines) ? body.lines : [],
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}
