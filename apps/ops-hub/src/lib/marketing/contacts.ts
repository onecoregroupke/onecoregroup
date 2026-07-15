// =============================================================================
// Marketing CRM — contacts + the promote-from-leads queue.
// =============================================================================

import { createServerClient } from '@ocg/db'
import type { MarketingContactRow } from '@ocg/db'
import {
  LIFECYCLE_STAGES,
  type LifecycleStage,
  type LeadToPromote,
  type MarketingContact,
} from './types'

function toContact(row: MarketingContactRow): MarketingContact {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    company: row.company,
    role: row.role,
    linkedinUrl: row.linkedin_url,
    source: row.source,
    sourceDetail: row.source_detail,
    lifecycleStage: row.lifecycle_stage as LifecycleStage,
    ownerEmail: row.owner_email,
    tags: row.tags ?? [],
    lastContactAt: row.last_contact_at,
    nextContactAt: row.next_contact_at,
    notes: row.notes,
    leadId: row.lead_id,
    createdByEmail: row.created_by_email,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function isLifecycle(v: string): v is LifecycleStage {
  return (LIFECYCLE_STAGES as readonly string[]).includes(v)
}

export interface ListContactsFilters {
  lifecycleStage?: LifecycleStage | 'any'
  ownerEmail?: string
  query?: string
}

export async function listContacts(
  filters: ListContactsFilters = {},
  limit = 300,
): Promise<MarketingContact[]> {
  const supabase = createServerClient()
  let query = supabase
    .from('marketing_contacts')
    .select('*')
    .order('last_contact_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(limit)
  if (filters.lifecycleStage && filters.lifecycleStage !== 'any') {
    query = query.eq('lifecycle_stage', filters.lifecycleStage)
  }
  if (filters.ownerEmail) query = query.eq('owner_email', filters.ownerEmail)
  if (filters.query) {
    const q = `%${filters.query.trim()}%`
    query = query.or(`full_name.ilike.${q},email.ilike.${q},company.ilike.${q}`)
  }
  const { data, error } = await query
  if (error || !data) {
    if (error) console.warn('[marketing] listContacts failed:', error.message)
    return []
  }
  return (data as MarketingContactRow[]).map(toContact)
}

export async function getContactById(id: string): Promise<MarketingContact | null> {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('marketing_contacts')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error || !data) return null
  return toContact(data as MarketingContactRow)
}

export interface ContactInput {
  fullName?: string | null
  email?: string | null
  phone?: string | null
  company?: string | null
  role?: string | null
  linkedinUrl?: string | null
  source?: string | null
  sourceDetail?: string | null
  lifecycleStage?: string
  ownerEmail?: string | null
  tags?: string[]
  nextContactAt?: string | null
  notes?: string | null
  leadId?: string | null
  createdByEmail?: string
}

function toRowPatch(input: ContactInput): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  if (input.fullName !== undefined) patch.full_name = input.fullName?.trim() || null
  if (input.email !== undefined) patch.email = input.email?.trim().toLowerCase() || null
  if (input.phone !== undefined) patch.phone = input.phone?.trim() || null
  if (input.company !== undefined) patch.company = input.company?.trim() || null
  if (input.role !== undefined) patch.role = input.role?.trim() || null
  if (input.linkedinUrl !== undefined) patch.linkedin_url = input.linkedinUrl?.trim() || null
  if (input.source !== undefined) patch.source = input.source?.trim() || null
  if (input.sourceDetail !== undefined) patch.source_detail = input.sourceDetail?.trim() || null
  if (input.lifecycleStage !== undefined && isLifecycle(input.lifecycleStage)) {
    patch.lifecycle_stage = input.lifecycleStage
  }
  if (input.ownerEmail !== undefined) patch.owner_email = input.ownerEmail?.trim() || null
  if (input.tags !== undefined) patch.tags = input.tags
  if (input.nextContactAt !== undefined) patch.next_contact_at = input.nextContactAt
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null
  if (input.leadId !== undefined) patch.lead_id = input.leadId
  return patch
}

export async function createContact(
  input: ContactInput,
): Promise<{ ok: true; contact: MarketingContact } | { ok: false; error: string }> {
  const supabase = createServerClient()
  const patch = toRowPatch(input)
  if (input.createdByEmail) patch.created_by_email = input.createdByEmail
  if (!patch.lifecycle_stage) patch.lifecycle_stage = 'lead'
  const { data, error } = await supabase
    .from('marketing_contacts')
    .insert(patch)
    .select('*')
    .single()
  if (error || !data) {
    if (error?.code === '23505') return { ok: false, error: 'A contact with that email already exists.' }
    return { ok: false, error: error?.message ?? 'create_failed' }
  }
  return { ok: true, contact: toContact(data as MarketingContactRow) }
}

export async function updateContact(
  id: string,
  input: ContactInput,
): Promise<{ ok: true; contact: MarketingContact } | { ok: false; error: string }> {
  const supabase = createServerClient()
  const patch = toRowPatch(input)
  patch.updated_at = new Date().toISOString()
  const { data, error } = await supabase
    .from('marketing_contacts')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (error || !data) {
    if (error?.code === '23505') return { ok: false, error: 'A contact with that email already exists.' }
    return { ok: false, error: error?.message ?? 'update_failed' }
  }
  return { ok: true, contact: toContact(data as MarketingContactRow) }
}

// ── Promote queue (leads → contacts) ────────────────────────────────────

export async function listLeadsToPromote(limit = 200): Promise<LeadToPromote[]> {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('marketing_leads_to_promote')
    .select('*')
    .order('captured_at', { ascending: false })
    .limit(limit)
  if (error || !data) {
    if (error) console.warn('[marketing] listLeadsToPromote failed:', error.message)
    return []
  }
  return (
    data as Array<{
      lead_id: string
      name: string | null
      email: string | null
      phone: string | null
      source: string | null
      brand_slug: string | null
      interest: string | null
      lead_status: string
      captured_at: string
    }>
  ).map((r) => ({
    leadId: r.lead_id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    source: r.source,
    brandSlug: r.brand_slug,
    interest: r.interest,
    leadStatus: r.lead_status,
    capturedAt: r.captured_at,
  }))
}

export async function promoteLead(
  leadId: string,
  createdByEmail: string,
): Promise<{ ok: true; contact: MarketingContact } | { ok: false; error: string }> {
  const supabase = createServerClient()
  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .select('id, name, email, phone, source, interest')
    .eq('id', leadId)
    .maybeSingle()
  if (leadErr || !lead) return { ok: false, error: 'Lead not found.' }
  const l = lead as { id: string; name: string | null; email: string | null; phone: string | null; source: string | null; interest: string | null }
  return createContact({
    fullName: l.name,
    email: l.email,
    phone: l.phone,
    source: l.source ?? 'lead',
    sourceDetail: l.interest,
    lifecycleStage: 'lead',
    leadId: l.id,
    createdByEmail,
  })
}
