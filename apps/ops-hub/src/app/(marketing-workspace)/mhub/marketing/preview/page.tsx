'use client'

import { useEffect, useMemo, useState } from 'react'
import { Smartphone, Monitor } from 'lucide-react'
import { apiFetch } from '@/lib/marketing/client'
import {
  PLATFORM_LABELS,
  type MarketingBrand,
  type MarketingContent,
  type MarketingPlatform,
  type PlatformKind,
} from '@/lib/marketing/types'

type Device = 'iphone' | 'desktop'

// Platforms that render as a square profile grid (vs a scrolling feed).
const GRID_PLATFORMS: PlatformKind[] = ['instagram', 'tiktok', 'youtube']

function isVideo(url: string): boolean {
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url)
}
function firstAsset(c: MarketingContent): string | null {
  return c.assetUrls && c.assetUrls.length > 0 ? c.assetUrls[0]! : null
}
function fmtDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })
}

export default function PreviewPage() {
  const [brands, setBrands] = useState<MarketingBrand[]>([])
  const [platforms, setPlatforms] = useState<MarketingPlatform[]>([])
  const [brandId, setBrandId] = useState('')
  const [platformId, setPlatformId] = useState('')
  const [items, setItems] = useState<MarketingContent[]>([])
  const [device, setDevice] = useState<Device>('iphone')
  const [loading, setLoading] = useState(true)

  // Load brands + platforms once.
  useEffect(() => {
    Promise.all([
      apiFetch<{ brands: MarketingBrand[] }>('/api/mhub/marketing/brands'),
      apiFetch<{ platforms: MarketingPlatform[] }>('/api/mhub/marketing/platforms'),
    ])
      .then(([b, p]) => {
        setBrands(b.brands ?? [])
        setPlatforms(p.platforms ?? [])
        if (b.brands?.[0]) setBrandId(b.brands[0].id)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const brand = useMemo(() => brands.find((b) => b.id === brandId) ?? null, [brands, brandId])
  const brandPlatforms = useMemo(
    () => platforms.filter((p) => p.brandId === brandId),
    [platforms, brandId],
  )

  // When brand changes, default the platform to its first.
  useEffect(() => {
    if (brandPlatforms.length > 0) setPlatformId(brandPlatforms[0]!.id)
    else setPlatformId('')
  }, [brandId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load content for the brand+platform.
  useEffect(() => {
    if (!brandId || !platformId) {
      setItems([])
      return
    }
    apiFetch<{ content: MarketingContent[] }>(
      `/api/mhub/marketing/content?brand=${brandId}&platform=${platformId}&status=any`,
    )
      .then((r) => {
        const rows = (r.content ?? []).filter((c) => c.status !== 'archived')
        rows.sort((a, b) => (b.scheduledAt ?? b.createdAt).localeCompare(a.scheduledAt ?? a.createdAt))
        setItems(rows)
      })
      .catch(() => setItems([]))
  }, [brandId, platformId])

  const platform = brandPlatforms.find((p) => p.id === platformId) ?? null
  const layout: 'grid' | 'feed' =
    platform && GRID_PLATFORMS.includes(platform.platform) ? 'grid' : 'feed'
  const handle = platform?.handle || (brand ? `@${brand.slug}` : '')
  const accent = brand?.primaryColor ?? '#1a1a2e'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Preview</h1>
        <p className="mt-1 text-sm text-gray-500">
          See the grid the way it lands on each brand&apos;s social page. Drafts and uploaded media
          appear in place; scheduled posts with no asset yet show a pending-upload tile.
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className={selCls}>
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select value={platformId} onChange={(e) => setPlatformId(e.target.value)} className={selCls}>
          {brandPlatforms.length === 0 && <option value="">No platforms</option>}
          {brandPlatforms.map((p) => (
            <option key={p.id} value={p.id}>
              {PLATFORM_LABELS[p.platform]}{p.handle ? ` · ${p.handle}` : ''}
            </option>
          ))}
        </select>
        <div className="ml-auto inline-flex overflow-hidden rounded-lg border border-gray-200">
          <button
            onClick={() => setDevice('iphone')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm ${device === 'iphone' ? 'bg-ocg-navy text-white' : 'text-gray-600'}`}
          >
            <Smartphone size={15} /> iPhone
          </button>
          <button
            onClick={() => setDevice('desktop')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm ${device === 'desktop' ? 'bg-ocg-navy text-white' : 'text-gray-600'}`}
          >
            <Monitor size={15} /> Desktop
          </button>
        </div>
      </div>

      {/* Device frame */}
      <div className="flex justify-center py-4">
        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : device === 'iphone' ? (
          <IphoneFrame>
            <ProfileHeader brand={brand} handle={handle} accent={accent} count={items.length} compact />
            <Surface items={items} layout={layout} accent={accent} />
          </IphoneFrame>
        ) : (
          <DesktopFrame handle={handle}>
            <ProfileHeader brand={brand} handle={handle} accent={accent} count={items.length} />
            <Surface items={items} layout={layout} accent={accent} wide />
          </DesktopFrame>
        )}
      </div>
    </div>
  )
}

function ProfileHeader({
  brand,
  handle,
  accent,
  count,
  compact,
}: {
  brand: MarketingBrand | null
  handle: string
  accent: string
  count: number
  compact?: boolean
}) {
  return (
    <div className={`flex items-center gap-3 border-b border-gray-100 ${compact ? 'px-3 py-3' : 'px-5 py-4'}`}>
      <div
        className="flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold text-white"
        style={{ backgroundColor: accent }}
      >
        {(brand?.shortName ?? brand?.name ?? 'O').slice(0, 2).toUpperCase()}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-gray-900">{handle}</p>
        <p className="text-xs text-gray-400">{count} posts</p>
      </div>
    </div>
  )
}

function Surface({
  items,
  layout,
  accent,
  wide,
}: {
  items: MarketingContent[]
  layout: 'grid' | 'feed'
  accent: string
  wide?: boolean
}) {
  if (items.length === 0) {
    return <div className="p-8 text-center text-sm text-gray-400">No content for this platform yet.</div>
  }
  if (layout === 'grid') {
    return (
      <div className="grid grid-cols-3 gap-0.5 bg-gray-100 p-0.5">
        {items.map((c) => <Tile key={c.id} c={c} accent={accent} />)}
      </div>
    )
  }
  return (
    <div className={`space-y-4 ${wide ? 'p-5' : 'p-3'}`}>
      {items.map((c) => <FeedCard key={c.id} c={c} accent={accent} />)}
    </div>
  )
}

function pendingUpload(c: MarketingContent): boolean {
  return (c.status === 'scheduled' || c.status === 'approved') && !firstAsset(c)
}

function Tile({ c, accent }: { c: MarketingContent; accent: string }) {
  const asset = firstAsset(c)
  if (asset) {
    return (
      <div className="relative aspect-square overflow-hidden bg-black">
        {isVideo(asset) ? (
          <video src={asset} className="h-full w-full object-cover" muted />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={asset} alt={c.title ?? ''} className="h-full w-full object-cover" />
        )}
      </div>
    )
  }
  if (pendingUpload(c)) {
    return (
      <div className="flex aspect-square flex-col items-center justify-center border border-dashed border-gray-300 bg-gray-50 p-2 text-center">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Pending upload</span>
        <span className="mt-1 text-[10px] text-gray-400">{fmtDate(c.scheduledAt)}</span>
      </div>
    )
  }
  // Draft / idea with no asset → copy placeholder tinted by brand accent.
  return (
    <div className="flex aspect-square flex-col justify-between p-2 text-white" style={{ backgroundColor: accent }}>
      <span className="text-[9px] uppercase tracking-wide opacity-70">{c.status}</span>
      <span className="line-clamp-3 text-[11px] font-medium leading-tight">{c.hook || c.title || 'Untitled'}</span>
    </div>
  )
}

function FeedCard({ c, accent }: { c: MarketingContent; accent: string }) {
  const asset = firstAsset(c)
  return (
    <div className="overflow-hidden rounded-xl border border-gray-100">
      {asset ? (
        isVideo(asset) ? (
          <video src={asset} className="max-h-80 w-full object-cover" controls muted />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={asset} alt={c.title ?? ''} className="max-h-80 w-full object-cover" />
        )
      ) : pendingUpload(c) ? (
        <div className="flex h-40 flex-col items-center justify-center border-b border-dashed border-gray-300 bg-gray-50">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Pending upload</span>
          <span className="mt-1 text-xs text-gray-400">scheduled {fmtDate(c.scheduledAt)}</span>
        </div>
      ) : (
        <div className="flex h-32 items-center p-4 text-white" style={{ backgroundColor: accent }}>
          <span className="text-sm font-medium">{c.hook || c.title || 'Untitled'}</span>
        </div>
      )}
      <div className="p-3">
        <p className="text-xs text-gray-400">{c.status}{c.scheduledAt ? ` · ${fmtDate(c.scheduledAt)}` : ''}</p>
        {(c.title || c.hook) && <p className="mt-1 text-sm text-gray-800">{c.title || c.hook}</p>}
        {c.bodyMarkdown && <p className="mt-1 line-clamp-2 text-xs text-gray-500">{c.bodyMarkdown}</p>}
      </div>
    </div>
  )
}

function IphoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative w-[390px] rounded-[3rem] border-[12px] border-black bg-black shadow-2xl">
      <div className="absolute left-1/2 top-2 z-10 h-6 w-28 -translate-x-1/2 rounded-full bg-black" />
      <div className="h-[760px] overflow-y-auto rounded-[2.2rem] bg-white">
        <div className="h-8" />
        {children}
      </div>
    </div>
  )
}

function DesktopFrame({ handle, children }: { handle: string; children: React.ReactNode }) {
  return (
    <div className="w-full max-w-3xl overflow-hidden rounded-xl border border-gray-200 shadow-2xl">
      <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-100 px-4 py-2.5">
        <span className="h-3 w-3 rounded-full bg-red-400" />
        <span className="h-3 w-3 rounded-full bg-amber-400" />
        <span className="h-3 w-3 rounded-full bg-green-400" />
        <span className="mx-auto rounded bg-white px-3 py-0.5 text-xs text-gray-500">{handle}</span>
      </div>
      <div className="max-h-[760px] overflow-y-auto bg-white">{children}</div>
    </div>
  )
}

const selCls =
  'rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-ocg-navy'
