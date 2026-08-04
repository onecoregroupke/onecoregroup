import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Award } from 'lucide-react'
import { db } from '@/lib/serverClient'
import { requireActor } from '@/lib/server-auth'
import { studentLedger } from '@/lib/schoolFinance'
import { summariseStudentAccount } from '@/lib/schoolBalance'
import { listAssessments } from '@/lib/schoolAssessments'
import { groupAssessmentsByTerm } from '@/lib/transcript'
import { formatKsh } from '@/lib/money'
import { PrintButton } from '@/components/rayyan/PrintButton'
import type { DarulStudentRow } from '@ocg/db'

export const dynamic = 'force-dynamic'

// Darul Swafa transcript — hifz progress + the marks-based academic record
// (Qur'an, Tajweed, Islamic studies), with fee-clearance status.
export default async function DarulTranscriptPage({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params
  await requireActor()
  const { data } = await db().from('darul_students').select('*').eq('id', studentId).maybeSingle()
  if (!data) notFound()
  const s = data as DarulStudentRow
  const entries = await studentLedger('darul', studentId)
  const summary = summariseStudentAccount(entries)
  const assessmentTerms = groupAssessmentsByTerm(await listAssessments('darul', studentId))
  const issued = new Date().toLocaleDateString('en-KE', { timeZone: 'Africa/Nairobi', day: 'numeric', month: 'long', year: 'numeric' })
  const ref = `DRL-TR-${(s.admission_number || s.id.slice(0, 8)).toUpperCase().replace(/[^A-Z0-9]/g, '')}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`
  const cleared = summary.postedBalance <= 0

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between print:hidden">
        <Link href={`/darul/students/${s.id}`} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"><ArrowLeft size={15} /> Back to profile</Link>
        <div className="flex gap-2">
          <Link href={`/darul/students/${s.id}/certificate`} className="inline-flex items-center gap-1.5 rounded-lg bg-[#2a6a2a] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"><Award size={15} /> Certificate</Link>
          <PrintButton />
        </div>
      </div>

      <div className="mx-auto max-w-3xl rounded-xl border border-gray-200 bg-white p-8 shadow-sm print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <div className="border-b-2 border-[#2a6a2a] pb-4 text-center">
          <p className="text-2xl font-bold text-[#2a6a2a]">Darul Swafa</p>
          <p className="mt-1 text-sm text-gray-500">Nairobi, Kenya · A One Core Group institution</p>
          <p className="mt-3 text-lg font-semibold uppercase tracking-wide text-gray-800">Academic Record &amp; Transcript</p>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
          <Field label="Student" value={s.full_name} />
          <Field label="Admission no." value={s.admission_number || '—'} />
          <Field label="Halaqa level" value={s.halaqa_level || '—'} />
          <Field label="Hifz completed" value={`${s.hifz_juz_completed}/30 juz`} />
          <Field label="Current surah" value={s.current_surah || '—'} />
          <Field label="Fees cleared" value={cleared ? 'Yes' : `No (${formatKsh(summary.postedBalance)} due)`} />
        </dl>

        <h2 className="mt-7 border-b border-gray-200 pb-1 text-sm font-bold uppercase tracking-wide text-gray-700">Academic assessment</h2>
        {assessmentTerms.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">No assessment records yet.</p>
        ) : (
          assessmentTerms.map((t) => (
            <div key={t.key} className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#2a6a2a]">{t.label}</p>
              <table className="mt-1 w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-300 text-left text-[11px] uppercase tracking-wide text-gray-500">
                    <th className="py-1.5 pr-2">Subject</th>
                    <th className="py-1.5 pr-2">Type</th>
                    <th className="py-1.5 pr-2 text-right">Mark</th>
                    <th className="py-1.5 text-right">Grade</th>
                  </tr>
                </thead>
                <tbody>
                  {t.rows.map((a) => (
                    <tr key={a.id} className="border-b border-gray-100">
                      <td className="py-1.5 pr-2 font-medium text-gray-800">{a.subject}{a.status !== 'recorded' && <span className="ml-1.5 text-xs font-normal uppercase text-amber-600">{a.status}</span>}</td>
                      <td className="py-1.5 pr-2 text-gray-600">{a.assessment_type}</td>
                      <td className="py-1.5 pr-2 text-right text-gray-700">{a.score != null ? `${a.score}/${a.max_score}` : '—'}</td>
                      <td className="py-1.5 text-right text-gray-700">{a.grade || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
        )}

        <div className="mt-10 grid grid-cols-2 gap-10 text-sm">
          <div><div className="h-10 border-b border-gray-400" /><p className="mt-1 text-gray-500">Ustadh / teacher</p></div>
          <div><div className="h-10 border-b border-gray-400" /><p className="mt-1 text-gray-500">Principal / stamp</p></div>
        </div>
        <p className="mt-6 text-xs text-gray-400">Issued {issued} · Verification ref {ref} · Generated by the One Core Group Ops Hub</p>
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className="font-medium text-gray-800">{value}</dd>
    </div>
  )
}
