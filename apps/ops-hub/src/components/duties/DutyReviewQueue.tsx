'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldCheck, RotateCcw, Check, Paperclip, ClipboardList, UserCheck } from 'lucide-react'
import { api } from '@/lib/apiClient'
import { validateReopenComment } from '@/lib/reviewAuthority'

export interface ReviewRow {
  logId: string
  dutyTitle: string
  date: string
  assigneeName: string
  completedBy: string
  completedAt: string | null
  note: string
  checklistDone: number
  checklistTotal: number
  evidenceCount: number
  onTime: boolean | null
  /** Non-empty when this occurrence is reserved for a named countersignatory. */
  namedReviewer: string
}

const time = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' })
    : ''

/**
 * Countersigning submitted duty occurrences (§§13–16).
 *
 * Every row here has already passed the same canReview() predicate the POST
 * enforces, so nothing is offered that will be refused. The reopen reason is
 * validated locally to save a round-trip; the server validates it again, which
 * is the check that counts.
 */
export function DutyReviewQueue({ rows }: { rows: ReviewRow[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [comments, setComments] = useState<Record<string, string>>({})

  async function decide(logId: string, decision: 'accept' | 'reopen') {
    const comment = comments[logId] ?? ''
    if (decision === 'reopen') {
      const problem = validateReopenComment(comment)
      if (problem) { setError(problem); return }
    }
    setBusy(logId)
    setError('')
    const { ok, data } = await api<{ error?: string }>('/api/duties/review', {
      method: 'POST',
      body: JSON.stringify({ log_id: logId, decision, comment }),
    })
    setBusy(null)
    if (!ok) { setError(data?.error ?? 'Could not save the decision.'); return }
    router.refresh()
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">
        Nothing awaiting your review.
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
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-gray-500">
                <span className="font-medium text-gray-600">{r.assigneeName || r.completedBy || 'Unassigned'}</span>
                <span>· {r.date}</span>
                {r.completedAt && <span>· submitted {time(r.completedAt)}</span>}
                {r.onTime === false && <span className="text-amber-700">· late</span>}
                {r.onTime === true && <span className="text-emerald-700">· on time</span>}
                {r.checklistTotal > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <ClipboardList size={11} /> {r.checklistDone}/{r.checklistTotal}
                  </span>
                )}
                {r.evidenceCount > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <Paperclip size={11} /> {r.evidenceCount}
                  </span>
                )}
              </p>
              {r.note && <p className="mt-1.5 rounded bg-white/80 px-2 py-1 text-xs text-gray-600">{r.note}</p>}
            </div>
            <span className="flex shrink-0 flex-col items-end gap-1">
              <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                <ShieldCheck size={10} /> Pending
              </span>
              {r.namedReviewer && (
                <span
                  className="inline-flex items-center gap-1 rounded bg-white px-2 py-0.5 text-[10px] font-medium text-gray-500"
                  title="Reserved for its named reviewer — no other manager can sign this off."
                >
                  <UserCheck size={10} /> Reserved for {r.namedReviewer}
                </span>
              )}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              className="input min-w-[180px] flex-1"
              placeholder="Comment (required to reopen)"
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
