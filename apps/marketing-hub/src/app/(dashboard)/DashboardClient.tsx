'use client'

import Link from 'next/link'
import type { Brand, DailyMetric, ComplianceLog } from '@ocg/db'
import { TrendingUp, TrendingDown, Users, Eye, MessageCircle, BarChart2, PenSquare } from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'

interface DashboardClientProps {
  brands: Brand[]
  metrics: DailyMetric[]
  compliance: ComplianceLog[]
}

function compliancePill(pct: number) {
  if (pct >= 80) return 'bg-green-100 text-green-700'
  if (pct >= 67) return 'bg-yellow-100 text-yellow-700'
  return 'bg-red-100 text-red-700'
}

export function DashboardClient({ brands, metrics, compliance }: DashboardClientProps) {
  const hasData = metrics.length > 0

  const totalReach = metrics.reduce((a, m) => a + m.reach, 0)
  const totalEngagement = metrics.reduce((a, m) => a + m.engagement, 0)
  const totalDMs = metrics.reduce((a, m) => a + m.dm_inquiries, 0)
  const avgCompliance =
    compliance.length > 0
      ? Math.round(compliance.reduce((a, c) => a + Number(c.compliance_pct), 0) / compliance.length)
      : 0

  // Per-brand reach for bar chart
  const chartData = brands.map((brand) => {
    const brandMetrics = metrics.filter((m) => m.brand_id === brand.id)
    return {
      name: brand.short_name,
      reach: brandMetrics.reduce((a, m) => a + m.reach, 0),
      color: brand.color_hex,
    }
  })

  const statCards = [
    { label: 'Combined Reach (Week)', value: totalReach.toLocaleString(), icon: Eye, color: 'text-blue-600 bg-blue-50' },
    { label: 'Total Engagement', value: totalEngagement.toLocaleString(), icon: TrendingUp, color: 'text-green-600 bg-green-50' },
    { label: 'DM Inquiries', value: totalDMs.toLocaleString(), icon: MessageCircle, color: 'text-purple-600 bg-purple-50' },
    { label: 'Avg Compliance %', value: `${avgCompliance}%`, icon: BarChart2, color: 'text-ocg-gold bg-amber-50' },
  ]

  return (
    <div className="space-y-6 pb-10">
      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((s) => {
          const Icon = s.icon
          return (
            <div key={s.label} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-start justify-between mb-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${s.color}`}>
                  <Icon size={18} />
                </div>
              </div>
              <p className="text-2xl font-bold text-gray-900">{hasData ? s.value : '—'}</p>
              <p className="text-gray-500 text-xs mt-1">{s.label}</p>
            </div>
          )
        })}
      </div>

      {/* No data notice */}
      {!hasData && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex items-start gap-3">
          <PenSquare size={18} className="text-amber-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-amber-800 font-medium text-sm">No data for this week yet</p>
            <p className="text-amber-600 text-sm mt-0.5">
              Use the{' '}
              <Link href="/input" className="underline font-medium">
                Input Portal
              </Link>{' '}
              to submit today&apos;s metrics.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Brand scorecards */}
        <div className="lg:col-span-2">
          <h2 className="font-semibold text-gray-900 mb-4 text-sm uppercase tracking-wide">
            Brand Scorecards — This Week
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {brands.map((brand) => {
              const brandMetrics = metrics.filter((m) => m.brand_id === brand.id)
              const comp = compliance.find((c) => c.brand_id === brand.id)
              const compPct = comp ? Number(comp.compliance_pct) : 0
              const reach = brandMetrics.reduce((a, m) => a + m.reach, 0)
              const engagement = brandMetrics.reduce((a, m) => a + m.engagement, 0)
              const dms = brandMetrics.reduce((a, m) => a + m.dm_inquiries, 0)
              const followerChange = brandMetrics.reduce((a, m) => a + m.follower_change, 0)

              return (
                <Link
                  key={brand.id}
                  href={`/brands/${brand.slug}`}
                  className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: brand.color_hex }}
                      />
                      <span className="font-semibold text-gray-900 text-sm">{brand.short_name}</span>
                    </div>
                    {brandMetrics.length > 0 && (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${compliancePill(compPct)}`}>
                        {compPct}%
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 truncate mb-3">{brand.name}</p>

                  {brandMetrics.length > 0 ? (
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="font-semibold text-gray-900 text-sm">{reach.toLocaleString()}</p>
                        <p className="text-gray-400 text-xs">Reach</p>
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900 text-sm">{engagement.toLocaleString()}</p>
                        <p className="text-gray-400 text-xs">Engage</p>
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900 text-sm">{dms}</p>
                        <p className="text-gray-400 text-xs">DMs</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-gray-300 text-xs text-center py-2">No data this week</p>
                  )}

                  {followerChange !== 0 && (
                    <div className={`flex items-center gap-1 mt-2 text-xs ${followerChange > 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {followerChange > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                      {followerChange > 0 ? '+' : ''}{followerChange} followers this week
                    </div>
                  )}
                </Link>
              )
            })}
          </div>
        </div>

        {/* Weekly reach chart */}
        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-4 text-sm uppercase tracking-wide">
            Reach by Brand
          </h2>
          {hasData ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v: number) => [v.toLocaleString(), 'Reach']}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Bar dataKey="reach" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-300 text-sm">
              No data yet
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
