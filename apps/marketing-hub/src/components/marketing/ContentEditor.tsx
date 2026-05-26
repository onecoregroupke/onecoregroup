'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, CheckCircle, Save } from 'lucide-react'
import { usePermissions } from '@/contexts/PermissionsContext'
import { apiFetch } from '@/lib/marketing/client'
import {
  CONTENT_TYPES,
  CONTENT_TYPE_LABELS,
  CONTENT_STATUS_LABELS,
  CONTENT_TRANSITIONS,
  type ContentStatus,
  type MarketingBrand,
  type MarketingCampaign,
  type MarketingContent,
  type MarketingPillar,
  type MarketingPlatform,
} from '@/lib/marketing/types'

// The calendar and forms treat wall-clock time as Africa/Nairobi (EAT, UTC+3,
// no DST). These helpers bridge a datetime-local input (naive) and stored UTC.
function isoToEatInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const eat = new Date(d.getTime() + 3 * 60 * 60 * 1000)
  return eat.toISOString().slice(0, 16)
}
function eatInputToIso(input: string): string | null {
  if (!input.trim()) return null
  const d = new Date(`${input}:00+03:00`)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

interface Props {
  contentId?: string
  defaultDate?: string | null     // YYYY-MM-DD (EAT) prefill from calendar
  defaultPlatformId?: string | null
}

export default function ContentEditor({ contentId, defaultDate, defaultPlatformId }: Props) {
  const router = useRouter()
  const { can, isAdmin } = usePermissions()
  const canEdit = isAdmin || can('marketing', 'edit')

  const [brands, setBrands] = useState<MarketingBrand[]>([])
  const [platforms, setPlatforms] = useState<MarketingPlatform[]>([])
  const [pillars, setPillars] = useState<MarketingPillar[]>([])
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>([])
  const [content, setContent] = useState<MarketingContent | null>(null)

  const [brandId, setBrandId] = useState('')
  const [platformId, setPlatformId] = useState(defaultPlatformId ?? '')
  const [campaignId, setCampaignId] = useState('')
  const [contentType, setContentType] = useState('post')
  const [title, setTitle] = useState('')
  const [hook, setHook] = useState('')
  const [body, setBody] = useState('')
  const [hashtags, setHashtags] = useState('')
  const [scheduledInput, setScheduledInput] = useState(
    defaultDate ? `${defaultDate}T09:00` : '',
  )
  const [notes, setNotes] = useState('')
  const [pillarIds, setPillarIds] = useState<string[]>([])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const platformsForBrand = useMemo(
    () => platforms.filter((p) => !brandId || p.brandId === brandId),
    [platforms, brandId],
  )
  const campaignsForBrand = useMemo(
    () => campaigns.filter((c) => !brandId || c.brandId === brandId),
    [campaigns, brandId],
  )

  useEffect(() => {
    void (async () => {
      setLoading(true)
      try {
        const [b, p, pl, cmp] = await Promise.all([
          apiFetch<{ brands: MarketingBrand[] }>('/api/marketing/brands'),
          apiFetch<{ platforms: MarketingPlatform[] }>('/api/marketing/platforms'),
          apiFetch<{ pillars: MarketingPillar[] }>('/api/marketing/pillars'),
          apiFetch<{ campaigns: MarketingCampaign[] }>('/api/marketing/campaigns?status=any'),
        ])
        setBrands(b.brands ?? [])
        setPlatforms(p.platforms ?? [])
        setPillars(pl.pillars ?? [])
        setCampaigns(cmp.campaigns ?? [])

        if (contentId) {
          const { content: c } = await apiFetch<{ content: MarketingContent }>(
            `/api/marketing/content?id=${contentId}`,
          )
          setContent(c)
          setBrandId(c.brandId)
          setPlatformId(c.platformId ?? '')
          setCampaignId(c.campaignId ?? '')
          setContentType(c.contentType)
          setTitle(c.title ?? '')
          setHook(c.hook ?? '')
          setBody(c.bodyMarkdown)
          setHashtags(c.hashtags ?? '')
          setScheduledInput(isoToEatInput(c.scheduledAt))
          setNotes(c.notes ?? '')
          setPillarIds(c.pillarIds)
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
  }, [contentId])

  function togglePillar(id: string) {
    setPillarIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))
  }

  async function save() {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      if (!brandId) throw new Error('Brand is required.')
      const payload = {
        brandId,
        platformId: platformId || null,
        campaignId: campaignId || null,
        contentType,
        title: title.trim() || null,
        hook: hook.trim() || null,
        bodyMarkdown: body,
        hashtags: hashtags.trim() || null,
        scheduledAt: eatInputToIso(scheduledInput),
        notes: notes.trim() || null,
        pillarIds,
      }
      if (contentId) {
        const { content: c } = await apiFetch<{ content: MarketingContent }>('/api/marketing/content', {
          method: 'PATCH',
          body: JSON.stringify({ id: contentId, ...payload }),
        })
        setContent(c)
        setMessage('Content saved.')
      } else {
        const { content: c } = await apiFetch<{ content: MarketingContent }>('/api/marketing/content', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        router.replace(`/marketing/content/${c.id}/edit`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save content.')
    } finally {
      setSaving(false)
    }
  }

  async function transition(toStatus: ContentStatus) {
    if (!contentId) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const extra: Record<string, unknown> = {}
      if (toStatus === 'scheduled') {
        const iso = eatInputToIso(scheduledInput)
        if (!iso) throw new Error('Set a schedule date/time before scheduling.')
        extra.scheduledAt = iso
      }
      const { content: c } = await apiFetch<{ content: MarketingContent }>('/api/marketing/content', {
        method: 'PATCH',
        body: JSON.stringify({ id: contentId, action: 'transition', toStatus, ...extra }),
      })
      setContent(c)
      setMessage(`Moved to ${CONTENT_STATUS_LABELS[c.status]}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transition failed.')
    } finally {
      setBusy(false)
    }
  }

  async function reopen() {
    if (!contentId) return
    setBusy(true)
    try {
      const { content: c } = await apiFetch<{ content: MarketingContent }>('/api/marketing/content', {
        method: 'PATCH',
        body: JSON.stringify({ id: contentId, action: 'reopen', toStatus: 'draft' }),
      })
      setContent(c)
      setMessage('Reopened to Draft.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reopen failed.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <p className="text-sm text-gray-400">Loading…</p>

  const allowed = content ? CONTENT_TRANSITIONS[content.status] : []

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="border-b border-gray-100 px-5 py-4 flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-900">
            {contentId ? 'Edit content' : 'New content'}
          </p>
          {content && (
            <span className="rounded-full bg-gray-100 px-3 py-0.5 text-xs font-medium text-gray-600">
              {CONTENT_STATUS_LABELS[content.status]}
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

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Brand">
              <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className={inputCls}>
                <option value="">Select…</option>
                {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Field>
            <Field label="Platform">
              <select value={platformId} onChange={(e) => setPlatformId(e.target.value)} className={inputCls}>
                <option value="">Unassigned</option>
                {platformsForBrand.map((p) => (
                  <option key={p.id} value={p.id}>{p.platform}{p.handle ? ` (${p.handle})` : ''}</option>
                ))}
              </select>
            </Field>
            <Field label="Type">
              <select value={contentType} onChange={(e) => setContentType(e.target.value)} className={inputCls}>
                {CONTENT_TYPES.map((t) => <option key={t} value={t}>{CONTENT_TYPE_LABELS[t]}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Campaign">
            <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} className={inputCls}>
              <option value="">None</option>
              {campaignsForBrand.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>

          <Field label="Title">
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Hook">
            <input value={hook} onChange={(e) => setHook(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Body (Markdown)">
            <textarea value={body} rows={8} onChange={(e) => setBody(e.target.value)} className={inputCls} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Hashtags">
              <input value={hashtags} onChange={(e) => setHashtags(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Scheduled (EAT)">
              <input
                type="datetime-local"
                value={scheduledInput}
                onChange={(e) => setScheduledInput(e.target.value)}
                className={inputCls}
              />
            </Field>
          </div>
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

      <aside className="space-y-6">
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="border-b border-gray-100 px-5 py-3">
            <p className="text-sm font-semibold text-gray-900">Pillars</p>
          </div>
          <div className="p-4 flex flex-wrap gap-2">
            {pillars.length === 0 ? (
              <p className="text-xs text-gray-400">No pillars defined yet.</p>
            ) : (
              pillars.map((p) => {
                const on = pillarIds.includes(p.id)
                return (
                  <button
                    key={p.id}
                    onClick={() => togglePillar(p.id)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${
                      on ? 'border-transparent text-white' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                    style={on ? { backgroundColor: p.colorHex } : undefined}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: on ? 'rgba(255,255,255,0.7)' : p.colorHex }} />
                    {p.name}
                  </button>
                )
              })
            )}
          </div>
        </section>

        {content && canEdit && (
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm">
            <div className="border-b border-gray-100 px-5 py-3">
              <p className="text-sm font-semibold text-gray-900">Workflow</p>
            </div>
            <div className="p-4 space-y-2">
              {content.status === 'archived' ? (
                <button onClick={reopen} disabled={busy} className={transitionBtn}>
                  Reopen to Draft
                </button>
              ) : allowed.length === 0 ? (
                <p className="text-xs text-gray-400">No further transitions from this status.</p>
              ) : (
                allowed.map((s) => (
                  <button key={s} onClick={() => transition(s)} disabled={busy} className={transitionBtn}>
                    Move to {CONTENT_STATUS_LABELS[s]}
                  </button>
                ))
              )}
            </div>
          </section>
        )}
      </aside>
    </div>
  )
}

const inputCls =
  'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-ocg-navy'
const transitionBtn =
  'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 inline-flex items-center justify-center gap-2'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">{label}</span>
      {children}
    </label>
  )
}
