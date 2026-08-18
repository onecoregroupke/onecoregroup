'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldCheck, RotateCcw, Check } from 'lucide-react'
import { api } from '@/lib/apiClient'

export interface ReviewRow {
  logId: string
  dutyTitle: string
  date: string
  assigneeName: string
  completedBy: string
  note: string
  checklistDone: number
  checklistTotal: number
  onTime: boolean | null
}

/**
 * Manager review of submitted duty occurrences (§13).
 *
 * The server refuses a reviewer who is also the person who did the work; this
 * component simply surfaces that refusal rather than trying to pre-empt it,
 * because "who am I" is an authorization question and belongs on the server.
 */
export function DutyReviewQueue({ rows }: { rows: ReviewRow[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [comments, setComments] = useState<Record<string, string>>({})

  async function decide(logId: string, decision: 'accept' | 'reopen') {
    setBusy(logId)
    setError('')
    const { ok, data } = await api<{ error?: string }>('/api/duties/review', {
      method: 'POST',
      body: JSON.stringify({ log_id: logId, decision, comment: comments[logId] ?? '' }),
    })
    setBusy(null)
    if (!ok) { setError(data?.error ?? 'Could not save the decision.'); return }
    router.refresh()
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">
        Nothing awaiting review.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {error && <p className="rounded-lg bg-red-50 p-2.5 text-sm text-red-600">{error}</p>}
      {rows.map((r) => (
        <div key={r.logId} className="rounded-lg border border-amber-100 bg-amber-50/40 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900">{r.dutyTitle}</p>
              <p className="mt-0.5 text-xs text-gray-500">
                {r.assigneeName || r.completedBy || 'Unassigned'} · {r.date}
                {r.checklistTotal > 0 && ` · checklist ${r.checklistDone}/${r.checklistTotal}`}
                {r.onTime === false && ' · late'}
              </p>
              {r.note && <p className="mt-1.5 rounded bg-white/80 px-2 py-1 text-xs text-gray-600">{r.note}</p>}
            </div>
            <span className="inline-flex shrink-0 items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
              <ShieldCheck size={10} /> Pending
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              className="input flex-1 min-w-[180px]"
              placeholder="Comment (optional)"
              value={comments[r.logId] ?? ''}
              onChange={(e) => setComments((c) => ({ ...c, [r.logId]: e.target.value }))}
            />
            <button
              onClick={() => decide(r.logId, 'accept')}
              disabled={busy === r.logId}
              className="inline-flex items-center gap-1.5 rounded-lg bg-ocg-navy px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
              <Check size={14} /> Accept
            </button>
            <button
              onClick={() => decide(r.logId, 'reopen')}
              disabled={busy === r.logId}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:border-red-300 hover:text-red-600 disabled:opacity-60"
            >
              <RotateCcw size={14} /> Reopen
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
