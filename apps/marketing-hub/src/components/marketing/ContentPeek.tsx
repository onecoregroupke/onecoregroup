'use client'

// Read-only detail pop-up for a single content item. The calendar opens this
// instead of navigating to the editor so spot checks never leave the board;
// "Edit this post" is the one-click escape hatch into the full editor.

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { AlertCircle, ExternalLink, Pencil, X } from 'lucide-react'
import { apiFetch } from '@/lib/marketing/client'
import {
  CONTENT_STATUS_LABELS,
  CONTENT_TYPE_LABELS,
  PLATFORM_LABELS,
  POSTED_VIA_LABELS,
  type CalendarContentRow,
  type ContentStatus,
  type MarketingBrand,
  type MarketingContent,
  type MarketingPillar,
  type MarketingPlatform,
} from '@/lib/marketing/types'

const STATUS_PILL: Record<ContentStatus, string> = {
  idea: 'bg-gray-100 text-gray-600',
  draft: 'bg-slate-100 text-slate-700',
  review: 'bg-amber-100 text-amber-800',
  approved: 'bg-emerald-100 text-emerald-800',
  scheduled: 'bg-blue-100 text-blue-800',
  published: 'bg-green-100 text-green-800',
  reported: 'bg-violet-100 text-violet-800',
  archived: 'bg-gray-100 text-gray-400',
  publish_failed: 'bg-red-100 text-red-700',
}

function isVideo(url: string): boolean {
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url)
}

// Times are stored UTC and read as Africa/Nairobi (EAT, UTC+3, no DST).
function eatFull(iso: string | null): string {
  if (!iso) return 'Unscheduled'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Unscheduled'
  return d.toLocaleString('en-KE', {
    timeZone: 'Africa/Nairobi',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

interface Props {
  contentId: string
  /** Row already on the calendar — renders the header while the record loads. */
  seed?: CalendarContentRow | null
  brands: MarketingBrand[]
  platforms: MarketingPlatform[]
  pillars: MarketingPillar[]
  onClose: () => void
}

export default function ContentPeek({ contentId, seed, brands, platforms, pillars, onClose }: Props) {
  const [content, setContent] = useState<MarketingContent | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    setContent(null)
    void (async () => {
      try {
        const { content: c } = await apiFetch<{ content: MarketingContent }>(
          `/api/marketing/content?id=${contentId}`,
        )
        if (!cancelled) setContent(c)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load this post.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [contentId])

  // Escape closes; the page behind stays put while the pop-up is open.
  const dialogRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    dialogRef.current?.focus()
  }, [])
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
    }
  }, [onClose])

  const brand = useMemo(
    () => brands.find((b) => b.id === (content?.brandId ?? seed?.brandId)),
    [brands, content?.brandId, seed?.brandId],
  )
  const platform = useMemo(
    () => platforms.find((p) => p.id === (content?.platformId ?? seed?.platformId)),
    [platforms, content?.platformId, seed?.platformId],
  )
  const activePillars = useMemo(
    () => pillars.filter((p) => content?.pillarIds.includes(p.id)),
    [pillars, content],
  )

  const status = content?.status ?? seed?.status ?? 'draft'
  const contentType = content?.contentType ?? seed?.contentType ?? 'post'
  const scheduledAt = content?.scheduledAt ?? seed?.scheduledAt ?? null
  const heading = content?.title || seed?.title || content?.hook || seed?.hook || 'Untitled'
  const accent = seed?.primaryPillarColor ?? activePillars[0]?.colorHex ?? brand?.primaryColor ?? '#1a1a2e'
  const platformLabel = platform ? PLATFORM_LABELS[platform.platform] : null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Post preview: ${heading}`}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl outline-none"
      >
        {/* Header */}
        <div className="flex flex-shrink-0 items-start gap-3 border-b border-gray-100 px-5 py-4">
          <span
            className="mt-1.5 inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
            style={{ backgroundColor: accent }}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wide text-gray-400">
              <span className="font-semibold text-gray-500">
                {brand?.shortName ?? brand?.name ?? seed?.brandName ?? '—'}
              </span>
              {platformLabel && <span>· {platformLabel}</span>}
              <span>· {CONTENT_TYPE_LABELS[contentType]}</span>
            </div>
            <h2 className="mt-1 break-words text-base font-semibold text-gray-900">{heading}</h2>
          </div>
          <span className={`flex-shrink-0 rounded-full px-3 py-0.5 text-xs font-medium ${STATUS_PILL[status]}`}>
            {CONTENT_STATUS_LABELS[status]}
          </span>
          <button
            onClick={onClose}
            className="flex-shrink-0 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close preview"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body — the only scrolling region, so the modal always fits the viewport. */}
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-gray-50 px-4 py-3 text-sm sm:grid-cols-3">
            <Meta label="Scheduled (EAT)" value={eatFull(scheduledAt)} />
            <Meta
              label="Platform"
              value={platformLabel ? `${platformLabel}${platform?.handle ? ` · ${platform.handle}` : ''}` : 'Unassigned'}
            />
            <Meta label="Posted via" value={POSTED_VIA_LABELS[content?.postedVia ?? seed?.postedVia ?? 'manual']} />
            {content?.campaignLabel && <Meta label="Campaign" value={content.campaignLabel} />}
            {content?.publishedAt && <Meta label="Published" value={eatFull(content.publishedAt)} />}
            {content?.ownerEmail && <Meta label="Owner" value={content.ownerEmail} />}
          </dl>

          {activePillars.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {activePillars.map((p) => (
                <span
                  key={p.id}
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-white"
                  style={{ backgroundColor: p.colorHex }}
                >
                  {p.name}
                </span>
              ))}
            </div>
          )}

          {loading ? (
            <p className="text-sm text-gray-400">Loading full post…</p>
          ) : content ? (
            <>
              {content.publishError && (
                <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                  <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                  <span className="break-words">{content.publishError}</span>
                </div>
              )}

              {content.hook && <Block label="Hook">{content.hook}</Block>}

              <Block label="Body">
                {content.bodyMarkdown.trim() ? content.bodyMarkdown : '— no body written yet —'}
              </Block>

              {content.hashtags && <Block label="Hashtags">{content.hashtags}</Block>}
              {content.notes && <Block label="Notes">{content.notes}</Block>}

              {content.assetUrls.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Media</p>
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                    {content.assetUrls.map((url) => (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="overflow-hidden rounded-lg border border-gray-100 bg-gray-50 hover:border-ocg-navy/40"
                      >
                        {isVideo(url) ? (
                          <video src={url} className="aspect-square w-full object-cover" muted />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={url} alt="" className="aspect-square w-full object-cover" />
                        )}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {content.externalUrl && (
                <a
                  href={content.externalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-ocg-navy hover:underline"
                >
                  <ExternalLink size={15} /> View the live post
                </a>
              )}
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-gray-100 px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Close
          </button>
          <Link
            href={`/marketing/content/${contentId}/edit`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            <Pencil size={15} /> Edit this post
          </Link>
        </div>
      </div>
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-gray-800">{value}</dd>
    </div>
  )
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-800">{children}</p>
    </div>
  )
}
