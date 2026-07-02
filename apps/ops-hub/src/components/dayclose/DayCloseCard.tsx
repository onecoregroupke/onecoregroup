'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, Lock, Moon, RefreshCw } from 'lucide-react'
import { api } from '@/lib/apiClient'

interface Status {
  date: string
  alreadyClosed: { closed_by: string; report_sent: boolean } | null
  tasksCompletedToday: number
  overdueTasks: number
  financeTransactionsToday: number
  financeInToday: number
  financeOutToday: number
  inventoryMovementsToday: number
  meetingsHeldToday: number
  openExceptions: number
  openBlockers: number
}

/**
 * The admin's end-of-day prompt on the dashboard: review today's numbers,
 * confirm everything is captured, close the day, and the master report goes
 * out to leadership. Shown only to management-edit users (the server page
 * decides that).
 */
export function DayCloseCard() {
  const [status, setStatus] = useState<Status | null>(null)
  const [loading, setLoading] = useState(true)
  const [closing, setClosing] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState<{ sent: boolean } | null>(null)

  useEffect(() => {
    void (async () => {
      const { ok, data } = await api<{ status?: Status }>('/api/day-close')
      if (ok && data.status) setStatus(data.status)
      setLoading(false)
    })()
  }, [])

  async function close() {
    setClosing(true); setError('')
    const { ok, data } = await api<{ error?: string; sent?: boolean }>('/api/day-close', {
      method: 'POST',
      body: JSON.stringify({ notes }),
    })
    setClosing(false)
    if (!ok) { setError(data?.error ?? 'Failed to close the day.'); return }
    setDone({ sent: Boolean(data.sent) })
  }

  if (loading || !status) return null

  if (status.alreadyClosed || done) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
        <CheckCircle2 size={20} className="shrink-0 text-emerald-600" />
        <p className="text-sm text-emerald-800">
          {done
            ? `Day closed. ${done.sent ? 'Master report sent to leadership.' : 'Master report logged (email not configured).'}`
            : `Today is closed${status.alreadyClosed?.closed_by ? ` by ${status.alreadyClosed.closed_by}` : ''}. The master report has been ${status.alreadyClosed?.report_sent ? 'sent' : 'logged'}.`}
        </p>
      </div>
    )
  }

  const checks = [
    { label: 'Tasks completed today', value: String(status.tasksCompletedToday), warn: false },
    { label: 'Money recorded', value: `${status.financeTransactionsToday} entries · KSh ${status.financeInToday.toLocaleString()} in / ${status.financeOutToday.toLocaleString()} out`, warn: false },
    { label: 'Inventory movements', value: String(status.inventoryMovementsToday), warn: false },
    { label: 'Meetings held', value: String(status.meetingsHeldToday), warn: false },
    { label: 'Overdue tasks', value: String(status.overdueTasks), warn: status.overdueTasks > 0 },
    { label: 'Open finance exceptions', value: String(status.openExceptions), warn: status.openExceptions > 0 },
    { label: 'Open blockers', value: String(status.openBlockers), warn: status.openBlockers > 0 },
  ]

  return (
    <div className="rounded-xl border border-ocg-navy/15 bg-gradient-to-br from-slate-50 to-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900">
            <Moon size={15} className="text-ocg-navy" /> Close the day — {status.date}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Confirm today&apos;s updates are complete and accurate. Closing sends the master report on all areas of the business to leadership.
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {checks.map((c) => (
          <div key={c.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-gray-500">{c.label}</span>
            <span className={`font-medium ${c.warn ? 'text-amber-600' : 'text-gray-800'}`}>{c.value}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        <input className="input" placeholder="Closing note (optional) — anything leadership should know" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <label className="flex items-start gap-2 text-sm text-gray-600">
          <input type="checkbox" className="mt-0.5" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          I have reviewed today&apos;s tasks, money records, and stock movements — the information is accurate and complete.
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end">
          <button onClick={close} disabled={!confirmed || closing}
            className="inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
            {closing ? <RefreshCw size={14} className="animate-spin" /> : <Lock size={14} />}
            {closing ? 'Closing & sending report…' : 'Close the day & send master report'}
          </button>
        </div>
      </div>
    </div>
  )
}
