import { notFound } from 'next/navigation'
import { db } from '@/lib/serverClient'
import { requireActor } from '@/lib/server-auth'
import { CertificateOfCompletion } from '@/components/school/CertificateOfCompletion'
import type { DarulStudentRow } from '@ocg/db'

export const dynamic = 'force-dynamic'

export default async function DarulCertificatePage({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params
  await requireActor()
  const { data } = await db().from('darul_students').select('*').eq('id', studentId).maybeSingle()
  if (!data) notFound()
  const s = data as DarulStudentRow
  const issued = new Date().toLocaleDateString('en-KE', { timeZone: 'Africa/Nairobi', day: 'numeric', month: 'long', year: 'numeric' })
  const ref = `DRL-CERT-${(s.admission_number || s.id.slice(0, 8)).toUpperCase().replace(/[^A-Z0-9]/g, '')}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`
  const programme = s.hifz_juz_completed >= 30 ? 'Hifz-ul-Qur’an (complete)' : s.halaqa_level || ''
  return (
    <CertificateOfCompletion
      backHref={`/darul/students/${s.id}`}
      brandName="Darul Swafa"
      subtitle="Nairobi, Kenya · A One Core Group institution"
      color="#2a6a2a"
      studentName={s.full_name}
      admissionNo={s.admission_number ?? ''}
      programme={programme}
      completionText="has satisfactorily completed the course of study"
      issuedDate={issued}
      verifyRef={ref}
      signatories={['Ustadh / teacher', 'Principal']}
    />
  )
}
