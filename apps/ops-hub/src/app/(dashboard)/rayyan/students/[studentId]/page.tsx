import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Award, FileText, GraduationCap, History, Medal } from 'lucide-react'
import { db } from '@/lib/serverClient'
import { safeRows } from '@/lib/management'
import { requireActor } from '@/lib/server-auth'
import { StudentAcademicActions } from '@/components/rayyan/StudentAcademicActions'
import { StudentAccount } from '@/components/finance/StudentAccount'
import type {
  RayyanActivityRow, RayyanAssessmentRow, RayyanFeeInvoiceRow, RayyanGuardianRow,
  RayyanStudentActivityRow, RayyanStudentHistoryRow, RayyanStudentRow,
} from '@ocg/db'

export const dynamic = 'force-dynamic'

// Student profile: bio + guardian, co-curricular activities, academic
// assessments per term (the transcript source), history timeline, and fees.
export default async function RayyanStudentProfilePage({
  params,
}: {
  params: Promise<{ studentId: string }>
}) {
  const { studentId } = await params
  const actor = await requireActor()
  const canFinanceView = actor.can('finance', 'view')
  const canFinanceEdit = actor.can('finance', 'edit')
  const supabase = db()
  const { data: studentRow } = await supabase.from('rayyan_students').select('*').eq('id', studentId).maybeSingle()
  if (!studentRow) notFound()
  const student = studentRow as RayyanStudentRow

  const [guardian, activities, enrolments, assessments, history, invoices] = await Promise.all([
    student.guardian_id
      ? supabase.from('rayyan_guardians').select('*').eq('id', student.guardian_id).maybeSingle().then((r) => r.data as RayyanGuardianRow | null)
      : null,
    safeRows<RayyanActivityRow>('rayyan_activities', { limit: 100 }),
    safeRows<RayyanStudentActivityRow>('rayyan_student_activities', { limit: 200 }).then((rows) => rows.filter((r) => r.student_id === studentId)),
    safeRows<RayyanAssessmentRow>('rayyan_assessments', { limit: 500 }).then((rows) => rows.filter((r) => r.student_id === studentId)),
    safeRows<RayyanStudentHistoryRow>('rayyan_student_history', { limit: 200 }).then((rows) => rows.filter((r) => r.student_id === studentId)),
    safeRows<RayyanFeeInvoiceRow>('rayyan_fee_invoices', { limit: 500 }).then((rows) => rows.filter((r) => r.student_id === studentId)),
  ])

  const activityName = new Map(activities.map((a) => [a.id, a.name]))
  const activeEnrolments = enrolments.filter((e) => e.is_active !== false)

  // Group assessments by year+term, latest first — the transcript structure.
  const termGroups = new Map<string, RayyanAssessmentRow[]>()
  for (const a of assessments) {
    const key = `${a.academic_year || '—'} · ${a.term || '—'}`
    termGroups.set(key, [...(termGroups.get(key) ?? []), a])
  }
  const sortedTerms = [...termGroups.entries()].sort((x, y) => y[0].localeCompare(x[0]))
  const sortedHistory = [...history].sort((x, y) => (y.occurred_on || '').localeCompare(x.occurred_on || ''))
  const feeBalance = invoices.reduce((sum, i) => sum + Math.max(0, Number(i.amount_expected_ksh ?? 0) - Number(i.amount_paid_ksh ?? 0)), 0)

  return (
    <div className="space-y-6">
      <Link href="/rayyan/students" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
        <ArrowLeft size={15} /> All students
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ocg-gold">Ar-Rayyan · Student profile</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-gray-900">
            <GraduationCap size={22} /> {student.full_name}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {[student.class_level, student.enrollment_status, student.admission_number && `Adm ${student.admission_number}`, student.schoolpay_code && `Fee code ${student.schoolpay_code}`].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/rayyan/students/${student.id}/transcript`}
            className="inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
            <FileText size={15} /> Transcript
          </Link>
          <Link href={`/rayyan/students/${student.id}/certificate`}
            className="inline-flex items-center gap-2 rounded-lg bg-[#2c45a0] px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
            <Award size={15} /> Certificate
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Guardian" value={guardian?.full_name ?? '—'} sub={guardian ? [guardian.phone, guardian.email].filter(Boolean).join(' · ') : ''} />
        <Stat label="Co-curricular" value={activeEnrolments.length ? activeEnrolments.map((e) => activityName.get(e.activity_id) ?? '').filter(Boolean).join(', ') : 'None yet'} />
        <Stat label="Assessments" value={String(assessments.length)} sub={sortedTerms[0]?.[0] ?? ''} />
        <Stat label="Fee balance (legacy)" value={`KSh ${feeBalance.toLocaleString()}`} sub={`${invoices.length} invoice${invoices.length === 1 ? '' : 's'}`} />
      </div>

      {canFinanceView ? (
        <StudentAccount school="rayyan" studentId={student.id} admissionNo={student.admission_number ?? ''} canEdit={canFinanceEdit} />
      ) : (
        <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500">The student fee account is visible to finance users. Ask an administrator for finance access to this brand.</p>
      )}

      <StudentAcademicActions
        studentId={student.id}
        activities={activities.filter((a) => a.is_active !== false).map((a) => ({ id: a.id, label: a.name }))}
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="mb-4 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ocg-gold">
            <Medal size={13} /> Co-curricular activities
          </h2>
          {activeEnrolments.length === 0 ? (
            <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500">Not enrolled in any activity yet — Ballerina, Football, Music, and Chess are ready above.</p>
          ) : (
            <div className="space-y-2">
              {activeEnrolments.map((e) => (
                <div key={e.id} className="rounded-lg border border-gray-100 p-3">
                  <p className="text-sm font-medium text-gray-800">{activityName.get(e.activity_id) ?? 'Activity'}</p>
                  <p className="mt-0.5 text-xs text-gray-400">{[e.joined_on && `Joined ${e.joined_on}`, e.notes].filter(Boolean).join(' · ') || 'No details'}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="mb-4 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ocg-gold">
            <History size={13} /> Student history
          </h2>
          {sortedHistory.length === 0 ? (
            <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500">No history events yet. Enrolments, promotions, awards, and exits will appear here.</p>
          ) : (
            <ol className="space-y-2">
              {sortedHistory.map((h) => (
                <li key={h.id} className="rounded-lg border border-gray-100 p-3">
                  <p className="text-sm font-medium text-gray-800">
                    <span className="mr-2 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-gray-500">{h.event_type}</span>
                    {h.title}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-400">{[h.occurred_on, h.details, h.recorded_by && `by ${h.recorded_by}`].filter(Boolean).join(' · ')}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-ocg-gold">Academic record</h2>
        {sortedTerms.length === 0 ? (
          <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500">No assessments recorded yet — capture the first one above.</p>
        ) : (
          <div className="space-y-5">
            {sortedTerms.map(([term, rows]) => (
              <div key={term}>
                <p className="mb-2 text-sm font-semibold text-gray-800">{term}</p>
                <div className="overflow-x-auto rounded-lg border border-gray-100">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400">
                        <th className="px-3 py-2">Learning area</th>
                        <th className="px-3 py-2">Performance</th>
                        <th className="px-3 py-2 text-right">Score</th>
                        <th className="px-3 py-2">Remarks</th>
                        <th className="px-3 py-2">Teacher</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {rows.map((a) => (
                        <tr key={a.id}>
                          <td className="px-3 py-2.5 font-medium text-gray-800">{a.learning_area}</td>
                          <td className="px-3 py-2.5 text-gray-600">{a.performance_level || '—'}</td>
                          <td className="px-3 py-2.5 text-right text-gray-600">{a.score != null ? a.score : '—'}</td>
                          <td className="px-3 py-2.5 text-gray-500">{a.remarks || '—'}</td>
                          <td className="px-3 py-2.5 text-gray-500">{a.teacher || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-gray-900" title={value}>{value}</p>
      {sub && <p className="mt-0.5 truncate text-xs text-gray-400">{sub}</p>}
    </div>
  )
}
