import { notFound } from 'next/navigation'
import { db } from '@/lib/serverClient'
import { requireActor } from '@/lib/server-auth'
import { CertificateOfCompletion } from '@/components/school/CertificateOfCompletion'
import type { RayyanStudentRow } from '@ocg/db'

export const dynamic = 'force-dynamic'

export default async function RayyanCertificatePage({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params
  await requireActor()
  const { data } = await db().from('rayyan_students').select('*').eq('id', studentId).maybeSingle()
  if (!data) notFound()
  const s = data as RayyanStudentRow
  const issued = new Date().toLocaleDateString('en-KE', { timeZone: 'Africa/Nairobi', day: 'numeric', month: 'long', year: 'numeric' })
  const ref = `RAY-CERT-${(s.admission_number || s.id.slice(0, 8)).toUpperCase().replace(/[^A-Z0-9]/g, '')}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`
  return (
    <CertificateOfCompletion
      backHref={`/rayyan/students/${s.id}`}
      brandName="Ar-Rayyan Playhouse & Daycare"
      subtitle="Nairobi, Kenya · A One Core Group school"
      color="#2c45a0"
      studentName={s.full_name}
      admissionNo={s.admission_number ?? ''}
      programme={s.class_level ?? ''}
      completionText="has satisfactorily completed the programme of study"
      issuedDate={issued}
      verifyRef={ref}
      signatories={['Class teacher', 'Head teacher']}
    />
  )
}
