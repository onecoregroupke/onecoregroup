'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/apiClient'
import { TASK_STATUSES } from '@/lib/taskStatuses'
import { SPECIALIST_OPTIONS } from '@/lib/specialistOptions'

export function TaskControls({
  taskId,
  status,
  agentEligible,
}: {
  taskId: string
  status: string
  agentEligible: boolean
}) {
  const router = useRouter()
  const [newStatus, setNewStatus] = useState(status)
  const [note, setNote] = useState('')
  const [specialist, setSpecialist] = useState(SPECIALIST_OPTIONS[0]?.value ?? 'analysis')
  const [busy, setBusy] = useState<'status' | 'run' | null>(null)
  const [msg, setMsg] = useState('')

  async function saveStatus() {
    setBusy('status')
    setMsg('')
    const { ok, data } = await api<{ error?: string }>(`/api/tasks/${taskId}/status`, {
      method: 'POST',
      body: JSON.stringify({ status: newStatus, note }),
    })
    setBusy(null)
    setMsg(ok ? 'Status updated.' : data?.error ?? 'Failed.')
    if (ok) router.refresh()
  }

  async function runSpecialist() {
    setBusy('run')
    setMsg('')
    const { ok, data } = await api<{ error?: string; job?: { status: string } }>('/api/agent/run', {
      method: 'POST',
      body: JSON.stringify({ taskId, specialist }),
    })
    setBusy(null)
    setMsg(ok ? `Specialist dispatched (${data?.job?.status ?? 'queued'}).` : data?.error ?? 'Failed.')
    if (ok) router.refresh()
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500">Update status</label>
        <select
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          value={newStatus}
          onChange={(e) => setNewStatus(e.target.value)}
        >
          {TASK_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <textarea
          className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          placeholder="Work note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button
          onClick={saveStatus}
          disabled={busy !== null}
          className="mt-2 w-full rounded-lg bg-ocg-navy py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {busy === 'status' ? 'Saving…' : 'Save status'}
        </button>
      </div>

      {agentEligible && (
        <div className="border-t border-gray-100 pt-4">
          <label className="mb-1 block text-xs font-medium text-gray-500">Queue for the agent</label>
          <select
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            value={specialist}
            onChange={(e) => setSpecialist(e.target.value)}
          >
            {SPECIALIST_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <button
            onClick={runSpecialist}
            disabled={busy !== null}
            className="mt-2 w-full rounded-lg border border-ocg-gold py-2 text-sm font-medium text-ocg-gold hover:bg-ocg-gold/10 disabled:opacity-60"
          >
            {busy === 'run' ? 'Queuing…' : 'Queue for agent'}
          </button>
          <p className="mt-2 text-[11px] text-gray-400">
            Queues this task for an orchestrating agent (Codex / Hermes / Claude Code) to draft via the oc-* skills.
          </p>
        </div>
      )}

      {msg && <p className="text-xs text-gray-500">{msg}</p>}
    </div>
  )
}
