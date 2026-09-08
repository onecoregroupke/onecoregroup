import type { OcgReminderDeliveryRow, OcgReminderRuleRow, OcgScheduleOccurrenceRow } from '@ocg/db'
import { sendReport } from './email'
import { createNotification } from './notifications'
import { db, nowIso } from './serverClient'

export interface ReminderInput {
  offsetMinutes: number
  channel: 'email' | 'in_app'
}

export function calendarReminderDeliveryPlan(input: {
  ruleId: string
  occurrenceStarts: Array<{ id: string | null; startsAt: string }>
  reminder: ReminderInput
  recipientEmail: string
}) {
  return input.occurrenceStarts.map((occurrence) => ({
    reminder_rule_id: input.ruleId,
    occurrence_id: occurrence.id,
    occurrence_starts_at: occurrence.startsAt,
    due_at: new Date(new Date(occurrence.startsAt).getTime() - input.reminder.offsetMinutes * 60_000).toISOString(),
    recipient_email: input.recipientEmail.toLowerCase(),
    channel: input.reminder.channel,
    idempotency_key: `calendar-reminder:${input.ruleId}:${occurrence.id ?? occurrence.startsAt}`,
  }))
}

export async function createCalendarReminders(input: {
  entityType: 'task' | 'event'
  entityId: string
  scheduleRuleId?: string | null
  startsAt: string
  occurrences?: OcgScheduleOccurrenceRow[]
  recipientId?: string | null
  recipientEmail: string
  recipientName?: string
  createdBy: string
  reminders: ReminderInput[]
}): Promise<void> {
  if (!input.recipientEmail.trim() || input.reminders.length === 0) return
  const occurrenceStarts = input.occurrences?.length
    ? input.occurrences.map((occurrence) => ({ id: occurrence.id, startsAt: occurrence.starts_at }))
    : [{ id: null, startsAt: input.startsAt }]

  for (const reminder of input.reminders) {
    if (reminder.offsetMinutes < 0 || reminder.offsetMinutes > 525_600) throw new Error('Reminder offset is outside the supported range.')
    const { data: existing } = await db().from('ocg_reminder_rules').select('*')
      .eq('entity_type', input.entityType).eq('entity_id', input.entityId)
      .eq('offset_minutes', reminder.offsetMinutes).eq('channel', reminder.channel)
      .eq('recipient_email', input.recipientEmail.toLowerCase()).eq('active', true).maybeSingle()
    let rule = existing as OcgReminderRuleRow | null
    if (!rule) {
      const { data, error } = await db().from('ocg_reminder_rules').insert({
        entity_type: input.entityType,
        entity_id: input.entityId,
        schedule_rule_id: input.scheduleRuleId ?? null,
        offset_minutes: reminder.offsetMinutes,
        channel: reminder.channel,
        recipient_id: input.recipientId ?? null,
        recipient_email: input.recipientEmail.toLowerCase(),
        created_by: input.createdBy,
      }).select('*').single()
      if (error || !data) throw new Error(error?.message ?? 'Reminder rule was not created.')
      rule = data as OcgReminderRuleRow
    }
    const rows = calendarReminderDeliveryPlan({
      ruleId: rule.id,
      occurrenceStarts,
      reminder,
      recipientEmail: input.recipientEmail,
    })
    const { error } = await db().from('ocg_reminder_deliveries').upsert(rows, { onConflict: 'idempotency_key', ignoreDuplicates: true })
    if (error) throw new Error(error.message)
  }
}

export async function runCalendarReminders(now = nowIso()): Promise<{ sent: number; failed: number; skipped: number }> {
  const staleBefore = new Date(new Date(now).getTime() - 15 * 60_000).toISOString()
  const { error: recoveryError } = await db().from('ocg_reminder_deliveries').update({
    status: 'failed', error_message: 'Recovered after an interrupted delivery attempt.', updated_at: nowIso(),
  }).eq('status', 'processing').lt('last_attempt_at', staleBefore)
  if (recoveryError) throw new Error(recoveryError.message)
  const { data, error } = await db().from('ocg_reminder_deliveries').select('*')
    .in('status', ['pending', 'failed']).lte('due_at', now).lt('attempt_count', 5)
    .order('due_at', { ascending: true }).limit(100)
  if (error) throw new Error(error.message)
  const deliveries = (data as OcgReminderDeliveryRow[] | null) ?? []
  let sent = 0; let failed = 0; let skipped = 0
  for (const delivery of deliveries) {
    const { data: claimed } = await db().from('ocg_reminder_deliveries').update({
      status: 'processing', attempt_count: Number(delivery.attempt_count) + 1, last_attempt_at: nowIso(), updated_at: nowIso(),
    }).eq('id', delivery.id).eq('status', delivery.status).select('id').maybeSingle()
    if (!claimed) { skipped += 1; continue }
    const { data: ruleData } = await db().from('ocg_reminder_rules').select('*').eq('id', delivery.reminder_rule_id).maybeSingle()
    const rule = ruleData as OcgReminderRuleRow | null
    if (!rule || !rule.active) {
      await db().from('ocg_reminder_deliveries').update({ status: 'cancelled', updated_at: nowIso() }).eq('id', delivery.id)
      skipped += 1; continue
    }
    const title = `Reminder: ${rule.entity_type === 'task' ? 'scheduled task' : 'calendar event'}`
    const when = new Date(delivery.occurrence_starts_at).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Nairobi' })
    const href = rule.entity_type === 'task' ? `/tasks/${rule.entity_id}` : '/calendar'
    let ok = false
    try {
      if (delivery.channel === 'email') {
        ok = await sendReport(title, `<p>Your ${rule.entity_type} is scheduled for <strong>${when}</strong>.</p><p><a href="${process.env['NEXT_PUBLIC_OPS_URL'] ?? ''}${href}">Open in Ops Hub</a></p>`, [delivery.recipient_email], delivery.idempotency_key)
      } else {
        await createNotification({ recipient_email: delivery.recipient_email, kind: 'calendar_reminder', title, body: `Scheduled for ${when}.`, href, metadata: { reminder_delivery_id: delivery.id }, idempotency_key: delivery.idempotency_key })
        ok = true
      }
    } catch {
      ok = false
    }
    await db().from('ocg_reminder_deliveries').update(ok ? {
      status: 'sent', sent_at: nowIso(), error_message: '', updated_at: nowIso(),
    } : {
      status: 'failed', error_message: 'Reminder provider unavailable or send failed.', updated_at: nowIso(),
    }).eq('id', delivery.id)
    if (ok) sent += 1; else failed += 1
  }
  return { sent, failed, skipped }
}
