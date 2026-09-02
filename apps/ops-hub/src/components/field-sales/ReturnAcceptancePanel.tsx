'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PackageCheck } from 'lucide-react'
import { api } from '@/lib/apiClient'

interface RequestLine {
  id: string
  itemName: string
  quantityReturned: number
  conditionNote: string
}

interface Request {
  id: string
  ref: string
  returnDate: string
  salesperson: string
  destinationStoreId: string | null
  lines: RequestLine[]
}

export function ReturnAcceptancePanel({ requests, stores }: {
  requests: Request[]
  stores: { id: string; label: string }[]
}) {
  return (
    <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-ocg-gold">Physical returns awaiting receipt</h2>
      <p className="mt-1 text-xs text-gray-500">Count every unit. All received units leave custody; only accepted sellable units enter the destination store.</p>
      {requests.length === 0 ? <p className="mt-3 rounded-lg bg-gray-50 p-4 text-sm text-gray-500">No return requests awaiting receipt.</p> : (
        <div className="mt-3 space-y-3">{requests.map((request) => <ReturnCard key={request.id} request={request} stores={stores} />)}</div>
      )}
    </section>
  )
}

function ReturnCard({ request, stores }: { request: Request; stores: { id: string; label: string }[] }) {
  const router = useRouter()
  const [storeId, setStoreId] = useState(request.destinationStoreId ?? '')
  const [lines, setLines] = useState(() => request.lines.map((line) => ({
    ...line, accepted: String(line.quantityReturned), rejected: '0', condition: line.conditionNote,
  })))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function post() {
    if (!storeId) { setError('Choose the store receiving accepted stock.'); return }
    if (lines.some((line) => Math.abs(Number(line.accepted) + Number(line.rejected) - line.quantityReturned) > 0.0001)) {
      setError('Accepted plus rejected must equal the physical quantity presented on every line.'); return
    }
    setSaving(true); setError('')
    const result = await api<{ error?: string }>('/api/field-sales', {
      method: 'POST',
      body: JSON.stringify({
        action: 'post-return-note', id: request.id, destination_store_id: storeId,
        lines: lines.map((line) => ({
          line_id: line.id, quantity_accepted: Number(line.accepted),
          quantity_rejected: Number(line.rejected), condition_note: line.condition,
        })),
      }),
    })
    setSaving(false)
    if (!result.ok) { setError(result.data?.error ?? 'Could not post the return.'); return }
    router.refresh()
  }

  return (
    <div className="rounded-lg border border-gray-100 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-gray-800">{request.ref} · {request.salesperson}</p>
        <span className="text-xs text-gray-400">{request.returnDate}</span>
      </div>
      <label className="mt-2 block max-w-sm text-xs font-medium text-gray-500">Receiving store
        <select className="input mt-1" value={storeId} onChange={(e) => setStoreId(e.target.value)}><option value="">Select…</option>{stores.map((store) => <option key={store.id} value={store.id}>{store.label}</option>)}</select>
      </label>
      <div className="mt-2 space-y-2">{lines.map((line, index) => (
        <div key={line.id} className="grid gap-2 rounded bg-gray-50 p-2 sm:grid-cols-[1fr_7rem_7rem_1fr]">
          <span className="text-sm text-gray-700">{line.itemName}<span className="block text-[10px] text-gray-400">presented {line.quantityReturned}</span></span>
          <label className="text-[10px] font-semibold uppercase text-gray-400">Accepted<input type="number" min="0" step="any" className="input mt-1" value={line.accepted} onChange={(e) => setLines((current) => current.map((entry, i) => i === index ? { ...entry, accepted: e.target.value } : entry))} /></label>
          <label className="text-[10px] font-semibold uppercase text-gray-400">Rejected<input type="number" min="0" step="any" className="input mt-1" value={line.rejected} onChange={(e) => setLines((current) => current.map((entry, i) => i === index ? { ...entry, rejected: e.target.value } : entry))} /></label>
          <label className="text-[10px] font-semibold uppercase text-gray-400">Condition<input className="input mt-1" value={line.condition} onChange={(e) => setLines((current) => current.map((entry, i) => i === index ? { ...entry, condition: e.target.value } : entry))} /></label>
        </div>
      ))}</div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <button onClick={post} disabled={saving} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-ocg-navy px-3 py-2 text-xs font-medium text-white disabled:opacity-60"><PackageCheck size={14} />{saving ? 'Posting…' : 'Receive and post return'}</button>
    </div>
  )
}
