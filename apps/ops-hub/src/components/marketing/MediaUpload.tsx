'use client'

import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Trash2, Loader2 } from 'lucide-react'
import { getClient } from '@/lib/supabase'
import { apiFetch } from '@/lib/marketing/client'

function isVideo(url: string): boolean {
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url)
}

export default function MediaUpload({ contentId }: { contentId: string }) {
  const [assets, setAssets] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    apiFetch<{ content: { assetUrls: string[] } }>(`/api/mhub/marketing/content?id=${contentId}`)
      .then((r) => setAssets(r.content?.assetUrls ?? []))
      .catch(() => {})
  }, [contentId])

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    setBusy(true)
    setError('')
    try {
      const {
        data: { session },
      } = await getClient().auth.getSession()
      if (!session) throw new Error('Session expired — sign in again.')
      for (const file of files) {
        const fd = new FormData()
        fd.append('file', file)
        const res = await fetch(`/api/mhub/marketing/content/${contentId}/media`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: fd,
        })
        const json = (await res.json().catch(() => ({}))) as { assetUrls?: string[]; error?: string }
        if (!res.ok) throw new Error(json.error ?? 'Upload failed.')
        if (json.assetUrls) setAssets(json.assetUrls)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function remove(url: string) {
    try {
      const r = await apiFetch<{ assetUrls: string[] }>(`/api/mhub/marketing/content/${contentId}/media`, {
        method: 'DELETE',
        body: JSON.stringify({ url }),
      })
      setAssets(r.assetUrls ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Remove failed.')
    }
  }

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <ImagePlus size={18} className="text-ocg-navy" />
        <h2 className="font-semibold text-gray-900">Media</h2>
      </div>
      <p className="mb-4 text-sm text-gray-500">
        Upload the finished poster, image, or video for this post. Uploads appear in the preview
        grid and travel with the post when it publishes.
      </p>

      {assets.length > 0 && (
        <div className="mb-4 grid grid-cols-3 gap-3 sm:grid-cols-4">
          {assets.map((url) => (
            <div key={url} className="group relative overflow-hidden rounded-lg border border-gray-100 bg-gray-50">
              {isVideo(url) ? (
                <video src={url} className="aspect-square w-full object-cover" muted />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt="" className="aspect-square w-full object-cover" />
              )}
              <button
                onClick={() => remove(url)}
                className="absolute right-1 top-1 rounded-md bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                aria-label="Remove"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:border-ocg-navy">
        {busy ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />}
        {busy ? 'Uploading…' : 'Upload media'}
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={onPick}
          disabled={busy}
        />
      </label>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </section>
  )
}
