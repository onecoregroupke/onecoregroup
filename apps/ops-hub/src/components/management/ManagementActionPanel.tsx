'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { api } from '@/lib/apiClient'

type Option = { id: string; label: string }
type BrandOption = { id: string; name: string }

type Mode = 'approval' | 'blocker' | 'decision' | 'recurring' | 'meeting'

const MODE_LABEL: Record<Mode, string> = {
  approval: 'Approval',
  blocker: 'Blocker',
  decision: 'Decision',
  recurring: 'Recurring task',
  meeting: 'Meeting note',
}

export function ManagementActionPanel({
  brands,
  team,
  projects,
  tasks,
}: {
  brands: BrandOption[]
  team: Option[]
  projects: Option[]
  tasks: Option[]
}) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('approval')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [values, setValues] = useState<Record<string, string>>({
    title: '',
    priority: 'Medium',
    status: 'pending',
    severity: 'Medium',
    approval_type: 'general',
    blocker_type: 'operational',
    department: 'Operations',
    recurrence_rule: 'weekly',
  })

  function set(name: string, value: string) {
    setValues((current) => ({ ...current, [name]: value }))
  }

  async function submit() {
    setError('')
    if (!values.title?.trim()) {
      setError('Title is required.')
      return
    }
    setSaving(true)
    const { ok, data } = await api<{ error?: string }>('/api/management', {
      method: 'POST',
      body: JSON.stringify({ type: mode, values }),
    })
    setSaving(false)
    if (!ok) {
      setError(data?.error ?? 'Failed to save item.')
      return
    }
    setValues({
      title: '',
      priority: values.priority ?? 'Medium',
      status: values.status ?? 'pending',
      severity: values.severity ?? 'Medium',
      approval_type: values.approval_type ?? 'general',
      blocker_type: values.blocker_type ?? 'operational',
      department: values.department ?? 'Operations',
      recurrence_rule: values.recurrence_rule ?? 'weekly',
    })
    router.refresh()
  }

  return (
    <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ocg-gold">Create management item</h2>
          <p className="mt-1 text-sm text-gray-500">Capture decisions, approvals, blockers, and recurring work directly into the cockpit.</p>
        </div>
        <select className="input sm:w-48" value={mode} onChange={(event) => setMode(event.target.value as Mode)}>
          {(Object.keys(MODE_LABEL) as Mode[]).map((key) => (
            <option key={key} value={key}>{MODE_LABEL[key]}</option>
          ))}
        </select>
      </div>

      <div className="grid gap-3 lg:grid-cols-4">
        <Field label="Title">
          <input className="input" value={values.title ?? ''} onChange={(event) => set('title', event.target.value)} />
        </Field>
        <Field label="Brand">
          <select className="input" value={values.brand_id ?? ''} onChange={(event) => set('brand_id', event.target.value)}>
            <option value="">All brands</option>
            {brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
          </select>
        </Field>
        {mode === 'approval' && (
          <>
            <Field label="Approver">
              <Select options={team} value={values.approver_id ?? ''} onChange={(value) => set('approver_id', value)} empty="Unassigned" />
            </Field>
            <Field label="Due date">
              <input type="date" className="input" value={values.due_date ?? ''} onChange={(event) => set('due_date', event.target.value)} />
            </Field>
          </>
        )}
        {mode === 'blocker' && (
          <>
            <Field label="Owner">
              <Select options={team} value={values.owner_id ?? ''} onChange={(value) => set('owner_id', value)} empty="Unassigned" />
            </Field>
            <Field label="Severity">
              <select className="input" value={values.severity ?? 'Medium'} onChange={(event) => set('severity', event.target.value)}>
                {['Low', 'Medium', 'High', 'Critical'].map((item) => <option key={item}>{item}</option>)}
              </select>
            </Field>
          </>
        )}
        {mode === 'decision' && (
          <>
            <Field label="Project">
              <Select options={projects} value={values.project_id ?? ''} onChange={(value) => set('project_id', value)} empty="No project" />
            </Field>
            <Field label="Owner">
              <Select options={team} value={values.owner_id ?? ''} onChange={(value) => set('owner_id', value)} empty="Unassigned" />
            </Field>
          </>
        )}
        {mode === 'recurring' && (
          <>
            <Field label="Assignee">
              <Select options={team} value={values.default_assignee_id ?? ''} onChange={(value) => set('default_assignee_id', value)} empty="Unassigned" />
            </Field>
            <Field label="Next run">
              <input type="datetime-local" className="input" value={values.next_run_at ?? ''} onChange={(event) => set('next_run_at', event.target.value)} />
            </Field>
          </>
        )}
        {mode === 'meeting' && (
          <>
            <Field label="Meeting date">
              <input type="datetime-local" className="input" value={values.meeting_date ?? ''} onChange={(event) => set('meeting_date', event.target.value)} />
            </Field>
            <Field label="Attendees">
              <input className="input" value={values.attendees ?? ''} onChange={(event) => set('attendees', event.target.value)} placeholder="Names, comma separated" />
            </Field>
          </>
        )}
      </div>

      {mode === 'approval' && (
        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          <Field label="Type">
            <input className="input" value={values.approval_type ?? ''} onChange={(event) => set('approval_type', event.target.value)} />
          </Field>
          <Field label="Related task">
            <Select options={tasks} value={values.related_task_id ?? ''} onChange={(value) => set('related_task_id', value)} empty="No task" />
          </Field>
          <Field label="Priority">
            <select className="input" value={values.priority ?? 'Medium'} onChange={(event) => set('priority', event.target.value)}>
              {['Low', 'Medium', 'High', 'Urgent'].map((item) => <option key={item}>{item}</option>)}
            </select>
          </Field>
        </div>
      )}

      {mode === 'blocker' && (
        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          <Field label="Related task">
            <Select options={tasks} value={values.task_id ?? ''} onChange={(value) => set('task_id', value)} empty="No task" />
          </Field>
          <Field label="Next action">
            <input className="input" value={values.next_action ?? ''} onChange={(event) => set('next_action', event.target.value)} />
          </Field>
          <Field label="Blocked since">
            <input type="date" className="input" value={values.blocked_since ?? ''} onChange={(event) => set('blocked_since', event.target.value)} />
          </Field>
        </div>
      )}

      <Field label={mode === 'decision' ? 'Decision / note' : 'Details'}>
        <textarea
          className="input mt-3 min-h-[76px]"
          value={values[mode === 'decision' ? 'decision' : mode === 'meeting' ? 'summary' : 'description'] ?? ''}
          onChange={(event) => set(mode === 'decision' ? 'decision' : mode === 'meeting' ? 'summary' : 'description', event.target.value)}
        />
      </Field>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex justify-end">
        <button
          onClick={submit}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          <Plus size={16} /> {saving ? 'Saving...' : `Add ${MODE_LABEL[mode].toLowerCase()}`}
        </button>
      </div>
    </section>
  )
}

export function ManagementStatusButton({
  type,
  id,
  values,
  children,
}: {
  type: Mode
  id: string
  values: Record<string, string | null>
  children: React.ReactNode
}) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)

  async function submit() {
    setSaving(true)
    await api('/api/management', {
      method: 'PATCH',
      body: JSON.stringify({ type, id, values }),
    })
    setSaving(false)
    router.refresh()
  }

  return (
    <button
      onClick={submit}
      disabled={saving}
      className="rounded border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-500 hover:border-ocg-gold/50 hover:text-ocg-gold disabled:opacity-60"
    >
      {saving ? 'Saving...' : children}
    </button>
  )
}

function Select({
  options,
  value,
  onChange,
  empty,
}: {
  options: Option[]
  value: string
  onChange: (value: string) => void
  empty: string
}) {
  return (
    <select className="input" value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">{empty}</option>
      {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
    </select>
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
