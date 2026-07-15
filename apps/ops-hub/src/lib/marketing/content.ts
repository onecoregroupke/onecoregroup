// =============================================================================
// Marketing content — data access + status machine.
// =============================================================================
// The hub's primary entity. Every planned, scheduled, or published post on any
// platform is one row here. Status transitions are enforced server-side via
// CONTENT_TRANSITIONS; archived is reachable from anywhere.

import { createServerClient } from '@ocg/db'
import type { Brand, MarketingContentRow, MarketingPillarRow, MarketingPlatformRow } from '@ocg/db'
import {
  CONTENT_STATUSES,
  CONTENT_TRANSITIONS,
  CONTENT_TYPES,
  POSTED_VIA_VALUES,
  type CalendarContentRow,
  type ContentStatus,
  type ContentType,
  type MarketingContent,
  type PlatformKind,
  type PostedVia,
} from './types'

function toAssetUrls(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string')
  return []
}

function toContent(row: MarketingContentRow, pillarIds: string[] = []): MarketingContent {
  return {
    id: row.id,
    brandId: row.brand_id,
    platformId: row.platform_id,
    campaignId: row.campaign_id,
    campaignLabel: row.campaign_label,
    contentType: row.content_type as ContentType,
    status: row.status as ContentStatus,
    postedVia: row.posted_via as PostedVia,
    title: row.title,
    hook: row.hook,
    bodyMarkdown: row.body_markdown ?? '',
    hashtags: row.hashtags,
    assetUrls: toAssetUrls(row.asset_urls),
    notes: row.notes,
    scheduledAt: row.scheduled_at,
    publishedAt: row.published_at,
    externalUrl: row.external_url,
    externalPostId: row.external_post_id,
    publishError: row.publish_error,
    ownerEmail: row.owner_email,
    createdByEmail: row.created_by_email,
    approvedByEmail: row.approved_by_email,
    pillarIds,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function isContentStatus(v: string): v is ContentStatus {
  return (CONTENT_STATUSES as readonly string[]).includes(v)
}
function isContentType(v: string): v is ContentType {
  return (CONTENT_TYPES as readonly string[]).includes(v)
}
function isPostedVia(v: string): v is PostedVia {
  return (POSTED_VIA_VALUES as readonly string[]).includes(v)
}

// ── Pillar binding helpers ────────────────────────────────────────────────

async function loadPillarIdsForContents(ids: string[]): Promise<Record<string, string[]>> {
  if (ids.length === 0) return {}
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('marketing_content_pillars')
    .select('content_id, pillar_id')
    .in('content_id', ids)
  if (error || !data) return {}
  const result: Record<string, string[]> = {}
  for (const row of data as { content_id: string; pillar_id: string }[]) {
    if (!result[row.content_id]) result[row.content_id] = []
    result[row.content_id]!.push(row.pillar_id)
  }
  return result
}

async function syncPillars(contentId: string, pillarIds: string[]): Promise<void> {
  const supabase = createServerClient()
  // Replace-set semantics: delete-then-insert. Cheap at our volumes.
  await supabase.from('marketing_content_pillars').delete().eq('content_id', contentId)
  if (pillarIds.length === 0) return
  const rows = pillarIds.map((pillar_id) => ({ content_id: contentId, pillar_id }))
  await supabase.from('marketing_content_pillars').insert(rows)
}

// ── Reads ─────────────────────────────────────────────────────────────────

export interface ListContentFilters {
  brandId?: string
  platformId?: string
  status?: ContentStatus | 'any'
  contentType?: ContentType
  pillarId?: string
  query?: string
}

export async function listContent(
  filters: ListContentFilters = {},
  limit = 200,
): Promise<MarketingContent[]> {
  const supabase = createServerClient()
  let query = supabase
    .from('marketing_content')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(limit)
  if (filters.brandId) query = query.eq('brand_id', filters.brandId)
  if (filters.platformId) query = query.eq('platform_id', filters.platformId)
  if (filters.status && filters.status !== 'any') query = query.eq('status', filters.status)
  if (!filters.status) query = query.neq('status', 'archived')
  if (filters.contentType) query = query.eq('content_type', filters.contentType)
  if (filters.query) {
    const q = `%${filters.query.trim()}%`
    query = query.or(`title.ilike.${q},hook.ilike.${q},body_markdown.ilike.${q}`)
  }
  const { data, error } = await query
  if (error || !data) {
    if (error) console.warn('[marketing] listContent failed:', error.message)
    return []
  }
  const rows = data as MarketingContentRow[]
  let pillarMap: Record<string, string[]> = {}
  if (rows.length) {
    pillarMap = await loadPillarIdsForContents(rows.map((r) => r.id))
    if (filters.pillarId) {
      return rows
        .filter((r) => (pillarMap[r.id] ?? []).includes(filters.pillarId!))
        .map((r) => toContent(r, pillarMap[r.id] ?? []))
    }
  }
  return rows.map((r) => toContent(r, pillarMap[r.id] ?? []))
}

export async function getContent(id: string): Promise<MarketingContent | null> {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('marketing_content')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error || !data) return null
  const row = data as MarketingContentRow
  const pillarMap = await loadPillarIdsForContents([row.id])
  return toContent(row, pillarMap[row.id] ?? [])
}

// ── Calendar feed ──────────────────────────────────────────────────────────
// Reads scheduled content for an arbitrary date range. The calendar UI uses
// this for month-by-month navigation. Brand, platform, and primary-pillar
// fields are resolved from lookup maps so we stay on typed base tables.

export async function listCalendarContentInRange(
  rangeStartIso: string,
  rangeEndIso: string,
  options: { brandIds?: string[]; platformIds?: string[] } = {},
): Promise<CalendarContentRow[]> {
  const supabase = createServerClient()
  let query = supabase
    .from('marketing_content')
    .select(
      'id, brand_id, platform_id, content_type, status, posted_via, title, hook, scheduled_at, published_at, external_url',
    )
    .neq('status', 'archived')
    .not('scheduled_at', 'is', null)
    .gte('scheduled_at', rangeStartIso)
    .lt('scheduled_at', rangeEndIso)
    .order('scheduled_at', { ascending: true })
  if (options.brandIds && options.brandIds.length > 0) query = query.in('brand_id', options.brandIds)
  if (options.platformIds && options.platformIds.length > 0) {
    query = query.in('platform_id', options.platformIds)
  }
  const { data, error } = await query
  if (error || !data) {
    if (error) console.warn('[marketing] listCalendarContentInRange failed:', error.message)
    return []
  }
  type Row = Pick<
    MarketingContentRow,
    | 'id' | 'brand_id' | 'platform_id' | 'content_type' | 'status' | 'posted_via'
    | 'title' | 'hook' | 'scheduled_at' | 'published_at' | 'external_url'
  >
  const rows = data as Row[]
  if (rows.length === 0) return []

  // Resolve lookup maps (brands, platforms, primary pillar) in parallel.
  const contentIds = rows.map((r) => r.id)
  const [brandsRes, platformsRes, pillarLinksRes, pillarsRes] = await Promise.all([
    supabase.from('brands').select('id, slug, name, color_hex'),
    supabase.from('marketing_platforms').select('id, platform, handle'),
    supabase.from('marketing_content_pillars').select('content_id, pillar_id').in('content_id', contentIds),
    supabase.from('marketing_pillars').select('id, color_hex, sort_order'),
  ])

  const brandMap = new Map<string, Pick<Brand, 'slug' | 'name' | 'color_hex'>>()
  for (const b of (brandsRes.data ?? []) as Pick<Brand, 'id' | 'slug' | 'name' | 'color_hex'>[]) {
    brandMap.set(b.id, { slug: b.slug, name: b.name, color_hex: b.color_hex })
  }
  const platformMap = new Map<string, Pick<MarketingPlatformRow, 'platform' | 'handle'>>()
  for (const p of (platformsRes.data ?? []) as Pick<MarketingPlatformRow, 'id' | 'platform' | 'handle'>[]) {
    platformMap.set(p.id, { platform: p.platform, handle: p.handle })
  }
  const pillarMeta = new Map<string, { color_hex: string; sort_order: number }>()
  for (const pl of (pillarsRes.data ?? []) as Pick<MarketingPillarRow, 'id' | 'color_hex' | 'sort_order'>[]) {
    pillarMeta.set(pl.id, { color_hex: pl.color_hex, sort_order: pl.sort_order })
  }
  // Primary pillar per content = lowest sort_order among its linked pillars.
  const primaryPillar = new Map<string, { id: string; color: string }>()
  for (const link of (pillarLinksRes.data ?? []) as { content_id: string; pillar_id: string }[]) {
    const meta = pillarMeta.get(link.pillar_id)
    if (!meta) continue
    const current = primaryPillar.get(link.content_id)
    const currentSort = current ? pillarMeta.get(current.id)?.sort_order ?? Infinity : Infinity
    if (!current || meta.sort_order < currentSort) {
      primaryPillar.set(link.content_id, { id: link.pillar_id, color: meta.color_hex })
    }
  }

  return rows.map((row) => {
    const brand = row.brand_id ? brandMap.get(row.brand_id) : undefined
    const platform = row.platform_id ? platformMap.get(row.platform_id) : undefined
    const primary = primaryPillar.get(row.id) ?? null
    return {
      id: row.id,
      brandId: row.brand_id,
      brandSlug: brand?.slug ?? '',
      brandName: brand?.name ?? '',
      brandColor: brand?.color_hex ?? '#1a1a2e',
      platformId: row.platform_id,
      platform: (platform?.platform as PlatformKind | null) ?? null,
      platformHandle: platform?.handle ?? null,
      contentType: row.content_type as ContentType,
      status: row.status as ContentStatus,
      postedVia: row.posted_via as PostedVia,
      title: row.title,
      hook: row.hook,
      scheduledAt: row.scheduled_at as string,
      publishedAt: row.published_at,
      externalUrl: row.external_url,
      primaryPillarId: primary?.id ?? null,
      primaryPillarColor: primary?.color ?? null,
    }
  })
}

// ── Writes ──────────────────────────────────────────────────────────────────

export interface CreateContentInput {
  brandId: string
  platformId?: string | null
  campaignId?: string | null
  campaignLabel?: string | null
  contentType: string
  title?: string | null
  hook?: string | null
  bodyMarkdown?: string
  hashtags?: string | null
  assetUrls?: string[]
  notes?: string | null
  scheduledAt?: string | null
  ownerEmail?: string | null
  pillarIds?: string[]
  createdByEmail: string
}

export async function createContent(
  input: CreateContentInput,
): Promise<{ ok: true; content: MarketingContent } | { ok: false; error: string }> {
  if (!input.brandId) return { ok: false, error: 'Brand is required.' }
  if (!input.contentType || !isContentType(input.contentType)) {
    return { ok: false, error: 'Unknown content type.' }
  }
  const scheduledAt = input.scheduledAt ?? null
  if (scheduledAt && Number.isNaN(new Date(scheduledAt).getTime())) {
    return { ok: false, error: 'Invalid schedule timestamp.' }
  }
  const supabase = createServerClient()
  // A schedule given on creation still starts in 'draft' — the explicit
  // approve+schedule transition is the only way into 'scheduled'.
  const { data, error } = await supabase
    .from('marketing_content')
    .insert({
      brand_id: input.brandId,
      platform_id: input.platformId ?? null,
      campaign_id: input.campaignId ?? null,
      campaign_label: input.campaignLabel?.trim() || null,
      content_type: input.contentType,
      status: 'draft',
      posted_via: 'manual',
      title: input.title?.trim() || null,
      hook: input.hook?.trim() || null,
      body_markdown: input.bodyMarkdown ?? '',
      hashtags: input.hashtags?.trim() || null,
      asset_urls: input.assetUrls ?? [],
      notes: input.notes?.trim() || null,
      scheduled_at: scheduledAt,
      owner_email: input.ownerEmail?.trim() || input.createdByEmail,
      created_by_email: input.createdByEmail,
    })
    .select('*')
    .single()
  if (error || !data) return { ok: false, error: error?.message ?? 'create_failed' }
  const row = data as MarketingContentRow
  if (input.pillarIds && input.pillarIds.length > 0) {
    await syncPillars(row.id, input.pillarIds)
  }
  return { ok: true, content: toContent(row, input.pillarIds ?? []) }
}

export interface UpdateContentInput {
  platformId?: string | null
  campaignId?: string | null
  campaignLabel?: string | null
  contentType?: string
  title?: string | null
  hook?: string | null
  bodyMarkdown?: string
  hashtags?: string | null
  assetUrls?: string[]
  notes?: string | null
  scheduledAt?: string | null
  ownerEmail?: string | null
  pillarIds?: string[]
}

export async function updateContent(
  id: string,
  input: UpdateContentInput,
): Promise<{ ok: true; content: MarketingContent } | { ok: false; error: string }> {
  const supabase = createServerClient()
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.platformId !== undefined) patch.platform_id = input.platformId ?? null
  if (input.campaignId !== undefined) patch.campaign_id = input.campaignId ?? null
  if (input.campaignLabel !== undefined) patch.campaign_label = input.campaignLabel?.trim() || null
  if (input.contentType !== undefined) {
    if (!isContentType(input.contentType)) return { ok: false, error: 'Unknown content type.' }
    patch.content_type = input.contentType
  }
  if (input.title !== undefined) patch.title = input.title?.trim() || null
  if (input.hook !== undefined) patch.hook = input.hook?.trim() || null
  if (input.bodyMarkdown !== undefined) patch.body_markdown = input.bodyMarkdown
  if (input.hashtags !== undefined) patch.hashtags = input.hashtags?.trim() || null
  if (input.assetUrls !== undefined) patch.asset_urls = input.assetUrls
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null
  if (input.scheduledAt !== undefined) {
    if (input.scheduledAt && Number.isNaN(new Date(input.scheduledAt).getTime())) {
      return { ok: false, error: 'Invalid schedule timestamp.' }
    }
    patch.scheduled_at = input.scheduledAt
  }
  if (input.ownerEmail !== undefined) patch.owner_email = input.ownerEmail?.trim() || null

  const { data, error } = await supabase
    .from('marketing_content')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (error || !data) return { ok: false, error: error?.message ?? 'update_failed' }
  if (input.pillarIds !== undefined) await syncPillars(id, input.pillarIds)
  const row = data as MarketingContentRow
  const pillarMap = await loadPillarIdsForContents([row.id])
  return { ok: true, content: toContent(row, pillarMap[row.id] ?? []) }
}

