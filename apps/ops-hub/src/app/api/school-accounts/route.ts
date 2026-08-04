import { NextResponse, type NextRequest } from 'next/server'
import { requireApiSection } from '@/lib/api-auth'
import { studentLedger, postLedgerEntry, reverseLedgerEntry, commitLedgerEntry, listChargeCategories, ensureChargeCategory, resolveSchoolBrandId } from '@/lib/schoolFinance'
import { summariseStudentAccount } from '@/lib/schoolBalance'
import type { School, SchoolLedgerEntryType } from '@ocg/db'

/**
 * Student-account API (Parts 3–5). Reads/writes the canonical school ledger.
 * Money access is governed by `finance`; brand scope is enforced in the service
 * layer (postLedgerEntry / reverseLedgerEntry call assertBrandInScope).
 */

const SCHOOLS = new Set<School>(['rayyan', 'rhythms', 'darul'])

function allowedFor(actor: Exclude<Awaited<ReturnType<typeof requireApiSection>>, NextResponse>): string[] | null {
  return actor.permissions === null || actor.isSuperAdmin ? null : (actor.allowedBrandIds('finance') ?? [])
}

export async function GET(req: NextRequest) {
  const gate = await requireApiSection(req, 'finance', 'view')
  if (gate instanceof NextResponse) return gate
  const url = new URL(req.url)
  const school = url.searchParams.get('school') as School | null
  const studentId = url.searchParams.get('studentId')
  if (!school || !SCHOOLS.has(school)) return NextResponse.json({ ok: false, error: 'valid school required' }, { status: 400 })
  // Brand isolation on READS too (the POST already enforces it): a finance user
  // scoped to other brands cannot read this school's student accounts.
  const allowed = allowedFor(gate)
  if (allowed !== null) {
    const brandId = await resolveSchoolBrandId(school)
    if (!brandId || !allowed.includes(brandId)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }
  if (studentId) {
    const entries = await studentLedger(school, studentId, { includeDrafts: true })
    return NextResponse.json({ ok: true, entries, summary: summariseStudentAccount(entries) })
  }
  const categories = await listChargeCategories(school)
  return NextResponse.json({ ok: true, categories })
}

export async function POST(req: NextRequest) {
  const gate = await requireApiSection(req, 'finance', 'edit')
  if (gate instanceof NextResponse) return gate
  const actor = gate
  const allowed = allowedFor(actor)
  try {
    const body = await req.json()
    const action = String(body?.action ?? '')
    const v = (body?.values ?? {}) as Record<string, unknown>
    const school = v.school as School
    if (!SCHOOLS.has(school)) return NextResponse.json({ ok: false, error: 'valid school required' }, { status: 400 })

    if (action === 'charge' || action === 'payment' || action === 'adjustment') {
      const brandId = await resolveSchoolBrandId(school)
      let categoryId = (v.category_id as string) || null
      let categoryLabel = (v.category_label as string) || ''
      if (!categoryId && categoryLabel) {
        const cat = await ensureChargeCategory(school, { name: categoryLabel, section: (v.section as string) ?? '', brand_id: brandId })
        categoryId = cat.id
        categoryLabel = cat.name
      }
      const entry = await postLedgerEntry(
        {
          school,
          student_id: String(v.student_id ?? ''),
          student_admission_no: (v.student_admission_no as string) ?? '',
          category_id: categoryId,
          category_label: categoryLabel,
          section: (v.section as string) ?? '',
          entry_type: action as SchoolLedgerEntryType,
          entry_date: (v.entry_date as string) || undefined,
          academic_year: (v.academic_year as string) ?? '',
          term: (v.term as string) ?? '',
          description: (v.description as string) ?? '',
          amount_ksh: Number(v.amount_ksh ?? 0),
          method: (v.method as string) ?? '',
          receipt_no: (v.receipt_no as string) ?? '',
          mpesa_code: (v.mpesa_code as string) ?? '',
          state: v.state === 'draft' ? 'draft' : 'posted',
        },
        allowed,
        actor,
      )
      return NextResponse.json({ ok: true, entry }, { status: 201 })
    }

    if (action === 'reverse') {
      const entry = await reverseLedgerEntry(String(v.id ?? ''), String(v.reason ?? ''), allowed, actor)
      return NextResponse.json({ ok: true, entry })
    }

    if (action === 'commit') {
      const entry = await commitLedgerEntry(String(v.id ?? ''), allowed, actor)
      return NextResponse.json({ ok: true, entry })
    }

    return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}
