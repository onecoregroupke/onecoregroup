import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requireActor } from '@/lib/server-auth'
import { db } from '@/lib/serverClient'
import { RhythmsBilling } from '@/components/school/RhythmsBilling'
import type { RhythmsStudentRow } from '@ocg/db'

export const dynamic = 'force-dynamic'

// Rhythms course-billing configuration — the programmes/courses on offer, their
// VERSIONED fee structures, and enrolment (which posts a draft charge schedule to
// the canonical ledger for review). Config is gated by the /rhythms layout
// (rhythms_admin); enrolment additionally needs finance edit (enforced by the API).
export default async function RhythmsBillingPage() {
  const actor = await requireActor()
  const canEdit = actor.can('rhythms_admin', 'edit')
  const canBill = actor.can('finance', 'edit')
  const { data } = await db().from('rhythms_students').select('id, full_name, admission_number').order('full_name', { ascending: true })
  const students = ((data as Pick<RhythmsStudentRow, 'id' | 'full_name' | 'admission_number'>[] | null) ?? [])
    .map((s) => ({ id: s.id, label: s.full_name, admission_number: s.admission_number ?? '' }))

  return (
    <div className="space-y-6">
      <Link href="/rhythms" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"><ArrowLeft size={15} /> Rhythms admin</Link>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ocg-gold">Rhythms College · Course billing</p>
        <h1 className="mt-1 text-2xl font-semibold text-gray-900">Course billing configuration</h1>
        <p className="mt-1 max-w-3xl text-sm text-gray-500">
          Define the courses/modules Rhythms offers and their versioned fee structures. Enrolling a
          student posts the fee schedule to their account as <b>draft charges</b> for review — nothing
          counts toward a balance until it is explicitly posted.
        </p>
      </div>
      <RhythmsBilling school="rhythms" students={students} canEdit={canEdit} canBill={canBill} />
    </div>
  )
}
