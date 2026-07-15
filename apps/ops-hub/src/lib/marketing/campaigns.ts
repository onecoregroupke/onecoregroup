// =============================================================================
// Marketing campaigns — data access + status machine.
// =============================================================================
// Campaigns are bounded units of work: goal, audience, window, owner. Content
// rows attach via campaign_id. (Site-events attribution feeds from the WM hub
// are omitted — One Core has no canonical site-events store.)

import { createServerClient } from '@ocg/db'
import type { MarketingCampaignRow } from '@ocg/db'
import {
  CAMPAIGN_STATUSES,
  CAMPAIGN_TRANSITIONS,
  type CampaignStatus,
  type MarketingCampaign,
} from './types'

function toCampaign(row: MarketingCampaignRow): MarketingCampaign {
  return {
    id: row.id,
    brandId: row.brand_id,
    slug: row.slug,
    name: row.name,
    goal: row.goal,
    audienceSummary: row.audience_summary,
    primaryChannel: row.primary_channel,
    secondaryChannels: row.secondary_channels ?? [],
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status as CampaignStatus,
    utmCampaign: row.utm_campaign,
    budgetKsh: row.budget_ksh !== null ? Number(row.budget_ksh) : null,
    targetLeads: row.target_leads,
    targetRevenueKsh: row.target_revenue_ksh !== null ? Number(row.target_revenue_ksh) : null,
    kpis: (row.kpis as Record<string, unknown>) ?? {},
    ownerEmail: row.owner_email,
    notes: row.notes,
    createdByEmail: row.created_by_email,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function isCampaignStatus(value: string): value is CampaignStatus {
  return (CAMPAIGN_STATUSES as readonly string[]).includes(value)
}

function slugify(value: string): string {
  const base = value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
  return base || `campaign-${Date.now().toString(36)}`
}

// ── Reads ───────────────────────────────────────────────────────────────

export interface ListCampaignsFilters {
  brandId?: string
  status?: CampaignStatus | 'any' | 'open'
  query?: string
}

export async function listCampaigns(
  filters: ListCampaignsFilters = {},
  limit = 200,
): Promise<MarketingCampaign[]> {
  const supabase = createServerClient()
  let query = supabase
    .from('marketing_campaigns')
    .select('*')
    .order('start_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(limit)
  if (filters.brandId) query = query.eq('brand_id', filters.brandId)
  if (filters.status === 'open') {
    query = query.in('status', ['planning', 'live', 'paused'])
  } else if (filters.status && filters.status !== 'any') {
    query = query.eq('status', filters.status)
  } else if (!filters.status) {
    query = query.neq('status', 'cancelled')
  }
  if (filters.query) {
    const q = `%${filters.query.trim()}%`
    query = query.or(`name.ilike.${q},goal.ilike.${q},notes.ilike.${q}`)
  }
  const { data, error } = await query
  if (error || !data) {
    if (error) console.warn('[marketing] listCampaigns failed:', error.message)
    return []
  }
  return (data as MarketingCampaignRow[]).map(toCampaign)
}

export async function getCampaignById(id: string): Promise<MarketingCampaign | null> {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('marketing_campaigns')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error || !data) return null
  return toCampaign(data as MarketingCampaignRow)
}

// ── Writes ─────────────────────────────────────────────────────────────

export interface CreateCampaignInput {
  brandId: string
  name: string
  slug?: string
  goal?: string | null
  audienceSummary?: string | null
  primaryChannel?: string | null
  secondaryChannels?: string[]
  startDate?: string | null
  endDate?: string | null
  utmCampaign?: string | null
  budgetKsh?: number | null
  targetLeads?: number | null
  targetRevenueKsh?: number | null
  kpis?: Record<string, unknown>
  ownerEmail?: string | null
  notes?: string | null
  createdByEmail: string
}

export async function createCampaign(
  input: CreateCampaignInput,
): Promise<{ ok: true; campaign: MarketingCampaign } | { ok: false; error: string }> {
  if (!input.brandId) return { ok: false, error: 'Brand is required.' }
  if (!input.name?.trim()) return { ok: false, error: 'Name is required.' }
  const supabase = createServerClient()
  const slug = slugify(input.slug ?? input.name)
  const utm = input.utmCampaign?.trim() || slug
  const { data, error } = await supabase
    .from('marketing_campaigns')
    .insert({
      brand_id: input.brandId,
      slug,
      name: input.name.trim(),
      goal: input.goal?.trim() || null,
      audience_summary: input.audienceSummary?.trim() || null,
      primary_channel: input.primaryChannel?.trim() || null,
      secondary_channels: input.secondaryChannels ?? [],
      start_date: input.startDate ?? null,
      end_date: input.endDate ?? null,
      status: 'planning',
      utm_campaign: utm,
      budget_ksh: input.budgetKsh ?? null,
      target_leads: input.targetLeads ?? null,
      target_revenue_ksh: input.targetRevenueKsh ?? null,
      kpis: input.kpis ?? {},
      owner_email: input.ownerEmail?.trim() || input.createdByEmail,
      notes: input.notes?.trim() || null,
      created_by_email: input.createdByEmail,
    })
    .select('*')
    .single()
  if (error || !data) {
    if (error?.code === '23505') return { ok: false, error: 'Slug already in use.' }
    return { ok: false, error: error?.message ?? 'create_failed' }
  }
  return { ok: true, campaign: toCampaign(data as MarketingCampaignRow) }
}

export interface UpdateCampaignInput {
  name?: string
  goal?: string | null
  audienceSummary?: string | null
  primaryChannel?: string | null
  secondaryChannels?: string[]
  startDate?: string | null
  endDate?: string | null
  utmCampaign?: string | null
  budgetKsh?: number | null
  targetLeads?: number | null
  targetRevenueKsh?: number | null
  kpis?: Record<string, unknown>
  ownerEmail?: string | null
  notes?: string | null
}

export async function updateCampaign(
  id: string,
  input: UpdateCampaignInput,
): Promise<{ ok: true; campaign: MarketingCampaign } | { ok: false; error: string }> {
  const supabase = createServerClient()
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.name !== undefined) patch.name = input.name.trim()
  if (input.goal !== undefined) patch.goal = input.goal?.trim() || null
  if (input.audienceSummary !== undefined) patch.audience_summary = input.audienceSummary?.trim() || null
  if (input.primaryChannel !== undefined) patch.primary_channel = input.primaryChannel?.trim() || null
  if (input.secondaryChannels !== undefined) patch.secondary_channels = input.secondaryChannels
  if (input.startDate !== undefined) patch.start_date = input.startDate
  if (input.endDate !== undefined) patch.end_date = input.endDate
  if (input.utmCampaign !== undefined) patch.utm_campaign = input.utmCampaign?.trim() || null
  if (input.budgetKsh !== undefined) patch.budget_ksh = input.budgetKsh
  if (input.targetLeads !== undefined) patch.target_leads = input.targetLeads
  if (input.targetRevenueKsh !== undefined) patch.target_revenue_ksh = input.targetRevenueKsh
  if (input.kpis !== undefined) patch.kpis = input.kpis
  if (input.ownerEmail !== undefined) patch.owner_email = input.ownerEmail?.trim() || null
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null
  const { data, error } = await supabase
    .from('marketing_campaigns')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (error || !data) return { ok: false, error: error?.message ?? 'update_failed' }
  return { ok: true, campaign: toCampaign(data as MarketingCampaignRow) }
}

export async function transitionCampaign(
  id: string,
  toStatus: string,
): Promise<{ ok: true; campaign: MarketingCampaign } | { ok: false; error: string }> {
  if (!isCampaignStatus(toStatus)) return { ok: false, error: 'Unknown target status.' }
  const current = await getCampaignById(id)
  if (!current) return { ok: false, error: 'Campaign not found.' }
  const allowed = CAMPAIGN_TRANSITIONS[current.status]
  if (!allowed.includes(toStatus)) {
    return { ok: false, error: `Cannot move "${current.status}" to "${toStatus}".` }
  }
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('marketing_campaigns')
    .update({ status: toStatus, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', current.status)
    .select('*')
    .single()
  if (error || !data) return { ok: false, error: error?.message ?? 'transition_failed' }
  return { ok: true, campaign: toCampaign(data as MarketingCampaignRow) }
}

// ── Linked content ──────────────────────────────────────────────────────

export async function listCampaignContent(campaignId: string): Promise<
  Array<{
    id: string
    title: string | null
    status: string
    scheduledAt: string | null
    publishedAt: string | null
    platformId: string | null
  }>
> {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('marketing_content')
    .select('id, title, status, scheduled_at, published_at, platform_id')
    .eq('campaign_id', campaignId)
    .neq('status', 'archived')
    .order('scheduled_at', { ascending: true, nullsFirst: false })
  if (error || !data) return []
  return (
    data as Array<{
      id: string
      title: string | null
      status: string
      scheduled_at: string | null
      published_at: string | null
      platform_id: string | null
    }>
  ).map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    scheduledAt: r.scheduled_at,
    publishedAt: r.published_at,
    platformId: r.platform_id,
  }))
}
