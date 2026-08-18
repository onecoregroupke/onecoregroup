'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X, GripVertical, Users, User, Building2, MapPin, Briefcase, Tag } from 'lucide-react'
import { api } from '@/lib/apiClient'
import { RECURRENCE_FREQUENCIES, WEEKDAY_LABELS } from '@/lib/recurrence'
import { DUTY_TARGET_KINDS, DUTY_KINDS } from '@/lib/dutyModel'

export interface BuilderOption { id: string; label: string }
export interface BuilderLists {
  team: BuilderOption[]
  brands: BuilderOption[]
  teams: string[]
  departments: string[]
  roles: string[]
  locations: string[]
  formTemplates: BuilderOption[]
}

const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent']

const TARGET_META: Record<string, { label: string; icon: React.ElementType; hint: string }> = {
  employee: { label: 'One person', icon: User, hint: 'A single named employee.' },
  team: { label: 'Team', icon: Users, hint: 'Everyone on this team gets their own copy each due day.' },
  department: { label: 'Department', icon: Building2, hint: 'Everyone in this department.' },
  role: { label: 'Role', icon: Briefcase, hint: 'Everyone holding this job role.' },
  location: { label: 'Location', icon: MapPin, hint: 'Everyone based at this location.' },
  brand: { label: 'Brand', icon: Tag, hint: 'Everyone assigned to this brand.' },
}

interface ChecklistDraft { id?: string; label: string; hint: string; required: boolean }

export interface DutyDraft {
  id?: string
  title: string
  description: string
  instructions: string
  duty_kind: string
  department: string
  category: string
  location: string
  priority: string
  target_kind: string
  assignee_id: string
  brand_id: string
  target_team: string
  target_department: string
  target_role: string
  target_location: string
  frequency: string
  weekdays: number[]
  day_of_month: string
  interval_days: string
  time_of_day: string
  start_date: string
  end_date: string
  skip_holidays: boolean
  requires_note: boolean
  requires_proof: boolean
  requires_checklist: boolean
  requires_approval: boolean
  required_form_template_id: string
  reviewer_id: string
  grace_minutes: string
  escalation_minutes: string
  reminder_minutes: string
}

export function emptyDraft(): DutyDraft {
  return {
    title: '', description: '', instructions: '', duty_kind: 'task',
    department: 'Operations', category: '', location: '', priority: 'Medium',
    target_kind: 'employee', assignee_id: '', brand_id: '',
    target_team: '', target_department: '', target_role: '', target_location: '',
    frequency: 'weekdays', weekdays: [1, 2, 3, 4, 5], day_of_month: '1', interval_days: '14',
    time_of_day: '', start_date: '', end_date: '', skip_holidays: false,
    requires_note: false, requires_proof: false, requires_checklist: false,
    requires_approval: false, required_form_template_id: '', reviewer_id: '',
    grace_minutes: '0', escalation_minutes: '0', reminder_minutes: '0',
  }
}

/**
 * The manager-side duty configurator (§1).
 *
 * Everything the recurrence + targeting engine supports is exposed here, and
 * nothing that it does not. Targeting a group creates ONE template — the
 * per-person occurrences are derived on read, so this form never fans out into
 * duplicate duty records.
 */
