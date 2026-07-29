'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarPlus, X } from 'lucide-react'
import { api } from '@/lib/apiClient'

type Option = { id: string; label: string; email?: string }
type TemplateOption = {
  id: string
  title: string
  brand_id: string
  project_id: string
  location: string
  agenda: string
  attendees: string[]
  meeting_mode: string
  meeting_url: string
}

export function NewMeetingButton({
  brands,
  projects,
  team,
  templates,
}: {
  brands: Option[]
  projects: Option[]
  team: Option[]
  templates: TemplateOption[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const now = new Date()
  const defaultDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  const [form, setForm] = useState({
    title: '',
    meeting_date: defaultDate,
    brand_id: '',
    project_id: '',
    location: '',
    agenda: '',
    meeting_mode: 'in_person',
    meeting_url: '',
    save_as_template: false,
  })
  const [attendees, setAttendees] = useState<string[]>([])

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }
  function toggleAttendee(id: string) {
    setAttendees((prev) => (prev.includes(id) ? prev.filter((n) => n !== id) : [...prev, id]))
  }
  function useTemplate(id: string) {
    const template = templates.find((t) => t.id === id)
    if (!template) return
    setForm((f) => ({
      ...f,
      title: template.title,
      brand_id: template.brand_id,
      project_id: template.project_id,
      location: template.location,
      agenda: template.agenda,
      meeting_mode: template.meeting_mode || 'in_person',
      meeting_url: template.meeting_url || '',
    }))
    setAttendees(template.attendees.filter((memberId) => team.some((m) => m.id === memberId)))
  }

  async function submit() {
    setError('')
    if (!form.title.trim()) return setError('Meeting title is required.')
    setSaving(true)
    const { ok, data } = await api<{ error?: string; meeting?: { id: string } }>('/api/meetings', {
      method: 'POST',
      body: JSON.stringify({
        action: 'create_meeting',
        values: {
          ...form,
          meeting_date: new Date(form.meeting_date).toISOString(),
          attendees: team.filter((m) => attendees.includes(m.id)).map((m) => m.label),
          attendee_emails: team.filter((m) => attendees.includes(m.id)).map((m) => m.email).filter(Boolean),
          attendee_member_ids: attendees,
          meeting_mode: form.meeting_mode,
          meeting_url: form.meeting_url,
          save_as_template: form.save_as_template,
        },
      }),
    })
    setSaving(false)
    if (!ok) return setError(data?.error ?? 'Failed to create meeting.')
    setOpen(false)
    if (data.meeting?.id) router.push(`/meetings/${data.meeting.id}`)
    else router.refresh()
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
        <CalendarPlus size={16} /> New meeting
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 overflow-y-auto">
          <div className="my-8 max-h-[calc(100dvh-4rem)] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Schedule a meeting</h2>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
            </div>

            <div className="space-y-3">
              {templates.length > 0 && (
                <Field label="Use saved meeting">
                  <select className="input" defaultValue="" onChange={(e) => useTemplate(e.target.value)}>
                    <option value="">Start fresh</option>
                    {templates.map((template) => <option key={template.id} value={template.id}>{template.title}</option>)}
                  </select>
                </Field>
              )}
              <Field label="Title *">
                <input className="input" value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Weekly management standup, Rayyan ops review…" />
                <p className="mt-1 text-[11px] text-gray-400">Meetings with the same title form a series — the prep brief pulls context from the previous one.</p>
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Date & time *"><input type="datetime-local" className="input" value={form.meeting_date} onChange={(e) => set('meeting_date', e.target.value)} /></Field>
                <Field label="Location"><input className="input" value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="Office, Google Meet…" /></Field>
                <Field label="Meeting mode">
                  <select className="input" value={form.meeting_mode} onChange={(e) => set('meeting_mode', e.target.value)}>
                    <option value="in_person">In person</option>
                    <option value="google_meet">Google Meet</option>
                    <option value="hybrid">Hybrid</option>
                    <option value="other_link">Other link</option>
                  </select>
                </Field>
                <Field label="Meeting link">
                  <input className="input" value={form.meeting_url} onChange={(e) => set('meeting_url', e.target.value)} placeholder="https://meet.google.com/..." />
                </Field>
                <Field label="Brand">
                  <select className="input" value={form.brand_id} onChange={(e) => set('brand_id', e.target.value)}>
                    <option value="">Group-wide</option>
                    {brands.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
                  </select>
                </Field>
                <Field label="Linked project">
                  <select className="input" value={form.project_id} onChange={(e) => set('project_id', e.target.value)}>
                    <option value="">None</option>
                    {projects.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Attendees">
                <div className="flex flex-wrap gap-2">
                  {team.map((m) => (
                    <button key={m.id} type="button" onClick={() => toggleAttendee(m.id)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium ${attendees.includes(m.id) ? 'border-ocg-navy bg-ocg-navy text-white' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Agenda"><textarea className="input min-h-[72px]" value={form.agenda} onChange={(e) => set('agenda', e.target.value)} /></Field>
              <label className="inline-flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={form.save_as_template}
                  onChange={(e) => setForm((f) => ({ ...f, save_as_template: e.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300 text-ocg-navy"
                />
                Save this meeting setup for reuse
              </label>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600">Cancel</button>
              <button onClick={submit} disabled={saving} className="rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60">
                {saving ? 'Scheduling…' : 'Schedule meeting'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
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
