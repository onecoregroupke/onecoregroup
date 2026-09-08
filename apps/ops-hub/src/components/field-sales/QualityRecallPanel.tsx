'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldAlert } from 'lucide-react'
import { api } from '@/lib/apiClient'

export function QualityRecallPanel({ allocations, custody, items, incidents, productionStores }: {
  allocations: Array<{ id: string; label: string; salespersonId: string | null }>
  custody: Array<{ salespersonId: string | null; itemId: string; balance: number }>
  items: Array<{ id: string; label: string; unit: string }>
  incidents: Array<{ id: string; label: string; itemId: string | null; salespersonId: string | null; allocationId: string | null }>
  productionStores: Array<{ id: string; label: string }>
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [values, setValues] = useState({ allocation_id: '', item_id: '', quantity: '', batch_number: '', quality_incident_id: '', production_store_id: productionStores[0]?.id ?? '' })
  const allocation = allocations.find((row) => row.id === values.allocation_id)
  const held = useMemo(() => custody.filter((row) => row.salespersonId === allocation?.salespersonId && row.balance > 0), [allocation?.salespersonId, custody])
  const item = items.find((row) => row.id === values.item_id)
  const available = held.find((row) => row.itemId === values.item_id)?.balance ?? 0
  const eligibleIncidents = incidents.filter((incident) => (!incident.itemId || incident.itemId === values.item_id) && (!incident.salespersonId || incident.salespersonId === allocation?.salespersonId) && (!incident.allocationId || incident.allocationId === values.allocation_id))

  async function submit() {
    setBusy(true); setError(''); setMessage('')
    const result = await api<{ error?: string }>('/api/field-sales', { method: 'POST', body: JSON.stringify({ action: 'quality-recall-to-production', ...values, salesperson_id: allocation?.salespersonId, quantity: Number(values.quantity), idempotency_key: crypto.randomUUID() }) })
    setBusy(false)
    if (!result.ok) { setError(result.data.error ?? 'Recall could not be posted.'); return }
    setMessage('Recall posted: salesperson custody reduced and Production custody increased. Finished Goods was not touched.')
    router.refresh()
  }

  if (!open) return <button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800"><ShieldAlert size={15} /> Quality recall to Production</button>
  return <section className="rounded-xl border border-amber-100 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xs font-semibold uppercase tracking-wider text-ocg-gold">Authorised quality recall</h2><p className="mt-1 text-sm text-gray-500">The original allocation and approved incident are mandatory. This never routes stock through Finished Goods.</p></div><button onClick={() => setOpen(false)} className="text-xs font-medium text-gray-500">Close</button></div><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5"><Field label="Original delivery note"><select className="input" value={values.allocation_id} onChange={(event) => setValues({ ...values, allocation_id: event.target.value, item_id: '', quality_incident_id: '' })}><option value="">Select…</option>{allocations.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}</select></Field><Field label="SKU in salesperson custody"><select className="input" value={values.item_id} onChange={(event) => setValues({ ...values, item_id: event.target.value, quality_incident_id: '' })}><option value="">Select…</option>{held.map((position) => { const option = items.find((row) => row.id === position.itemId); return option ? <option key={option.id} value={option.id}>{option.label} · {position.balance} {option.unit}</option> : null })}</select></Field><Field label={`Quantity${item ? ` (${item.unit})` : ''}`}><input className="input" type="number" min="0" max={available || undefined} step="any" value={values.quantity} onChange={(event) => setValues({ ...values, quantity: event.target.value })} /></Field><Field label="Affected batch"><input className="input" value={values.batch_number} onChange={(event) => setValues({ ...values, batch_number: event.target.value })} /></Field><Field label="Approved incident"><select className="input" value={values.quality_incident_id} onChange={(event) => setValues({ ...values, quality_incident_id: event.target.value })}><option value="">Select…</option>{eligibleIncidents.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}</select></Field>{productionStores.length > 1 ? <Field label="Production store"><select className="input" value={values.production_store_id} onChange={(event) => setValues({ ...values, production_store_id: event.target.value })}>{productionStores.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}</select></Field> : null}</div>{error ? <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p> : null}{message ? <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p> : null}<button disabled={busy || !allocation?.salespersonId || !values.item_id || !values.quality_incident_id || !(Number(values.quantity) > 0)} onClick={submit} className="mt-4 rounded-lg bg-ocg-navy px-5 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? 'Posting…' : 'Post direct recall'}</button></section>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label><span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>{children}</label> }
