import { NextResponse, type NextRequest } from 'next/server'
import { requireApiSection } from '@/lib/api-auth'
import { listAssessments, recordAssessment, updateAssessment, deleteAssessment } from '@/lib/schoolAssessments'
import type { School, SectionKey } from '@ocg/db'

// Academic marks for Rhythms/Darul (and Rayyan). Access is gated on the relevant
// school-admin section, so a Rhythms teacher/admin cannot touch Darul records.
const SCHOOLS = new Set<School>(['rayyan', 'rhythms', 'darul'])
const SECTION: Record<School, SectionKey> = { rayyan: 'rayyan_admin', rhythms: 'rhythms_admin', darul: 'darul_admin' }

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const school = url.searchParams.get('school') as School | null
  const studentId = url.searchParams.get('studentId') ?? ''
  if (!school || !SCHOOLS.has(school)) return NextResponse.json({ ok: false, error: 'valid school required' }, { status: 400 })
  const gate = await requireApiSection(req, SECTION[school], 'view')
  if (gate instanceof NextResponse) return gate
  if (!studentId) return NextResponse.json({ ok: false, error: 'studentId is required' }, { status: 400 })
  return NextResponse.json({ ok: true, assessments: await listAssessments(school, studentId) })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const v = (body?.values ?? {}) as Record<string, unknown>
  const school = v.school as School
  if (!SCHOOLS.has(school)) return NextResponse.json({ ok: false, error: 'valid school required' }, { status: 400 })
  const gate = await requireApiSection(req, SECTION[school], 'edit')
  if (gate instanceof NextResponse) return gate
  try {
    const assessment = await recordAssessment({
      school, student_id: String(v.student_id ?? ''), student_admission_no: (v.student_admission_no as string) ?? '',
      subject: String(v.subject ?? ''), academic_year: (v.academic_year as string) ?? '', term: (v.term as string) ?? '',
      assessment_type: (v.assessment_type as string) ?? 'exam',
      score: v.score === '' || v.score == null ? null : Number(v.score),
      max_score: v.max_score ? Number(v.max_score) : 100,
      grade: (v.grade as string) ?? '', status: (v.status as string) ?? 'recorded',
      remarks: (v.remarks as string) ?? '', teacher: (v.teacher as string) ?? '', assessed_on: (v.assessed_on as string) || null,
    }, gate.name || gate.email || 'unknown')
    return NextResponse.json({ ok: true, assessment }, { status: 201 })
  } catch (e) { return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 }) }
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const school = body?.school as School
  if (!SCHOOLS.has(school)) return NextResponse.json({ ok: false, error: 'valid school required' }, { status: 400 })
  const gate = await requireApiSection(req, SECTION[school], 'edit')
  if (gate instanceof NextResponse) return gate
  try {
    return NextResponse.json({ ok: true, assessment: await updateAssessment(String(body?.id ?? ''), body?.values ?? {}) })
  } catch (e) { return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 }) }
}

export async function DELETE(req: NextRequest) {
  const url = new URL(req.url)
  const school = url.searchParams.get('school') as School
  if (!SCHOOLS.has(school)) return NextResponse.json({ ok: false, error: 'valid school required' }, { status: 400 })
  const gate = await requireApiSection(req, SECTION[school], 'edit')
  if (gate instanceof NextResponse) return gate
  try {
    await deleteAssessment(url.searchParams.get('id') ?? '')
    return NextResponse.json({ ok: true })
  } catch (e) { return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 }) }
}
