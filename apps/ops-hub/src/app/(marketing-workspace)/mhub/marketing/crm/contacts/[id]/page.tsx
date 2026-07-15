'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, Save, Plus, CheckCircle, AlertCircle } from 'lucide-react'
import { usePermissions } from '@/contexts/PermissionsContext'
import { apiFetch } from '@/lib/marketing/client'
import {
  LIFECYCLE_STAGES,
  LIFECYCLE_STAGE_LABELS,
  DEAL_STAGE_LABELS,
  DEAL_TRANSITIONS,
  MANUAL_ACTIVITY_KINDS,
  ACTIVITY_KIND_LABELS,
  type ActivityKind,
  type DealStage,
  type MarketingActivity,
  type MarketingContact,
  type MarketingDeal,
} from '@/lib/marketing/types'

function dt(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi', dateStyle: 'medium', timeStyle: 'short' })
}

export default function ContactDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id
  const { can, isAdmin } = usePermissions()
  const canEdit = isAdmin || can('marketing', 'edit')

  const [contact, setContact] = useState<MarketingContact | null>(null)
  const [deals, setDeals] = useState<MarketingDeal[]>([])
  const [activities, setActivities] = useState<MarketingActivity[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  // editable fields
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [company, setCompany] = useState('')
  const [role, setRole] = useState('')
  const [stage, setStage] = useState('lead')
  const [owner, setOwner] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  // activity log form
  const [actKind, setActKind] = useState<string>('note')
  const [actBody, setActBody] = useState('')

  // new deal form
  const [dealName, setDealName] = useState('')
  const [dealValue, setDealValue] = useState('')

  function hydrate(c: MarketingContact) {
    setContact(c)
    setFullName(c.fullName ?? '')
    setEmail(c.email ?? '')
    setPhone(c.phone ?? '')
    setCompany(c.company ?? '')
    setRole(c.role ?? '')
    setStage(c.lifecycleStage)
    setOwner(c.ownerEmail ?? '')
    setNotes(c.notes ?? '')
  }

  async function load() {
    if (!id) return
    setLoading(true)
    try {
      const { contact: c, deals: d, activities: a } = await apiFetch<{
        contact: MarketingContact
        deals: MarketingDeal[]
        activities: MarketingActivity[]
      }>(`/api/mhub/marketing/contacts?id=${id}`)
      hydrate(c)
      setDeals(d ?? [])
      setActivities(a ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load contact.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function saveContact() {
    setSaving(true); setError(''); setMessage('')
    try {
      const { contact: c } = await apiFetch<{ contact: MarketingContact }>('/api/mhub/marketing/contacts', {
        method: 'PATCH',
        body: JSON.stringify({
          id,
          fullName: fullName.trim() || null,
          email: email.trim() || null,
          phone: phone.trim() || null,
          company: company.trim() || null,
          role: role.trim() || null,
          lifecycleStage: stage,
          ownerEmail: owner.trim() || null,
          notes: notes.trim() || null,
        }),
      })
      hydrate(c)
      setMessage('Contact saved.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  async function logActivity() {
    if (!actBody.trim()) return
    setError('')
    try {
      await apiFetch('/api/mhub/marketing/activities', {
        method: 'POST',
        body: JSON.stringify({ contactId: id, kind: actKind, body: actBody.trim() }),
      })
      setActBody('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log activity.')
    }
  }

  async function createDeal() {
    if (!dealName.trim()) return
    setError('')
    try {
      await apiFetch('/api/mhub/marketing/deals', {
        method: 'POST',
        body: JSON.stringify({
          contactId: id,
          name: dealName.trim(),
          valueKsh: dealValue.trim() ? Number(dealValue) : null,
        }),
      })
      setDealName(''); setDealValue('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create deal.')
    }
  }

  async function transitionDeal(dealId: string, toStage: DealStage) {
    setError('')
    try {
      await apiFetch('/api/mhub/marketing/deals', {
        method: 'PATCH',
        body: JSON.stringify({ id: dealId, action: 'transition', toStage }),
      })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update deal.')
    }
  }

  if (loading) return <p className="text-sm text-gray-400">Loading…</p>
  if (!contact) return <p className="text-sm text-gray-400">Contact not found.</p>

  return (
    <div className="space-y-6">
      <Link href="/mhub/marketing/crm" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft size={15} /> Back to contacts
      </Link>

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

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        {/* Details */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4">
            <p className="text-sm font-semibold text-gray-900">{contact.fullName || contact.email || 'Contact'}</p>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name"><input value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputCls} /></Field>
              <Field label="Email"><input value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} /></Field>
              <Field label="Phone"><input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} /></Field>
              <Field label="Company"><input value={company} onChange={(e) => setCompany(e.target.value)} className={inputCls} /></Field>
              <Field label="Role"><input value={role} onChange={(e) => setRole(e.target.value)} className={inputCls} /></Field>
              <Field label="Lifecycle stage">
                <select value={stage} onChange={(e) => setStage(e.target.value)} className={inputCls}>
                  {LIFECYCLE_STAGES.map((s) => <option key={s} value={s}>{LIFECYCLE_STAGE_LABELS[s]}</option>)}
                </select>
              </Field>
              <Field label="Owner email"><input value={owner} onChange={(e) => setOwner(e.target.value)} className={inputCls} /></Field>
            </div>
            <Field label="Notes"><textarea value={notes} rows={3} onChange={(e) => setNotes(e.target.value)} className={inputCls} /></Field>
            {canEdit && (
              <div className="flex justify-end border-t border-gray-100 pt-4">
                <button onClick={saveContact} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60">
                  <Save size={16} /> {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            )}
          </div>

          {/* Deals */}
          <div className="border-t border-gray-100 px-5 py-4">
            <p className="text-sm font-semibold text-gray-900">Deals ({deals.length})</p>
          </div>
          <div className="px-5 pb-5 space-y-3">
            {deals.length === 0 ? (
              <p className="text-xs text-gray-400">No deals on this contact.</p>
            ) : (
              deals.map((d) => (
                <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-100 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900">{d.name}</p>
                    <p className="text-xs text-gray-500">
                      {DEAL_STAGE_LABELS[d.stage]}{d.valueKsh != null ? ` · Ksh ${d.valueKsh.toLocaleString()}` : ''}
                    </p>
                  </div>
                  {canEdit && DEAL_TRANSITIONS[d.stage].length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {DEAL_TRANSITIONS[d.stage].map((s) => (
                        <button key={s} onClick={() => transitionDeal(d.id, s)} className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50">
                          → {DEAL_STAGE_LABELS[s]}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
            {canEdit && (
              <div className="flex flex-wrap gap-2 pt-1">
                <input value={dealName} onChange={(e) => setDealName(e.target.value)} placeholder="Deal name" className={`${inputCls} flex-1 min-w-[160px]`} />
                <input value={dealValue} onChange={(e) => setDealValue(e.target.value)} placeholder="Value Ksh" type="number" className={`${inputCls} w-32`} />
                <button onClick={createDeal} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                  <Plus size={15} /> Add deal
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Activity timeline */}
        <aside className="bg-white rounded-2xl border border-gray-100 shadow-sm h-fit">
          <div className="border-b border-gray-100 px-5 py-4">
            <p className="text-sm font-semibold text-gray-900">Activity</p>
          </div>
          {canEdit && (
            <div className="border-b border-gray-50 p-4 space-y-2">
              <select value={actKind} onChange={(e) => setActKind(e.target.value)} className={inputCls}>
                {MANUAL_ACTIVITY_KINDS.map((k) => <option key={k} value={k}>{ACTIVITY_KIND_LABELS[k as ActivityKind]}</option>)}
              </select>
              <textarea value={actBody} rows={2} onChange={(e) => setActBody(e.target.value)} placeholder="What happened?" className={inputCls} />
              <button onClick={logActivity} className="w-full rounded-lg bg-ocg-navy px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
                Log activity
              </button>
            </div>
          )}
          <div className="max-h-[480px] overflow-y-auto divide-y divide-gray-50">
            {activities.length === 0 ? (
              <p className="p-4 text-xs text-gray-400">No activity yet.</p>
            ) : (
              activities.map((a) => (
                <div key={a.id} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-gray-700">{ACTIVITY_KIND_LABELS[a.kind]}</span>
                    <span className="text-[11px] text-gray-400">{dt(a.occurredAt)}</span>
                  </div>
                  {a.body && <p className="mt-1 text-sm text-gray-600 whitespace-pre-wrap">{a.body}</p>}
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
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
