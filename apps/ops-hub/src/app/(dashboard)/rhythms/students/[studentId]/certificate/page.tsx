import { notFound } from 'next/navigation'
import { db } from '@/lib/serverClient'
import { requireActor } from '@/lib/server-auth'
import { CertificateOfCompletion } from '@/components/school/CertificateOfCompletion'
import type { RhythmsStudentRow } from '@ocg/db'

export const dynamic = 'force-dynamic'

export default async function RhythmsCertificatePage({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params
  await requireActor()
  const { data } = await db().from('rhythms_students').select('*').eq('id', studentId).maybeSingle()
  if (!data) notFound()
  const s = data as RhythmsStudentRow
  const issued = new Date().toLocaleDateString('en-KE', { timeZone: 'Africa/Nairobi', day: 'numeric', month: 'long', year: 'numeric' })
  const ref = `RHY-CERT-${(s.admission_number || s.id.slice(0, 8)).toUpperCase().replace(/[^A-Z0-9]/g, '')}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`
  return (
    <CertificateOfCompletion
      backHref={`/rhythms/students/${s.id}`}
      brandName="Rhythms College"
      subtitle="Nairobi, Kenya · A One Core Group institution"
      color="#9a2a2a"
      studentName={s.full_name}
      admissionNo={s.admission_number ?? ''}
      programme={s.programme ?? ''}
      completionText="has satisfactorily completed the course of study"
      issuedDate={issued}
      verifyRef={ref}
      signatories={['Course tutor', 'Principal']}
    />
  )
}
