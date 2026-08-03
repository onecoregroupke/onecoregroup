import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { db } from '@/lib/serverClient'
import { safeRows } from '@/lib/management'
import { PrintButton } from '@/components/rayyan/PrintButton'
import type {
  RayyanActivityRow, RayyanAssessmentRow, RayyanGuardianRow,
  RayyanStudentActivityRow, RayyanStudentHistoryRow, RayyanStudentRow,
} from '@ocg/db'

export const dynamic = 'force-dynamic'

// Printable transcript / report card. Use the browser's Print → Save as PDF —
// everything outside the sheet is hidden by print styles.
export default async function RayyanTranscriptPage({
  params,
}: {
  params: Promise<{ studentId: string }>
}) {
  const { studentId } = await params
  const supabase = db()
  const { data: studentRow } = await supabase.from('rayyan_students').select('*').eq('id', studentId).maybeSingle()
  if (!studentRow) notFound()
  const student = studentRow as RayyanStudentRow

  const [guardian, activities, enrolments, assessments, history] = await Promise.all([
    student.guardian_id
      ? supabase.from('rayyan_guardians').select('*').eq('id', student.guardian_id).maybeSingle().then((r) => r.data as RayyanGuardianRow | null)
      : null,
    safeRows<RayyanActivityRow>('rayyan_activities', { limit: 100 }),
    safeRows<RayyanStudentActivityRow>('rayyan_student_activities', { limit: 200 }).then((rows) => rows.filter((r) => r.student_id === studentId && r.is_active !== false)),
    safeRows<RayyanAssessmentRow>('rayyan_assessments', { limit: 500 }).then((rows) => rows.filter((r) => r.student_id === studentId)),
    safeRows<RayyanStudentHistoryRow>('rayyan_student_history', { limit: 200 }).then((rows) => rows.filter((r) => r.student_id === studentId)),
  ])

  const activityName = new Map(activities.map((a) => [a.id, a.name]))
  const termGroups = new Map<string, RayyanAssessmentRow[]>()
  for (const a of assessments) {
    const key = `${a.academic_year || '—'} · ${a.term || '—'}`
    termGroups.set(key, [...(termGroups.get(key) ?? []), a])
  }
  const sortedTerms = [...termGroups.entries()].sort((x, y) => x[0].localeCompare(y[0]))
  const sortedHistory = [...history].sort((x, y) => (x.occurred_on || '').localeCompare(y.occurred_on || ''))
  const issued = new Date().toLocaleDateString('en-KE', { timeZone: 'Africa/Nairobi', day: 'numeric', month: 'long', year: 'numeric' })
  // Verification reference (deterministic per student + issue day) so a printed
  // transcript can be checked back against the record.
  const verifyRef = `RAY-${(student.admission_number || student.id.slice(0, 8)).toUpperCase().replace(/[^A-Z0-9]/g, '')}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between print:hidden">
        <Link href={`/rayyan/students/${student.id}`} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
          <ArrowLeft size={15} /> Back to profile
        </Link>
        <PrintButton />
      </div>

      <div className="mx-auto max-w-3xl rounded-xl border border-gray-200 bg-white p-8 shadow-sm print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <div className="border-b-2 border-[#2c45a0] pb-4 text-center">
          <p className="text-2xl font-bold text-[#2c45a0]">Ar-Rayyan Playhouse &amp; Daycare</p>
          <p className="mt-1 text-sm text-gray-500">Nairobi, Kenya · A One Core Group school</p>
          <p className="mt-3 text-lg font-semibold uppercase tracking-wide text-gray-800">Student Transcript &amp; Progress Record</p>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
          <TranscriptField label="Student" value={student.full_name} />
          <TranscriptField label="Admission no." value={student.admission_number || '—'} />
          <TranscriptField label="Class" value={student.class_level || '—'} />
          <TranscriptField label="Guardian" value={guardian?.full_name ?? '—'} />
          <TranscriptField label="Enrolled since" value={student.start_date || '—'} />
          <TranscriptField label="Status" value={student.enrollment_status} />
        </dl>

        <h2 className="mt-7 border-b border-gray-200 pb-1 text-sm font-bold uppercase tracking-wide text-gray-700">Academic performance</h2>
        {sortedTerms.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">No assessments recorded yet.</p>
        ) : (
          sortedTerms.map(([term, rows]) => (
            <div key={term} className="mt-4">
              <p className="text-sm font-semibold text-gray-800">{term}</p>
              <table className="mt-1.5 w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-300 text-left text-[11px] uppercase tracking-wide text-gray-500">
                    <th className="py-1.5 pr-2">Learning area</th>
                    <th className="py-1.5 pr-2">Performance level</th>
                    <th className="py-1.5 pr-2 text-right">Score</th>
                    <th className="py-1.5">Teacher remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => (
                    <tr key={a.id} className="border-b border-gray-100">
                      <td className="py-1.5 pr-2 font-medium text-gray-800">{a.learning_area}</td>
                      <td className="py-1.5 pr-2 text-gray-700">{a.performance_level || '—'}</td>
                      <td className="py-1.5 pr-2 text-right text-gray-700">{a.score != null ? a.score : '—'}</td>
                      <td className="py-1.5 text-gray-600">{a.remarks || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
        )}

        <h2 className="mt-7 border-b border-gray-200 pb-1 text-sm font-bold uppercase tracking-wide text-gray-700">Co-curricular activities</h2>
        <p className="mt-2 text-sm text-gray-700">
          {enrolments.length === 0
            ? 'None recorded.'
            : enrolments.map((e) => `${activityName.get(e.activity_id) ?? 'Activity'}${e.joined_on ? ` (since ${e.joined_on})` : ''}`).join(' · ')}
        </p>

        {sortedHistory.length > 0 && (
          <>
            <h2 className="mt-7 border-b border-gray-200 pb-1 text-sm font-bold uppercase tracking-wide text-gray-700">School history</h2>
            <ul className="mt-2 space-y-1 text-sm text-gray-700">
              {sortedHistory.map((h) => (
                <li key={h.id}>{h.occurred_on} — <b>{h.title}</b>{h.details ? `: ${h.details}` : ''}</li>
              ))}
            </ul>
          </>
        )}

        <div className="mt-10 grid grid-cols-2 gap-10 text-sm">
          <div>
            <div className="h-10 border-b border-gray-400" />
            <p className="mt-1 text-gray-500">Class teacher</p>
          </div>
          <div>
            <div className="h-10 border-b border-gray-400" />
            <p className="mt-1 text-gray-500">Head teacher / stamp</p>
          </div>
        </div>
        <p className="mt-6 text-xs text-gray-400">Verification ref: {verifyRef} · Issued {issued} · Generated by the One Core Group Ops Hub</p>
      </div>
    </div>
  )
}

function TranscriptField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className="font-medium text-gray-800">{value}</dd>
    </div>
  )
}
