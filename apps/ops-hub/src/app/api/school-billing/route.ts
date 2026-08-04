import { NextResponse, type NextRequest } from 'next/server'
import { requireApiSection } from '@/lib/api-auth'
import {
  listProgrammes, upsertProgramme, listFeeStructures, createFeeStructure,
  setFeeStructureStatus, previewEnrollment, enrolStudent, listEnrollments,
} from '@/lib/schoolBilling'
import type { School, SectionKey } from '@ocg/db'

// Course-billing config (programmes + versioned fee structures) is gated on the
// school-admin section. Enrolling a student posts a DRAFT charge schedule to the
// ledger, so that action additionally requires `finance` edit + brand scope.
const SCHOOLS = new Set<School>(['rayyan', 'rhythms', 'darul'])
const SECTION: Record<School, SectionKey> = { rayyan: 'rayyan_admin', rhythms: 'rhythms_admin', darul: 'darul_admin' }

function financeAllowed(actor: Exclude<Awaited<ReturnType<typeof requireApiSection>>, NextResponse>): string[] | null {
  return actor.permissions === null || actor.isSuperAdmin ? null : (actor.allowedBrandIds('finance') ?? [])
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const school = url.searchParams.get('school') as School | null
  if (!school || !SCHOOLS.has(school)) return NextResponse.json({ ok: false, error: 'valid school required' }, { status: 400 })
  const gate = await requireApiSection(req, SECTION[school], 'view')
  if (gate instanceof NextResponse) return gate
  const studentId = url.searchParams.get('studentId')
  const [programmes, structures] = await Promise.all([listProgrammes(school), listFeeStructures(school)])
  const enrollments = studentId ? await listEnrollments(school, studentId) : []
  return NextResponse.json({ ok: true, programmes, structures, enrollments })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const action = String(body?.action ?? '')
  const v = (body?.values ?? {}) as Record<string, unknown>
  const school = v.school as School
  if (!SCHOOLS.has(school)) return NextResponse.json({ ok: false, error: 'valid school required' }, { status: 400 })

  try {
    // Enrolment writes financial charges — gate on finance edit + brand scope.
    if (action === 'enrol') {
      const gate = await requireApiSection(req, 'finance', 'edit')
      if (gate instanceof NextResponse) return gate
      const result = await enrolStudent({
        school, student_id: String(v.student_id ?? ''), student_admission_no: (v.student_admission_no as string) ?? '',
        programme_id: (v.programme_id as string) || null, fee_structure_id: String(v.fee_structure_id ?? ''),
        academic_year: (v.academic_year as string) ?? '', term: (v.term as string) ?? '',
        start_date: (v.start_date as string) || null, includeOptional: Boolean(v.includeOptional),
      }, financeAllowed(gate), gate)
      return NextResponse.json({ ok: true, ...result }, { status: 201 })
    }

    // Everything else is config — gate on the school-admin section.
    const gate = await requireApiSection(req, SECTION[school], 'edit')
    if (gate instanceof NextResponse) return gate
    const actor = { userId: gate.userId, email: gate.email, name: gate.name }

    switch (action) {
      case 'upsert-programme': {
        const programme = await upsertProgramme(school, {
          id: (v.id as string) || undefined, name: String(v.name ?? ''), kind: (v.kind as string) ?? 'course',
          code: (v.code as string) ?? '', duration_label: (v.duration_label as string) ?? '',
          applies_to: (v.applies_to as string) ?? '', completion_requirements: (v.completion_requirements as string) ?? '',
          is_active: v.is_active === undefined ? true : Boolean(v.is_active), sort_order: Number(v.sort_order ?? 0),
          notes: (v.notes as string) ?? '',
        }, actor)
        return NextResponse.json({ ok: true, programme }, { status: 201 })
      }
      case 'toggle-programme': {
        const programme = await upsertProgramme(school, { id: String(v.id ?? ''), name: String(v.name ?? ''), is_active: Boolean(v.is_active) }, actor)
        return NextResponse.json({ ok: true, programme })
      }
      case 'create-structure': {
        const structure = await createFeeStructure(school, {
          programme_id: (v.programme_id as string) || null, name: (v.name as string) ?? '',
          academic_year: (v.academic_year as string) ?? '', effective_from: (v.effective_from as string) || null,
          status: (v.status as string) ?? 'active', notes: (v.notes as string) ?? '',
          items: Array.isArray(v.items) ? (v.items as { label: string; amount_ksh: number; billing_cadence?: string; is_required?: boolean; is_completion_req?: boolean }[]) : [],
        }, actor)
        return NextResponse.json({ ok: true, structure }, { status: 201 })
      }
      case 'set-structure-status': {
        const structure = await setFeeStructureStatus(String(v.id ?? ''), String(v.status ?? ''), actor)
        return NextResponse.json({ ok: true, structure })
      }
      case 'preview-enrollment': {
        const preview = await previewEnrollment(school, String(v.fee_structure_id ?? ''), { includeOptional: Boolean(v.includeOptional) })
        return NextResponse.json({ ok: true, ...preview })
      }
      default:
        return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}
