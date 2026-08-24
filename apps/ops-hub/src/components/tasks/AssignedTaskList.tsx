'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import { api } from '@/lib/apiClient'
import { statusTone, priorityTone, TASK_STATUSES } from '@/lib/taskStatuses'

export interface AssignedTask {
  taskId: string
  name: string
  projectName: string
  targetDate: string
  priority: string
  status: string
  overdue: boolean
  /** True when a manager must sign this off — the assignee cannot self-close it. */
  requiresApproval: boolean
}

/**
 * The employee's Assigned Tasks (§9) — specific work given to them by
 * management, as distinct from a recurring Duty.
 *
 * Status changes go through the canonical /api/tasks/[id]/status endpoint, which
 * is also where the reviewer rules live: on an approval-gated task the server
 * refuses a self-certified 'Completed', so this list offers the full status set
 * and lets the authority answer rather than guessing at it client-side.
 */
export function AssignedTaskList({ tasks, emptyMessage }: { tasks: AssignedTask[]; emptyMessage: string }) {
  if (tasks.length === 0) {
    return <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">{emptyMessage}</p>
  }
  return (
    <div className="space-y-2">
      {tasks.map((t) => <TaskRow key={t.taskId} task={t} />)}
    </div>
  )
}

function TaskRow({ task }: { task: AssignedTask }) {
  const router = useRouter()
  const [status, setStatus] = useState(task.status)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function update() {
    setSaving(true)
    setError('')
    const { ok, data } = await api<{ error?: string }>(`/api/tasks/${task.taskId}/status`, {
      method: 'POST',
      body: JSON.stringify({ status, note: 'Updated from My Work.' }),
    })
    setSaving(false)
    if (!ok) {
      setError(data?.error ?? 'Could not update this task.')
      setStatus(task.status)
      return
    }
    router.refresh()
  }

  return (
    <div className={`rounded-lg border p-3 transition-colors hover:border-ocg-gold/40 ${
      task.overdue ? 'border-red-100 bg-red-50/30' : 'border-gray-100'
    }`}>
      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <Link href={`/tasks/${task.taskId}`} className="truncate text-sm font-medium text-gray-800 hover:text-ocg-gold">
              {task.name}
            </Link>
            {/* The type tag: an Assigned Task is never mistaken for a Duty (§6A). */}
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
              Task
            </span>
            {task.overdue && (
              <span className="inline-flex items-center gap-1 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-600">
                <AlertTriangle size={10} /> Overdue
              </span>
            )}
          </p>
          <p className="truncate text-xs text-gray-400">
            {task.taskId} · {task.projectName}
            {task.targetDate ? ` · due ${task.targetDate}` : ''}
            {task.requiresApproval ? ' · manager sign-off required' : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${priorityTone(task.priority)}`}>{task.priority}</span>
          <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${statusTone(task.status)}`}>{task.status}</span>
          <select
            className="input h-8 py-1 md:w-40"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label={`Status for ${task.taskId}`}
          >
            {TASK_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button
            onClick={update}
            disabled={saving || status === task.status}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-ocg-gold hover:text-ocg-gold disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Update'}
          </button>
        </div>
      </div>
      {error && <p className="mt-2 rounded bg-red-50 px-2 py-1.5 text-xs text-red-600">{error}</p>}
    </div>
  )
}
