import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Award } from 'lucide-react'
import { db } from '@/lib/serverClient'
import { requireActor } from '@/lib/server-auth'
import { studentLedger } from '@/lib/schoolFinance'
import { summariseStudentAccount } from '@/lib/schoolBalance'
import { formatKsh } from '@/lib/money'
import { PrintButton } from '@/components/rayyan/PrintButton'
import type { RhythmsStudentRow } from '@ocg/db'

export const dynamic = 'force-dynamic'

// Rhythms transcript / programme record. Rhythms fee categories ARE the
// courses/modules a student takes, so the transcript is their course record with
// enrolment + completion; marks-based assessment is a future academic module.
export default async function RhythmsTranscriptPage({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params
  await requireActor()
  const { data } = await db().from('rhythms_students').select('*').eq('id', studentId).maybeSingle()
  if (!data) notFound()
  const s = data as RhythmsStudentRow
  const entries = await studentLedger('rhythms', studentId)
  const summary = summariseStudentAccount(entries)
  const issued = new Date().toLocaleDateString('en-KE', { timeZone: 'Africa/Nairobi', day: 'numeric', month: 'long', year: 'numeric' })
  const ref = `RHY-TR-${(s.admission_number || s.id.slice(0, 8)).toUpperCase().replace(/[^A-Z0-9]/g, '')}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`
  const cleared = summary.postedBalance <= 0

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between print:hidden">
        <Link href={`/rhythms/students/${s.id}`} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"><ArrowLeft size={15} /> Back to profile</Link>
        <div className="flex gap-2">
          <Link href={`/rhythms/students/${s.id}/certificate`} className="inline-flex items-center gap-1.5 rounded-lg bg-[#9a2a2a] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"><Award size={15} /> Certificate</Link>
          <PrintButton />
        </div>
      </div>

      <div className="mx-auto max-w-3xl rounded-xl border border-gray-200 bg-white p-8 shadow-sm print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <div className="border-b-2 border-[#9a2a2a] pb-4 text-center">
          <p className="text-2xl font-bold text-[#9a2a2a]">Rhythms College</p>
          <p className="mt-1 text-sm text-gray-500">Nairobi, Kenya · A One Core Group institution</p>
          <p className="mt-3 text-lg font-semibold uppercase tracking-wide text-gray-800">Programme Record &amp; Transcript</p>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
          <Field label="Student" value={s.full_name} />
          <Field label="Admission no." value={s.admission_number || '—'} />
          <Field label="Programme" value={s.programme || '—'} />
          <Field label="Cohort" value={s.cohort || '—'} />
          <Field label="Status" value={s.enrollment_status || '—'} />
          <Field label="Fees cleared" value={cleared ? 'Yes' : `No (${formatKsh(summary.postedBalance)} due)`} />
        </dl>

        <h2 className="mt-7 border-b border-gray-200 pb-1 text-sm font-bold uppercase tracking-wide text-gray-700">Courses &amp; modules</h2>
        {summary.byCategory.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">No course records yet.</p>
        ) : (
          <table className="mt-2 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-300 text-left text-[11px] uppercase tracking-wide text-gray-500">
                <th className="py-1.5 pr-2">Course / module</th>
                <th className="py-1.5 pr-2 text-right">Charged</th>
                <th className="py-1.5 pr-2 text-right">Paid</th>
                <th className="py-1.5 text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {summary.byCategory.map((c) => (
                <tr key={c.key} className="border-b border-gray-100">
                  <td className="py-1.5 pr-2 font-medium text-gray-800">{c.label}</td>
                  <td className="py-1.5 pr-2 text-right text-gray-700">{formatKsh(c.charged)}</td>
                  <td className="py-1.5 pr-2 text-right text-gray-700">{formatKsh(c.paid)}</td>
                  <td className="py-1.5 text-right text-gray-700">{formatKsh(c.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="mt-10 grid grid-cols-2 gap-10 text-sm">
          <div><div className="h-10 border-b border-gray-400" /><p className="mt-1 text-gray-500">Course tutor</p></div>
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
