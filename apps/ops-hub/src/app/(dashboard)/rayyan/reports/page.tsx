import { getRayyanAdminData } from '@/lib/management'

export const dynamic = 'force-dynamic'

export default async function RayyanReportsPage() {
  const { students, admissions, feeFollowups, adminTasks, snapshots } = await getRayyanAdminData()
  const enrolled = students.filter((s) => s.enrollment_status === 'enrolled')
  const pendingDocs = admissions.filter((a) => a.documents_status !== 'complete')
  const activeAdmissions = admissions.filter((a) => !['Enrolled', 'Lost / inactive'].includes(a.pipeline_status))
  const pendingFees = feeFollowups.filter((f) => f.follow_up_status !== 'resolved')
  const dueAdmin = adminTasks.filter((t) => t.status !== 'done')
  const balance = snapshots.reduce((sum, s) => sum + Number(s.balance_ksh ?? 0), 0)
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-semibold text-gray-900">Rayyan reports</h1><p className="text-sm text-gray-500">Admissions, enrollment, fee follow-up, and admin workload summary. SchoolPay remains the payment source of truth.</p></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Students" value={students.length} />
        <Stat label="Enrolled" value={enrolled.length} />
        <Stat label="Admissions pipeline" value={activeAdmissions.length} />
        <Stat label="Pending documents" value={pendingDocs.length} tone="text-amber-600" />
        <Stat label="Fee follow-ups" value={pendingFees.length} tone="text-amber-600" />
        <Stat label="Admin tasks due" value={dueAdmin.length} />
        <Stat label="Payment snapshots" value={snapshots.length} />
        <Stat label="Snapshot balance" value={balance} money tone="text-red-600" />
      </div>
    </div>
  )
}

function Stat({ label, value, money = false, tone = 'text-gray-900' }: { label: string; value: number; money?: boolean; tone?: string }) {
  return <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm"><p className={`text-3xl font-light ${tone}`}>{money ? `KSh ${value.toLocaleString()}` : value}</p><p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</p></div>
}
