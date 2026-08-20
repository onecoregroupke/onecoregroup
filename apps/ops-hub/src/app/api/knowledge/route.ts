import { NextResponse, type NextRequest } from 'next/server'
import { getApiActor } from '@/lib/api-auth'
import { memberForEmail } from '@/lib/team'
import { listBrands } from '@/lib/brands'
import { auditEvent } from '@/lib/audit'
import { hasAuthority } from '@/lib/governanceModel'
import {
  createKnowledge, createKnowledgeVersion, getKnowledgeEntry,
  listKnowledge, publishKnowledgeVersion,
} from '@/lib/knowledge'
import { db } from '@/lib/serverClient'
import type { EmployeeAuthorityRow, KnowledgeEntryRow } from '@ocg/db'

async function knowledgeContext(req: NextRequest) {
  const actor = await getApiActor(req)
  if (!actor) return { error: NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 }) }
  if (!actor.can('knowledge', 'view')) return { error: NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 }) }
  const member = await memberForEmail(actor.email)
  return { actor, member }
}

function entryInScope(entry: KnowledgeEntryRow, ctx: Exclude<Awaited<ReturnType<typeof knowledgeContext>>, { error: NextResponse }>): boolean {
  const allowed = ctx.actor.allowedBrandIds('knowledge')
  if (allowed !== null && (!entry.brand_id || !allowed.includes(entry.brand_id))) return false
  const scope = ctx.actor.recordScope('knowledge')
  if (scope === 'group' || scope === 'management') return true
  if (scope === 'department') return Boolean(ctx.member?.department) && ctx.member?.department === entry.department
  return Boolean(ctx.member?.id) && ctx.member?.id === entry.owner_member_id
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
  return NextResponse.json({
    ok: true, records,
    brands: brands.map((brand) => ({ id: brand.id, name: brand.short_name || brand.name })),
    canEdit: ctx.actor.can('knowledge', 'edit') && ['management', 'group'].includes(ctx.actor.recordScope('knowledge')),
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
      let authorised = ctx.actor.permissions === null
      if (!authorised && ctx.member) {
        const { data } = await db().from('employee_authorities').select('*').eq('member_id', ctx.member.id).eq('active', true)
        authorised = hasAuthority((data as EmployeeAuthorityRow[] | null) ?? [], 'approve', {
          brandId: entry.brand_id, operationalArea: 'knowledge',
        })
      }
      if (!authorised) return NextResponse.json({ ok: false, error: 'Explicit knowledge approval authority is required.' }, { status: 403 })
      const version = await publishKnowledgeVersion(String(values.version_id ?? ''), actorName)
      await auditEvent({ actor: ctx.actor, action: 'knowledge.publish', entity_table: 'ocg_knowledge_versions', entity_id: version.id, entity_label: entry.title, after_data: version as unknown as Record<string, unknown> })
      return NextResponse.json({ ok: true, version })
    }
    return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 400 })
  }
}

