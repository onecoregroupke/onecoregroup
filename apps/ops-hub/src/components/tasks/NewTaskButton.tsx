'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X } from 'lucide-react'
import { api } from '@/lib/apiClient'
import { TASK_PRIORITIES, TASK_CATEGORIES } from '@/lib/taskStatuses'

export function NewTaskButton({
  projects,
  brands,
  clients,
  team,
}: {
  projects: { id: string; name: string }[]
  brands: { slug: string; name: string }[]
  clients: { id: string; name: string }[]
  team: string[]
}) {
  const router = useRouter()
  const [projectOptions, setProjectOptions] = useState(projects)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [projectMode, setProjectMode] = useState<'existing' | 'new'>('existing')
  const [projectOwner, setProjectOwner] = useState<'brand' | 'client' | 'shared'>('shared')
  const [form, setForm] = useState({
    task_name: '',
    project_id: projects[0]?.id ?? '',
    new_project_name: '',
    new_project_brand: brands[0]?.slug ?? '',
    new_project_client_id: clients[0]?.id ?? '',
    new_project_service_line: '',
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
    if (!form.task_name) {
      setError('Task name is required.')
      return
    }
    if (projectMode === 'existing' && !form.project_id) {
      setError('Task name and project are required.')
      return
    }
    if (projectMode === 'new' && !form.new_project_name.trim()) {
      setError('New project name is required.')
      return
    }
    if (projectMode === 'new' && projectOwner === 'brand' && !form.new_project_brand) {
      setError('Choose the brand for the new project.')
      return
    }
    if (projectMode === 'new' && projectOwner === 'client' && !form.new_project_client_id) {
      setError('Choose the client for the new project.')
      return
    }
    setSaving(true)
    let projectId = form.project_id
    if (projectMode === 'new') {
      const projectPayload =
        projectOwner === 'brand'
          ? {
              project_name: form.new_project_name,
              brand: form.new_project_brand,
              service_line: form.new_project_service_line,
            }
          : projectOwner === 'client'
          ? {
              project_name: form.new_project_name,
              client_id: form.new_project_client_id,
              service_line: form.new_project_service_line,
            }
          : {
              project_name: form.new_project_name,
              shared: true,
              service_line: form.new_project_service_line,
            }
      const created = await api<{ error?: string; project?: { project_id: string; project_name: string } }>('/api/projects', {
        method: 'POST',
        body: JSON.stringify(projectPayload),
      })
      if (!created.ok || !created.data.project) {
        setSaving(false)
        setError(created.data?.error ?? 'Failed to create project.')
        return
      }
      projectId = created.data.project.project_id
      setProjectOptions((current) => [
        { id: created.data.project!.project_id, name: created.data.project!.project_name },
        ...current,
      ])
    }
    const { ok, data } = await api<{ error?: string; emailNote?: string }>('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({
        task_name: form.task_name,
        project_id: projectId,
        assigned_to: form.assigned_to,
        category: form.category,
        priority: form.priority,
        target_date: form.target_date,
        task_description: form.task_description,
        agent_eligible: form.agent_eligible,
      }),
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
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4">
          <div className="my-4 flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">New task</h2>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-700">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 overflow-y-auto p-6">
              <Field label="Task name">
                <input
                  className="input"
                  value={form.task_name}
                  onChange={(e) => set('task_name', e.target.value)}
                  placeholder="e.g. Draft December piano-discovery proposal"
                />
              </Field>

              <div className="rounded-xl border border-gray-100 p-3">
                <div className="mb-3 flex rounded-lg border border-gray-200 p-1 text-sm">
                  <button
                    type="button"
                    onClick={() => setProjectMode('existing')}
                    className={`flex-1 rounded-md px-3 py-1.5 font-medium ${projectMode === 'existing' ? 'bg-ocg-navy text-white' : 'text-gray-500 hover:text-gray-800'}`}
                  >
                    Existing project
                  </button>
                  <button
                    type="button"
                    onClick={() => setProjectMode('new')}
                    className={`flex-1 rounded-md px-3 py-1.5 font-medium ${projectMode === 'new' ? 'bg-ocg-navy text-white' : 'text-gray-500 hover:text-gray-800'}`}
                  >
                    Create project
                  </button>
                </div>
                {projectMode === 'existing' ? (
                  <Field label="Project">
                    <select className="input" value={form.project_id} onChange={(e) => set('project_id', e.target.value)}>
                      {projectOptions.length === 0 && <option value="">No projects yet</option>}
                      {projectOptions.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </Field>
                ) : (
                  <div className="space-y-3">
                    <Field label="New project name">
                      <input className="input" value={form.new_project_name} onChange={(e) => set('new_project_name', e.target.value)} placeholder="e.g. July shared operations" />
                    </Field>
                    <div className="flex gap-2 text-xs">
                      {[
                        ['shared', 'Joint / shared'],
                        ['brand', 'Brand'],
                        ['client', 'Client'],
                      ].map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setProjectOwner(value as typeof projectOwner)}
                          className={`flex-1 rounded-lg border px-3 py-2 font-medium ${projectOwner === value ? 'border-ocg-navy bg-ocg-navy text-white' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {projectOwner === 'brand' && (
                      <Field label="Brand">
                        <select className="input" value={form.new_project_brand} onChange={(e) => set('new_project_brand', e.target.value)}>
                          {brands.map((brand) => <option key={brand.slug} value={brand.slug}>{brand.name}</option>)}
                        </select>
                      </Field>
                    )}
                    {projectOwner === 'client' && (
                      <Field label="Client">
                        <select className="input" value={form.new_project_client_id} onChange={(e) => set('new_project_client_id', e.target.value)}>
                          {clients.length === 0 && <option value="">No clients yet</option>}
                          {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
                        </select>
                      </Field>
                    )}
                    <Field label="Service line">
                      <input className="input" value={form.new_project_service_line} onChange={(e) => set('new_project_service_line', e.target.value)} placeholder="Optional" />
                    </Field>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
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

            <div className="flex justify-end gap-2 border-t border-gray-100 p-4">
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
