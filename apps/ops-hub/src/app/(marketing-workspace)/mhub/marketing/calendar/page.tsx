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

// ── EAT (Africa/Nairobi, UTC+3) date helpers, all date-only strings ─────────
function eatTodayIso(): string {
  return new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
}
function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
function mondayOf(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`)
  const wd = (d.getUTCDay() + 6) % 7 // Mon = 0 … Sun = 6
  return addDays(iso, -wd)
}
function toEatIso(date: Date): string {
  return new Date(date.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
}
function dayHeader(iso: string): { weekday: string; dm: string } {
  const d = new Date(`${iso}T12:00:00+03:00`)
  return {
    weekday: d.toLocaleDateString('en-KE', { weekday: 'short', timeZone: 'Africa/Nairobi' }),
    dm: d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', timeZone: 'Africa/Nairobi' }),
  }
}

export default function CalendarPage() {
  const [weekStart, setWeekStart] = useState(() => mondayOf(eatTodayIso()))
  const [brands, setBrands] = useState<MarketingBrand[]>([])
  const [platforms, setPlatforms] = useState<MarketingPlatform[]>([])
  const [pillars, setPillars] = useState<MarketingPillar[]>([])
  const [content, setContent] = useState<CalendarContentRow[]>([])
  const [brandFilter, setBrandFilter] = useState('')
  const [platformFilter, setPlatformFilter] = useState('')
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const todayIso = eatTodayIso()
  const thisWeek = mondayOf(todayIso)
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])
  const weekEnd = addDays(weekStart, 6)

  const rows = useMemo(
    () => (brandFilter ? brands.filter((b) => b.id === brandFilter) : brands),
    [brands, brandFilter],
  )

  // Reference data once.
  useEffect(() => {
    void (async () => {
      try {
        const [b, p, pl] = await Promise.all([
          apiFetch<{ brands: MarketingBrand[] }>('/api/mhub/marketing/brands'),
          apiFetch<{ platforms: MarketingPlatform[] }>('/api/mhub/marketing/platforms'),
          apiFetch<{ pillars: MarketingPillar[] }>('/api/mhub/marketing/pillars'),
        ])
        setBrands(b.brands ?? [])
        setPlatforms(p.platforms ?? [])
        setPillars(pl.pillars ?? [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load reference data.')
      }
    })()
  }, [])

  // Content for the visible week.
  useEffect(() => {
    void (async () => {
      setLoading(true)
      setError('')
      try {
        const startUtc = new Date(`${weekStart}T00:00:00+03:00`).toISOString()
        const endUtc = new Date(`${addDays(weekStart, 7)}T00:00:00+03:00`).toISOString()
        const params = new URLSearchParams({ start: startUtc, end: endUtc })
        if (brandFilter) params.set('brand', brandFilter)
        if (platformFilter) params.set('platform', platformFilter)
        const { content: data } = await apiFetch<{ content: CalendarContentRow[] }>(
          `/api/mhub/marketing/calendar?${params.toString()}`,
        )
        setContent(data ?? [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load calendar.')
      } finally {
        setLoading(false)
      }
    })()
  }, [weekStart, brandFilter, platformFilter])

  // brandId|dayIso → rows
  const cellMap = useMemo(() => {
    const map: Record<string, CalendarContentRow[]> = {}
    for (const row of content) {
      if (!row.scheduledAt) continue
      const key = `${row.brandId}|${toEatIso(new Date(row.scheduledAt))}`
      ;(map[key] ??= []).push(row)
    }
    for (const k of Object.keys(map)) {
      map[k]!.sort((a, b) => (a.scheduledAt ?? '').localeCompare(b.scheduledAt ?? ''))
    }
    return map
  }, [content])

  async function handleDrop(targetDayIso: string) {
    const id = draggingId
    setDraggingId(null)
    setDragOver(null)
    if (!id) return
    const row = content.find((c) => c.id === id)
    if (!row || !row.scheduledAt) return
    if (toEatIso(new Date(row.scheduledAt)) === targetDayIso) return // same day, no-op
    const eat = new Date(new Date(row.scheduledAt).getTime() + 3 * 60 * 60 * 1000)
    const hh = eat.getUTCHours()
    const mm = eat.getUTCMinutes()
    const time = hh === 0 && mm === 0 ? '09:00' : `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
    const newScheduledAt = new Date(`${targetDayIso}T${time}:00+03:00`).toISOString()
    setSaving(true)
    setError('')
    try {
      await apiFetch('/api/mhub/marketing/content', {
        method: 'PATCH',
        body: JSON.stringify({ id: row.id, action: 'reschedule', scheduledAt: newScheduledAt }),
      })
      setContent((prev) => prev.map((c) => (c.id === row.id ? { ...c, scheduledAt: newScheduledAt } : c)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reschedule failed.')
    } finally {
      setSaving(false)
    }
  }

  const weekLabel = `${dayHeader(weekStart).dm} – ${dayHeader(weekEnd).dm}`

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-bold text-2xl text-gray-900">Calendar</h1>
        <p className="text-gray-500 text-sm mt-1">
          One week at a glance — brands down the side, days across the top. Drag a post to another
          day to reschedule. Colour = content pillar. Times are Africa/Nairobi (EAT).
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
        <div className="flex items-center gap-2">
          <button onClick={() => setWeekStart(addDays(weekStart, -7))} className={navBtn} aria-label="Previous week">
            <ChevronLeft size={16} />
          </button>
          <span className="px-2 text-sm font-semibold text-gray-800">{weekLabel}</span>
          <button onClick={() => setWeekStart(addDays(weekStart, 7))} className={navBtn} aria-label="Next week">
            <ChevronRight size={16} />
          </button>
          {weekStart !== thisWeek && (
            <button onClick={() => setWeekStart(thisWeek)} className="rounded-lg bg-ocg-navy px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800">
              This week
            </button>
          )}
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
                    {(brand?.shortName ?? brand?.name ?? '—')} · {PLATFORM_LABELS[p.platform]}
                  </option>
                )
              })}
          </select>
          <Link href="/mhub/marketing/content/new" className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <Plus size={15} /> New
          </Link>
        </div>
      </div>

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

      {/* Mobile agenda: one card per day, posts listed with their brand. The
          brands×days grid below is desktop-only — it can't shrink to a phone. */}
      <div className="space-y-3 md:hidden">
        {loading ? (
          <p className="rounded-xl border border-gray-100 bg-white p-4 text-sm text-gray-400 shadow-sm">Loading…</p>
        ) : (
          days.map((iso) => {
            const dayItems = rows.flatMap((brand) =>
              (cellMap[`${brand.id}|${iso}`] ?? []).map((row) => ({ row, brand })),
            )
            const h = dayHeader(iso)
            const isToday = iso === todayIso
            return (
              <div key={iso} className={`rounded-xl border bg-white p-3 shadow-sm ${isToday ? 'border-ocg-gold/50' : 'border-gray-100'}`}>
                <div className="mb-2 flex items-center justify-between">
                  <p className={`text-sm font-semibold ${isToday ? 'text-ocg-gold' : 'text-gray-800'}`}>
                    {h.weekday} · {h.dm}{isToday ? ' · Today' : ''}
                  </p>
                  <Link
                    href={`/mhub/marketing/content/new?date=${encodeURIComponent(iso)}`}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 active:bg-gray-50"
                  >
                    <Plus size={13} /> Add
                  </Link>
                </div>
                {dayItems.length === 0 ? (
                  <p className="text-xs text-gray-400">No posts scheduled.</p>
                ) : (
                  <div className="space-y-1.5">
                    {dayItems.map(({ row, brand }) => {
                      const accent = row.primaryPillarColor ?? brand.primaryColor ?? '#1a1a2e'
                      const time = row.scheduledAt
                        ? new Date(row.scheduledAt).toLocaleTimeString('en-KE', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit' })
                        : '—'
                      const platform = row.platform ? PLATFORM_LABELS[row.platform] : null
                      return (
                        <Link
                          key={row.id}
                          href={`/mhub/marketing/content/${row.id}/edit`}
                          className="block rounded-md border border-gray-100 bg-white px-2.5 py-2 shadow-sm active:bg-gray-50"
                          style={{ borderLeft: `3px solid ${accent}` }}
                        >
                          <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wide text-gray-400">
                            <span className="truncate">{brand.shortName ?? brand.name}</span>
                            <span className="shrink-0">{time}{platform ? ` · ${platform}` : ''}</span>
                          </div>
                          <div className="mt-0.5 truncate text-sm text-gray-800">{row.title || row.hook || 'Untitled'}</div>
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Grid: brands (rows) × days (columns) — desktop only */}
      <div className="hidden overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm md:block">
        <table className="w-full min-w-[900px] table-fixed border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 w-40 bg-gray-50 px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Brand
              </th>
              {days.map((iso) => {
                const h = dayHeader(iso)
                const isToday = iso === todayIso
                return (
                  <th key={iso} className={`border-l border-gray-100 px-2 py-2.5 text-center ${isToday ? 'bg-amber-50' : 'bg-gray-50'}`}>
                    <div className="text-[10px] uppercase tracking-wide text-gray-400">{h.weekday}</div>
                    <div className={`text-sm ${isToday ? 'font-bold text-ocg-gold' : 'text-gray-800'}`}>{h.dm}</div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-sm text-gray-400">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-sm text-gray-400">No brands to show.</td></tr>
            ) : (
              rows.map((brand) => (
                <tr key={brand.id} className="align-top">
                  <th scope="row" className="sticky left-0 z-10 border-t border-gray-100 bg-white px-3 py-3 text-left">
                    <span className="inline-flex items-center gap-2">
                      <span className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: brand.primaryColor }} />
                      <span className="text-sm font-medium text-gray-800">{brand.shortName ?? brand.name}</span>
                    </span>
                  </th>
                  {days.map((iso) => {
                    const items = cellMap[`${brand.id}|${iso}`] ?? []
                    const dropKey = `${brand.id}|${iso}`
                    const isToday = iso === todayIso
                    return (
                      <td
                        key={iso}
                        onDragOver={(e) => { e.preventDefault(); setDragOver(dropKey) }}
                        onDragLeave={() => setDragOver((k) => (k === dropKey ? null : k))}
                        onDrop={() => handleDrop(iso)}
                        className={`border-l border-t border-gray-100 p-1.5 ${isToday ? 'bg-amber-50/30' : ''} ${dragOver === dropKey ? 'bg-ocg-navy/5 ring-1 ring-inset ring-ocg-navy/30' : ''}`}
                      >
                        <div className="flex min-h-[68px] flex-col gap-1">
                          {items.map((item) => (
                            <CalendarChip key={item.id} row={item} onDragStart={() => setDraggingId(item.id)} />
                          ))}
                          <Link
                            href={`/mhub/marketing/content/new?date=${encodeURIComponent(iso)}`}
                            className="mt-auto flex items-center justify-center rounded border border-dashed border-gray-200 py-1 text-[11px] text-gray-300 hover:border-ocg-navy/30 hover:text-ocg-navy"
                            aria-label={`Add content for ${brand.name} on ${iso}`}
                          >
                            +
                          </Link>
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CalendarChip({ row, onDragStart }: { row: CalendarContentRow; onDragStart: () => void }) {
  const accent = row.primaryPillarColor ?? '#1a1a2e'
  const time = row.scheduledAt
    ? new Date(row.scheduledAt).toLocaleTimeString('en-KE', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit' })
    : '—'
  const platform = row.platform ? PLATFORM_LABELS[row.platform] : null
  return (
    <Link
      href={`/mhub/marketing/content/${row.id}/edit`}
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart() }}
      className="block cursor-move rounded-md border bg-white px-2 py-1.5 text-[11px] leading-snug shadow-sm transition-colors hover:bg-gray-50"
      style={{ borderColor: `${accent}55`, borderLeft: `3px solid ${accent}` }}
      title={`${CONTENT_STATUS_LABELS[row.status]} · ${CONTENT_TYPE_LABELS[row.contentType]}${platform ? ` · ${platform}` : ''}`}
    >
      <div className="flex items-center justify-between gap-1 text-[9px] uppercase tracking-wide text-gray-400">
        <span>{time}</span>
        {platform && <span className="truncate">{platform}</span>}
      </div>
      <div className="mt-0.5 truncate text-gray-800">{row.title || row.hook || 'Untitled'}</div>
    </Link>
  )
}

const navBtn = 'inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50'
const selCls = 'rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-ocg-navy'
