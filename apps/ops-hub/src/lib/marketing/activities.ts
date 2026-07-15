// =============================================================================
// Marketing CRM — activity timeline.
// =============================================================================
// Logging an activity also bumps the contact's last_contact_at so the CRM
// list stays sorted by recency.

import { createServerClient } from '@ocg/db'
import type { MarketingActivityRow } from '@ocg/db'
import { ACTIVITY_KINDS, type ActivityKind, type MarketingActivity } from './types'

function toActivity(row: MarketingActivityRow): MarketingActivity {
  return {
    id: row.id,
    contactId: row.contact_id,
    dealId: row.deal_id,
    kind: row.kind as ActivityKind,
    subject: row.subject,
    body: row.body,
    occurredAt: row.occurred_at,
    byEmail: row.by_email,
    createdAt: row.created_at,
  }
}

function isKind(v: string): v is ActivityKind {
  return (ACTIVITY_KINDS as readonly string[]).includes(v)
}

export async function listActivitiesForContact(contactId: string, limit = 100): Promise<MarketingActivity[]> {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('marketing_activities')
    .select('*')
    .eq('contact_id', contactId)
    .order('occurred_at', { ascending: false })
    .limit(limit)
  if (error || !data) return []
  return (data as MarketingActivityRow[]).map(toActivity)
}

export interface LogActivityInput {
  contactId: string
  dealId?: string | null
  kind: string
  subject?: string | null
  body?: string | null
  occurredAt?: string
  byEmail?: string | null
}

export async function logActivity(
  input: LogActivityInput,
): Promise<{ ok: true; activity: MarketingActivity } | { ok: false; error: string }> {
  if (!input.contactId) return { ok: false, error: 'Contact is required.' }
  if (!isKind(input.kind)) return { ok: false, error: 'Unknown activity kind.' }
  const supabase = createServerClient()
  const occurredAt = input.occurredAt ?? new Date().toISOString()
  const { data, error } = await supabase
    .from('marketing_activities')
    .insert({
      contact_id: input.contactId,
      deal_id: input.dealId ?? null,
      kind: input.kind,
      subject: input.subject?.trim() || null,
      body: input.body?.trim() || null,
      occurred_at: occurredAt,
      by_email: input.byEmail ?? null,
    })
    .select('*')
    .single()
  if (error || !data) return { ok: false, error: error?.message ?? 'log_failed' }
  // Bump the contact's last_contact_at (best-effort).
  await supabase
    .from('marketing_contacts')
    .update({ last_contact_at: occurredAt, updated_at: new Date().toISOString() })
    .eq('id', input.contactId)
  return { ok: true, activity: toActivity(data as MarketingActivityRow) }
}
