'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, X } from 'lucide-react'
import { usePermissions } from '@/contexts/PermissionsContext'
import { apiFetch } from '@/lib/marketing/client'
import { CrmNav } from '@/components/marketing/CrmNav'
import {
  LIFECYCLE_STAGES,
  LIFECYCLE_STAGE_LABELS,
  type LifecycleStage,
  type MarketingContact,
} from '@/lib/marketing/types'

const STAGE_BADGE: Record<LifecycleStage, string> = {
  subscriber: 'bg-gray-100 text-gray-600',
  lead: 'bg-slate-100 text-slate-700',
  prospect: 'bg-amber-50 text-amber-700',
  client: 'bg-green-50 text-green-700',
  alumni: 'bg-blue-50 text-blue-700',
}

export default function CrmContactsPage() {
  const { can, isAdmin } = usePermissions()
  const canEdit = isAdmin || can('marketing', 'edit')
  const [contacts, setContacts] = useState<MarketingContact[]>([])
  const [stageFilter, setStageFilter] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showNew, setShowNew] = useState(false)

  // New-contact form
  const [nFullName, setNFullName] = useState('')
  const [nEmail, setNEmail] = useState('')
  const [nCompany, setNCompany] = useState('')
  const [nStage, setNStage] = useState<string>('lead')
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (stageFilter) params.set('stage', stageFilter)
      else params.set('stage', 'any')
      if (query.trim()) params.set('q', query.trim())
      const { contacts: c } = await apiFetch<{ contacts: MarketingContact[] }>(
        `/api/marketing/contacts?${params.toString()}`,
      )
      setContacts(c ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load contacts.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageFilter])

  async function createContact() {
    setSaving(true)
    setError('')
    try {
      await apiFetch('/api/marketing/contacts', {
        method: 'POST',
        body: JSON.stringify({
          fullName: nFullName.trim() || null,
          email: nEmail.trim() || null,
          company: nCompany.trim() || null,
          lifecycleStage: nStage,
        }),
      })
      setShowNew(false)
      setNFullName(''); setNEmail(''); setNCompany(''); setNStage('lead')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create contact.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-bold text-2xl text-gray-900">CRM</h1>
          <p className="text-gray-500 text-sm mt-1">People, deals, and the lead promote queue.</p>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowNew((v) => !v)}
            className="inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            {showNew ? <X size={16} /> : <Plus size={16} />} {showNew ? 'Cancel' : 'New contact'}
          </button>
        )}
      </div>

      <CrmNav />

      {showNew && canEdit && (
        <div className="grid gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm sm:grid-cols-[1fr_1fr_1fr_auto_auto]">
          <input value={nFullName} onChange={(e) => setNFullName(e.target.value)} placeholder="Full name" className={inputCls} />
          <input value={nEmail} onChange={(e) => setNEmail(e.target.value)} placeholder="Email" className={inputCls} />
          <input value={nCompany} onChange={(e) => setNCompany(e.target.value)} placeholder="Company" className={inputCls} />
          <select value={nStage} onChange={(e) => setNStage(e.target.value)} className={inputCls}>
            {LIFECYCLE_STAGES.map((s) => <option key={s} value={s}>{LIFECYCLE_STAGE_LABELS[s]}</option>)}
          </select>
          <button onClick={createContact} disabled={saving} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60">
            {saving ? 'Saving…' : 'Add'}
          </button>
        </div>
      )}

      <div className="grid gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm sm:grid-cols-[1fr_2fr_auto]">
        <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} className={inputCls}>
          <option value="">All stages</option>
          {LIFECYCLE_STAGES.map((s) => <option key={s} value={s}>{LIFECYCLE_STAGE_LABELS[s]}</option>)}
        </select>
        <input
          value={query}
          placeholder="Search name, email, company…"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void load() }}
          className={inputCls}
        />
        <button onClick={() => void load()} className="rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
          Search
        </button>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-5 py-3 font-semibold">Name</th>
              <th className="px-5 py-3 font-semibold">Company</th>
              <th className="px-5 py-3 font-semibold">Stage</th>
              <th className="px-5 py-3 font-semibold">Owner</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={4} className="px-5 py-6 text-gray-400">Loading…</td></tr>
            ) : contacts.length === 0 ? (
              <tr><td colSpan={4} className="px-5 py-6 text-gray-400">No contacts yet.</td></tr>
            ) : (
              contacts.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <Link href={`/marketing/crm/contacts/${c.id}`} className="font-medium text-gray-900 hover:text-ocg-navy">
                      {c.fullName || c.email || 'Unnamed'}
                    </Link>
                    {c.email && <div className="text-xs text-gray-400">{c.email}</div>}
                  </td>
                  <td className="px-5 py-3 text-gray-600">{c.company || '—'}</td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STAGE_BADGE[c.lifecycleStage]}`}>
                      {LIFECYCLE_STAGE_LABELS[c.lifecycleStage]}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-500 text-xs">{c.ownerEmail || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const inputCls =
  'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-ocg-navy'
