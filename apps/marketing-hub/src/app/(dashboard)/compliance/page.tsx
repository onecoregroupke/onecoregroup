'use client'

import { useEffect, useState } from 'react'
import { getClient } from '@/lib/supabase'
import type { Brand, DailyMetric } from '@ocg/db'
import { ChevronLeft, ChevronRight } from 'lucide-react'

function getWeekDays(weekStart: Date): Date[] {
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + i)
    return d
  })
}

function getMonday(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d
}

function fmtDate(d: Date) {
  return d.toISOString().split('T')[0]!
}

function DayCell({ posted }: { posted: boolean | null }) {
  if (posted === null)
    return (
      <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-300 text-xs">
        ?
      </div>
    )
  return (
    <div
      className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${
        posted ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-500'
      }`}
    >
      {posted ? '✓' : '✗'}
    </div>
  )
}

const BRAND_CONFIGS = [
  { slug: 'nairobi-piano-technicians', short: 'NPT', color: '#1a1a2e' },
  { slug: 'glitz-n-glim', short: 'Glitz', color: '#b07a00' },
  { slug: 'nuuranest-stays', short: 'Nuura', color: '#1a6b42' },
  { slug: 'ar-rayyan-playhouse', short: 'Ar-Rayyan', color: '#2c45a0' },
  { slug: 'rhythms-college', short: 'Rhythms', color: '#9a2a2a' },
  { slug: 'darul-swafa', short: 'Darul', color: '#2a6a2a' },
]

export default function CompliancePage() {
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()))
  const [brands, setBrands] = useState<Brand[]>([])
  const [metrics, setMetrics] = useState<DailyMetric[]>([])
  const [loading, setLoading] = useState(true)

  const days = getWeekDays(weekStart)
  const weekEnd = days[days.length - 1]!

  useEffect(() => {
    const supabase = getClient()
    Promise.all([
      supabase.from('brands').select('*').eq('is_active', true).order('name'),
      supabase
        .from('daily_metrics')
        .select('brand_id, metric_date, feed_posts_count')
        .gte('metric_date', fmtDate(weekStart))
        .lte('metric_date', fmtDate(weekEnd)),
    ]).then(([br, mr]) => {
      setBrands((br.data as Brand[]) ?? [])
      setMetrics((mr.data as DailyMetric[]) ?? [])
      setLoading(false)
    })
  }, [weekStart])

  function navigate(dir: -1 | 1) {
    setLoading(true)
    const d = new Date(weekStart)
    d.setDate(d.getDate() + dir * 7)
    setWeekStart(d)
  }

  const weekLabel = `${days[0]!.toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })} — ${weekEnd.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}`

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-bold text-2xl text-gray-900">Compliance Tracker</h1>
          <p className="text-gray-500 text-sm mt-1">Posting compliance per brand, Mon–Sat</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-medium text-gray-700 min-w-[180px] text-center">{weekLabel}</span>
          <button
            onClick={() => navigate(1)}
            disabled={fmtDate(weekStart) >= fmtDate(getMonday(new Date()))}
            className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-40"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-5 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider w-40">
                Brand
              </th>
              {days.map((d) => (
                <th key={fmtDate(d)} className="text-center px-2 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {d.toLocaleDateString('en-KE', { weekday: 'short' })}
                  <br />
                  <span className="font-normal text-gray-400">{d.getDate()}</span>
                </th>
              ))}
              <th className="text-center px-4 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                % Compliance
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="text-center py-10 text-gray-400 text-sm">
                  Loading...
                </td>
              </tr>
            ) : (
              brands.map((brand) => {
                const bc = BRAND_CONFIGS.find((b) => b.slug === brand.slug)
                const brandMetrics = metrics.filter((m) => m.brand_id === brand.id)
                const today = fmtDate(new Date())

                const dayStatuses = days.map((d) => {
                  const ds = fmtDate(d)
                  if (ds > today) return null
                  const metric = brandMetrics.find((m) => m.metric_date === ds)
                  if (!metric) return null
                  return metric.feed_posts_count > 0
                })

                const posted = dayStatuses.filter(Boolean).length
                const total = dayStatuses.filter((s) => s !== null).length
                const pct = total > 0 ? Math.round((posted / 6) * 100) : 0

                return (
                  <tr key={brand.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: bc?.color ?? '#999' }} />
                        <span className="font-medium text-sm text-gray-900">{bc?.short ?? brand.short_name}</span>
                      </div>
                    </td>
                    {dayStatuses.map((status, i) => (
                      <td key={i} className="px-2 py-4 text-center">
                        <div className="flex justify-center">
                          <DayCell posted={status} />
                        </div>
                      </td>
                    ))}
                    <td className="px-4 py-4 text-center">
                      <span
                        className={`text-sm font-bold px-3 py-1 rounded-full ${
                          pct >= 80
                            ? 'bg-green-100 text-green-700'
                            : pct >= 67
                            ? 'bg-yellow-100 text-yellow-700'
                            : total === 0
                            ? 'bg-gray-100 text-gray-400'
                            : 'bg-red-100 text-red-600'
                        }`}
                      >
                        {total === 0 ? '—' : `${pct}%`}
                      </span>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400 text-center">
        ✓ = feed post submitted · ✗ = no post submitted · ? = no data yet
      </p>
    </div>
  )
}
