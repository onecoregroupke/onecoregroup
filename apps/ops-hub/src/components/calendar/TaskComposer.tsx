'use client'

import { useMemo, useState } from 'react'
import { X, ListTodo } from 'lucide-react'
import { api } from '@/lib/apiClient'
import { TASK_PRIORITIES, TASK_CATEGORIES } from '@/lib/taskStatuses'
import {
  buildTaskPayload, validateTaskForm, initialTaskForm,
  type AssignableProject, type AssignablePerson,
} from '@/lib/calendarTasks'

export type ComposerProject = AssignableProject
export type ComposerPerson = AssignablePerson

/**
 * Assign a real Ops Task from a calendar day (§§24–26).
 *
 * The critical property is what this component does NOT do: it does not insert
 * into Supabase, does not create a calendar row that pretends to be a task, and
 * does not send its own assignment email. It POSTs to /api/tasks — the same
 * endpoint the Task Board uses — so the one task-creation engine keeps owning
 * every downstream effect: the task record, the assignment email, the in-app
 * notification, the chat message, the audit entry and the review infrastructure.
 *
 * Calendar is an input station, not a second task system.
 */
export function TaskComposer({
  date,
  projects,
  people,
  onClose,
  onCreated,
}: {
  date: string
  projects: ComposerProject[]
  people: ComposerPerson[]
  onClose: () => void
  onCreated: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [form, setForm] = useState(() => initialTaskForm(date, projects[0]?.id ?? ''))

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((c) => ({ ...c, [k]: v }))
  }

  // The brand is inherited from the project, exactly as createTask() does
  // server-side — showing a separate brand picker would invite a mismatch.
  const project = useMemo(
    () => projects.find((p) => p.id === form.project_id) ?? null,
    [projects, form.project_id],
  )

  /** Plain-language echo of what the two dates actually mean together. */
  const summary = useMemo(() => {
    if (!form.schedule_date) {
      return form.target_date ? `Due ${form.target_date}, no scheduled time.` : ''
    }
    const when = form.all_day
      ? `${form.schedule_date}, all day`
      : `${form.schedule_date}, ${form.start_time}–${form.end_time}`
    if (form.target_date && form.target_date !== form.schedule_date) {
      return `Scheduled ${when} · due ${form.target_date}.`
    }
    return `Scheduled ${when}.`
  }, [form.schedule_date, form.all_day, form.start_time, form.end_time, form.target_date])

  async function submit() {
    setError('')
    setNotice('')
    const problem = validateTaskForm(form)
    if (problem) { setError(problem); return }

    setSaving(true)
    // The canonical task endpoint — the same one the Task Board posts to (§25).
    const { ok, data } = await api<{ error?: string; emailNote?: string }>('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(buildTaskPayload(form)),
    })
    setSaving(false)
    if (!ok) { setError(data?.error ?? 'Could not create the task.'); return }
    // A missing assignee email is worth saying out loud — the task exists, but
    // nobody was told about it.
    if (data?.emailNote) { setNotice(data.emailNote); return }
    onCreated()
  }

  if (projects.length === 0) {
    return (
      <Shell date={date} onClose={onClose}>
        <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">
          You have no projects available to assign work under. Create one under Projects first.
        </p>
      </Shell>
    )
  }

  return (
    <Shell date={date} onClose={onClose}>
      <Field label="Task">
        <input
          className="input"
          value={form.task_name}
          onChange={(e) => set('task_name', e.target.value)}
          placeholder="e.g. Prepare supplier comparison"
          autoFocus
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Project">
          <select className="input" value={form.project_id} onChange={(e) => set('project_id', e.target.value)}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </Field>
        <Field label="Assign to">
          <select className="input" value={form.assigned_to} onChange={(e) => set('assigned_to', e.target.value)}>
            <option value="">Unassigned</option>
            {people.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
          </select>
        </Field>
      </div>

      {project && (
        <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
          Brand: <span className="font-medium text-gray-700">{project.brandLabel || 'Group (no brand)'}</span>{' '}
          — inherited from the project.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Priority">
          <select className="input" value={form.priority} onChange={(e) => set('priority', e.target.value)}>
            {TASK_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Category">
          <select className="input" value={form.category} onChange={(e) => set('category', e.target.value)}>
            {TASK_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
      </div>

      {/* ── Schedule: WHEN the work happens (§42) ─────────────────── */}
      <fieldset className="rounded-lg border border-gray-100 p-3">
        <legend className="px-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
          When should this be done?
        </legend>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Schedule date">
            <input type="date" className="input" value={form.schedule_date}
              onChange={(e) => set('schedule_date', e.target.value)} />
          </Field>
          <label className="flex items-end gap-2 pb-2 text-sm text-gray-600">
            <input type="checkbox" checked={form.all_day}
              onChange={(e) => set('all_day', e.target.checked)}
              className="h-4 w-4 accent-[#1a1a2e]" />
            All day
          </label>
        </div>

        {form.schedule_date && !form.all_day && (
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <Field label="Starts">
              <input type="time" className="input" value={form.start_time}
                onChange={(e) => set('start_time', e.target.value)} />
            </Field>
            <Field label="Ends">
              <input type="time" className="input" value={form.end_time}
                onChange={(e) => set('end_time', e.target.value)} />
            </Field>
          </div>
        )}

        <div className="mt-2">
          <Field label="Location">
            <input className="input" value={form.location}
              onChange={(e) => set('location', e.target.value)}
              placeholder="Optional — where the work happens" />
          </Field>
        </div>

        {!form.schedule_date && (
          <p className="mt-2 text-xs text-gray-400">
            No scheduled time — the person decides when to fit it in before the deadline.
          </p>
        )}
      </fieldset>

      {/* ── Deadline: a SEPARATE concept from the schedule (§41) ───── */}
      <Field label="Deadline (due date)">
        <input type="date" className="input" value={form.target_date}
          onChange={(e) => set('target_date', e.target.value)} />
      </Field>
      <p className="-mt-1 text-xs text-gray-400">
        The deadline is when the work must be finished, which can be later than the day it is
        scheduled. Scheduled Wednesday, due Friday is a normal combination.
      </p>

      <Field label="Instructions">
        <textarea
          className="input min-h-[80px]"
          value={form.task_description}
          onChange={(e) => set('task_description', e.target.value)}
          placeholder="What needs doing, and anything the person needs to know."
        />
      </Field>

      <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
        This creates a normal Ops Task. It will appear on the Task Board, in the
        assignee&rsquo;s My Work, and on this calendar — one task, not three.
        {summary && <><br /><strong>{summary}</strong></>}
      </p>

      {error && <p className="rounded-lg bg-red-50 p-2.5 text-sm text-red-600">{error}</p>}
      {notice && (
        <div className="rounded-lg bg-amber-50 p-2.5 text-sm text-amber-800">
          <p>{notice}</p>
          <button onClick={onCreated} className="mt-1.5 font-medium underline">Close anyway</button>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-gray-500 hover:text-gray-700">
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-ocg-navy px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          <ListTodo size={15} /> {saving ? 'Assigning…' : 'Assign task'}
        </button>
      </div>
    </Shell>
  )
}

/** Modal chrome: flex-1 min-h-0 body so the dialog stays usable at 100% zoom. */
function Shell({ date, onClose, children }: { date: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-ocg-gold">Assign a task</p>
            <p className="mt-0.5 text-sm text-gray-500">{date}</p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:text-gray-600" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>
      {children}
    </label>
  )
}
