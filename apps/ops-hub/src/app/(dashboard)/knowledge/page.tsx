import { requireSection } from '@/lib/server-auth'
import { memberForEmail } from '@/lib/team'
import { listBrands } from '@/lib/brands'
import { listKnowledge } from '@/lib/knowledge'
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
  return <KnowledgeWorkspace records={records} brands={brands.map((brand) => ({ id: brand.id, name: brand.short_name || brand.name }))} canEdit={actor.can('knowledge', 'edit') && ['management', 'group'].includes(actor.recordScope('knowledge'))} />
}

