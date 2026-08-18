'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { api } from '@/lib/apiClient'
import { CALENDAR_EVENT_KINDS } from '@/lib/calendarModel'

/**
 * Create a calendar event.
 *
 * Visibility defaults to `private`. Anyone may create a private or
 * named-invitee event; team / department / brand / company bands require the
 * `calendar_events` grant, and the server re-checks that — the options are
 * hidden here purely so people are not offered something that will be refused.
 */
export function EventComposer({
  date,
  brands,
  canCreateShared,
  onClose,
  onCreated,
}: {
  date: string
  brands: { id: string; label: string }[]
  canCreateShared: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    title: '', description: '', event_kind: 'event', location: '',
    date, start_time: '09:00', end_time: '10:00', all_day: false,
    visibility: 'private', brand_id: '',
  })

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((c) => ({ ...c, [k]: v }))
  }

  async function submit() {
    setError('')
    if (!form.title.trim()) { setError('A title is required.'); return }
    if (form.visibility === 'brand' && !form.brand_id) { setError('Choose the brand this event belongs to.'); return }
    if (!form.all_day && form.end_time < form.start_time) { setError('The end time is before the start time.'); return }

    setSaving(true)
    // Africa/Nairobi is UTC+3 year-round with no DST, so a fixed offset is safe.
    const startsAt = form.all_day ? `${form.date}T00:00:00+03:00` : `${form.date}T${form.start_time}:00+03:00`
    const endsAt = form.all_day ? `${form.date}T23:59:00+03:00` : `${form.date}T${form.end_time}:00+03:00`

    const { ok, data } = await api<{ error?: string }>('/api/calendar', {
      method: 'POST',
      body: JSON.stringify({
        title: form.title,
        description: form.description,
        event_kind: form.event_kind,
        location: form.location,
        starts_at: startsAt,
        ends_at: endsAt,
        all_day: form.all_day,
        visibility: form.visibility,
        brand_id: form.brand_id || null,
      }),
    })
    setSaving(false)
    if (!ok) { setError(data?.error ?? 'Could not create the event.'); return }
    onCreated()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      {/* flex-1 min-h-0 body so the dialog stays fully usable at 100% zoom. */}
      <div
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-ocg-gold">New calendar event</p>
            <p className="mt-0.5 text-sm text-gray-500">{date}</p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:text-gray-600" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <Field label="Title">
            <input className="input" value={form.title} onChange={(e) => set('title', e.target.value)}
              placeholder="e.g. Monthly stock count" autoFocus />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Kind">
              <select className="input" value={form.event_kind} onChange={(e) => set('event_kind', e.target.value)}>
                {CALENDAR_EVENT_KINDS.map((k) => (
                  <option key={k} value={k}>{k.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </Field>
            <Field label="Date">
              <input type="date" className="input" value={form.date} onChange={(e) => set('date', e.target.value)} />
            </Field>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={form.all_day} onChange={(e) => set('all_day', e.target.checked)} className="h-4 w-4 accent-[#1a1a2e]" />
            All day
          </label>

          {!form.all_day && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Starts"><input type="time" className="input" value={form.start_time} onChange={(e) => set('start_time', e.target.value)} /></Field>
              <Field label="Ends"><input type="time" className="input" value={form.end_time} onChange={(e) => set('end_time', e.target.value)} /></Field>
            </div>
          )}

          <Field label="Location">
            <input className="input" value={form.location} onChange={(e) => set('location', e.target.value)} />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Who can see this">
              <select className="input" value={form.visibility} onChange={(e) => set('visibility', e.target.value)}>
                <option value="private">Only me</option>
                {canCreateShared && <option value="team">My team</option>}
                {canCreateShared && <option value="department">My department</option>}
                {canCreateShared && <option value="brand">A brand</option>}
                {canCreateShared && <option value="company">Everyone</option>}
              </select>
            </Field>
            {form.visibility === 'brand' && (
              <Field label="Brand">
                <select className="input" value={form.brand_id} onChange={(e) => set('brand_id', e.target.value)}>
                  <option value="">Select…</option>
                  {brands.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
                </select>
              </Field>
            )}
          </div>

          <Field label="Notes">
            <textarea className="input min-h-[70px]" value={form.description} onChange={(e) => set('description', e.target.value)} />
          </Field>

          {!canCreateShared && (
            <p className="rounded-lg bg-gray-50 p-2.5 text-xs text-gray-500">
              You can create events on your own calendar. Sharing an event with a team, brand or the
              whole company needs the calendar events permission.
            </p>
          )}

          {error && <p className="rounded-lg bg-red-50 p-2.5 text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-gray-100 px-5 py-3">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          <button onClick={submit} disabled={saving}
            className="rounded-lg bg-ocg-navy px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60">
            {saving ? 'Creating…' : 'Create event'}
          </button>
        </div>
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
