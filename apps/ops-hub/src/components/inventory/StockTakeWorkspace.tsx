'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, ClipboardCheck, Lock, Play, Save, Send, TriangleAlert } from 'lucide-react'
import type { InventoryStockCountRow, InventoryStoreRow } from '@ocg/db'
import { api } from '@/lib/apiClient'
import {
  STOCK_TAKE_REASON_CODES,
  stockTakeVariance,
  stockTakeVariancePercent,
} from '@/lib/inventoryStockTakeModel'
import type { StockTakeDetail } from '@/lib/inventoryStockTake'

interface Props {
  stores: InventoryStoreRow[]
  counts: InventoryStockCountRow[]
  detail: StockTakeDetail | null
  canEdit: boolean
}

type LineDraft = Record<string, { counted_quantity: string; reason_code: string; reason: string; notes: string }>

export function StockTakeWorkspace({ stores, counts, detail, canEdit }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [draft, setDraft] = useState<LineDraft>(() => Object.fromEntries((detail?.lines ?? []).map((line) => [line.id, {
    counted_quantity: line.counted_quantity == null ? '' : String(line.counted_quantity),
    reason_code: line.reason_code ?? '',
    reason: line.reason ?? '',
    notes: line.notes ?? '',
  }])))

  const selectedCountId = detail?.count.id
  const linesChanged = useMemo(() => Object.keys(draft).length > 0, [draft])

  async function start(form: FormData) {
    setBusy('start'); setError('')
    const res = await api<{ ok: boolean; count?: InventoryStockCountRow; error?: string }>('/api/inventory/stock-take', {
      method: 'POST',
      body: JSON.stringify({
        action: 'start',
        store_id: form.get('store_id'),
        effective_date: form.get('effective_date'),
        notes: form.get('notes'),
      }),
    })
    setBusy('')
    if (!res.ok || !res.data.count) { setError(res.data.error ?? 'Could not start stock take.'); return }
    router.push(`/inventory/stock-take?id=${res.data.count.id}`)
  }

  async function act(action: string) {
    if (!selectedCountId) return
    setBusy(action); setError('')
    const body = action === 'update-lines'
      ? {
          action,
          count_id: selectedCountId,
          lines: Object.entries(draft).map(([id, row]) => ({
            id,
            counted_quantity: row.counted_quantity === '' ? null : Number(row.counted_quantity),
            reason_code: row.reason_code,
            reason: row.reason,
            notes: row.notes,
          })),
        }
      : { action, count_id: selectedCountId }
    const res = await api<{ ok: boolean; error?: string }>('/api/inventory/stock-take', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    setBusy('')
    if (!res.ok) { setError(res.data.error ?? 'Stock-take action failed.'); return }
    router.refresh()
  }

  return (
    <div className="space-y-6">
      {error && <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {canEdit && (
        <form action={start} className="grid gap-3 rounded-xl border border-gray-100 bg-white p-5 shadow-sm md:grid-cols-[1fr_160px_1fr_auto]">
          <label className="grid gap-1 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Store</span>
            <select name="store_id" required className="input">
              <option value="">Choose store</option>
              {stores.map((store) => <option key={store.id} value={store.id}>{store.name} · {store.store_type}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Effective date</span>
            <input name="effective_date" type="date" required className="input" defaultValue={new Date().toISOString().slice(0, 10)} />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Notes</span>
            <input name="notes" className="input" placeholder="Optional" />
          </label>
          <button disabled={busy === 'start'} className="mt-5 inline-flex items-center justify-center gap-2 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
            <Play size={15} /> Start
          </button>
        </form>
      )}

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <section className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ocg-gold">History</h2>
          <div className="space-y-2">
            {counts.length === 0 ? <p className="text-sm text-gray-500">No stock takes yet.</p> : counts.map((count) => (
              <Link key={count.id} href={`/inventory/stock-take?id=${count.id}`}
                className={`block rounded-lg border px-3 py-2 text-sm ${count.id === selectedCountId ? 'border-ocg-gold bg-amber-50/40' : 'border-gray-100 hover:border-gray-200'}`}>
                <span className="block font-medium text-gray-800">{count.count_ref}</span>
                <span className="text-xs text-gray-400">{count.effective_date} · {count.status}</span>
              </Link>
            ))}
          </div>
        </section>

        {!detail ? (
          <section className="rounded-xl border border-gray-100 bg-white p-6 text-sm text-gray-500 shadow-sm">
            Select a stock take from history or start a new monthly count.
          </section>
        ) : (
          <section className="space-y-4">
            <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ocg-gold">{detail.store?.name ?? 'Store'} stock take</p>
                  <h2 className="mt-1 text-xl font-semibold text-gray-900">{detail.count.count_ref}</h2>
                  <p className="mt-1 text-sm text-gray-500">
                    Status {detail.count.status} · effective {detail.count.effective_date} · frozen {detail.count.frozen_at ? new Date(detail.count.frozen_at).toLocaleString() : 'not frozen'}
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-sm">
                  <MiniStat label="Counted" value={`${detail.summary.counted}/${detail.summary.total}`} />
                  <MiniStat label="Positive" value={detail.summary.positive} />
                  <MiniStat label="Negative" value={detail.summary.negative} />
                </div>
              </div>
              {detail.unsafeMovementCount > 0 && (
                <p className="mt-3 inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                  <TriangleAlert size={15} /> {detail.unsafeMovementCount} ledger movement{detail.unsafeMovementCount === 1 ? '' : 's'} occurred after freeze. Posting is blocked.
                </p>
              )}
            </div>

            <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
              <table className="w-full min-w-[980px] text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400">
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2">Category</th>
                    <th className="px-3 py-2 text-right">System Qty</th>
                    <th className="px-3 py-2 text-right">Physical Qty</th>
                    <th className="px-3 py-2 text-right">Difference</th>
                    <th className="px-3 py-2">Reason</th>
                    <th className="px-3 py-2">Comment</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {detail.lines.map((line) => {
                    const row = draft[line.id] ?? { counted_quantity: '', reason_code: '', reason: '', notes: '' }
                    const counted = row.counted_quantity === '' ? null : Number(row.counted_quantity)
                    const variance = stockTakeVariance(line.expected_quantity, counted)
                    const pct = stockTakeVariancePercent(line.expected_quantity, counted)
                    const locked = !canEdit || detail.count.status === 'posted' || detail.count.status === 'approved'
                    return (
                      <tr key={line.id} className={variance ? 'bg-amber-50/30' : ''}>
                        <td className="px-3 py-2.5">
                          <p className="font-medium text-gray-800">{line.item.name}</p>
                          <p className="text-xs text-gray-400">{line.item.sku || line.item.base_unit || line.item.unit}</p>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-gray-500">{line.item.category || line.item.item_type}</td>
                        <td className="px-3 py-2.5 text-right text-gray-700">{line.expected_quantity.toLocaleString()} {line.item.base_unit || line.item.unit}</td>
                        <td className="px-3 py-2.5">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            disabled={locked}
                            className="input text-right"
                            value={row.counted_quantity}
                            onChange={(e) => setDraft((d) => ({ ...d, [line.id]: { ...row, counted_quantity: e.target.value } }))}
                          />
                        </td>
                        <td className={`px-3 py-2.5 text-right font-semibold ${variance > 0 ? 'text-emerald-700' : variance < 0 ? 'text-red-700' : 'text-gray-500'}`}>
                          {counted == null ? '—' : `${variance > 0 ? '+' : ''}${variance.toLocaleString()}`}
                          {pct != null && <span className="block text-[10px] font-normal text-gray-400">{pct}%</span>}
                          {line.estimated_cost_impact_ksh !== 0 && <span className="block text-[10px] font-normal text-gray-400">KSh {line.estimated_cost_impact_ksh.toLocaleString()}</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          <select disabled={locked || variance === 0} className="input" value={row.reason_code}
                            onChange={(e) => setDraft((d) => ({ ...d, [line.id]: { ...row, reason_code: e.target.value } }))}>
                            <option value="">None</option>
                            {STOCK_TAKE_REASON_CODES.map((reason) => <option key={reason.value} value={reason.value}>{reason.label}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2.5">
                          <input disabled={locked} className="input" value={row.reason}
                            onChange={(e) => setDraft((d) => ({ ...d, [line.id]: { ...row, reason: e.target.value } }))} />
                        </td>
                        <td className="px-3 py-2.5 text-xs text-gray-500">{line.status}{line.movement_id && <span className="block text-emerald-600">movement posted</span>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              {canEdit && detail.count.status !== 'posted' && detail.count.status !== 'approved' && (
                <button disabled={busy !== '' || !linesChanged} onClick={() => act('update-lines')} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 disabled:opacity-60">
                  <Save size={15} /> Save counts
                </button>
              )}
              {canEdit && detail.count.status === 'counting' && (
                <button disabled={busy !== ''} onClick={() => act('submit-review')} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 disabled:opacity-60">
                  <Send size={15} /> Review
                </button>
              )}
              {canEdit && detail.count.status === 'variance_review' && (
                <button disabled={busy !== ''} onClick={() => act('approve')} className="inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
                  <Check size={15} /> Approve
                </button>
              )}
              {canEdit && detail.count.status === 'approved' && (
                <button disabled={busy !== '' || detail.unsafeMovementCount > 0} onClick={() => act('post')} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
                  <ClipboardCheck size={15} /> Approve & Reconcile
                </button>
              )}
              {detail.count.status === 'posted' && <span className="inline-flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 text-sm text-gray-600"><Lock size={15} /> Posted immutable record</span>}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-lg border border-gray-100 px-3 py-2"><p className="font-semibold text-gray-900">{value}</p><p className="text-[10px] uppercase tracking-wider text-gray-400">{label}</p></div>
}
