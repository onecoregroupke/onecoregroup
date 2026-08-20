'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertCircle, CheckCircle, Save } from 'lucide-react'
import { usePermissions } from '@/contexts/PermissionsContext'
import { apiFetch } from '@/lib/marketing/client'
import {
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_TRANSITIONS,
  type CampaignStatus,
  type MarketingBrand,
  type MarketingCampaign,
} from '@/lib/marketing/types'

interface LinkedContent {
  id: string
  title: string | null
  status: string
  scheduledAt: string | null
  publishedAt: string | null
  platformId: string | null
}

function numOrNull(v: string): number | null {
  if (v.trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export default function CampaignEditor({ campaignId }: { campaignId?: string }) {
  const router = useRouter()
  const { can, isAdmin } = usePermissions()
  const canEdit = isAdmin || can('marketing', 'edit')

  const [brands, setBrands] = useState<MarketingBrand[]>([])
  const [campaign, setCampaign] = useState<MarketingCampaign | null>(null)
  const [content, setContent] = useState<LinkedContent[]>([])

  const [brandId, setBrandId] = useState('')
  const [name, setName] = useState('')
  const [goal, setGoal] = useState('')
  const [audience, setAudience] = useState('')
  const [primaryChannel, setPrimaryChannel] = useState('')
  const [secondary, setSecondary] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [utm, setUtm] = useState('')
  const [budget, setBudget] = useState('')
  const [targetLeads, setTargetLeads] = useState('')
  const [targetRevenue, setTargetRevenue] = useState('')
  const [owner, setOwner] = useState('')
  const [notes, setNotes] = useState('')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  function hydrate(c: MarketingCampaign) {
    setCampaign(c)
    setBrandId(c.brandId)
    setName(c.name)
    setGoal(c.goal ?? '')
    setAudience(c.audienceSummary ?? '')
    setPrimaryChannel(c.primaryChannel ?? '')
    setSecondary(c.secondaryChannels.join(', '))
    setStartDate(c.startDate ?? '')
    setEndDate(c.endDate ?? '')
    setUtm(c.utmCampaign ?? '')
    setBudget(c.budgetKsh?.toString() ?? '')
    setTargetLeads(c.targetLeads?.toString() ?? '')
    setTargetRevenue(c.targetRevenueKsh?.toString() ?? '')
    setOwner(c.ownerEmail ?? '')
    setNotes(c.notes ?? '')
  }

  useEffect(() => {
    void (async () => {
      setLoading(true)
      try {
        const b = await apiFetch<{ brands: MarketingBrand[] }>('/api/mhub/marketing/brands')
        setBrands(b.brands ?? [])
        if (campaignId) {
          const { campaign: c, content: linked } = await apiFetch<{
            campaign: MarketingCampaign
            content: LinkedContent[]
          }>(`/api/mhub/marketing/campaigns?id=${campaignId}`)
          hydrate(c)
          setContent(linked ?? [])
        } else if (b.brands?.[0]) {
          setBrandId(b.brands[0].id)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load.')
      } finally {
        setLoading(false)
      }
    })()
  }, [campaignId])

  async function save() {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      if (!brandId) throw new Error('Brand is required.')
      if (!name.trim()) throw new Error('Name is required.')
      const payload = {
        brandId,
        name: name.trim(),
        goal: goal.trim() || null,
        audienceSummary: audience.trim() || null,
        primaryChannel: primaryChannel.trim() || null,
        secondaryChannels: secondary.split(',').map((s) => s.trim()).filter(Boolean),
        startDate: startDate || null,
        endDate: endDate || null,
        utmCampaign: utm.trim() || null,
        budgetKsh: numOrNull(budget),
        targetLeads: numOrNull(targetLeads),
        targetRevenueKsh: numOrNull(targetRevenue),
        ownerEmail: owner.trim() || null,
        notes: notes.trim() || null,
      }
      if (campaignId) {
        const { campaign: c } = await apiFetch<{ campaign: MarketingCampaign }>('/api/mhub/marketing/campaigns', {
          method: 'PATCH',
          body: JSON.stringify({ id: campaignId, ...payload }),
        })
        hydrate(c)
        setMessage('Campaign saved.')
      } else {
        const { campaign: c } = await apiFetch<{ campaign: MarketingCampaign }>('/api/mhub/marketing/campaigns', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        router.replace(`/mhub/marketing/campaigns/${c.id}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save campaign.')
    } finally {
      setSaving(false)
    }
  }

  async function transition(toStatus: CampaignStatus) {
    if (!campaignId) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const { campaign: c } = await apiFetch<{ campaign: MarketingCampaign }>('/api/mhub/marketing/campaigns', {
        method: 'PATCH',
        body: JSON.stringify({ id: campaignId, action: 'transition', toStatus }),
      })
      hydrate(c)
      setMessage(`Moved to ${CAMPAIGN_STATUS_LABELS[c.status]}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transition failed.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <p className="text-sm text-gray-400">Loading…</p>

  const allowed = campaign ? CAMPAIGN_TRANSITIONS[campaign.status] : []

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="border-b border-gray-100 px-5 py-4 flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-900">{campaignId ? 'Edit campaign' : 'New campaign'}</p>
          {campaign && (
            <span className="rounded-full bg-gray-100 px-3 py-0.5 text-xs font-medium text-gray-600">
              {CAMPAIGN_STATUS_LABELS[campaign.status]}
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
              <select value={brandId} onChange={(e) => setBrandId(e.target.value)} disabled={Boolean(campaignId)} className={`${inputCls} disabled:bg-gray-50`}>
                <option value="">Select…</option>
                {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Field>
            <Field label="Name">
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
            </Field>
          </div>
          <Field label="Goal">
            <textarea value={goal} rows={2} onChange={(e) => setGoal(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Audience">
            <textarea value={audience} rows={2} onChange={(e) => setAudience(e.target.value)} className={inputCls} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Primary channel">
              <input value={primaryChannel} onChange={(e) => setPrimaryChannel(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Secondary channels (comma-separated)">
              <input value={secondary} onChange={(e) => setSecondary(e.target.value)} className={inputCls} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Start date">
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls} />
            </Field>
            <Field label="End date">
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputCls} />
            </Field>
          </div>
          <Field label="UTM campaign">
            <input value={utm} onChange={(e) => setUtm(e.target.value)} placeholder="defaults to slug" className={inputCls} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Budget (Ksh)">
              <input type="number" value={budget} onChange={(e) => setBudget(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Target leads">
              <input type="number" value={targetLeads} onChange={(e) => setTargetLeads(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Target revenue (Ksh)">
              <input type="number" value={targetRevenue} onChange={(e) => setTargetRevenue(e.target.value)} className={inputCls} />
            </Field>
          </div>
          <Field label="Owner email">
            <input value={owner} onChange={(e) => setOwner(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Notes">
            <textarea value={notes} rows={2} onChange={(e) => setNotes(e.target.value)} className={inputCls} />
          </Field>

          {canEdit && (
            <div className="flex justify-end border-t border-gray-100 pt-4">
              <button
                onClick={save}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
              >
                <Save size={16} /> {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          )}
        </div>
      </section>

      {campaign && (
        <aside className="space-y-6">
          {canEdit && (
            <section className="bg-white rounded-2xl border border-gray-100 shadow-sm">
              <div className="border-b border-gray-100 px-5 py-3">
                <p className="text-sm font-semibold text-gray-900">Workflow</p>
              </div>
              <div className="p-4 space-y-2">
                {allowed.length === 0 ? (
                  <p className="text-xs text-gray-400">No further transitions from this status.</p>
                ) : (
                  allowed.map((s) => (
                    <button key={s} onClick={() => transition(s)} disabled={busy} className={transitionBtn}>
                      Move to {CAMPAIGN_STATUS_LABELS[s]}
                    </button>
                  ))
                )}
              </div>
            </section>
          )}

          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm">
            <div className="border-b border-gray-100 px-5 py-3">
              <p className="text-sm font-semibold text-gray-900">Content ({content.length})</p>
            </div>
            <div className="divide-y divide-gray-50">
              {content.length === 0 ? (
                <p className="p-4 text-xs text-gray-400">
                  No content attached. Link posts from the content editor’s campaign field.
                </p>
              ) : (
                content.map((c) => (
                  <Link
                    key={c.id}
                    href={`/mhub/marketing/content/${c.id}/edit`}
                    className="flex items-center justify-between gap-2 px-5 py-2.5 hover:bg-gray-50"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-gray-800">{c.title || 'Untitled'}</span>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500">{c.status}</span>
                  </Link>
                ))
              )}
            </div>
          </section>
        </aside>
      )}
    </div>
  )
}

const inputCls =
  'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-ocg-navy'
const transitionBtn =
  'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">{label}</span>
      {children}
    </label>
  )
}
