'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Ban, ShieldCheck, X } from 'lucide-react'
import { api } from '@/lib/apiClient'

/**
 * Blacklist / restore a vendor. Blacklisting requires a written reason so the
 * register always shows WHY a supplier was flagged and who did it.
 */
export function VendorBlacklistButton({ vendorId, vendorName, blacklisted }: {
  vendorId: string
  vendorName: string
  blacklisted: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(nextBlacklisted: boolean) {
    if (nextBlacklisted && !reason.trim()) { setError('State the reason for blacklisting.'); return }
    setSaving(true); setError('')
    const { ok, data } = await api<{ error?: string }>('/api/procurement', {
      method: 'POST',
      body: JSON.stringify({ action: 'blacklist', id: vendorId, blacklisted: nextBlacklisted, reason }),
    })
    setSaving(false)
    if (!ok) { setError(data?.error ?? 'Failed to update.'); return }
    setOpen(false); setReason('')
    router.refresh()
  }

  if (blacklisted) {
    return (
      <button onClick={() => submit(false)} disabled={saving}
        className="inline-flex items-center gap-1 rounded-md border border-emerald-200 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">
        <ShieldCheck size={12} /> {saving ? 'Restoring…' : 'Restore'}
      </button>
    )
  }

  return (
    <>
      <button onClick={() => { setOpen(true); setError('') }}
        className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50">
        <Ban size={12} /> Blacklist
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-semibold text-gray-900">Blacklist {vendorName}</p>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-700"><X size={16} /></button>
            </div>
            <p className="mb-3 text-sm text-gray-500">
              The vendor stays in the register with this reason visible to everyone, but new
              purchases against them are blocked until they are restored.
            </p>
            <textarea
              className="input min-h-[90px]"
              placeholder="Reason — e.g. delivered substandard packaging twice, overbilled on LPO 114…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900">Cancel</button>
              <button onClick={() => submit(true)} disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
                <Ban size={14} /> {saving ? 'Saving…' : 'Blacklist vendor'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
