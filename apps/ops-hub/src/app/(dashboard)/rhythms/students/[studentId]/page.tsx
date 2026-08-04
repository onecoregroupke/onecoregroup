import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Award, FileText, GraduationCap } from 'lucide-react'
import { db } from '@/lib/serverClient'
import { requireActor } from '@/lib/server-auth'
import { StudentAccount } from '@/components/finance/StudentAccount'
import type { RhythmsStudentRow, RhythmsGuardianRow } from '@ocg/db'

export const dynamic = 'force-dynamic'

// Rhythms student profile — course/programme + cohort identity and the canonical
// fee account (the SAME school-agnostic ledger as Rayyan; Rhythms keeps its own
// course-billing categories, it does not inherit Rayyan's fee structure).
export default async function RhythmsStudentProfilePage({
  params,
}: {
  params: Promise<{ studentId: string }>
}) {
  const { studentId } = await params
  const actor = await requireActor()
  const { data: row } = await db().from('rhythms_students').select('*').eq('id', studentId).maybeSingle()
  if (!row) notFound()
  const student = row as RhythmsStudentRow
  const guardian = student.guardian_id
    ? await db().from('rhythms_guardians').select('*').eq('id', student.guardian_id).maybeSingle().then((r) => r.data as RhythmsGuardianRow | null)
    : null
  const canFinanceView = actor.can('finance', 'view')
  const canFinanceEdit = actor.can('finance', 'edit')
  const meta = [student.programme, student.cohort, student.enrollment_status, student.admission_number && `Adm ${student.admission_number}`]
    .filter(Boolean).join(' · ')

  return (
    <div className="space-y-6">
      <Link href="/rhythms/students" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
        <ArrowLeft size={15} /> All students
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ocg-gold">Rhythms College · Student profile</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-gray-900"><GraduationCap size={22} /> {student.full_name}</h1>
          <p className="mt-1 text-sm text-gray-500">{meta || '—'}</p>
          {guardian && <p className="mt-0.5 text-xs text-gray-400">Guardian: {guardian.full_name}{guardian.phone ? ` · ${guardian.phone}` : ''}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/rhythms/students/${student.id}/transcript`} className="inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"><FileText size={15} /> Transcript</Link>
          <Link href={`/rhythms/students/${student.id}/certificate`} className="inline-flex items-center gap-2 rounded-lg bg-[#9a2a2a] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"><Award size={15} /> Certificate</Link>
        </div>
      </div>

      {canFinanceView ? (
        <StudentAccount school="rhythms" studentId={student.id} admissionNo={student.admission_number ?? ''} canEdit={canFinanceEdit} />
      ) : (
        <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500">The student fee account is visible to finance users. Ask an administrator for finance access to this brand.</p>
      )}
    </div>
  )
}
