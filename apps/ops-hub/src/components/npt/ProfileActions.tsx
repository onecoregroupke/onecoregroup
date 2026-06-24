'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, FileText, MessageSquare, ReceiptText, Thermometer, X } from 'lucide-react'
import { api } from '@/lib/apiClient'

type Option = { id: string; label: string }
type Action = 'contact' | 'schedule' | 'estimate' | 'invoice' | 'measurement'

export function ProfileActions({
  customerId,
  pianoId,
  pianos = [],
  technicians = [],
}: {
  customerId?: string
  pianoId?: string
  pianos?: Option[]
  technicians?: Option[]
}) {
  const router = useRouter()
  const [action, setAction] = useState<Action | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [v, setV] = useState<Record<string, string>>({ event_type: 'comment', title: 'Appointment', record_type: 'quote' })

  function set(k: string, val: string) { setV((c) => ({ ...c, [k]: val })) }

  async function submit() {
    setError('')
    let body: Record<string, unknown> | null = null
    if (action === 'schedule') {
      body = { type: 'npt_appointment', values: { customer_id: customerId, piano_id: pianoId || v.piano_id, technician_id: v.technician_id, title: v.title || 'Appointment', start_at: v.start_at, end_at: v.end_at, location: v.location, notes: v.notes, status: 'Scheduled' } }
    } else if (action === 'contact') {
      if (!v.body?.trim()) { setError('Add a note.'); return }
      body = { type: 'npt_timeline', values: { customer_id: customerId, piano_id: pianoId, event_type: v.event_type || 'comment', title: v.subject || '', body: v.body } }
    } else if (action === 'estimate' || action === 'invoice') {
      const isInv = action === 'invoice'
      body = { type: 'npt_quote', values: { customer_id: customerId, record_type: isInv ? 'invoice' : 'quote', [isInv ? 'invoice_amount_ksh' : 'quote_amount_ksh']: v.amount, notes: v.notes, status: 'draft' } }
    } else if (action === 'measurement') {
      body = { type: 'npt_measurement', values: { piano_id: pianoId, technician_id: v.technician_id, temperature_c: v.temperature_c, humidity_pct: v.humidity_pct, notes: v.notes } }
    }
    if (!body) return
    setSaving(true)
    const { ok, data } = await api<{ error?: string }>('/api/npt', { method: 'POST', body: JSON.stringify(body) })
    setSaving(false)
    if (!ok) { setError(data?.error ?? 'Failed.'); return }
    setV({ event_type: 'comment', title: 'Appointment', record_type: 'quote' })
    setAction(null)
    router.refresh()
  }

  const RAIL: { key: Action; label: string; icon: React.ElementType; show: boolean }[] = [
    { key: 'contact', label: 'Contact', icon: MessageSquare, show: true },
    { key: 'schedule', label: 'Schedule', icon: CalendarClock, show: true },
    { key: 'estimate', label: 'Estimate', icon: FileText, show: Boolean(customerId) },
    { key: 'invoice', label: 'Invoice', icon: ReceiptText, show: Boolean(customerId) },
    { key: 'measurement', label: 'Measurement', icon: Thermometer, show: Boolean(pianoId) },
  ]

  return (
    <section className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap gap-2">
        {RAIL.filter((r) => r.show).map((r) => (
          <button key={r.key} onClick={() => setAction(action === r.key ? null : r.key)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium border ${action === r.key ? 'border-ocg-navy bg-ocg-navy text-white' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
            <r.icon size={15} /> {r.label}
          </button>
        ))}
      </div>

      {action && (
        <div className="mt-4 border-t border-gray-100 pt-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-ocg-gold">{action}</p>
            <button onClick={() => setAction(null)} className="text-gray-400 hover:text-gray-700"><X size={15} /></button>
          </div>

          {action === 'schedule' && (
            <div className="grid gap-3 lg:grid-cols-4">
              <Field label="Title"><input className="input" value={v.title ?? ''} onChange={(e) => set('title', e.target.value)} /></Field>
              {!pianoId && pianos.length > 0 && <Field label="Piano"><Select options={pianos} value={v.piano_id ?? ''} onChange={(val) => set('piano_id', val)} empty="No piano" /></Field>}
              <Field label="Technician"><Select options={technicians} value={v.technician_id ?? ''} onChange={(val) => set('technician_id', val)} empty="Unassigned" /></Field>
              <Field label="Start"><input type="datetime-local" className="input" value={v.start_at ?? ''} onChange={(e) => set('start_at', e.target.value)} /></Field>
              <Field label="End"><input type="datetime-local" className="input" value={v.end_at ?? ''} onChange={(e) => set('end_at', e.target.value)} /></Field>
              <Field label="Location"><input className="input" value={v.location ?? ''} onChange={(e) => set('location', e.target.value)} /></Field>
            </div>
          )}

          {action === 'contact' && (
            <div className="grid gap-3 lg:grid-cols-4">
              <Field label="Type">
                <select className="input" value={v.event_type ?? 'comment'} onChange={(e) => set('event_type', e.target.value)}>
                  <option value="comment">Comment</option><option value="message">Message</option><option value="call">Phone call</option>
                </select>
              </Field>
              <Field label="Subject"><input className="input" value={v.subject ?? ''} onChange={(e) => set('subject', e.target.value)} /></Field>
              <Field label="Note" wide><textarea className="input min-h-[64px]" value={v.body ?? ''} onChange={(e) => set('body', e.target.value)} /></Field>
            </div>
          )}

          {(action === 'estimate' || action === 'invoice') && (
            <div className="grid gap-3 lg:grid-cols-4">
              <Field label="Amount (KSh)"><input type="number" className="input" value={v.amount ?? ''} onChange={(e) => set('amount', e.target.value)} /></Field>
              <Field label="Notes" wide><input className="input" value={v.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></Field>
            </div>
          )}

          {action === 'measurement' && (
            <div className="grid gap-3 lg:grid-cols-4">
              <Field label="Temp (°C)"><input type="number" step="0.1" className="input" value={v.temperature_c ?? ''} onChange={(e) => set('temperature_c', e.target.value)} /></Field>
              <Field label="Humidity (%)"><input type="number" step="0.1" className="input" value={v.humidity_pct ?? ''} onChange={(e) => set('humidity_pct', e.target.value)} /></Field>
              <Field label="Technician"><Select options={technicians} value={v.technician_id ?? ''} onChange={(val) => set('technician_id', val)} empty="—" /></Field>
              <Field label="Notes" wide><input className="input" value={v.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></Field>
            </div>
          )}

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <div className="mt-3 flex justify-end">
            <button onClick={submit} disabled={saving} className="rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60">{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      )}
    </section>
  )
}

function Select({ options, value, onChange, empty }: { options: Option[]; value: string; onChange: (v: string) => void; empty: string }) {
  return <select className="input" value={value} onChange={(e) => onChange(e.target.value)}><option value="">{empty}</option>{options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
}
function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <label className={`block ${wide ? 'lg:col-span-2' : ''}`}><span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>{children}</label>
}
