'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, CheckCircle, Save } from 'lucide-react'
import { usePermissions } from '@/contexts/PermissionsContext'
import { apiFetch } from '@/lib/marketing/client'
import {
  WHATSAPP_TRIGGER_TYPES,
  WHATSAPP_TRIGGER_LABELS,
  WHATSAPP_FLOW_STATUS_LABELS,
  WHATSAPP_FLOW_TRANSITIONS,
  type MarketingBrand,
  type WhatsappFlow,
  type WhatsappFlowStatus,
} from '@/lib/marketing/types'

export default function FlowEditor({ flowId }: { flowId?: string }) {
  const router = useRouter()
  const { can, isAdmin } = usePermissions()
  const canEdit = isAdmin || can('marketing', 'edit')

  const [brands, setBrands] = useState<MarketingBrand[]>([])
  const [flow, setFlow] = useState<WhatsappFlow | null>(null)
  const [brandId, setBrandId] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [triggerType, setTriggerType] = useState('keyword')
  const [keywords, setKeywords] = useState('')
  const [definition, setDefinition] = useState('{\n  "steps": []\n}')
  const [notes, setNotes] = useState('')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  function hydrate(f: WhatsappFlow) {
    setFlow(f)
    setBrandId(f.brandId)
    setName(f.name)
    setDescription(f.description ?? '')
    setTriggerType(f.triggerType)
    setKeywords(f.triggerKeywords.join(', '))
    setDefinition(JSON.stringify(f.flowDefinition ?? {}, null, 2))
    setNotes(f.notes ?? '')
  }

  useEffect(() => {
    void (async () => {
      setLoading(true)
      try {
        const b = await apiFetch<{ brands: MarketingBrand[] }>('/api/marketing/brands')
        setBrands(b.brands ?? [])
        if (flowId) {
          const { flow: f } = await apiFetch<{ flow: WhatsappFlow }>(`/api/marketing/whatsapp?id=${flowId}`)
          hydrate(f)
        } else if (b.brands?.[0]) {
          setBrandId(b.brands[0].id)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load.')
      } finally {
        setLoading(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowId])

  async function save() {
    setSaving(true); setError(''); setMessage('')
    try {
      if (!brandId) throw new Error('Brand is required.')
      if (!name.trim()) throw new Error('Name is required.')
      let flowDefinition: Record<string, unknown> = {}
      if (definition.trim()) {
        try {
          flowDefinition = JSON.parse(definition)
        } catch {
          throw new Error('Flow definition must be valid JSON.')
        }
      }
      const payload = {
        brandId,
        name: name.trim(),
        description: description.trim() || null,
        triggerType,
        triggerKeywords: keywords.split(',').map((k) => k.trim()).filter(Boolean),
        flowDefinition,
        notes: notes.trim() || null,
      }
      if (flowId) {
        const { flow: f } = await apiFetch<{ flow: WhatsappFlow }>('/api/marketing/whatsapp', {
          method: 'PATCH',
          body: JSON.stringify({ id: flowId, ...payload }),
        })
        hydrate(f)
        setMessage('Flow saved.')
      } else {
        const { flow: f } = await apiFetch<{ flow: WhatsappFlow }>('/api/marketing/whatsapp', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        router.replace(`/marketing/whatsapp/${f.id}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save flow.')
    } finally {
      setSaving(false)
    }
  }

  async function transition(toStatus: WhatsappFlowStatus) {
    if (!flowId) return
    setBusy(true); setError(''); setMessage('')
    try {
      const { flow: f } = await apiFetch<{ flow: WhatsappFlow }>('/api/marketing/whatsapp', {
        method: 'PATCH',
        body: JSON.stringify({ id: flowId, action: 'transition', toStatus }),
      })
      hydrate(f)
      setMessage(`Moved to ${WHATSAPP_FLOW_STATUS_LABELS[f.status]}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transition failed.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <p className="text-sm text-gray-400">Loading…</p>

  const allowed = flow ? WHATSAPP_FLOW_TRANSITIONS[flow.status] : []

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="border-b border-gray-100 px-5 py-4 flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-900">{flowId ? 'Edit flow' : 'New flow'}</p>
          {flow && (
            <span className="rounded-full bg-gray-100 px-3 py-0.5 text-xs font-medium text-gray-600">
              {WHATSAPP_FLOW_STATUS_LABELS[flow.status]}
            </span>
          )}
        </div>
        <div className="p-5 space-y-4">
          {message && (
            <div className="flex items-center gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-700">
              <CheckCircle size={16} /> {message}
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Brand">
              <select value={brandId} onChange={(e) => setBrandId(e.target.value)} disabled={Boolean(flowId)} className={`${inputCls} disabled:bg-gray-50`}>
                <option value="">Select…</option>
                {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Field>
            <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} /></Field>
          </div>
          <Field label="Description"><textarea value={description} rows={2} onChange={(e) => setDescription(e.target.value)} className={inputCls} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Trigger type">
              <select value={triggerType} onChange={(e) => setTriggerType(e.target.value)} className={inputCls}>
                {WHATSAPP_TRIGGER_TYPES.map((t) => <option key={t} value={t}>{WHATSAPP_TRIGGER_LABELS[t]}</option>)}
              </select>
            </Field>
            <Field label="Trigger keywords (comma-separated)">
              <input value={keywords} onChange={(e) => setKeywords(e.target.value)} className={inputCls} />
            </Field>
          </div>
          <Field label="Flow definition (JSON)">
            <textarea value={definition} rows={12} onChange={(e) => setDefinition(e.target.value)} className={`${inputCls} font-mono text-xs`} />
          </Field>
          <Field label="Notes"><textarea value={notes} rows={2} onChange={(e) => setNotes(e.target.value)} className={inputCls} /></Field>

          {canEdit && (
            <div className="flex justify-end border-t border-gray-100 pt-4">
              <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60">
                <Save size={16} /> {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          )}
        </div>
      </section>

      {flow && canEdit && (
        <aside className="bg-white rounded-2xl border border-gray-100 shadow-sm h-fit">
          <div className="border-b border-gray-100 px-5 py-3">
            <p className="text-sm font-semibold text-gray-900">Workflow</p>
          </div>
          <div className="p-4 space-y-2">
            {allowed.length === 0 ? (
              <p className="text-xs text-gray-400">No further transitions.</p>
            ) : (
              allowed.map((s) => (
                <button key={s} onClick={() => transition(s)} disabled={busy} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60">
                  Move to {WHATSAPP_FLOW_STATUS_LABELS[s]}
                </button>
              ))
            )}
          </div>
        </aside>
      )}
    </div>
  )
}

const inputCls =
  'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-ocg-navy'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">{label}</span>
      {children}
    </label>
  )
}
