'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PackageCheck } from 'lucide-react'
import { api } from '@/lib/apiClient'

/** One-click "goods arrived": marks the purchase received and pushes every
 *  line item into the brand's inventory. */
export function ReceiveButton({ purchaseId }: { purchaseId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function receive() {
    setBusy(true); setError('')
    const { ok, data } = await api<{ error?: string }>('/api/procurement', {
      method: 'POST',
      body: JSON.stringify({ action: 'receive', id: purchaseId }),
    })
    setBusy(false)
    if (!ok) { setError(data?.error ?? 'Failed'); return }
    router.refresh()
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button onClick={receive} disabled={busy} title="Mark received and add items to inventory"
        className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60">
        <PackageCheck size={13} /> {busy ? 'Receiving…' : 'Receive'}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  )
}
