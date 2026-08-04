import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Award, BookOpen, FileText } from 'lucide-react'
import { db } from '@/lib/serverClient'
import { requireActor } from '@/lib/server-auth'
import { StudentAccount } from '@/components/finance/StudentAccount'
import { StudentAssessments } from '@/components/school/StudentAssessments'
import type { DarulStudentRow, DarulGuardianRow } from '@ocg/db'

export const dynamic = 'force-dynamic'

// Darul Swafa student profile — hifz progress + the canonical school fee account
// (same school-agnostic ledger) + the marks-based academic record (Qur'an,
// Tajweed, Islamic studies). Brand colour #2a6a2a.
export default async function DarulStudentProfilePage({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params
  const actor = await requireActor()
  const { data: row } = await db().from('darul_students').select('*').eq('id', studentId).maybeSingle()
  if (!row) notFound()
  const student = row as DarulStudentRow
  const guardian = student.guardian_id
    ? await db().from('darul_guardians').select('*').eq('id', student.guardian_id).maybeSingle().then((r) => r.data as DarulGuardianRow | null)
    : null
  const canFinanceView = actor.can('finance', 'view')
  const canFinanceEdit = actor.can('finance', 'edit')
  const canAcademicView = actor.can('darul_admin', 'view')
  const canAcademicEdit = actor.can('darul_admin', 'edit')
  const meta = [student.halaqa_level, student.enrollment_status, student.admission_number && `Adm ${student.admission_number}`]
    .filter(Boolean).join(' · ')

  return (
    <div className="space-y-6">
      <Link href="/darul/students" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
        <ArrowLeft size={15} /> All students
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ocg-gold">Darul Swafa · Student profile</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-gray-900"><BookOpen size={22} /> {student.full_name}</h1>
          <p className="mt-1 text-sm text-gray-500">{meta || '—'}</p>
          {guardian && <p className="mt-0.5 text-xs text-gray-400">Guardian: {guardian.full_name}{guardian.phone ? ` · ${guardian.phone}` : ''}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/darul/students/${student.id}/transcript`} className="inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"><FileText size={15} /> Transcript</Link>
          <Link href={`/darul/students/${student.id}/certificate`} className="inline-flex items-center gap-2 rounded-lg bg-[#2a6a2a] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"><Award size={15} /> Certificate</Link>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        <Stat label="Hifz progress" value={`${student.hifz_juz_completed}/30 juz`} />
        <Stat label="Current surah" value={student.current_surah || '—'} />
        <Stat label="Halaqa level" value={student.halaqa_level || '—'} />
      </section>

      {canFinanceView ? (
        <StudentAccount school="darul" studentId={student.id} admissionNo={student.admission_number ?? ''} canEdit={canFinanceEdit} />
      ) : (
        <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500">The student fee account is visible to finance users. Ask an administrator for finance access to this brand.</p>
      )}

      {canAcademicView && (
        <StudentAssessments school="darul" studentId={student.id} admissionNo={student.admission_number ?? ''} canEdit={canAcademicEdit} subjectLabel="Subject (Qur'an / Tajweed / studies)" />
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <p className="text-xl font-light text-gray-900">{value}</p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
    </div>
  )
}
