'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePermissions } from '@/contexts/PermissionsContext'
import { apiFetch } from '@/lib/marketing/client'
import { CrmNav } from '@/components/marketing/CrmNav'
import {
  DEAL_STAGES,
  DEAL_STAGE_LABELS,
  DEAL_TRANSITIONS,
  OPEN_DEAL_STAGES,
  type DealStage,
  type MarketingContact,
  type MarketingDeal,
} from '@/lib/marketing/types'

export default function DealsPage() {
  const { can, isAdmin } = usePermissions()
  const canEdit = isAdmin || can('marketing', 'edit')
  const [deals, setDeals] = useState<MarketingDeal[]>([])
  const [contacts, setContacts] = useState<Map<string, string>>(new Map())
  const [stageFilter, setStageFilter] = useState('open')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [d, c] = await Promise.all([
        apiFetch<{ deals: MarketingDeal[] }>(`/api/marketing/deals?stage=${stageFilter || 'any'}`),
        apiFetch<{ contacts: MarketingContact[] }>('/api/marketing/contacts?stage=any'),
      ])
      setDeals(d.deals ?? [])
      setContacts(new Map((c.contacts ?? []).map((x) => [x.id, x.fullName || x.email || 'Unnamed'])))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load deals.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageFilter])

  const pipeline = useMemo(() => {
    const sums = new Map<DealStage, { count: number; value: number }>()
    for (const s of OPEN_DEAL_STAGES) sums.set(s, { count: 0, value: 0 })
    for (const d of deals) {
      if (!OPEN_DEAL_STAGES.includes(d.stage)) continue
      const e = sums.get(d.stage)!
      e.count += 1
      e.value += d.valueKsh ?? 0
    }
    return sums
  }, [deals])

  async function transition(id: string, toStage: DealStage) {
    setError('')
    try {
      await apiFetch('/api/marketing/deals', {
        method: 'PATCH',
        body: JSON.stringify({ id, action: 'transition', toStage }),
      })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update deal.')
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-bold text-2xl text-gray-900">CRM</h1>
        <p className="text-gray-500 text-sm mt-1">People, deals, and the lead promote queue.</p>
      </div>
      <CrmNav />

      {/* Pipeline summary */}
      <div className="grid gap-3 sm:grid-cols-4">
        {OPEN_DEAL_STAGES.map((s) => {
          const e = pipeline.get(s)!
          return (
            <div key={s} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-gray-400">{DEAL_STAGE_LABELS[s]}</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{e.count}</p>
              <p className="text-xs text-gray-500">Ksh {e.value.toLocaleString()}</p>
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-3">
        <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocg-navy">
          <option value="open">Open</option>
          <option value="any">All</option>
          {DEAL_STAGES.map((s) => <option key={s} value={s}>{DEAL_STAGE_LABELS[s]}</option>)}
        </select>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-5 py-3 font-semibold">Deal</th>
              <th className="px-5 py-3 font-semibold">Contact</th>
              <th className="px-5 py-3 font-semibold">Stage</th>
              <th className="px-5 py-3 font-semibold">Value</th>
              <th className="px-5 py-3 font-semibold">Close</th>
              {canEdit && <th className="px-5 py-3 font-semibold">Move</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={6} className="px-5 py-6 text-gray-400">Loading…</td></tr>
            ) : deals.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-6 text-gray-400">No deals match.</td></tr>
            ) : (
              deals.map((d) => (
                <tr key={d.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-900">{d.name}</td>
                  <td className="px-5 py-3">
                    <Link href={`/marketing/crm/contacts/${d.contactId}`} className="text-gray-600 hover:text-ocg-navy">
                      {contacts.get(d.contactId) ?? '—'}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-gray-600">{DEAL_STAGE_LABELS[d.stage]}</td>
                  <td className="px-5 py-3 text-gray-600">{d.valueKsh != null ? `Ksh ${d.valueKsh.toLocaleString()}` : '—'}</td>
                  <td className="px-5 py-3 text-gray-500 text-xs">{d.expectedCloseDate ?? '—'}</td>
                  {canEdit && (
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1">
                        {DEAL_TRANSITIONS[d.stage].map((s) => (
                          <button key={s} onClick={() => transition(d.id, s)} className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50">
                            {DEAL_STAGE_LABELS[s]}
                          </button>
                        ))}
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