// ── Status transitions ──────────────────────────────────────────────────────

export interface TransitionInput {
  toStatus: string
  byEmail: string
  scheduledAt?: string
  publishedAt?: string
  externalUrl?: string
  externalPostId?: string
  postedVia?: string
}

export async function transitionContent(
  id: string,
  input: TransitionInput,
): Promise<{ ok: true; content: MarketingContent } | { ok: false; error: string }> {
  if (!isContentStatus(input.toStatus)) return { ok: false, error: 'Unknown target status.' }
  const current = await getContent(id)
  if (!current) return { ok: false, error: 'Content not found.' }
  const allowed = CONTENT_TRANSITIONS[current.status]
  if (!allowed.includes(input.toStatus)) {
    return { ok: false, error: `Cannot move "${current.status}" to "${input.toStatus}".` }
  }
  const now = new Date().toISOString()
  const patch: Record<string, unknown> = { status: input.toStatus, updated_at: now }

  if (input.toStatus === 'approved' || input.toStatus === 'review') {
    patch.approved_by_email = input.byEmail
  }

  if (input.toStatus === 'scheduled') {
    if (!input.scheduledAt && !current.scheduledAt) {
      return { ok: false, error: 'Schedule timestamp is required to schedule.' }
    }
    if (input.scheduledAt) {
      if (Number.isNaN(new Date(input.scheduledAt).getTime())) {
        return { ok: false, error: 'Invalid schedule timestamp.' }
      }
      patch.scheduled_at = input.scheduledAt
    }
    patch.approved_by_email = current.approvedByEmail ?? input.byEmail
  }

  if (input.toStatus === 'published') {
    patch.published_at = input.publishedAt ?? now
    if (input.externalUrl !== undefined) patch.external_url = input.externalUrl
    if (input.externalPostId !== undefined) patch.external_post_id = input.externalPostId
    if (input.postedVia !== undefined) {
      if (!isPostedVia(input.postedVia)) return { ok: false, error: 'Unknown posted_via value.' }
      patch.posted_via = input.postedVia
    }
    patch.publish_error = null
  }

  // Race-safe conditional UPDATE: only succeeds if status hasn't drifted.
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('marketing_content')
    .update(patch)
    .eq('id', id)
    .eq('status', current.status)
    .select('*')
    .single()
  if (error || !data) return { ok: false, error: error?.message ?? 'transition_failed' }
  const row = data as MarketingContentRow
  const pillarMap = await loadPillarIdsForContents([row.id])
  return { ok: true, content: toContent(row, pillarMap[row.id] ?? []) }
}

