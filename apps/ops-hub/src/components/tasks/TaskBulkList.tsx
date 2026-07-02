'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckSquare, Search } from 'lucide-react'
import { api } from '@/lib/apiClient'
import { priorityTone, statusTone, TASK_STATUSES } from '@/lib/taskStatuses'
import type { Brand, OpsTaskRow } from '@ocg/db'

type TeamOption = { id: string; name: string }

export function TaskBulkList({
  tasks,
  brands,
  team,
  canEdit = true,
}: {
  tasks: OpsTaskRow[]
  brands: Brand[]
  team: TeamOption[]
  /** When false, the bulk assign/status toolbar + row selection are hidden
   *  (the server also rejects the bulk API for non-editors). */
  canEdit?: boolean
}) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [assignee, setAssignee] = useState('')
  const [status, setStatus] = useState('')
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState('')
  const brandById = useMemo(() => new Map(brands.map((b) => [b.id, b])), [brands])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return tasks
    return tasks.filter((task) =>
      [
        task.task_id,
        task.task_name,
        task.project_name,
        task.assigned_to,
        task.current_status,
        task.priority,
        task.task_description,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)),
    )
  }, [query, tasks])

  const allShownSelected = filtered.length > 0 && filtered.every((task) => selected.includes(task.task_id))

  function toggle(taskId: string) {
    setSelected((current) =>
      current.includes(taskId) ? current.filter((id) => id !== taskId) : [...current, taskId],
    )
  }

  function toggleAll() {
    if (allShownSelected) {
      setSelected((current) => current.filter((id) => !filtered.some((task) => task.task_id === id)))
      return
    }
    setSelected((current) => Array.from(new Set([...current, ...filtered.map((task) => task.task_id)])))
  }

  async function applyBulk() {
    setNote('')
    if (selected.length === 0) {
      setNote('Select at least one task.')
      return
    }
    if (!assignee && !status) {
      setNote('Choose an assignee or status to apply.')
      return
    }
    setSaving(true)
    const { ok, data } = await api<{ error?: string; updated?: number; emailNotes?: string[] }>('/api/tasks/bulk', {
      method: 'POST',
      body: JSON.stringify({
        taskIds: selected,
        assigned_to: assignee || undefined,
        status: status || undefined,
      }),
    })
    setSaving(false)
    if (!ok) {
      setNote(data?.error ?? 'Bulk update failed.')
      return
    }
    setSelected([])
    setAssignee('')
    setStatus('')
    setNote(`Updated ${data.updated ?? selected.length} task${(data.updated ?? selected.length) === 1 ? '' : 's'}.${data.emailNotes?.length ? ` ${data.emailNotes.join(' ')}` : ''}`)
    router.refresh()
  }

  return (
    <section className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
      {canEdit && (
      <div className="border-b border-gray-100 p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto_auto] lg:items-end">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Filter shown tasks</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                className="input pl-9"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search task, project, assignee, status..."
              />
            </div>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Bulk assignee</span>
            <select className="input lg:w-52" value={assignee} onChange={(event) => setAssignee(event.target.value)}>
              <option value="">Keep assignee</option>
              {team.map((member) => <option key={member.id} value={member.name}>{member.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Bulk status</span>
            <select className="input lg:w-48" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">Keep status</option>
              {TASK_STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <button
            onClick={applyBulk}
            disabled={saving || selected.length === 0}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            <CheckSquare size={16} /> {saving ? 'Updating...' : `Apply (${selected.length})`}
          </button>
        </div>
        {note && <p className="mt-3 text-sm text-gray-500">{note}</p>}
      </div>
      )}

      {filtered.length === 0 ? (
        <p className="p-6 text-sm text-gray-500">No tasks match these filters.</p>
      ) : (
        <>
          <div className="hidden border-b border-gray-100 px-4 py-3 text-xs text-gray-500 md:flex md:items-center md:gap-3">
            {canEdit && <input type="checkbox" checked={allShownSelected} onChange={toggleAll} aria-label="Select all shown tasks" />}
            <span>{filtered.length} task{filtered.length === 1 ? '' : 's'} shown</span>
          </div>
          <div className="divide-y divide-gray-50">
            {filtered.map((task) => {
              const brand = task.brand_id ? brandById.get(task.brand_id) : undefined
              const checked = selected.includes(task.task_id)
              return (
                <article key={task.task_id} className={`grid gap-3 p-4 transition-colors md:items-center ${canEdit ? 'md:grid-cols-[auto_1.5fr_0.8fr_0.7fr_0.7fr_0.8fr]' : 'md:grid-cols-[1.5fr_0.8fr_0.7fr_0.7fr_0.8fr]'} ${checked ? 'bg-amber-50/50' : 'hover:bg-gray-50'}`}>
                  {canEdit && (
                  <label className="flex items-center gap-3">
                    <input type="checkbox" checked={checked} onChange={() => toggle(task.task_id)} aria-label={`Select ${task.task_name}`} />
                    <span className="text-xs font-medium text-gray-400 md:hidden">Select</span>
                  </label>
                  )}
                  <div className="min-w-0">
                    <Link href={`/tasks/${task.task_id}`} className="font-medium text-gray-900 hover:text-ocg-gold">
                      {task.task_name}
                    </Link>
                    <p className="mt-0.5 truncate text-xs text-gray-400">{task.task_id} · {task.project_name}</p>
                  </div>
                  <p className="text-sm text-gray-600">
                    {brand ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: brand.color_hex }} />
                        {brand.short_name || brand.name}
                      </span>
                    ) : 'No brand'}
                  </p>
                  <p className="text-sm text-gray-600">{task.assigned_to || 'Unassigned'}</p>
                  <p className="text-sm text-gray-500">{task.target_date || 'No due date'}</p>
                  <div className="flex flex-wrap gap-2">
                    <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${priorityTone(task.priority)}`}>{task.priority}</span>
                    <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${statusTone(task.current_status)}`}>{task.current_status}</span>
                  </div>
                </article>
              )
            })}
          </div>
        </>
      )}
    </section>
  )
}
