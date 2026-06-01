'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X } from 'lucide-react'
import { api } from '@/lib/apiClient'
import { TASK_PRIORITIES, TASK_CATEGORIES } from '@/lib/taskStatuses'

export function NewTaskButton({
  projects,
  team,
}: {
  projects: { id: string; name: string }[]
  team: string[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    task_name: '',
    project_id: projects[0]?.id ?? '',
    assigned_to: '',
    category: 'Operations',
    priority: 'Medium',
    target_date: '',
    task_description: '',
    agent_eligible: 'Yes' as 'Yes' | 'No',
  })

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function submit() {
    setError('')
    if (!form.task_name || !form.project_id) {
      setError('Task name and project are required.')
      return
    }
    setSaving(true)
    const { ok, data } = await api<{ error?: string; emailNote?: string }>('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(form),
    })
    setSaving(false)
    if (!ok) {
      setError(data?.error ?? 'Failed to create task.')
      return
    }
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        <Plus size={16} /> New task
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">New task</h2>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-700">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <Field label="Task name">
                <input
                  className="input"
                  value={form.task_name}
                  onChange={(e) => set('task_name', e.target.value)}
                  placeholder="e.g. Draft December piano-discovery proposal"
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Project">
                  <select className="input" value={form.project_id} onChange={(e) => set('project_id', e.target.value)}>
                    {projects.length === 0 && <option value="">No projects yet</option>}
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Assignee">
                  <input
                    className="input"
                    list="ops-team"
                    value={form.assigned_to}
                    onChange={(e) => set('assigned_to', e.target.value)}
                    placeholder="Name"
                  />
                  <datalist id="ops-team">
                    {team.map((n) => <option key={n} value={n} />)}
                  </datalist>
                </Field>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <Field label="Category">
                  <select className="input" value={form.category} onChange={(e) => set('category', e.target.value)}>
                    {TASK_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label="Priority">
                  <select className="input" value={form.priority} onChange={(e) => set('priority', e.target.value)}>
                    {TASK_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </Field>
                <Field label="Due date">
                  <input type="date" className="input" value={form.target_date} onChange={(e) => set('target_date', e.target.value)} />
                </Field>
              </div>

              <Field label="Description">
                <textarea
                  className="input min-h-[80px]"
                  value={form.task_description}
                  onChange={(e) => set('task_description', e.target.value)}
                  placeholder="What does done look like?"
                />
              </Field>

              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={form.agent_eligible === 'Yes'}
                  onChange={(e) => set('agent_eligible', e.target.checked ? 'Yes' : 'No')}
                />
                Agent-eligible (a specialist can draft this)
              </label>

              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600">
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={saving}
                className="rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {saving ? 'Creating…' : 'Create task'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        :global(.input) {
          width: 100%;
          border: 1px solid #e5e7eb;
          border-radius: 0.5rem;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
        }
        :global(.input:focus) {
          outline: none;
          box-shadow: 0 0 0 2px #1a1a2e33;
        }
      `}</style>
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-500">{label}</label>
      {children}
    </div>
  )
}
