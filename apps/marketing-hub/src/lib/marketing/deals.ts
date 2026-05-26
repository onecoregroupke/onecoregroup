// =============================================================================
// Marketing CRM — deals + pipeline.
// =============================================================================

import { createServerClient } from '@ocg/db'
import type { MarketingDealRow } from '@ocg/db'
import {
  DEAL_STAGES,
  DEAL_TRANSITIONS,
  type DealStage,
  type MarketingDeal,
} from './types'

function toDeal(row: MarketingDealRow): MarketingDeal {
  return {
    id: row.id,
    contactId: row.contact_id,
    campaignId: row.campaign_id,
    brandId: row.brand_id,
    name: row.name,
    valueKsh: row.value_ksh !== null ? Number(row.value_ksh) : null,
    stage: row.stage as DealStage,
    expectedCloseDate: row.expected_close_date,
    closedAt: row.closed_at,
    lostReason: row.lost_reason,
    ownerEmail: row.owner_email,
    notes: row.notes,
    createdByEmail: row.created_by_email,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function isDealStage(v: string): v is DealStage {
  return (DEAL_STAGES as readonly string[]).includes(v)
}

export interface ListDealsFilters {
  stage?: DealStage | 'any' | 'open'
  contactId?: string
  brandId?: string
}

export async function listDeals(filters: ListDealsFilters = {}, limit = 300): Promise<MarketingDeal[]> {
  const supabase = createServerClient()
  let query = supabase
    .from('marketing_deals')
    .select('*')
    .order('expected_close_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(limit)
  if (filters.contactId) query = query.eq('contact_id', filters.contactId)
  if (filters.brandId) query = query.eq('brand_id', filters.brandId)
  if (filters.stage === 'open') {
    query = query.in('stage', ['new', 'qualified', 'proposal', 'negotiation'])
  } else if (filters.stage && filters.stage !== 'any') {
    query = query.eq('stage', filters.stage)
  }
  const { data, error } = await query
  if (error || !data) {
    if (error) console.warn('[marketing] listDeals failed:', error.message)
    return []
  }
  return (data as MarketingDealRow[]).map(toDeal)
}

export async function getDealById(id: string): Promise<MarketingDeal | null> {
  const supabase = createServerClient()
  const { data, error } = await supabase.from('marketing_deals').select('*').eq('id', id).maybeSingle()
  if (error || !data) return null
  return toDeal(data as MarketingDealRow)
}

export interface DealInput {
  contactId?: string
  campaignId?: string | null
  brandId?: string | null
  name?: string
  valueKsh?: number | null
  expectedCloseDate?: string | null
  ownerEmail?: string | null
  notes?: string | null
  createdByEmail?: string
}

function toRowPatch(input: DealInput): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  if (input.campaignId !== undefined) patch.campaign_id = input.campaignId
  if (input.brandId !== undefined) patch.brand_id = input.brandId
  if (input.name !== undefined) patch.name = input.name.trim()
  if (input.valueKsh !== undefined) patch.value_ksh = input.valueKsh
  if (input.expectedCloseDate !== undefined) patch.expected_close_date = input.expectedCloseDate
  if (input.ownerEmail !== undefined) patch.owner_email = input.ownerEmail?.trim() || null
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null
  return patch
}

export async function createDeal(
  input: DealInput,
): Promise<{ ok: true; deal: MarketingDeal } | { ok: false; error: string }> {
  if (!input.contactId) return { ok: false, error: 'Contact is required.' }
  if (!input.name?.trim()) return { ok: false, error: 'Name is required.' }
  const supabase = createServerClient()
  const patch = toRowPatch(input)
  patch.contact_id = input.contactId
  patch.stage = 'new'
  if (input.createdByEmail) patch.created_by_email = input.createdByEmail
  const insert = patch as { contact_id: string; name: string } & Record<string, unknown>
  const { data, error } = await supabase.from('marketing_deals').insert(insert).select('*').single()
  if (error || !data) return { ok: false, error: error?.message ?? 'create_failed' }
  return { ok: true, deal: toDeal(data as MarketingDealRow) }
}

export async function updateDeal(
  id: string,
  input: DealInput,
): Promise<{ ok: true; deal: MarketingDeal } | { ok: false; error: string }> {
  const supabase = createServerClient()
  const patch = toRowPatch(input)
  patch.updated_at = new Date().toISOString()
  const { data, error } = await supabase.from('marketing_deals').update(patch).eq('id', id).select('*').single()
  if (error || !data) return { ok: false, error: error?.message ?? 'update_failed' }
  return { ok: true, deal: toDeal(data as MarketingDealRow) }
}

export async function transitionDeal(
  id: string,
  toStage: string,
  lostReason?: string | null,
): Promise<{ ok: true; deal: MarketingDeal } | { ok: false; error: string }> {
  if (!isDealStage(toStage)) return { ok: false, error: 'Unknown target stage.' }
  const current = await getDealById(id)
  if (!current) return { ok: false, error: 'Deal not found.' }
  const allowed = DEAL_TRANSITIONS[current.stage]
  if (!allowed.includes(toStage)) {
    return { ok: false, error: `Cannot move "${current.stage}" to "${toStage}".` }
  }
  const patch: Record<string, unknown> = { stage: toStage, updated_at: new Date().toISOString() }
  if (toStage === 'won' || toStage === 'lost') patch.closed_at = new Date().toISOString()
  else patch.closed_at = null
  if (toStage === 'lost') patch.lost_reason = lostReason?.trim() || null
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('marketing_deals')
    .update(patch)
    .eq('id', id)
    .eq('stage', current.stage)
    .select('*')
    .single()
  if (error || !data) return { ok: false, error: error?.message ?? 'transition_failed' }
  return { ok: true, deal: toDeal(data as MarketingDealRow) }
}
