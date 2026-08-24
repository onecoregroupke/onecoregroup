import { requireSection } from '@/lib/server-auth'
import { memberForEmail } from '@/lib/team'
import { listBrands } from '@/lib/brands'
import { listKnowledge, canApproveKnowledgeByEntry } from '@/lib/knowledge'
import { KnowledgeWorkspace } from '@/components/knowledge/KnowledgeWorkspace'

export const dynamic = 'force-dynamic'

export default async function KnowledgePage() {
  const actor = await requireSection('knowledge', 'view')
  const member = await memberForEmail(actor.email)
  const [records, allBrands] = await Promise.all([
    listKnowledge({
      allowedBrands: actor.allowedBrandIds('knowledge'),
      recordScope: actor.recordScope('knowledge'),
      department: member?.department ?? '',
      ownerMemberId: member?.id ?? null,
    }),
    listBrands(),
  ])
  const allowed = actor.allowedBrandIds('knowledge')
  const brands = allowed === null ? allBrands : allBrands.filter((brand) => allowed.includes(brand.id))
  const canEdit = actor.can('knowledge', 'edit') && ['management', 'group'].includes(actor.recordScope('knowledge'))
  // §37: the list follows the same per-entry canPublish decision as the reader.
  const canPublish = canEdit
    ? await canApproveKnowledgeByEntry(
      { isFoundingAdmin: actor.permissions === null, memberId: member?.id ?? null },
      records,
    )
    : {}

  return (
    <KnowledgeWorkspace
      records={records}
      brands={brands.map((brand) => ({ id: brand.id, name: brand.short_name || brand.name }))}
      canEdit={canEdit}
      canPublish={canPublish}
    />
  )
}

