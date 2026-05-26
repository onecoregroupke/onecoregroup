'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { apiFetch } from '@/lib/marketing/client'
import {
  CONTENT_STATUS_LABELS,
  CONTENT_TYPE_LABELS,
  PLATFORM_LABELS,
  type CalendarContentRow,
  type MarketingBrand,
  type MarketingPillar,
  type MarketingPlatform,
} from '@/lib/marketing/types'

// ── EAT (Africa/Nairobi, UTC+3, no DST) date helpers ────────────────────────
function currentEatYearMonth(): { year: number; monthIndex0: number } {
  const eatNow = new Date(Date.now() + 3 * 60 * 60 * 1000)
  return { year: eatNow.getUTCFullYear(), monthIndex0: eatNow.getUTCMonth() }
}
function monthWindowEat(year: number, m0: number): { startUtc: string; endUtc: string } {
  const startUtc = new Date(Date.UTC(year, m0, 1, -3, 0, 0)).toISOString()
  const endUtc = new Date(Date.UTC(year, m0 + 1, 1, -3, 0, 0)).toISOString()
  return { startUtc, endUtc }
}
function parseMonth(value: string): { year: number; monthIndex0: number } {
  if (/^\d{4}-\d{2}$/.test(value)) {
    const [y, m] = value.split('-').map(Number)
    if (y >= 2024 && y <= 2100 && m >= 1 && m <= 12) return { year: y, monthIndex0: m - 1 }
  }
  return currentEatYearMonth()
}
function monthLabel(year: number, m0: number): string {
  return new Date(Date.UTC(year, m0, 1)).toLocaleDateString('en-KE', {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  })
}
function shiftMonth(value: string, delta: number): string {
  const { year, monthIndex0 } = parseMonth(value)
  const m = monthIndex0 + delta
  const y = m < 0 ? year - 1 : m > 11 ? year + 1 : year
  const mm = ((m % 12) + 12) % 12
  return `${y}-${String(mm + 1).padStart(2, '0')}`
}
function toEatIso(date: Date): string {
  return new Date(date.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

interface DayCell { iso: string; weekday: string; day: number }

export default function CalendarPage() {
  const [monthValue, setMonthValue] = useState(() => {
    const { year, monthIndex0 } = currentEatYearMonth()
    return `${year}-${String(monthIndex0 + 1).padStart(2, '0')}`
  })
  const [brands, setBrands] = useState<MarketingBrand[]>([])
  const [platforms, setPlatforms] = useState<MarketingPlatform[]>([])
  const [pillars, setPillars] = useState<MarketingPillar[]>([])
  const [content, setContent] = useState<CalendarContentRow[]>([])
  const [brandFilter, setBrandFilter] = useState('')
  const [platformFilter, setPlatformFilter] = useState('')
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const { year, monthIndex0 } = parseMonth(monthValue)
  const todayMonth = (() => {
    const { year: ty, monthIndex0: tm } = currentEatYearMonth()
    return `${ty}-${String(tm + 1).padStart(2, '0')}`
  })()
  const todayIso = toEatIso(new Date())

  const days = useMemo<DayCell[]>(() => {
    const daysInMonth = new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate()
    const out: DayCell[] = []
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${year}-${String(monthIndex0 + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      const date = new Date(`${iso}T12:00:00+03:00`)
      out.push({ iso, weekday: date.toLocaleDateString('en-KE', { weekday: 'short' }), day: d })
    }
    return out
  }, [year, monthIndex0])

  // Load reference data once.
  useEffect(() => {
    void (async () => {
      try {
        const [b, p, pl] = await Promise.all([
          apiFetch<{ brands: MarketingBrand[] }>('/api/marketing/brands'),
          apiFetch<{ platforms: MarketingPlatform[] }>('/api/marketing/platforms'),
          apiFetch<{ pillars: MarketingPillar[] }>('/api/marketing/pillars'),
        ])
        setBrands(b.brands ?? [])
        setPlatforms(p.platforms ?? [])
        setPillars(pl.pillars ?? [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load reference data.')
      }
    })()
  }, [])

  // Load calendar content when month or filters change.
  useEffect(() => {
    void (async () => {
      setLoading(true)
      setError('')
      try {
        const { startUtc, endUtc } = monthWindowEat(year, monthIndex0)
        const params = new URLSearchParams({ start: startUtc, end: endUtc })
        if (brandFilter) params.set('brand', brandFilter)
        if (platformFilter) params.set('platform', platformFilter)
        const { content: rows } = await apiFetch<{ content: CalendarContentRow[] }>(
          `/api/marketing/calendar?${params.toString()}`,
        )
        setContent(rows ?? [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load calendar.')
      } finally {
        setLoading(false)
      }
    })()
  }, [year, monthIndex0, brandFilter, platformFilter])

  const columns = useMemo(() => {
    let cols = platforms
    if (brandFilter) cols = cols.filter((p) => p.brandId === brandFilter)
    if (platformFilter) cols = cols.filter((p) => p.id === platformFilter)
    return cols.slice().sort((a, b) => {
      const sa = brands.find((br) => br.id === a.brandId)?.sortOrder ?? 999
      const sb = brands.find((br) => br.id === b.brandId)?.sortOrder ?? 999
      if (sa !== sb) return sa - sb
      return (a.platform || '').localeCompare(b.platform || '')
    })
  }, [platforms, brands, brandFilter, platformFilter])

  const cellMap = useMemo(() => {
    const map: Record<string, CalendarContentRow[]> = {}
    for (const row of content) {
      if (!row.scheduledAt) continue
      const key = `${toEatIso(new Date(row.scheduledAt))}|${row.platformId ?? '__none__'}`
      ;(map[key] ??= []).push(row)
    }
    return map
  }, [content])

  async function handleDrop(targetDayIso: string, targetPlatformId: string) {
    if (!draggingId) return
    const row = content.find((c) => c.id === draggingId)
    setDraggingId(null)
    if (!row || !row.scheduledAt) return
    // Keep the original EAT time-of-day, move it to the dropped day.
    const eatTime = new Date(new Date(row.scheduledAt).getTime() + 3 * 60 * 60 * 1000)
    const hh = eatTime.getUTCHours()
    const mm = eatTime.getUTCMinutes()
    const time = hh === 0 && mm === 0 ? '09:00' : `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
    const newScheduledAt = new Date(`${targetDayIso}T${time}:00+03:00`).toISOString()

    setSaving(true)
    setError('')
    try {
      await apiFetch('/api/marketing/content', {
        method: 'PATCH',
        body: JSON.stringify({
          id: row.id,
          action: 'reschedule',
          scheduledAt: newScheduledAt,
          platformId: targetPlatformId,
        }),
      })
      setContent((prev) =>
        prev.map((c) =>
          c.id === row.id
            ? {
                ...c,
                scheduledAt: newScheduledAt,
                platformId: targetPlatformId,
                platform: platforms.find((p) => p.id === targetPlatformId)?.platform ?? c.platform,
              }
            : c,
        ),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reschedule failed.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2">
        <h1 className="font-bold text-2xl text-gray-900">{monthLabel(year, monthIndex0)}</h1>
        <p className="text-gray-500 text-sm">
          Click a cell to draft content for that day and platform. Drag a chip to reschedule it.
          Colour matches the content pillar. Times are Africa/Nairobi (EAT).
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
        <div className="flex items-center gap-2">
          <button onClick={() => setMonthValue(shiftMonth(monthValue, -1))} className={navBtn} aria-label="Previous month">
            <ChevronLeft size={16} />
          </button>
          {monthValue !== todayMonth && (
            <button onClick={() => setMonthValue(todayMonth)} className="rounded-lg bg-ocg-navy px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800">
              This month
            </button>
          )}
          <button onClick={() => setMonthValue(shiftMonth(monthValue, 1))} className={navBtn} aria-label="Next month">
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={brandFilter} onChange={(e) => { setBrandFilter(e.target.value); setPlatformFilter('') }} className={selCls}>
            <option value="">All brands</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select value={platformFilter} onChange={(e) => setPlatformFilter(e.target.value)} className={selCls}>
            <option value="">All platforms</option>
            {platforms
              .filter((p) => !brandFilter || p.brandId === brandFilter)
              .map((p) => {
                const brand = brands.find((b) => b.id === p.brandId)
                return (
                  <option key={p.id} value={p.id}>
                    {(brand?.shortName ?? brand?.name ?? '—')} · {PLATFORM_LABELS[p.platform]}{p.handle ? ` (${p.handle})` : ''}
                  </option>
                )
              })}
          </select>
          <Link href="/marketing/content/new" className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <Plus size={15} /> New
          </Link>
        </div>
      </div>

      {/* Pillar legend */}
      {pillars.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-100 bg-white px-4 py-2.5 text-xs shadow-sm">
          <span className="font-semibold uppercase tracking-wide text-gray-400">Pillars</span>
          {pillars.map((p) => (
            <span key={p.id} className="inline-flex items-center gap-1.5 text-gray-600">
              <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: p.colorHex }} />
              {p.name}
            </span>
          ))}
        </div>
      )}

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {saving && <p className="text-xs text-gray-400">Saving…</p>}

      {columns.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-8 text-sm text-gray-500 shadow-sm">
          No platforms match the filters. Add one under{' '}
          <Link href="/marketing/platforms" className="font-medium text-ocg-navy hover:underline">Platforms</Link>.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
          <table className="w-full min-w-[760px] table-fixed border-collapse text-left text-xs">
            <thead>
              <tr className="bg-gray-50">
                <th className="w-24 border-b border-gray-100 px-3 py-3 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Day</th>
                {columns.map((col) => {
                  const brand = brands.find((b) => b.id === col.brandId)
                  return (
                    <th key={col.id} className="border-b border-l border-gray-100 px-3 py-2.5 align-bottom"
                        style={{ borderTop: `3px solid ${brand?.primaryColor ?? '#1a1a2e'}` }}>
                      <div className="text-[10px] uppercase tracking-wide text-gray-400">{brand?.shortName ?? brand?.name ?? '—'}</div>
                      <div className="text-[11px] font-semibold text-gray-800">{PLATFORM_LABELS[col.platform]}</div>
                      {col.handle && <div className="text-[10px] text-gray-400">{col.handle}</div>}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={columns.length + 1} className="px-3 py-6 text-gray-400">Loading…</td></tr>
              ) : (
                days.map((day) => {
                  const isToday = day.iso === todayIso
                  const isWeekend = day.weekday === 'Sat' || day.weekday === 'Sun'
                  const rowBg = isToday ? 'bg-amber-50/40' : isWeekend ? 'bg-gray-50/60' : ''
                  return (
                    <tr key={day.iso} className={rowBg}>
                      <th scope="row" className="border-b border-gray-100 px-3 py-2 align-top">
                        <div className="text-[10px] uppercase tracking-wide text-gray-400">{day.weekday}</div>
                        <div className={`text-sm ${isToday ? 'font-bold text-ocg-gold' : 'text-gray-800'}`}>{day.day}</div>
                      </th>
                      {columns.map((col) => {
                        const items = cellMap[`${day.iso}|${col.id}`] ?? []
                        return (
                          <td key={col.id} className="border-b border-l border-gray-100 align-top"
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={() => handleDrop(day.iso, col.id)}>
                            <div className="flex min-h-[60px] flex-col gap-1 p-1.5">
                              {items.map((item) => (
                                <CalendarChip key={item.id} row={item} onDragStart={() => setDraggingId(item.id)} />
                              ))}
                              <Link
                                href={`/marketing/content/new?date=${encodeURIComponent(day.iso)}&platform=${encodeURIComponent(col.id)}`}
                                className="mt-auto block rounded border border-dashed border-gray-200 px-2 py-1 text-center text-[10px] text-gray-300 hover:border-ocg-navy/30 hover:text-ocg-navy"
                                aria-label="Add content"
                              >
                                +
                              </Link>
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function CalendarChip({ row, onDragStart }: { row: CalendarContentRow; onDragStart: () => void }) {
  const accent = row.primaryPillarColor ?? '#1a1a2e'
  const time = row.scheduledAt
    ? new Date(row.scheduledAt).toLocaleTimeString('en-KE', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit' })
    : '—'
  const isEphemeral = row.contentType === 'status'
  return (
    <Link
      href={`/marketing/content/${row.id}/edit`}
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart() }}
      className="block cursor-move rounded border bg-white px-2 py-1.5 text-[11px] leading-snug text-gray-800 shadow-sm transition-colors hover:bg-gray-50"
      style={{ borderColor: `${accent}55`, borderLeft: `3px solid ${accent}` }}
      title={`${CONTENT_STATUS_LABELS[row.status]} · ${CONTENT_TYPE_LABELS[row.contentType]}${isEphemeral ? ' · expires +24h' : ''}`}
    >
      <div className="flex items-center justify-between gap-1 text-[9px] uppercase tracking-wide text-gray-400">
        <span>{isEphemeral ? '⏱ ' : ''}{time}</span>
        <span>{row.status}</span>
      </div>
      <div className="mt-0.5 truncate text-gray-800">{row.title || row.hook || 'Untitled'}</div>
    </Link>
  )
}

const navBtn = 'inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50'
const selCls = 'rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-ocg-navy'
