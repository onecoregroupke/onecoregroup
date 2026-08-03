// Recurring-duty recurrence engine (§8). Pure + unit-tested (recurrence.test.ts).
// A duty template carries a recurrence RULE; whether it is "due" on a given date
// is derived, so we never generate uncontrolled duplicate task instances — the
// occurrence for date X simply exists when isDutyDueOn(rule, X) is true, and its
// completion is the single (duty_id, date) log row.

export interface RecurrenceRule {
  frequency: string              // daily | weekdays | weekly | monthly | interval
  weekdays?: number[] | null     // 0=Sun … 6=Sat — for 'weekly' / selected days
  day_of_month?: number | null   // 1..31 for 'monthly'; -1 = last WORKING day of month
  interval_days?: number | null  // for 'interval' (every N days from start_date)
  start_date?: string | null     // YYYY-MM-DD
  end_date?: string | null       // YYYY-MM-DD (inclusive)
  active?: boolean
  paused?: boolean
}

function atUtc(iso: string): Date { return new Date(`${iso}T00:00:00Z`) }
function dow(iso: string): number { return atUtc(iso).getUTCDay() }
function dom(iso: string): number { return atUtc(iso).getUTCDate() }
function isWeekend(d: number): boolean { return d === 0 || d === 6 }
function daysBetween(a: string, b: string): number {
  return Math.round((atUtc(b).getTime() - atUtc(a).getTime()) / 86_400_000)
}

/** The last Mon–Fri of the month containing `iso`. */
export function lastWorkingDayOfMonth(iso: string): string {
  const dt = atUtc(iso)
  const last = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0))
  while (isWeekend(last.getUTCDay())) last.setUTCDate(last.getUTCDate() - 1)
  return last.toISOString().slice(0, 10)
}

/** Is this recurring duty due on `dateISO` (YYYY-MM-DD)? Pure + deterministic. */
export function isDutyDueOn(rule: RecurrenceRule, dateISO: string): boolean {
  if (rule.active === false || rule.paused === true) return false
  if (rule.start_date && dateISO < rule.start_date) return false
  if (rule.end_date && dateISO > rule.end_date) return false
  const d = dow(dateISO)
  switch (rule.frequency) {
    case 'daily': return true
    case 'weekdays': return !isWeekend(d)
    case 'weekly': return (rule.weekdays ?? []).includes(d)
    case 'monthly':
      if (rule.day_of_month === -1) return dateISO === lastWorkingDayOfMonth(dateISO)
      return dom(dateISO) === (rule.day_of_month ?? 1)
    case 'interval': {
      const n = rule.interval_days ?? 0
      if (n <= 0 || !rule.start_date) return false
      const diff = daysBetween(rule.start_date, dateISO)
      return diff >= 0 && diff % n === 0
    }
    default:
      return true // unknown → daily (back-compat with pre-migration daily duties)
  }
}

/** Every due date in [fromISO, toISO] inclusive. */
export function dueDatesBetween(rule: RecurrenceRule, fromISO: string, toISO: string): string[] {
  const out: string[] = []
  const cur = atUtc(fromISO)
  const end = atUtc(toISO).getTime()
  while (cur.getTime() <= end) {
    const iso = cur.toISOString().slice(0, 10)
    if (isDutyDueOn(rule, iso)) out.push(iso)
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return out
}

/** A due date strictly before `todayISO` with no completion is overdue (when the
 *  rule keeps missed occurrences open). */
export function isOverdueOccurrence(rule: RecurrenceRule, dateISO: string, todayISO: string, completed: boolean): boolean {
  return !completed && dateISO < todayISO && isDutyDueOn(rule, dateISO)
}

export const RECURRENCE_FREQUENCIES = [
  { value: 'daily', label: 'Every day' },
  { value: 'weekdays', label: 'Every weekday (Mon–Fri)' },
  { value: 'weekly', label: 'Selected days of the week' },
  { value: 'monthly', label: 'Monthly (day of month)' },
  { value: 'interval', label: 'Every N days' },
] as const

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

/** Human summary of a rule for list UIs. */
export function describeRecurrence(rule: RecurrenceRule): string {
  switch (rule.frequency) {
    case 'daily': return 'Every day'
    case 'weekdays': return 'Every weekday (Mon–Fri)'
    case 'weekly': return `Weekly on ${(rule.weekdays ?? []).map((d) => WEEKDAY_LABELS[d]).join(', ') || '—'}`
    case 'monthly': return rule.day_of_month === -1 ? 'Last working day of the month' : `Monthly on day ${rule.day_of_month ?? 1}`
    case 'interval': return `Every ${rule.interval_days ?? 0} days`
    default: return 'Every day'
  }
}
