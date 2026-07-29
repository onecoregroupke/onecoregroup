// =============================================================================
// Marketing platforms — data access.
// =============================================================================
// One row per (brand, platform, handle). The cadence target lives on this row,
// so a brand's LinkedIn and Instagram can carry different monthly_post_target
// values. current_health is a manual flag today.

import { createServerClient } from '@ocg/db'
import type { MarketingPlatformRow } from '@ocg/db'
import type {
  MarketingPlatform,
  PlatformHealth,
  PlatformKind,
  PostingMode,
} from './types'
import { PLATFORM_KINDS, PLATFORM_HEALTH_VALUES, POSTING_MODES } from './types'

function toPlatform(row: MarketingPlatformRow): MarketingPlatform {
  return {
    id: row.id,
    brandId: row.brand_id,
    platform: row.platform as PlatformKind,
    handle: row.handle,
    externalId: row.external_id,
    monthlyPostTarget: row.monthly_post_target,
    currentHealth: (row.current_health as PlatformHealth) ?? 'healthy',
    postingMode: (row.posting_mode as PostingMode) ?? 'remind_only',
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function isPlatformKind(value: string): value is PlatformKind {
  return (PLATFORM_KINDS as readonly string[]).includes(value)
}
function isPlatformHealth(value: string): value is PlatformHealth {
  return (PLATFORM_HEALTH_VALUES as readonly string[]).includes(value)
}
function isPostingMode(value: string): value is PostingMode {
  return (POSTING_MODES as readonly string[]).includes(value)
}

export async function listPlatforms(
  options: { brandId?: string; brandIds?: string[]; includeInactive?: boolean } = {},
): Promise<MarketingPlatform[]> {
  const supabase = createServerClient()
  let query = supabase
    .from('marketing_platforms')
    .select('*')
    .order('brand_id', { ascending: true })
    .order('platform', { ascending: true })
  if (options.brandId) query = query.eq('brand_id', options.brandId)
  if (options.brandIds && options.brandIds.length > 0) query = query.in('brand_id', options.brandIds)
  if (!options.includeInactive) query = query.eq('is_active', true)
  const { data, error } = await query
  if (error || !data) {
    if (error) console.warn('[marketing] listPlatforms failed:', error.message)
    return []
  }
  return (data as MarketingPlatformRow[]).map(toPlatform)
}

export interface CreatePlatformInput {
  brandId: string
  platform: string
  handle?: string | null
  externalId?: string | null
  monthlyPostTarget?: number
}

export async function createPlatform(
  input: CreatePlatformInput,
): Promise<{ ok: true; platform: MarketingPlatform } | { ok: false; error: string }> {
  if (!isPlatformKind(input.platform)) return { ok: false, error: 'Unknown platform.' }
  if (!input.brandId) return { ok: false, error: 'Brand is required.' }
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('marketing_platforms')
    .insert({
      brand_id: input.brandId,
      platform: input.platform,
      handle: input.handle?.trim() || null,
      external_id: input.externalId?.trim() || null,
      monthly_post_target: input.monthlyPostTarget ?? 0,
    })
    .select('*')
    .single()
  if (error || !data) {
    if (error?.code === '23505') {
      return { ok: false, error: 'This platform and handle already exists for this brand.' }
    }
    return { ok: false, error: error?.message ?? 'create_failed' }
  }
  return { ok: true, platform: toPlatform(data as MarketingPlatformRow) }
}

export interface UpdatePlatformInput {
  handle?: string | null
  externalId?: string | null
  monthlyPostTarget?: number
  currentHealth?: string
  postingMode?: string
  isActive?: boolean
}

export async function updatePlatform(
  id: string,
  input: UpdatePlatformInput,
): Promise<{ ok: true; platform: MarketingPlatform } | { ok: false; error: string }> {
  const supabase = createServerClient()
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.handle !== undefined) patch.handle = input.handle?.trim() || null
  if (input.externalId !== undefined) patch.external_id = input.externalId?.trim() || null
  if (input.monthlyPostTarget !== undefined) {
    if (Number.isNaN(input.monthlyPostTarget) || input.monthlyPostTarget < 0) {
      return { ok: false, error: 'Monthly target must be 0 or higher.' }
    }
    patch.monthly_post_target = Math.floor(input.monthlyPostTarget)
  }
  if (input.currentHealth !== undefined) {
    if (!isPlatformHealth(input.currentHealth)) return { ok: false, error: 'Unknown health value.' }
    patch.current_health = input.currentHealth
  }
  if (input.postingMode !== undefined) {
    if (!isPostingMode(input.postingMode)) return { ok: false, error: 'Unknown posting mode.' }
    patch.posting_mode = input.postingMode
  }
  if (input.isActive !== undefined) patch.is_active = input.isActive
  const { data, error } = await supabase
    .from('marketing_platforms')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (error || !data) return { ok: false, error: error?.message ?? 'update_failed' }
  return { ok: true, platform: toPlatform(data as MarketingPlatformRow) }
}

export async function archivePlatform(id: string): Promise<{ ok: boolean }> {
  const supabase = createServerClient()
  await supabase
    .from('marketing_platforms')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
  return { ok: true }
}
