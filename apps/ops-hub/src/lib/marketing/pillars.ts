// =============================================================================
// Marketing pillars — data access.
// =============================================================================
// Pillars are the taxonomy that content tags into. The calendar colours each
// chip by its first pillar (sort_order ascending). Pillars are global across
// brands in v1.

import { createServerClient } from '@ocg/db'
import type { MarketingPillarRow } from '@ocg/db'
import type { MarketingPillar } from './types'

function toPillar(row: MarketingPillarRow): MarketingPillar {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    colorHex: row.color_hex,
    targetSharePct: row.target_share_pct,
    isActive: row.is_active,
    sortOrder: row.sort_order,
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
  return base || `pillar-${Date.now().toString(36)}`
}

export async function listPillars(includeInactive = false): Promise<MarketingPillar[]> {
  const supabase = createServerClient()
  let query = supabase
    .from('marketing_pillars')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (!includeInactive) query = query.eq('is_active', true)
  const { data, error } = await query
  if (error || !data) {
    if (error) console.warn('[marketing] listPillars failed:', error.message)
    return []
  }
  return (data as MarketingPillarRow[]).map(toPillar)
}

export interface CreatePillarInput {
  name: string
  slug?: string
  description?: string | null
  colorHex?: string
  targetSharePct?: number | null
  sortOrder?: number
}

export async function createPillar(
  input: CreatePillarInput,
): Promise<{ ok: true; pillar: MarketingPillar } | { ok: false; error: string }> {
  if (!input.name?.trim()) return { ok: false, error: 'Name is required.' }
  const supabase = createServerClient()
  const slug = slugify(input.slug ?? input.name)
  const { data, error } = await supabase
    .from('marketing_pillars')
    .insert({
      slug,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      color_hex: input.colorHex || '#1a1a2e',
      target_share_pct: input.targetSharePct ?? null,
      sort_order: input.sortOrder ?? 100,
    })
    .select('*')
    .single()
  if (error || !data) {
    if (error?.code === '23505') return { ok: false, error: 'Slug already exists.' }
    return { ok: false, error: error?.message ?? 'create_failed' }
  }
  return { ok: true, pillar: toPillar(data as MarketingPillarRow) }
}

export interface UpdatePillarInput {
  name?: string
  description?: string | null
  colorHex?: string
  targetSharePct?: number | null
  isActive?: boolean
  sortOrder?: number
}

export async function updatePillar(
  id: string,
  input: UpdatePillarInput,
): Promise<{ ok: true; pillar: MarketingPillar } | { ok: false; error: string }> {
  const supabase = createServerClient()
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.name !== undefined) patch.name = input.name.trim()
  if (input.description !== undefined) patch.description = input.description?.trim() || null
  if (input.colorHex !== undefined) patch.color_hex = input.colorHex
  if (input.targetSharePct !== undefined) patch.target_share_pct = input.targetSharePct
  if (input.isActive !== undefined) patch.is_active = input.isActive
  if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder
  const { data, error } = await supabase
    .from('marketing_pillars')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (error || !data) return { ok: false, error: error?.message ?? 'update_failed' }
  return { ok: true, pillar: toPillar(data as MarketingPillarRow) }
}

export async function archivePillar(id: string): Promise<{ ok: boolean }> {
  const supabase = createServerClient()
  await supabase
    .from('marketing_pillars')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
  return { ok: true }
}
