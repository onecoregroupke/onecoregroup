import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getRequisitionIssueDetail } from '@/lib/procurementChain'
import { listStores } from '@/lib/manufacturing'
import { requireSection } from '@/lib/server-auth'
import { RequisitionIssueWorkspace } from '@/components/procurement/RequisitionIssueWorkspace'

export const dynamic = 'force-dynamic'

export default async function RequisitionIssuePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const actor = await requireSection('procurement')
  const { id } = await params
  const allowed = actor.allowedBrandIds('procurement')
  const detail = await getRequisitionIssueDetail(id)

  if (!detail) notFound()
  if (allowed !== null && !allowed.includes(detail.requisition.brand_id)) notFound()

  const stores = await listStores(allowed, detail.requisition.brand_id)

  return (
    <div className="space-y-5">
      <Link href="/procurement" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
        <ArrowLeft size={15} /> Procurement
      </Link>

      <RequisitionIssueWorkspace
        detail={detail}
        stores={stores.map((store) => ({ id: store.id, label: store.name }))}
        canEdit={actor.can('procurement', 'edit')}
      />
    </div>
  )
}
