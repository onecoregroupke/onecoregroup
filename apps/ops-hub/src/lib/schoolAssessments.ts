import { db, nowIso } from './serverClient'
import { resolveSchoolBrandId } from './schoolFinance'
import type { School, SchoolAssessmentRow } from '@ocg/db'

// Marks-based academic records for Rhythms/Darul (Rayyan keeps rayyan_assessments).
// Kept entirely separate from fees (school_ledger_entries).

export async function listAssessments(school: School, studentId: string): Promise<SchoolAssessmentRow[]> {
  const { data } = await db()
    .from('school_assessments')
    .select('*')
    .eq('school', school)
    .eq('student_id', studentId)
    .order('academic_year', { ascending: false })
    .order('term', { ascending: false })
    .order('subject', { ascending: true })
  return (data as SchoolAssessmentRow[] | null) ?? []
}

export async function recordAssessment(input: {
  school: School
  student_id: string
  student_admission_no?: string
  subject: string
  academic_year?: string
  term?: string
  assessment_type?: string
  score?: number | null
  max_score?: number
  grade?: string
  status?: string
  remarks?: string
  teacher?: string
  assessed_on?: string | null
}, recordedBy: string): Promise<SchoolAssessmentRow> {
  if (!input.subject?.trim()) throw new Error('Subject / learning area is required')
  if (!input.student_id) throw new Error('student is required')
  const brandId = await resolveSchoolBrandId(input.school)
  const { data, error } = await db().from('school_assessments').insert({
    school: input.school,
    brand_id: brandId,
    student_id: input.student_id,
    student_admission_no: input.student_admission_no ?? '',
    subject: input.subject.trim(),
    academic_year: input.academic_year ?? '',
    term: input.term ?? '',
    assessment_type: input.assessment_type || 'exam',
    score: input.score ?? null,
    max_score: input.max_score ?? 100,
    grade: input.grade ?? '',
    status: input.status || 'recorded',
    remarks: input.remarks ?? '',
    teacher: input.teacher ?? '',
    assessed_on: input.assessed_on || null,
    recorded_by: recordedBy,
  }).select('*').single()
  if (error) throw new Error(error.message)
  return data as SchoolAssessmentRow
}

const EDITABLE = ['subject', 'academic_year', 'term', 'assessment_type', 'score', 'max_score', 'grade', 'status', 'remarks', 'teacher', 'assessed_on'] as const

export async function updateAssessment(id: string, patch: Partial<SchoolAssessmentRow>): Promise<SchoolAssessmentRow> {
  if (!id) throw new Error('id is required')
  const update: Record<string, unknown> = { updated_at: nowIso() }
  for (const k of EDITABLE) if (patch[k] !== undefined) update[k] = patch[k]
  const { data, error } = await db().from('school_assessments').update(update).eq('id', id).select('*').single()
  if (error) throw new Error(error.message)
  return data as SchoolAssessmentRow
}

export async function deleteAssessment(id: string): Promise<void> {
  if (!id) throw new Error('id is required')
  const { error } = await db().from('school_assessments').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
