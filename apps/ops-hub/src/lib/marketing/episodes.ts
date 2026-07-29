// =============================================================================
// Marketing episodes — long-form anchor (YouTube + podcast) + clip spawning.
// =============================================================================
// An episode optionally spawns short-form clip content rows across the brand's
// platforms. Each clip links episode → content via marketing_episode_clips.
// Status: idea → recording → editing → scheduled → published → archived.

import { createServerClient } from '@ocg/db'
import type { MarketingEpisodeRow, MarketingContentRow } from '@ocg/db'
import type { EpisodeStatus, EpisodeEditStatus, MarketingEpisode } from './episodeTypes'

export { EPISODE_STATUSES, EPISODE_EDIT_STATUSES, EPISODE_STATUS_LABELS } from './episodeTypes'
export type { EpisodeStatus, EpisodeEditStatus, MarketingEpisode } from './episodeTypes'

function toEpisode(row: MarketingEpisodeRow): MarketingEpisode {
  return {
    id: row.id,
    brandId: row.brand_id,
    number: row.number,
    slug: row.slug,
    title: row.title,
    hook: row.hook,
    guestName: row.guest_name,
    guestOrg: row.guest_org,
    summaryMarkdown: row.summary_markdown,
    recordDate: row.record_date,
    publishDate: row.publish_date,
    editStatus: row.edit_status as EpisodeEditStatus,
    status: row.status as EpisodeStatus,
    youtubeUrl: row.youtube_url,
    podcastUrl: row.podcast_url,
    durationSeconds: row.duration_seconds,
    campaignId: row.campaign_id,
    createdByEmail: row.created_by_email,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function slugify(value: string): string {
  const base = value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
  return base || `episode-${Date.now().toString(36)}`
}

// ── Reads ───────────────────────────────────────────────────────────────
export async function listEpisodes(
  filters: { brandId?: string; brandIds?: string[]; status?: EpisodeStatus | 'any' } = {},
  limit = 100,
): Promise<MarketingEpisode[]> {
  const supabase = createServerClient()
  let query = supabase
    .from('marketing_episodes')
    .select('*')
    .order('publish_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(limit)
  if (filters.brandId) query = query.eq('brand_id', filters.brandId)
  if (filters.brandIds && filters.brandIds.length > 0) query = query.in('brand_id', filters.brandIds)
  if (filters.status && filters.status !== 'any') query = query.eq('status', filters.status)
  const { data, error } = await query
  if (error || !data) {
    if (error) console.warn('[marketing] listEpisodes failed:', error.message)
    return []
  }
  return (data as MarketingEpisodeRow[]).map(toEpisode)
}

export async function getEpisodeById(id: string): Promise<MarketingEpisode | null> {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('marketing_episodes')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error || !data) return null
  return toEpisode(data as MarketingEpisodeRow)
}

export interface EpisodeClip {
  id: string
  contentId: string
  hook: string | null
  startSeconds: number | null
  endSeconds: number | null
  aspectRatio: string | null
  contentTitle: string | null
  contentStatus: string
  platformId: string | null
}

export async function listEpisodeClips(episodeId: string): Promise<EpisodeClip[]> {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('marketing_episode_clips')
    .select('id, content_id, hook, start_seconds, end_seconds, aspect_ratio')
    .eq('episode_id', episodeId)
  if (error || !data) return []
  const clips = data as Array<{
    id: string
    content_id: string
    hook: string | null
    start_seconds: number | null
    end_seconds: number | null
    aspect_ratio: string | null
  }>
  if (clips.length === 0) return []

  const { data: contentRows } = await supabase
    .from('marketing_content')
    .select('id, title, status, platform_id')
    .in('id', clips.map((c) => c.content_id))
  const byId = new Map(
    ((contentRows as Pick<MarketingContentRow, 'id' | 'title' | 'status' | 'platform_id'>[] | null) ?? []).map(
      (r) => [r.id, r],
    ),
  )

  return clips.map((c) => {
    const content = byId.get(c.content_id)
    return {
      id: c.id,
      contentId: c.content_id,
      hook: c.hook,
      startSeconds: c.start_seconds,
      endSeconds: c.end_seconds,
      aspectRatio: c.aspect_ratio,
      contentTitle: content?.title ?? null,
      contentStatus: content?.status ?? 'idea',
      platformId: content?.platform_id ?? null,
    }
  })
}

// ── Writes ─────────────────────────────────────────────────────────────
export interface CreateEpisodeInput {
  brandId: string
  title: string
  number?: number | null
  hook?: string | null
  guestName?: string | null
  guestOrg?: string | null
  summaryMarkdown?: string
  recordDate?: string | null
  publishDate?: string | null
  youtubeUrl?: string | null
  podcastUrl?: string | null
  campaignId?: string | null
  createdByEmail: string
}

export async function createEpisode(
  input: CreateEpisodeInput,
): Promise<{ ok: true; episode: MarketingEpisode } | { ok: false; error: string }> {
  if (!input.brandId) return { ok: false, error: 'Brand is required.' }
  if (!input.title?.trim()) return { ok: false, error: 'Title is required.' }
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('marketing_episodes')
    .insert({
      brand_id: input.brandId,
      number: input.number ?? null,
      slug: slugify(input.title),
      title: input.title.trim(),
      hook: input.hook?.trim() || null,
      guest_name: input.guestName?.trim() || null,
      guest_org: input.guestOrg?.trim() || null,
      summary_markdown: input.summaryMarkdown ?? '',
      record_date: input.recordDate ?? null,
      publish_date: input.publishDate ?? null,
      status: 'idea',
      youtube_url: input.youtubeUrl?.trim() || null,
      podcast_url: input.podcastUrl?.trim() || null,
      campaign_id: input.campaignId ?? null,
      created_by_email: input.createdByEmail,
    })
    .select('*')
    .single()
  if (error || !data) {
    if (error?.code === '23505') return { ok: false, error: 'Episode number or slug already in use.' }
    return { ok: false, error: error?.message ?? 'create_failed' }
  }
  return { ok: true, episode: toEpisode(data as MarketingEpisodeRow) }
}

export interface UpdateEpisodeInput {
  title?: string
  number?: number | null
  hook?: string | null
  guestName?: string | null
  guestOrg?: string | null
  summaryMarkdown?: string
  recordDate?: string | null
  publishDate?: string | null
  status?: EpisodeStatus
  editStatus?: EpisodeEditStatus
  youtubeUrl?: string | null
  podcastUrl?: string | null
  durationSeconds?: number | null
  campaignId?: string | null
}

export async function updateEpisode(
  id: string,
  input: UpdateEpisodeInput,
): Promise<{ ok: true; episode: MarketingEpisode } | { ok: false; error: string }> {
  const supabase = createServerClient()
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.title !== undefined) patch.title = input.title.trim()
  if (input.number !== undefined) patch.number = input.number
  if (input.hook !== undefined) patch.hook = input.hook?.trim() || null
  if (input.guestName !== undefined) patch.guest_name = input.guestName?.trim() || null
  if (input.guestOrg !== undefined) patch.guest_org = input.guestOrg?.trim() || null
  if (input.summaryMarkdown !== undefined) patch.summary_markdown = input.summaryMarkdown
  if (input.recordDate !== undefined) patch.record_date = input.recordDate
  if (input.publishDate !== undefined) patch.publish_date = input.publishDate
  if (input.status !== undefined) patch.status = input.status
  if (input.editStatus !== undefined) patch.edit_status = input.editStatus
  if (input.youtubeUrl !== undefined) patch.youtube_url = input.youtubeUrl?.trim() || null
  if (input.podcastUrl !== undefined) patch.podcast_url = input.podcastUrl?.trim() || null
  if (input.durationSeconds !== undefined) patch.duration_seconds = input.durationSeconds
  if (input.campaignId !== undefined) patch.campaign_id = input.campaignId
  const { data, error } = await supabase
    .from('marketing_episodes')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (error || !data) return { ok: false, error: error?.message ?? 'update_failed' }
  return { ok: true, episode: toEpisode(data as MarketingEpisodeRow) }
}

// ── Clip spawning ─────────────────────────────────────────────────────────
export interface SpawnClipInput {
  platformId?: string | null
  contentType?: string
  title?: string
  hook?: string | null
  bodyMarkdown?: string
  scheduledAt?: string | null
  startSeconds?: number | null
  endSeconds?: number | null
  aspectRatio?: string | null
}

/** Spawn clip content rows for an episode. Each clip becomes a draft content
 *  row (linked back via episode_id) plus a marketing_episode_clips row. */
export async function spawnClips(
  episodeId: string,
  clips: SpawnClipInput[],
  createdByEmail: string,
): Promise<{ ok: true; created: number } | { ok: false; error: string }> {
  const episode = await getEpisodeById(episodeId)
  if (!episode) return { ok: false, error: 'Episode not found.' }
  if (clips.length === 0) return { ok: false, error: 'No clips provided.' }
  const supabase = createServerClient()
  let created = 0

  for (const clip of clips) {
    const { data: contentRow, error: contentErr } = await supabase
      .from('marketing_content')
      .insert({
        brand_id: episode.brandId,
        platform_id: clip.platformId ?? null,
        campaign_id: episode.campaignId ?? null,
        episode_id: episodeId,
        content_type: clip.contentType ?? 'short',
        status: 'draft',
        posted_via: 'manual',
        title: clip.title ?? `${episode.title} — clip`,
        hook: clip.hook ?? null,
        body_markdown: clip.bodyMarkdown ?? '',
        scheduled_at: clip.scheduledAt ?? null,
        created_by_email: createdByEmail,
        owner_email: createdByEmail,
      })
      .select('id')
      .single()
    if (contentErr || !contentRow) continue

    await supabase.from('marketing_episode_clips').insert({
      episode_id: episodeId,
      content_id: (contentRow as { id: string }).id,
      hook: clip.hook ?? null,
      start_seconds: clip.startSeconds ?? null,
      end_seconds: clip.endSeconds ?? null,
      aspect_ratio: clip.aspectRatio ?? '9:16',
    })
    created += 1
  }

  return { ok: true, created }
}
