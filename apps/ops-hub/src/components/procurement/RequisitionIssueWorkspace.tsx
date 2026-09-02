'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ClipboardCheck, PackageMinus, Save } from 'lucide-react'
import type { ProcurementGoodsIssueItemRow, ProcurementGoodsIssueRow } from '@ocg/db'
import { api } from '@/lib/apiClient'
import type { RequisitionIssueDetail } from '@/lib/procurementChain'

interface StoreOption {
  id: string
  label: string
}

interface Props {
  detail: RequisitionIssueDetail
  stores: StoreOption[]
  canEdit: boolean
}

type DraftLine = Record<string, { quantity_issued: string; batch_number: string; remarks: string }>

export function RequisitionIssueWorkspace({ detail, stores, canEdit }: Props) {
  const router = useRouter()
  const draftIssue = detail.issues.find((issue) => issue.kind === 'issue' && issue.status === 'draft') ?? null
  const draftItems = useMemo(
    () => draftIssue ? detail.issueItems.filter((item) => item.issue_id === draftIssue.id) : [],
    [detail.issueItems, draftIssue],
  )
  const [storeId, setStoreId] = useState(draftIssue?.source_store_id ?? commonStore(detail))
  const [documentNumber, setDocumentNumber] = useState(draftIssue?.document_number ?? '')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [lines, setLines] = useState<DraftLine>(() => Object.fromEntries(draftItems.map((item) => [item.id, {
    quantity_issued: Number(item.quantity_issued) > 0 ? String(item.quantity_issued) : '',
    batch_number: item.batch_number ?? '',
    remarks: item.remarks ?? '',
  }])))

  const relatedByIssue = useMemo(() => {
    const map = new Map<string, ProcurementGoodsIssueItemRow[]>()
    for (const item of detail.issueItems) {
      map.set(item.issue_id, [...(map.get(item.issue_id) ?? []), item])
    }
    return map
  }, [detail.issueItems])

  const outstanding = detail.items.some((item) => item.remaining_to_issue > 0)
  const canCreate = canEdit && outstanding && !draftIssue && ['approved', 'ready_for_issue', 'partially_issued'].includes(detail.requisition.status)

  async function createDraft() {
    setBusy('create'); setError('')
    const res = await api<{ ok: boolean; issue?: ProcurementGoodsIssueRow; error?: string }>('/api/procurement/chain', {
      method: 'POST',
      body: JSON.stringify({
        action: 'create-issue-from-requisition',
        id: detail.requisition.id,
        values: { source_store_id: storeId || null },
      }),
    })
    setBusy('')
    if (!res.ok) { setError(res.data.error ?? 'Could not create issue note.'); return }
    router.refresh()
  }

  async function saveDraft(post: boolean) {
    if (!draftIssue) return
    if (post && !documentNumber.trim()) {
      setError('Enter the physical GIN number before posting.')
      return
    }
    setBusy(post ? 'post' : 'save'); setError('')
    const res = await api<{ ok: boolean; error?: string }>('/api/procurement/chain', {
      method: 'POST',
      body: JSON.stringify({
        action: 'update-issue',
        id: draftIssue.id,
        values: {
          document_number: documentNumber.trim(),
          source_store_id: storeId || null,
          store_location: stores.find((store) => store.id === storeId)?.label ?? '',
          items: draftItems.map((item) => {
            const row = lines[item.id] ?? { quantity_issued: '', batch_number: '', remarks: '' }
            return {
              requisition_item_id: item.requisition_item_id,
              inventory_item_id: item.inventory_item_id,
              description: item.description,
              unit: item.unit,
              quantity_approved: item.quantity_approved,
              quantity_issued: Number(row.quantity_issued || 0),
              batch_number: row.batch_number,
              store_location: stores.find((store) => store.id === storeId)?.label ?? '',
              remarks: row.remarks,
            }
          }),
        },
      }),
    })
    if (!res.ok) { setBusy(''); setError(res.data.error ?? 'Could not save issue note.'); return }
    if (post) {
      const posted = await api<{ ok: boolean; error?: string }>('/api/procurement/chain', {
        method: 'POST',
        body: JSON.stringify({ action: 'post-issue', id: draftIssue.id }),
      })
      setBusy('')
      if (!posted.ok) { setError(posted.data.error ?? 'Saved as draft, but posting failed.'); return }
    } else {
      setBusy('')
    }
    router.refresh()
  }

  return (
    <div className="space-y-5">
      {error && <p className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ocg-gold">Material Requisition</p>
            <h1 className="mt-1 text-2xl font-semibold text-gray-900">{detail.requisition.reference ?? 'MRF draft'}</h1>
            <p className="mt-1 text-sm text-gray-500">
              {detail.requisition.status} · {detail.requisition.department || 'No department'} · requested by {detail.requisition.requested_by_name || detail.requisition.requested_by}
            </p>
          </div>
          {canCreate && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <select className="input min-w-[220px]" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
                <option value="">Choose source store</option>
                {stores.map((store) => <option key={store.id} value={store.id}>{store.label}</option>)}
              </select>
              <button disabled={busy !== '' || !storeId} onClick={createDraft}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
                <PackageMinus size={15} /> Issue Materials
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400">
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2">Unit</th>
              <th className="px-3 py-2 text-right">Requested</th>
              <th className="px-3 py-2 text-right">Approved</th>
              <th className="px-3 py-2 text-right">Issued</th>
              <th className="px-3 py-2 text-right">Remaining</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {detail.items.map((item) => (
              <tr key={item.id}>
                <td className="px-3 py-2.5">
                  <p className="font-medium text-gray-800">{item.description || item.inventory_item?.name || 'Item'}</p>
                  {item.inventory_item?.sku && <p className="text-xs text-gray-400">{item.inventory_item.sku}</p>}
                </td>
                <td className="px-3 py-2.5 text-gray-500">{item.unit}</td>
                <td className="px-3 py-2.5 text-right">{Number(item.quantity_requested).toLocaleString()}</td>
                <td className="px-3 py-2.5 text-right">{Number(item.quantity_approved).toLocaleString()}</td>
                <td className="px-3 py-2.5 text-right">{item.issued_to_date.toLocaleString()}</td>
                <td className={`px-3 py-2.5 text-right font-semibold ${item.remaining_to_issue > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                  {item.remaining_to_issue.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {draftIssue && (
        <section className="space-y-4 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Goods Issue Note</h2>
              <p className="mt-1 text-sm text-gray-500">System ref {draftIssue.reference} · against MRF {detail.requisition.reference ?? detail.requisition.id}</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-500">Physical GIN no. *</span>
                <input className="input" value={documentNumber} onChange={(e) => setDocumentNumber(e.target.value)} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-500">Source store *</span>
                <select className="input" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
                  <option value="">Choose source store</option>
                  {stores.map((store) => <option key={store.id} value={store.id}>{store.label}</option>)}
                </select>
              </label>
            </div>
          </div>
          <div className="overflow-x-auto rounded-lg border border-gray-100">
            <table className="w-full min-w-[920px] text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400">
                  <th className="px-3 py-2">Item</th>
                  <th className="px-3 py-2 text-right">Approved</th>
                  <th className="px-3 py-2 text-right">Already issued</th>
                  <th className="px-3 py-2 text-right">Remaining before</th>
                  <th className="px-3 py-2 text-right">Quantity now</th>
                  <th className="px-3 py-2 text-right">Resulting balance</th>
                  <th className="px-3 py-2">Batch</th>
                  <th className="px-3 py-2">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {draftItems.map((item) => {
                  const reqLine = detail.items.find((line) => line.id === item.requisition_item_id)
                  const row = lines[item.id] ?? { quantity_issued: '', batch_number: '', remarks: '' }
                  const now = Number(row.quantity_issued || 0)
                  const remaining = reqLine?.remaining_to_issue ?? Number(item.quantity_approved)
                  const result = Math.max(0, remaining - now)
                  return (
                    <tr key={item.id}>
                      <td className="px-3 py-2.5 text-gray-800">{item.description}</td>
                      <td className="px-3 py-2.5 text-right">{Number(reqLine?.quantity_approved ?? item.quantity_approved).toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-right">{Number(reqLine?.issued_to_date ?? 0).toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-right">{remaining.toLocaleString()}</td>
                      <td className="px-3 py-2.5">
                        <input type="number" min="0" step="any" className="input text-right" value={row.quantity_issued}
                          onChange={(e) => setLines((current) => ({ ...current, [item.id]: { ...row, quantity_issued: e.target.value } }))} />
                      </td>
                      <td className={`px-3 py-2.5 text-right font-semibold ${now > remaining ? 'text-red-700' : 'text-gray-700'}`}>{result.toLocaleString()}</td>
                      <td className="px-3 py-2.5">
                        <input className="input" value={row.batch_number}
                          onChange={(e) => setLines((current) => ({ ...current, [item.id]: { ...row, batch_number: e.target.value } }))} />
                      </td>
                      <td className="px-3 py-2.5">
                        <input className="input" value={row.remarks}
                          onChange={(e) => setLines((current) => ({ ...current, [item.id]: { ...row, remarks: e.target.value } }))} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button disabled={busy !== ''} onClick={() => saveDraft(false)}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 disabled:opacity-60">
              <Save size={15} /> Save draft
            </button>
            <button disabled={busy !== '' || !storeId || !documentNumber.trim()} onClick={() => saveDraft(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
              <ClipboardCheck size={15} /> Post Issue Note
            </button>
          </div>
        </section>
      )}

      <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ocg-gold">Related Issue Notes</h2>
        {detail.issues.length === 0 ? (
          <p className="text-sm text-gray-500">No issue notes have been raised against this MRF yet.</p>
        ) : (
          <div className="space-y-2">
            {detail.issues.map((issue) => (
              <div key={issue.id} className="rounded-lg border border-gray-100 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-gray-800">{issue.document_number || issue.reference || 'Draft issue note'} · {issue.status}</p>
                  <p className="text-xs text-gray-400">{issue.issue_date} · {issue.store_location || 'No store'}</p>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {(relatedByIssue.get(issue.id) ?? []).map((line) => `${Number(line.quantity_issued).toLocaleString()} ${line.unit} ${line.description}`).join(' · ') || 'No quantities entered'}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function commonStore(detail: RequisitionIssueDetail): string {
  const stores = [...new Set(detail.items.map((item) => item.inventory_item?.store_id).filter(Boolean) as string[])]
  return stores.length === 1 ? stores[0]! : ''
}
