'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import { getClient } from '@/lib/supabase'

export function StockCardPdfButton({ filters }: { filters: Record<string, string | undefined> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function download() {
    setBusy(true)
    setError('')
    try {
      const session = await getClient().auth.getSession()
      const token = session.data.session?.access_token
      const response = await fetch('/api/inventory/stock-cards/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(filters),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? 'Could not generate the stock-card PDF.')
      }
      const url = URL.createObjectURL(await response.blob())
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ?? 'stock-card.pdf'
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (cause) {
      setError((cause as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return <div className="text-right">
    <button onClick={download} disabled={busy} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
      <Download size={15} /> {busy ? 'Preparing…' : 'Download current view'}
    </button>
    {error ? <p className="mt-1 max-w-xs text-xs text-red-600">{error}</p> : null}
  </div>
}
