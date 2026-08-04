import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PrintButton } from '@/components/rayyan/PrintButton'

// Branded, printable certificate of completion — reused by every school with its
// own brand identity and colour. NEVER uses WM & Co branding. Print → Save as PDF.
export function CertificateOfCompletion({
  backHref, brandName, subtitle, color, studentName, admissionNo = '', programme = '',
  completionText, issuedDate, verifyRef, signatories = ['Head of Institution', 'Registrar'],
}: {
  backHref: string
  brandName: string
  subtitle: string
  color: string
  studentName: string
  admissionNo?: string
  programme?: string
  completionText: string
  issuedDate: string
  verifyRef: string
  signatories?: string[]
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between print:hidden">
        <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
          <ArrowLeft size={15} /> Back to profile
        </Link>
        <PrintButton />
      </div>

      <div className="mx-auto max-w-3xl rounded-xl border-[6px] bg-white p-10 text-center shadow-sm print:max-w-none print:rounded-none print:shadow-none" style={{ borderColor: color }}>
        <p className="text-sm font-semibold uppercase tracking-[0.3em]" style={{ color }}>{brandName}</p>
        <p className="mt-1 text-xs text-gray-500">{subtitle}</p>

        <h1 className="mt-10 text-3xl font-bold uppercase tracking-wide text-gray-900">Certificate of Completion</h1>
        <p className="mt-8 text-sm text-gray-500">This is to certify that</p>
        <p className="mt-2 text-2xl font-semibold text-gray-900">{studentName}</p>
        {admissionNo && <p className="mt-1 text-xs text-gray-400">Admission No. {admissionNo}</p>}
        <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-gray-700">
          {completionText}{programme ? <> in <b>{programme}</b></> : null} and is hereby awarded this certificate.
        </p>

        <div className="mt-14 grid grid-cols-2 gap-12 text-sm">
          {signatories.map((s) => (
            <div key={s}>
              <div className="h-10 border-b border-gray-400" />
              <p className="mt-1 text-gray-500">{s}</p>
            </div>
          ))}
        </div>
        <p className="mt-10 text-xs text-gray-400">Issued {issuedDate} · Verification ref {verifyRef} · One Core Group</p>
      </div>
    </div>
  )
}
