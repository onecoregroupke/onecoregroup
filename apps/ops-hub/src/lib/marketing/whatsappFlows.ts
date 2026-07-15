// =============================================================================
// WhatsApp flows — data access + status machine.
// =============================================================================
// Authored conversation flows the operator references. No runtime here; the
// flow_definition is free-form JSON.

import { createServerClient } from '@ocg/db'
import type { MarketingWhatsappFlowRow } from '@ocg/db'
import {
  WHATSAPP_FLOW_STATUSES,
  WHATSAPP_FLOW_TRANSITIONS,
  WHATSAPP_TRIGGER_TYPES,
  type WhatsappFlow,
  type WhatsappFlowStatus,
  type WhatsappTriggerType,
} from './types'

function toFlow(row: MarketingWhatsappFlowRow): WhatsappFlow {
  return {
    id: row.id,
    brandId: row.brand_id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    triggerKeywords: row.trigger_keywords ?? [],
    triggerType: row.trigger_type as WhatsappTriggerType,
    triggerConfig: (row.trigger_config as Record<string, unknown>) ?? {},
    flowDefinition: (row.flow_definition as Record<string, unknown>) ?? {},
    status: row.status as WhatsappFlowStatus,
    lastTriggeredAt: row.last_triggered_at,
    triggeredCount: row.triggered_count,
    ownerEmail: row.owner_email,
    notes: row.notes,
    createdByEmail: row.created_by_email,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function isStatus(v: string): v is WhatsappFlowStatus {
  return (WHATSAPP_FLOW_STATUSES as readonly string[]).includes(v)
}
function isTrigger(v: string): v is WhatsappTriggerType {
  return (WHATSAPP_TRIGGER_TYPES as readonly string[]).includes(v)
}

function slugify(value: string): string {
  const base = value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
  return base || `flow-${Date.now().toString(36)}`
}

export async function listFlows(
  options: { brandId?: string; includeArchived?: boolean } = {},
): Promise<WhatsappFlow[]> {
  const supabase = createServerClient()
  let query = supabase
    .from('marketing_whatsapp_flows')
    .select('*')
    .order('updated_at', { ascending: false })
  if (options.brandId) query = query.eq('brand_id', options.brandId)
  if (!options.includeArchived) query = query.neq('status', 'archived')
  const { data, error } = await query
  if (error || !data) {
    if (error) console.warn('[marketing] listFlows failed:', error.message)
    return []
  }
  return (data as MarketingWhatsappFlowRow[]).map(toFlow)
}

export async function getFlowById(id: string): Promise<WhatsappFlow | null> {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('marketing_whatsapp_flows')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error || !data) return null
  return toFlow(data as MarketingWhatsappFlowRow)
}

export interface FlowInput {
  brandId?: string
  name?: string
  slug?: string
  description?: string | null
  triggerKeywords?: string[]
  triggerType?: string
  triggerConfig?: Record<string, unknown>
  flowDefinition?: Record<string, unknown>
  ownerEmail?: string | null
  notes?: string | null
  createdByEmail?: string
}

export async function createFlow(
  input: FlowInput,
): Promise<{ ok: true; flow: WhatsappFlow } | { ok: false; error: string }> {
  if (!input.brandId) return { ok: false, error: 'Brand is required.' }
  if (!input.name?.trim()) return { ok: false, error: 'Name is required.' }
  if (input.triggerType && !isTrigger(input.triggerType)) {
    return { ok: false, error: 'Unknown trigger type.' }
  }
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('marketing_whatsapp_flows')
    .insert({
      brand_id: input.brandId,
      slug: slugify(input.slug ?? input.name),
      name: input.name.trim(),
      description: input.description?.trim() || null,
      trigger_keywords: input.triggerKeywords ?? [],
      trigger_type: input.triggerType ?? 'keyword',
      trigger_config: input.triggerConfig ?? {},
      flow_definition: input.flowDefinition ?? {},
      owner_email: input.ownerEmail?.trim() || input.createdByEmail || null,
      notes: input.notes?.trim() || null,
      created_by_email: input.createdByEmail ?? null,
    })
    .select('*')
    .single()
  if (error || !data) {
    if (error?.code === '23505') return { ok: false, error: 'A flow with that slug already exists for this brand.' }
    return { ok: false, error: error?.message ?? 'create_failed' }
  }
  return { ok: true, flow: toFlow(data as MarketingWhatsappFlowRow) }
}

export async function updateFlow(
  id: string,
  input: FlowInput,
): Promise<{ ok: true; flow: WhatsappFlow } | { ok: false; error: string }> {
  const supabase = createServerClient()
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.name !== undefined) patch.name = input.name.trim()
  if (input.description !== undefined) patch.description = input.description?.trim() || null
  if (input.triggerKeywords !== undefined) patch.trigger_keywords = input.triggerKeywords
  if (input.triggerType !== undefined) {
    if (!isTrigger(input.triggerType)) return { ok: false, error: 'Unknown trigger type.' }
    patch.trigger_type = input.triggerType
  }
  if (input.triggerConfig !== undefined) patch.trigger_config = input.triggerConfig
  if (input.flowDefinition !== undefined) patch.flow_definition = input.flowDefinition
  if (input.ownerEmail !== undefined) patch.owner_email = input.ownerEmail?.trim() || null
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null
  const { data, error } = await supabase
    .from('marketing_whatsapp_flows')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (error || !data) return { ok: false, error: error?.message ?? 'update_failed' }
  return { ok: true, flow: toFlow(data as MarketingWhatsappFlowRow) }
}

export async function transitionFlow(
  id: string,
  toStatus: string,
): Promise<{ ok: true; flow: WhatsappFlow } | { ok: false; error: string }> {
  if (!isStatus(toStatus)) return { ok: false, error: 'Unknown target status.' }
  const current = await getFlowById(id)
  if (!current) return { ok: false, error: 'Flow not found.' }
  const allowed = WHATSAPP_FLOW_TRANSITIONS[current.status]
  if (!allowed.includes(toStatus)) {
    return { ok: false, error: `Cannot move "${current.status}" to "${toStatus}".` }
  }
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('marketing_whatsapp_flows')
    .update({ status: toStatus, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', current.status)
    .select('*')
    .single()
  if (error || !data) return { ok: false, error: error?.message ?? 'transition_failed' }
  return { ok: true, flow: toFlow(data as MarketingWhatsappFlowRow) }
}
