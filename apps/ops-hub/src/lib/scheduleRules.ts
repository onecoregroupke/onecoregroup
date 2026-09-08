import type { OcgScheduleOccurrenceRow, OcgScheduleRuleRow } from '@ocg/db'
import { db } from './serverClient'

export type ScheduleFrequency = OcgScheduleRuleRow['frequency']

export interface ScheduleRuleInput {
  frequency: ScheduleFrequency
  intervalCount?: number
  weekdays?: number[]
  endsOn?: string | null
  occurrenceLimit?: number | null
}

export interface GeneratedOccurrence {
  occurrenceNumber: number
  startsAt: string
  endsAt: string | null
}

function dateAt(iso: string): Date { return new Date(`${iso}T00:00:00Z`) }
function isoDate(date: Date): string { return date.toISOString().slice(0, 10) }
function addDays(iso: string, days: number): string { const date = dateAt(iso); date.setUTCDate(date.getUTCDate() + days); return isoDate(date) }
function mondayOf(iso: string): string { const date = dateAt(iso); return addDays(iso, -((date.getUTCDay() + 6) % 7)) }
function daysBetween(a: string, b: string): number { return Math.round((dateAt(b).getTime() - dateAt(a).getTime()) / 86_400_000) }

function nairobiParts(instant: string): { date: string; time: string } {
  const date = new Date(instant)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date)
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return { date: `${pick('year')}-${pick('month')}-${pick('day')}`, time: `${pick('hour')}:${pick('minute')}` }
}

function nairobiInstant(date: string, time: string): string { return `${date}T${time}:00+03:00` }

function dueOn(date: string, startDate: string, rule: ScheduleRuleInput): boolean {
  const interval = Math.max(1, Math.floor(Number(rule.intervalCount ?? 1)))
  const day = dateAt(date).getUTCDay()
  const diff = daysBetween(startDate, date)
  switch (rule.frequency) {
    case 'daily': return diff % interval === 0
    case 'weekdays': return day >= 1 && day <= 5 && (interval === 1 || Math.floor(diff / 7) % interval === 0)
    case 'selected_weekdays': {
      const weekDiff = Math.floor(daysBetween(mondayOf(startDate), mondayOf(date)) / 7)
      return (rule.weekdays ?? []).includes(day) && weekDiff % interval === 0
    }
    case 'weekly': return day === dateAt(startDate).getUTCDay() && Math.floor(diff / 7) % interval === 0
    case 'monthly': {
      const start = dateAt(startDate)
      const current = dateAt(date)
      const monthDiff = (current.getUTCFullYear() - start.getUTCFullYear()) * 12 + current.getUTCMonth() - start.getUTCMonth()
      return current.getUTCDate() === start.getUTCDate() && monthDiff % interval === 0
    }
    case 'interval_days': return diff % interval === 0
    case 'interval_weeks': return day === dateAt(startDate).getUTCDay() && diff % (interval * 7) === 0
  }
}

/** Generate a finite series. The rule is rejected unless it has an inclusive
 * end date or a count, and is hard-capped at 500 occurrences. */
export function generateScheduleOccurrences(
  startsAt: string,
  endsAt: string | null,
  rule: ScheduleRuleInput,
): GeneratedOccurrence[] {
  if (!rule.endsOn && !rule.occurrenceLimit) throw new Error('A recurring schedule must end on a date or after a number of occurrences.')
  const limit = rule.occurrenceLimit == null ? 500 : Math.max(1, Math.min(500, Math.floor(rule.occurrenceLimit)))
  const start = nairobiParts(startsAt)
  const end = endsAt ? nairobiParts(endsAt) : null
  const durationMs = endsAt ? Math.max(0, new Date(endsAt).getTime() - new Date(startsAt).getTime()) : null
  const horizon = rule.endsOn ?? addDays(start.date, 3660)
  const result: GeneratedOccurrence[] = []
  for (let date = start.date; date <= horizon && result.length < limit; date = addDays(date, 1)) {
    if (!dueOn(date, start.date, rule)) continue
    const occurrenceStart = nairobiInstant(date, start.time)
    const occurrenceEnd = durationMs == null
      ? null
      : new Date(new Date(occurrenceStart).getTime() + durationMs).toISOString()
    result.push({ occurrenceNumber: result.length + 1, startsAt: occurrenceStart, endsAt: occurrenceEnd })
  }
  if (result.length === 0) throw new Error('The recurrence rule produces no occurrences in its selected range.')
  // Keep the exact submitted first end wall time where possible; duration is
  // authoritative for later occurrences and correctly handles day crossings.
  if (end && result[0]) result[0].endsAt = endsAt
  return result
}

export async function createScheduleForEntity(input: {
  entityType: 'task' | 'event'
  entityId: string
  startsAt: string
  endsAt: string | null
  assigneeId?: string | null
  rule: ScheduleRuleInput
  createdBy: string
  createdById?: string | null
}): Promise<{ rule: OcgScheduleRuleRow; occurrences: OcgScheduleOccurrenceRow[] }> {
  const generated = generateScheduleOccurrences(input.startsAt, input.endsAt, input.rule)
  type ScheduleResult = { rule: OcgScheduleRuleRow; occurrences: OcgScheduleOccurrenceRow[] }
  type ScheduleRpc = Promise<{ data: ScheduleResult | null; error: { message: string } | null }>
  const call = db().rpc as unknown as (name: string, values: Record<string, unknown>) => ScheduleRpc
  const { data, error } = await call('create_ocg_schedule', {
    p_entity_type: input.entityType,
    p_entity_id: input.entityId,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt,
    p_assignee_id: input.assigneeId ?? null,
    p_frequency: input.rule.frequency,
    p_interval_count: Math.max(1, Number(input.rule.intervalCount ?? 1)),
    p_weekdays: input.rule.weekdays ?? [],
    p_ends_on: input.rule.endsOn ?? null,
    p_occurrence_limit: input.rule.occurrenceLimit ?? null,
    p_created_by: input.createdBy,
    p_created_by_id: input.createdById ?? null,
    p_occurrences: generated.map((occurrence) => ({
      occurrence_number: occurrence.occurrenceNumber,
      starts_at: occurrence.startsAt,
      ends_at: occurrence.endsAt,
    })),
  })
  if (error || !data) throw new Error(error?.message ?? 'Schedule was not created.')
  return data
}
