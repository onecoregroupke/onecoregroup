/**
 * Kenya-time helpers. All OCG scheduling is entered and read in Africa/Nairobi
 * (EAT, UTC+3, no DST). HTML datetime-local inputs produce NAIVE strings
 * ("2026-07-06T14:00"); if those are stored as-is, Postgres interprets them as
 * UTC and every appointment silently shifts by 3 hours. `eatToIso` pins the
 * naive string to +03:00 before storage; the format helpers always render in
 * Africa/Nairobi regardless of the viewer's machine.
 */

export const EAT_TZ = 'Africa/Nairobi'

const NAIVE_LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/

/** Naive datetime-local string (Kenyan wall clock) → ISO with the +03:00 offset.
 *  Strings that already carry a timezone (Z or ±hh:mm) pass through unchanged. */
export function eatToIso(value: string | null | undefined): string | null {
  if (!value) return null
  const v = value.trim()
  if (!v) return null
  if (NAIVE_LOCAL.test(v)) return `${v}${v.length === 16 ? ':00' : ''}+03:00`
  return v
}

/** ISO timestamp → "2026-07-06T14:00" in Kenyan time, for datetime-local inputs. */
export function isoToEatLocal(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: EAT_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}

export function formatEatDateTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso ?? ''
  return d.toLocaleString('en-KE', {
    timeZone: EAT_TZ,
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

export function formatEatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso ?? ''
  return d.toLocaleDateString('en-KE', { timeZone: EAT_TZ, day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatEatTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('en-KE', { timeZone: EAT_TZ, hour: 'numeric', minute: '2-digit' })
}

/** "Mon 6 Jul, 2:00 pm – 3:30 pm · 1h 30m" in Kenyan time. */
export function formatEatRange(start: string | null | undefined, end?: string | null): string {
  if (!start) return ''
  const s = new Date(start)
  if (Number.isNaN(s.getTime())) return start
  const first = s.toLocaleString('en-KE', {
    timeZone: EAT_TZ, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  })
  if (!end) return first
  const e = new Date(end)
  if (Number.isNaN(e.getTime())) return first
  const mins = Math.max(0, Math.round((e.getTime() - s.getTime()) / 60000))
  const duration = mins >= 60 ? `${Math.floor(mins / 60)}h${mins % 60 ? ` ${mins % 60}m` : ''}` : `${mins}m`
  return `${first} - ${formatEatTime(end)} · ${duration}`
}

/** Today's date (YYYY-MM-DD) on the Kenyan wall clock. */
export function eatToday(): string {
  return new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/** Days from today (EAT) to the given timestamp's EAT calendar date.
 *  0 = today, 1 = tomorrow, negative = past. */
export function eatDaysUntil(iso: string): number {
  const target = new Date(new Date(iso).getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const today = eatToday()
  return Math.round((Date.parse(`${target}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000)
}
