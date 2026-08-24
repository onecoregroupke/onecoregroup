import { NextResponse, type NextRequest } from 'next/server'
import { getApiActor } from '@/lib/api-auth'
import { memberForEmail } from '@/lib/team'
import { listBrands } from '@/lib/brands'
import { auditEvent } from '@/lib/audit'
import {
  canApproveKnowledgeForEntry, canApproveKnowledgeByEntry, createKnowledge, createKnowledgeVersion,
  getKnowledgeEntry, getKnowledgeVersion, knowledgeEntryInScope, listKnowledge,
  publishKnowledgeVersion,
} from '@/lib/knowledge'
import type { KnowledgeEntryRow } from '@ocg/db'

async function knowledgeContext(req: NextRequest) {
  const actor = await getApiActor(req)
  if (!actor) return { error: NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 }) }
  if (!actor.can('knowledge', 'view')) return { error: NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 }) }
  const member = await memberForEmail(actor.email)
  return { actor, member }
}

function entryInScope(entry: KnowledgeEntryRow, ctx: Exclude<Awaited<ReturnType<typeof knowledgeContext>>, { error: NextResponse }>): boolean {
  return knowledgeEntryInScope(entry, {
    allowedBrands: ctx.actor.allowedBrandIds('knowledge'),
    recordScope: ctx.actor.recordScope('knowledge'),
    memberDepartment: ctx.member?.department ?? null,
    memberId: ctx.member?.id ?? null,
  })
}

export async function GET(req: NextRequest) {
  const ctx = await knowledgeContext(req)
  if ('error' in ctx) return ctx.error
  const [records, brands] = await Promise.all([
    listKnowledge({
      allowedBrands: ctx.actor.allowedBrandIds('knowledge'),
      recordScope: ctx.actor.recordScope('knowledge'),
      department: ctx.member?.department ?? '',
      ownerMemberId: ctx.member?.id ?? null,
    }),
    listBrands(),
  ])
  const canEdit = ctx.actor.can('knowledge', 'edit')
    && ['management', 'group'].includes(ctx.actor.recordScope('knowledge'))
  // §37: Publish is offered per record, from the SAME decision the reader and
  // the server use. Editing is not publishing.
  const canPublish = canEdit
    ? await canApproveKnowledgeByEntry(
      { isFoundingAdmin: ctx.actor.permissions === null, memberId: ctx.member?.id ?? null },
      records,
    )
    : {}
  return NextResponse.json({
    ok: true, records,
    brands: brands.map((brand) => ({ id: brand.id, name: brand.short_name || brand.name })),
    canEdit,
    canPublish,
  })
}

export async function POST(req: NextRequest) {
  const ctx = await knowledgeContext(req)
  if ('error' in ctx) return ctx.error
  if (!ctx.actor.can('knowledge', 'edit') || !['management', 'group'].includes(ctx.actor.recordScope('knowledge'))) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }
  try {
    const body = await req.json()
    const action = String(body?.action ?? '')
    const values = body?.values ?? {}
    const actorName = ctx.actor.name || ctx.actor.email || ctx.actor.userId
    if (action === 'create') {
      const brandId = values.brand_id || null
      const allowed = ctx.actor.allowedBrandIds('knowledge')
      if (allowed !== null && (!brandId || !allowed.includes(brandId))) {
        return NextResponse.json({ ok: false, error: 'Pick an entity within your scope.' }, { status: 403 })
      }
      const record = await createKnowledge({
        title: String(values.title ?? ''), brand_id: brandId,
        department: String(values.department ?? ''), operational_area: String(values.operational_area ?? ''),
        knowledge_type: String(values.knowledge_type ?? 'reference_material'),
        owner_member_id: values.owner_member_id || ctx.member?.id || null,
        visibility_scope: values.visibility_scope ?? 'management',
        tags: String(values.tags ?? '').split(',').map((tag) => tag.trim()).filter(Boolean),
        content_body: String(values.content_body ?? ''), file_url: String(values.file_url ?? ''),
        source_title: String(values.source_title ?? ''), source_type: String(values.source_type ?? ''),
        source_date: values.source_date || null, source_reference: String(values.source_reference ?? ''),
        sourceClass: values.source_class ?? 'live', actor: actorName,
      })
      await auditEvent({ actor: ctx.actor, action: 'knowledge.create', entity_table: 'ocg_knowledge_entries', entity_id: record.id, entity_label: record.title, after_data: record as unknown as Record<string, unknown> })
      return NextResponse.json({ ok: true, record }, { status: 201 })
    }

    const entry = await getKnowledgeEntry(String(values.entry_id ?? ''))
    if (!entry || !entryInScope(entry, ctx)) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
    if (action === 'new-version') {
      const version = await createKnowledgeVersion({
        entry, content_body: String(values.content_body ?? ''), file_url: String(values.file_url ?? ''),
        source_title: String(values.source_title ?? ''), source_type: String(values.source_type ?? ''),
        source_date: values.source_date || null, source_reference: String(values.source_reference ?? ''),
        change_summary: String(values.change_summary ?? ''), actor: actorName,
      })
      await auditEvent({ actor: ctx.actor, action: 'knowledge.version.create', entity_table: 'ocg_knowledge_versions', entity_id: version.id, entity_label: entry.title, after_data: version as unknown as Record<string, unknown> })
      return NextResponse.json({ ok: true, version }, { status: 201 })
    }
    if (action === 'publish') {
      // §33: resolve the version FIRST and authorise against its real parent
      // entry. Trusting the caller's entry_id here is what let a permitted
      // entry id launder a publish of an unrelated version.
      const versionId = String(values.version_id ?? '')
      const version0 = await getKnowledgeVersion(versionId)
      if (!version0 || version0.entry_id !== entry.id) {
        return NextResponse.json(
          { ok: false, error: 'That version does not belong to this knowledge entry.' },
          { status: 400 },
        )
      }
      const parent = await getKnowledgeEntry(version0.entry_id)
      if (!parent || !entryInScope(parent, ctx)) {
        return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
      }
      const authorised = await canApproveKnowledgeForEntry({
        isFoundingAdmin: ctx.actor.permissions === null,
        memberId: ctx.member?.id ?? null,
        brandId: parent.brand_id,
      })
      if (!authorised) {
        return NextResponse.json(
          { ok: false, error: 'Explicit knowledge approval authority is required.' },
          { status: 403 },
        )
      }
      // Re-checked inside, against the version's own entry_id.
      const version = await publishKnowledgeVersion(versionId, actorName, parent.id)
      await auditEvent({ actor: ctx.actor, action: 'knowledge.publish', entity_table: 'ocg_knowledge_versions', entity_id: version.id, entity_label: parent.title, after_data: version as unknown as Record<string, unknown> })
      return NextResponse.json({ ok: true, version })
    }
    return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 400 })
  }
}

