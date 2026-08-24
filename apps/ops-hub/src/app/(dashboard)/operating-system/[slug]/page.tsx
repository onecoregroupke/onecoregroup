import { notFound } from 'next/navigation'
import { requireSection } from '@/lib/server-auth'
import { memberForEmail } from '@/lib/team'
import { getManual, canOpenManual, resolveManualContent, manualStatusLabel } from '@/lib/operatingSystem/service'
import { loadDynamicSections } from '@/lib/operatingSystem/dynamic'
import { referencedKnowledge } from '@/lib/operatingSystem/model'
import { listKnowledge } from '@/lib/knowledge'
import { ManualReader } from '@/components/operatingSystem/ManualReader'
import type { DynamicSource } from '@/lib/operatingSystem/model'

export const dynamic = 'force-dynamic'

/**
 * One Operating System manual (§5).
 *
 * Access is checked SERVER-SIDE against the same brand scope the landing page
 * filters by, so a brand-scoped user cannot open another entity's manual by
 * typing its slug (§58).
 */
export default async function ManualPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const actor = await requireSection('knowledge', 'view')
  const { slug } = await params

  const manual = await getManual(slug)
  if (!manual) notFound()
  if (!canOpenManual(manual, actor.allowedBrandIds('knowledge'))) notFound()

  const doc = resolveManualContent(manual.version)
  if (!doc || !manual.version) notFound()

  // Which live sections this manual actually asks for — loaded once, not per block.
  const sources = [...new Set(
    doc.chapters.flatMap((c) => c.blocks)
      .filter((b): b is Extract<typeof b, { kind: 'dynamic' }> => b.kind === 'dynamic')
      .map((b) => b.source as DynamicSource),
  )]

  const member = await memberForEmail(actor.email)
  const [dynamicSections, knowledgeRecords] = await Promise.all([
    loadDynamicSections(sources, manual.brandId),
    // Resolve related-Knowledge links through the SAME scoped list the Knowledge
    // library uses, so a manual can never link someone into a document their
    // visibility scope does not reach (§58).
    listKnowledge({
      allowedBrands: actor.allowedBrandIds('knowledge'),
      recordScope: actor.recordScope('knowledge'),
      department: member?.department ?? '',
      ownerMemberId: member?.id ?? null,
    }),
  ])

  const wanted = new Set(referencedKnowledge(doc))
  const knowledgeLinks: Record<string, string> = {}
  for (const record of knowledgeRecords) {
    if (wanted.has(record.title)) knowledgeLinks[record.title] = record.id
  }

  return (
    <ManualReader
      doc={doc}
      meta={{
        slug: manual.slug,
        entity: manual.brandName,
        versionNo: manual.version.version_no,
        status: manual.version.status,
        statusLabel: manualStatusLabel(manual.version.status),
        generatedAt: new Date(manual.version.created_at).toLocaleDateString('en-KE', {
          day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Nairobi',
        }),
        sourceSummary: manual.version.source_summary,
      }}
      dynamic={dynamicSections}
      knowledgeLinks={knowledgeLinks}
    />
  )
}
