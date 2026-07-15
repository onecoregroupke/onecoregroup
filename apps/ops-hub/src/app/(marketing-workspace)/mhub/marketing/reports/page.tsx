'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { usePermissions } from '@/contexts/PermissionsContext'
import { apiFetch } from '@/lib/marketing/client'
import {
  REPORT_STATUS_LABELS,
  type ExecutiveReport,
  type ReportStatus,
} from '@/lib/marketing/types'

const STATUS_BADGE: Record<ReportStatus, string> = {
  drafting: 'bg-slate-100 text-slate-700',
  approved: 'bg-blue-50 text-blue-700',
  sending: 'bg-amber-50 text-amber-700',
  sent: 'bg-green-50 text-green-700',
  cancelled: 'bg-gray-100 text-gray-400',
}

function isoDaysAgo(days: number): string {
  const d = new Date(Date.now() + 3 * 60 * 60 * 1000 - days * 86400000)
  return d.toISOString().slice(0, 10)
}

export default function ReportsPage() {
  const router = useRouter()
  const { can, isAdmin } = usePermissions()
  const canEdit = isAdmin || can('marketing', 'edit')
  const [reports, setReports] = useState<ExecutiveReport[]>([])
  const [periodStart, setPeriodStart] = useState(isoDaysAgo(14))
  const [periodEnd, setPeriodEnd] = useState(isoDaysAgo(0))
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const { reports: r } = await apiFetch<{ reports: ExecutiveReport[] }>('/api/mhub/marketing/reports')
      setReports(r ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reports.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function generate() {
    setGenerating(true)
    setError('')
    try {
      const { report } = await apiFetch<{ report: ExecutiveReport }>('/api/mhub/marketing/reports', {
        method: 'POST',
        body: JSON.stringify({ periodStart, periodEnd }),
      })
      router.push(`/mhub/marketing/reports/${report.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate report.')
      setGenerating(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-bold text-2xl text-gray-900">Reports</h1>
        <p className="text-gray-500 text-sm mt-1">
          Executive summaries of marketing activity, with an AI-written narrative (Groq).
        </p>
      </div>

      {canEdit && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <label className="block">
            <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">From</span>
            <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className={inputCls} />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">To</span>
            <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className={inputCls} />
          </label>
          <button
            onClick={generate}
            disabled={generating}
            className="inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            <Sparkles size={16} /> {generating ? 'Generating…' : 'Generate report'}
          </button>
        </div>
      )}

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-5 py-3 font-semibold">Period</th>
              <th className="px-5 py-3 font-semibold">Subject</th>
              <th className="px-5 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={3} className="px-5 py-6 text-gray-400">Loading…</td></tr>
            ) : reports.length === 0 ? (
              <tr><td colSpan={3} className="px-5 py-6 text-gray-400">No reports yet. Generate one above.</td></tr>
            ) : (
              reports.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 text-gray-600 text-xs">{r.periodStart} → {r.periodEnd}</td>
                  <td className="px-5 py-3">
                    <Link href={`/mhub/marketing/reports/${r.id}`} className="font-medium text-gray-900 hover:text-ocg-navy">
                      {r.subject}
                    </Link>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[r.status]}`}>
                      {REPORT_STATUS_LABELS[r.status]}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const inputCls =
  'rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-ocg-navy'