/** Reschedule a row in-place. Used by calendar drag-and-drop. */
export async function rescheduleContent(
  id: string,
  newScheduledAt: string,
  newPlatformId?: string | null,
): Promise<{ ok: true; content: MarketingContent } | { ok: false; error: string }> {
  if (Number.isNaN(new Date(newScheduledAt).getTime())) {
    return { ok: false, error: 'Invalid schedule timestamp.' }
  }
  const current = await getContent(id)
  if (!current) return { ok: false, error: 'Content not found.' }
  // Drag-and-drop can rebook anything that isn't terminal.
  if (current.status === 'archived' || current.status === 'reported') {
    return { ok: false, error: `Cannot reschedule "${current.status}" content.` }
  }
  const patch: Record<string, unknown> = {
    scheduled_at: newScheduledAt,
    updated_at: new Date().toISOString(),
  }
  if (newPlatformId !== undefined) patch.platform_id = newPlatformId
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('marketing_content')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (error || !data) return { ok: false, error: error?.message ?? 'reschedule_failed' }
  const row = data as MarketingContentRow
  const pillarMap = await loadPillarIdsForContents([row.id])
  return { ok: true, content: toContent(row, pillarMap[row.id] ?? []) }
}

export async function archiveContent(id: string): Promise<{ ok: boolean }> {
  const supabase = createServerClient()
  await supabase
    .from('marketing_content')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('id', id)
  return { ok: true }
}

export async function reopenContent(
  id: string,
  toStatus: ContentStatus = 'draft',
): Promise<{ ok: true; content: MarketingContent } | { ok: false; error: string }> {
  const allowedReopenTargets: ContentStatus[] = ['idea', 'draft']
  if (!allowedReopenTargets.includes(toStatus)) {
    return { ok: false, error: 'Reopen targets are limited to idea or draft.' }
  }
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('marketing_content')
    .update({ status: toStatus, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'archived')
    .select('*')
    .single()
  if (error || !data) return { ok: false, error: error?.message ?? 'reopen_failed' }
  const row = data as MarketingContentRow
  const pillarMap = await loadPillarIdsForContents([row.id])
  return { ok: true, content: toContent(row, pillarMap[row.id] ?? []) }
}
