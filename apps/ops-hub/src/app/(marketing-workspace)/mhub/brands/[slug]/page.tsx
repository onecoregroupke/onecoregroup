'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { getClient } from '@/lib/supabase'
import type { Brand, DailyMetric } from '@ocg/db'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import Link from 'next/link'
import { ArrowLeft, Clock } from 'lucide-react'

export default function BrandPage() {
  const params = useParams()
  const slug = params['slug'] as string
  const [brand, setBrand] = useState<Brand | null>(null)
  const [metrics, setMetrics] = useState<DailyMetric[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = getClient()
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const fromDate = sevenDaysAgo.toISOString().split('T')[0]!

    supabase.from('brands').select('*').eq('slug', slug).single().then(async (brandRes) => {
      const b = brandRes.data as Brand | null
      setBrand(b)
      if (b) {
        const { data: m } = await supabase
          .from('daily_metrics')
          .select('*')
          .eq('brand_id', b.id)
          .gte('metric_date', fromDate)
          .order('metric_date', { ascending: false })
        setMetrics((m as DailyMetric[]) ?? [])
      }
      setLoading(false)
    })
  }, [slug])

  if (loading) return <LoadingSpinner className="py-20" />

  if (!brand) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-400">Brand not found</p>
        <Link href="/mhub" className="text-ocg-navy text-sm mt-2 inline-block hover:underline">← Dashboard</Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Link href="/mhub" className="inline-flex items-center gap-2 text-gray-500 text-sm hover:text-ocg-navy transition-colors">
        <ArrowLeft size={16} /> Dashboard
      </Link>

      {/* Brand header */}
      <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold" style={{ backgroundColor: brand.color_hex }}>
            {brand.short_name.charAt(0)}
          </div>
          <div>
            <h1 className="font-bold text-xl text-gray-900">{brand.name}</h1>
            <p className="text-gray-400 text-sm">Last 7 days of metrics</p>
          </div>
        </div>
      </div>

      {/* Phase 2 notice */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 flex items-start gap-3">
        <Clock size={18} className="text-blue-500 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-blue-800 font-medium text-sm">Full brand analytics coming in Phase 2</p>
          <p className="text-blue-600 text-sm mt-0.5">
            Charts, trend analysis, and AI-powered insights will be available once Instagram/YouTube API credentials are configured.
          </p>
        </div>
      </div>

      {/* Raw metrics table */}
      {metrics.length > 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="border-b border-gray-100">
                {['Date', 'Posts', 'Stories', 'Reach', 'Engagement', 'Likes', 'DMs', 'Source'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => (
                <tr key={m.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{m.metric_date}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{m.feed_posts_count}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{m.stories_count}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{m.reach.toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{m.engagement.toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{m.likes.toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{m.dm_inquiries}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full capitalize">
                      {m.source}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
          <p className="text-gray-400 text-sm">No metrics found for the last 7 days.</p>
          <Link href="/mhub/input" className="text-ocg-navy font-medium text-sm mt-2 inline-block hover:underline">
            Submit metrics via Input Portal →
          </Link>
        </div>
      )}
    </div>
  )
}
