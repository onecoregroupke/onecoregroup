import { notFound } from 'next/navigation'
import { requireSection } from '@/lib/server-auth'
import { memberForEmail } from '@/lib/team'
import { listBrands } from '@/lib/brands'
import { canApproveKnowledgeForEntry, getKnowledgeRecord, knowledgeEntryInScope } from '@/lib/knowledge'
import { KnowledgeReader } from '@/components/knowledge/KnowledgeReader'

export const dynamic = 'force-dynamic'

export default async function KnowledgeEntryPage({
  params,
}: {
  params: Promise<{ entryId: string }>
}) {
  const actor = await requireSection('knowledge', 'view')
  const { entryId } = await params
  const [record, member, allBrands] = await Promise.all([
    getKnowledgeRecord(entryId),
    memberForEmail(actor.email),
    listBrands(),
  ])
  if (!record) notFound()
  const inScope = knowledgeEntryInScope(record, {
    allowedBrands: actor.allowedBrandIds('knowledge'),
    recordScope: actor.recordScope('knowledge'),
    memberDepartment: member?.department ?? null,
    memberId: member?.id ?? null,
  })
  if (!inScope) notFound()

  const canEdit = actor.can('knowledge', 'edit') && ['management', 'group'].includes(actor.recordScope('knowledge'))
  const canPublish = canEdit && await canApproveKnowledgeForEntry({
    isFoundingAdmin: actor.permissions === null,
    memberId: member?.id ?? null,
    brandId: record.brand_id,
  })
  const brand = record.brand_id ? allBrands.find((b) => b.id === record.brand_id) : null

  return (
    <KnowledgeReader
      record={record}
      brandName={brand ? (brand.short_name || brand.name) : null}
      canEdit={canEdit}
      canPublish={canPublish}
    />
  )
}