export function DutyBuilder({
  lists,
  initial,
  checklist: initialChecklist = [],
  onDone,
}: {
  lists: BuilderLists
  initial?: DutyDraft
  checklist?: ChecklistDraft[]
  onDone?: () => void
}) {
  const router = useRouter()
  const editing = !!initial?.id
  const [open, setOpen] = useState(editing)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState<DutyDraft>(initial ?? emptyDraft())
  const [checklist, setChecklist] = useState<ChecklistDraft[]>(initialChecklist)

  function set<K extends keyof DutyDraft>(name: K, value: DutyDraft[K]) {
    setForm((c) => ({ ...c, [name]: value }))
  }
  function toggleDay(d: number) {
    setForm((c) => ({
      ...c,
      weekdays: c.weekdays.includes(d) ? c.weekdays.filter((x) => x !== d) : [...c.weekdays, d].sort((a, b) => a - b),
    }))
  }

  const targetHint = useMemo(() => TARGET_META[form.target_kind]?.hint ?? '', [form.target_kind])

  function targetValid(): string | null {
    switch (form.target_kind) {
      case 'employee': return form.assignee_id ? null : 'Choose the employee this duty belongs to.'
      case 'team': return form.target_team ? null : 'Choose a team.'
      case 'department': return form.target_department ? null : 'Choose a department.'
      case 'role': return form.target_role ? null : 'Choose a role.'
      case 'location': return form.target_location ? null : 'Choose a location.'
      case 'brand': return form.brand_id ? null : 'Choose a brand.'
      default: return null
    }
  }

  async function submit() {
    setError('')
    if (!form.title.trim()) { setError('Duty title is required.'); return }
    // A blank target would resolve to nobody — refuse it here rather than
    // saving a duty that silently reaches no one.
    const targetProblem = targetValid()
    if (targetProblem) { setError(targetProblem); return }
    if (form.frequency === 'weekly' && form.weekdays.length === 0) { setError('Pick at least one weekday.'); return }
    if (form.requires_checklist && checklist.length === 0) {
      setError('This duty requires a checklist, so add at least one checklist item.'); return
    }

    setSaving(true)
    const payload = {
      ...(editing ? { id: initial!.id } : {}),
      ...form,
      weekdays: form.frequency === 'weekly' ? form.weekdays : [],
      day_of_month: form.frequency === 'monthly' ? form.day_of_month : '',
      interval_days: form.frequency === 'interval' ? form.interval_days : '',
      checklist: checklist.filter((c) => c.label.trim()),
    }
    const { ok, data } = await api<{ error?: string }>('/api/duties', {
      method: editing ? 'PATCH' : 'POST',
      body: JSON.stringify(payload),
    })
    setSaving(false)
    if (!ok) { setError(data?.error ?? 'Failed to save duty.'); return }
    if (!editing) { setForm(emptyDraft()); setChecklist([]); setOpen(false) }
    onDone?.()
    router.refresh()
  }

  return (
    <section data-tour="duty-setup" className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      {!editing && (
        <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-3 text-left">
          <span>
            <span className="block text-xs font-semibold uppercase tracking-wider text-ocg-gold">Recurring duties setup</span>
            <span className="mt-1 block text-sm text-gray-500">
              Create a recurring duty and target it at a person, team, department, role, location or brand.
              Configure the schedule, what must be supplied on completion, and whether a manager reviews it.
            </span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-ocg-navy px-3 py-2 text-sm font-medium text-white">
            <Plus size={16} /> New duty
          </span>
        </button>
      )}

      {open && (
        <div className={editing ? 'space-y-4' : 'mt-4 space-y-4'}>
          {/* ── What ─────────────────────────────────────────────────── */}
          <div className="grid gap-3 lg:grid-cols-4">
            <Field label="Duty" className="lg:col-span-2">
              <input className="input" value={form.title} onChange={(e) => set('title', e.target.value)}
                placeholder="e.g. Open the workshop and log the compound inspection" />
            </Field>
            <Field label="Type">
              <select className="input" value={form.duty_kind} onChange={(e) => set('duty_kind', e.target.value)}>
                {DUTY_KINDS.map((k) => <option key={k} value={k}>{k.replace('_', ' ')}</option>)}
              </select>
            </Field>
            <Field label="Priority">
              <select className="input" value={form.priority} onChange={(e) => set('priority', e.target.value)}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
          </div>

          {/* ── Who ──────────────────────────────────────────────────── */}
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Assign to</p>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {DUTY_TARGET_KINDS.map((kind) => {
                const meta = TARGET_META[kind]
                const Icon = meta?.icon ?? User
                const active = form.target_kind === kind
                return (
                  <button key={kind} type="button" onClick={() => set('target_kind', kind)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      active ? 'border-ocg-navy bg-ocg-navy text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                    }`}>
                    <Icon size={12} /> {meta?.label ?? kind}
                  </button>
                )
              })}
            </div>

            <div className="grid gap-3 lg:grid-cols-3">
              {form.target_kind === 'employee' && (
                <Field label="Employee">
                  <select className="input" value={form.assignee_id} onChange={(e) => set('assignee_id', e.target.value)}>
                    <option value="">Select…</option>
                    {lists.team.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                </Field>
              )}
              {form.target_kind === 'team' && (
                <Field label="Team">
                  <ComboSelect value={form.target_team} options={lists.teams} onChange={(v) => set('target_team', v)} />
                </Field>
              )}
              {form.target_kind === 'department' && (
                <Field label="Department">
                  <ComboSelect value={form.target_department} options={lists.departments} onChange={(v) => set('target_department', v)} />
                </Field>
              )}
              {form.target_kind === 'role' && (
                <Field label="Role">
                  <ComboSelect value={form.target_role} options={lists.roles} onChange={(v) => set('target_role', v)} />
                </Field>
              )}
              {form.target_kind === 'location' && (
                <Field label="Location">
                  <ComboSelect value={form.target_location} options={lists.locations} onChange={(v) => set('target_location', v)} />
                </Field>
              )}

              <Field label={form.target_kind === 'brand' ? 'Brand' : 'Brand (optional)'}>
                <select className="input" value={form.brand_id} onChange={(e) => set('brand_id', e.target.value)}>
                  <option value="">Group-wide</option>
                  {lists.brands.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
                </select>
              </Field>
              <Field label="Department label">
                <input className="input" value={form.department} onChange={(e) => set('department', e.target.value)} />
              </Field>
            </div>
            <p className="mt-2 text-xs text-gray-400">{targetHint}</p>
          </div>

          {/* ── When ─────────────────────────────────────────────────── */}
          <div className="grid gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3 lg:grid-cols-4">
            <Field label="Repeats">
              <select className="input" value={form.frequency} onChange={(e) => set('frequency', e.target.value)}>
                {RECURRENCE_FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </Field>

            {form.frequency === 'weekly' && (
              <div className="lg:col-span-3">
                <span className="mb-1 block text-xs font-medium text-gray-500">On days</span>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAY_LABELS.map((label, d) => (
                    <button key={d} type="button" onClick={() => toggleDay(d)}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                        form.weekdays.includes(d) ? 'border-ocg-navy bg-ocg-navy text-white' : 'border-gray-200 bg-white text-gray-600'
                      }`}>{label}</button>
                  ))}
                </div>
              </div>
            )}
            {form.frequency === 'monthly' && (
              <Field label="Day of month">
                <select className="input" value={form.day_of_month} onChange={(e) => set('day_of_month', e.target.value)}>
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((n) => <option key={n} value={String(n)}>{n}</option>)}
                  <option value="-1">Last working day</option>
                </select>
              </Field>
            )}
            {form.frequency === 'interval' && (
              <Field label="Every N days">
                <input type="number" min="1" className="input" value={form.interval_days} onChange={(e) => set('interval_days', e.target.value)} />
              </Field>
            )}

            <Field label="Time of day"><input type="time" className="input" value={form.time_of_day} onChange={(e) => set('time_of_day', e.target.value)} /></Field>
            <Field label="Grace (min)"><input type="number" min="0" className="input" value={form.grace_minutes} onChange={(e) => set('grace_minutes', e.target.value)} /></Field>
            <Field label="Reminder (min before)"><input type="number" min="0" className="input" value={form.reminder_minutes} onChange={(e) => set('reminder_minutes', e.target.value)} /></Field>
            <Field label="Escalate after (min)"><input type="number" min="0" className="input" value={form.escalation_minutes} onChange={(e) => set('escalation_minutes', e.target.value)} /></Field>
            <Field label="Starts"><input type="date" className="input" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} /></Field>
            <Field label="Ends (optional)"><input type="date" className="input" value={form.end_date} onChange={(e) => set('end_date', e.target.value)} /></Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-gray-600 lg:col-span-2">
              <input type="checkbox" checked={form.skip_holidays} onChange={(e) => set('skip_holidays', e.target.checked)} className="h-4 w-4 accent-[#1a1a2e]" />
              Skip public holidays
            </label>
          </div>

          {/* ── What must be supplied ────────────────────────────────── */}
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Completion requirements</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Toggle label="Note required" checked={form.requires_note} onChange={(v) => set('requires_note', v)} />
              <Toggle label="Evidence required" checked={form.requires_proof} onChange={(v) => set('requires_proof', v)} />
              <Toggle label="Checklist required" checked={form.requires_checklist} onChange={(v) => set('requires_checklist', v)} />
              <Toggle label="Manager review" checked={form.requires_approval} onChange={(v) => set('requires_approval', v)} />
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-3">
              <Field label="Required form (optional)">
                <select className="input" value={form.required_form_template_id} onChange={(e) => set('required_form_template_id', e.target.value)}>
                  <option value="">None</option>
                  {lists.formTemplates.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                </select>
              </Field>
              <Field label="Reviewer (optional)">
                <select className="input" value={form.reviewer_id} onChange={(e) => set('reviewer_id', e.target.value)}>
                  <option value="">Any manager</option>
                  {lists.team.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </Field>
              <Field label="Location / area">
                <input className="input" value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="e.g. Compound, Store 2" />
              </Field>
            </div>
          </div>

          {/* ── Checklist ────────────────────────────────────────────── */}
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Checklist items</p>
              <button type="button"
                onClick={() => setChecklist((c) => [...c, { label: '', hint: '', required: true }])}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 hover:border-ocg-gold/40">
                <Plus size={12} /> Add item
              </button>
            </div>
            {checklist.length === 0 ? (
              <p className="text-xs text-gray-400">No checklist. The person just ticks the duty off.</p>
            ) : (
              <div className="space-y-1.5">
                {checklist.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <GripVertical size={14} className="shrink-0 text-gray-300" />
                    <input className="input flex-1" value={item.label} placeholder="What must be checked"
                      onChange={(e) => setChecklist((c) => c.map((x, i) => (i === idx ? { ...x, label: e.target.value } : x)))} />
                    <input className="input hidden flex-1 sm:block" value={item.hint} placeholder="Hint (optional)"
                      onChange={(e) => setChecklist((c) => c.map((x, i) => (i === idx ? { ...x, hint: e.target.value } : x)))} />
                    <button type="button" onClick={() => setChecklist((c) => c.filter((_, i) => i !== idx))}
                      className="shrink-0 rounded p-1 text-gray-300 hover:text-red-500" aria-label="Remove item">
                      <X size={14} />
                    </button>
                  </div>
                ))}
                <p className="text-xs text-gray-400">
                  Removing an item deactivates it — past completions keep their recorded results.
                </p>
              </div>
            )}
          </div>

          {/* ── Detail ───────────────────────────────────────────────── */}
          <div className="grid gap-3 lg:grid-cols-2">
            <Field label="Short note (shown in lists)">
              <input className="input" value={form.description} onChange={(e) => set('description', e.target.value)} />
            </Field>
            <Field label="Instructions (shown when opened)">
              <textarea className="input min-h-[38px]" value={form.instructions} onChange={(e) => set('instructions', e.target.value)} />
            </Field>
          </div>

          {error && <p className="rounded-lg bg-red-50 p-2.5 text-sm text-red-600">{error}</p>}

          <div className="flex flex-wrap gap-2">
            <button onClick={submit} disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-ocg-navy px-6 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60">
              <Plus size={16} /> {saving ? 'Saving…' : editing ? 'Save changes' : 'Create duty'}
            </button>
            {!editing && (
              <button onClick={() => setOpen(false)} className="rounded-lg px-4 py-2 text-sm text-gray-500 hover:text-gray-700">
                Cancel
              </button>
            )}
            {editing && onDone && (
              <button onClick={onDone} className="rounded-lg px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Close</button>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

/** A select over known values that still accepts a new one — team names and
 *  departments are free text on ops_team_members, so both must work. */
function ComboSelect({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  const known = options.filter(Boolean)
  return (
    <>
      <input className="input" list={`opts-${known.length}-${known[0] ?? 'x'}`} value={value}
        onChange={(e) => onChange(e.target.value)} placeholder="Type or choose…" />
      <datalist id={`opts-${known.length}-${known[0] ?? 'x'}`}>
        {known.map((o) => <option key={o} value={o} />)}
      </datalist>
    </>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[#1a1a2e]" />
      {label}
    </label>
  )
}

function Field({ label, className = '', children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>
      {children}
    </label>
  )
}
