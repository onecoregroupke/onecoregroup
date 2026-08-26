'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Factory, PackageCheck, X } from 'lucide-react'
import { api } from '@/lib/apiClient'
import { finishedGoodsQuantity, formatPackageConfiguration } from '@/lib/finishedGoodsQuantity'
import type { PackagingRequirementSummary } from './StorePanel'

export interface ItemOption {
  id: string
  label: string
  unit: string
  itemType: string
  onHand: number
  packSize: number
  packageConfig: string
  requirements: PackagingRequirementSummary[]
}

interface Line { item_id: string; quantity: string }

/**
 * Start a production run, issue its materials, and transfer the finished goods.
 *
 * The three steps are separate on purpose: issuing deducts raw material and
 * packaging from stock, and only ACCEPTED finished units are added back. A run
 * that produces 100 and rejects 10 must add 90, never 100 — that rule is
 * enforced in the database, and this UI simply cannot express the other thing.
 */
export function ProductionRunPanel({
  brands,
  products,
  materials,
  stores,
}: {
  brands: { id: string; label: string }[]
  products: ItemOption[]
  materials: ItemOption[]
  stores: { id: string; label: string }[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState<'run' | 'materials' | 'output'>('run')
  const [runId, setRunId] = useState<string | null>(null)
  const [runRef, setRunRef] = useState('')

  const [run, setRun] = useState({
    brand_id: brands[0]?.id ?? '', product_item_id: '', planned_quantity: '',
    batch_number: '', production_team: '', notes: '',
  })
  const [lines, setLines] = useState<Line[]>([{ item_id: '', quantity: '' }])
  const [output, setOutput] = useState({
    produced_quantity: '', accepted_quantity: '', rejected_quantity: '0',
    destination_store_id: '', expiry_date: '', remarks: '',
  })

  const product = products.find((p) => p.id === run.product_item_id)
  const planned = Number(run.planned_quantity || 0)
  const requirementGroups = product?.requirements.reduce<Record<string, PackagingRequirementSummary[]>>((groups, requirement) => {
    const key = requirement.requirementGroup || requirement.id
    groups[key] = [...(groups[key] ?? []), requirement]
    return groups
  }, {}) ?? {}

  function reset() {
    setStep('run'); setRunId(null); setRunRef('')
    setRun({ brand_id: brands[0]?.id ?? '', product_item_id: '', planned_quantity: '', batch_number: '', production_team: '', notes: '' })
    setLines([{ item_id: '', quantity: '' }])
    setOutput({ produced_quantity: '', accepted_quantity: '', rejected_quantity: '0', destination_store_id: '', expiry_date: '', remarks: '' })
    setError(''); setOpen(false)
  }

  async function post(body: Record<string, unknown>) {
    setSaving(true); setError('')
    const { ok, data } = await api<{ error?: string; row?: Record<string, unknown> }>('/api/manufacturing', {
      method: 'POST', body: JSON.stringify(body),
    })
    setSaving(false)
    if (!ok) { setError(data?.error ?? 'Something went wrong.'); return null }
    return data.row ?? {}
  }

  async function startRun() {
    if (!run.product_item_id) { setError('Choose the product being made.'); return }
    if (!(Number(run.planned_quantity) > 0)) { setError('Planned quantity must be greater than zero.'); return }
    const row = await post({ action: 'create-run', ...run, planned_quantity: Number(run.planned_quantity) })
    if (!row) return
    setRunId(String(row['id']))
    setRunRef(String(row['run_ref'] ?? ''))
    setOutput((o) => ({ ...o, produced_quantity: run.planned_quantity, accepted_quantity: run.planned_quantity }))
    setStep('materials')
    router.refresh()
  }

  async function issue() {
    const payload = lines
      .filter((l) => l.item_id && Number(l.quantity) > 0)
      .map((l) => ({ item_id: l.item_id, quantity: Number(l.quantity) }))
    if (payload.length === 0) { setStep('output'); return }
    const done = await post({ action: 'issue-materials', run_id: runId, lines: payload })
    if (!done) return
    setStep('output')
    router.refresh()
  }

  async function finish() {
    const produced = Number(output.produced_quantity)
    const accepted = Number(output.accepted_quantity)
    const rejected = Number(output.rejected_quantity || 0)
    if (!(produced > 0)) { setError('Produced quantity must be greater than zero.'); return }
    if (accepted + rejected > produced) { setError('Accepted plus rejected cannot exceed what was produced.'); return }

    const transfer = await post({
      action: 'create-fg-transfer',
      run_id: runId,
      brand_id: run.brand_id,
      item_id: run.product_item_id,
      batch_number: run.batch_number,
      unit: product?.unit ?? 'pcs',
      produced_quantity: produced,
      accepted_quantity: accepted,
      rejected_quantity: rejected,
      destination_store_id: output.destination_store_id || null,
      expiry_date: output.expiry_date || null,
      remarks: output.remarks,
    })
    if (!transfer) return
    const posted = await post({ action: 'post-fg-transfer', id: transfer['id'] })
    if (!posted) return
    reset()
    router.refresh()
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
        <Factory size={15} /> New production run
      </button>
    )
  }

  return (
    <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-ocg-gold">
            Production run {runRef && `· ${runRef}`}
          </p>
          <p className="mt-1 text-sm text-gray-500">
            {step === 'run' && 'What is being made, and how much.'}
            {step === 'materials' && 'Issue raw material and packaging. This deducts them from store.'}
            {step === 'output' && 'Record the output. Only accepted units are added to finished goods.'}
          </p>
        </div>
        <button onClick={reset} className="rounded p-1 text-gray-400 hover:text-gray-600" aria-label="Close">
          <X size={17} />
        </button>
      </div>

      <ol className="mb-4 flex gap-2 text-[11px] font-medium">
        {(['run', 'materials', 'output'] as const).map((s, i) => (
          <li key={s} className={`rounded-full px-2.5 py-1 ${
            step === s ? 'bg-ocg-navy text-white' : 'bg-gray-100 text-gray-400'
          }`}>{i + 1}. {s === 'run' ? 'Plan' : s === 'materials' ? 'Materials' : 'Output'}</li>
        ))}
      </ol>

      {step === 'run' && (
        <div className="grid gap-3 lg:grid-cols-3">
          {brands.length > 1 && (
            <Field label="Brand">
              <select className="input" value={run.brand_id} onChange={(e) => setRun({ ...run, brand_id: e.target.value })}>
                {brands.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
              </select>
            </Field>
          )}
          <Field label="Product">
            <select className="input" value={run.product_item_id} onChange={(e) => setRun({ ...run, product_item_id: e.target.value })}>
              <option value="">Select…</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </Field>
          <Field label={`Planned quantity${product ? ` (${product.unit})` : ''}`}>
            <input type="number" min="0" step="any" className="input" value={run.planned_quantity}
              onChange={(e) => setRun({ ...run, planned_quantity: e.target.value })} />
          </Field>
          <Field label="Batch number">
            <input className="input" value={run.batch_number} onChange={(e) => setRun({ ...run, batch_number: e.target.value })} />
          </Field>
          <Field label="Production team">
            <input className="input" value={run.production_team} onChange={(e) => setRun({ ...run, production_team: e.target.value })} />
          </Field>
          <Field label="Notes">
            <input className="input" value={run.notes} onChange={(e) => setRun({ ...run, notes: e.target.value })} />
          </Field>
          {product && (
            <div className="lg:col-span-3 rounded-lg border border-emerald-100 bg-emerald-50/40 p-3">
              <p className="text-xs font-semibold text-emerald-800">
                {product.packageConfig ? formatPackageConfiguration(product.packageConfig) : product.unit}
                {' · '}{finishedGoodsQuantity(product.onHand, product.packSize).totalLabel} on hand
              </p>
              {finishedGoodsQuantity(product.onHand, product.packSize).cartonLabel && (
                <p className="text-[11px] text-emerald-700">{finishedGoodsQuantity(product.onHand, product.packSize).cartonLabel}</p>
              )}
              <p className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">Packaging requirements</p>
              {Object.keys(requirementGroups).length === 0 ? (
                <p className="mt-1 text-xs text-amber-700">No active packaging compatibility has been mapped for this SKU.</p>
              ) : (
                <div className="mt-1 grid gap-1 sm:grid-cols-2">
                  {Object.entries(requirementGroups).map(([group, options]) => {
                    const oneOf = options[0]?.selectionMode === 'one_of'
                    const capacities = options.map((option) => option.onHand / Math.max(option.quantityPerUnit, 0.00001))
                    const available = oneOf
                      ? capacities.reduce((sum, capacity) => sum + capacity, 0)
                      : Math.min(...capacities)
                    const short = planned > 0 && available < planned
                    return (
                      <div key={group} className={`rounded border px-2 py-1.5 text-xs ${short ? 'border-red-200 bg-red-50 text-red-700' : 'border-white bg-white/80 text-gray-600'}`}>
                        <span className="font-medium">{options[0]?.role}</span>{oneOf ? ' · choose one compatible option' : ' · required'}
                        <span className="block text-[11px]">{options.map((option) => `${option.componentName} (${option.onHand} ${option.unit})`).join(oneOf ? ' OR ' : ' + ')}</span>
                        {planned > 0 && <span className="block text-[10px]">supports {Math.floor(available).toLocaleString()} finished pieces</span>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {step === 'materials' && (
        <div className="space-y-2">
          {lines.map((line, idx) => {
            const mat = materials.find((m) => m.id === line.item_id)
            const short = mat && Number(line.quantity) > mat.onHand
            return (
              <div key={idx} className="flex flex-wrap items-end gap-2">
                <label className="min-w-[180px] flex-1">
                  <span className="mb-1 block text-xs font-medium text-gray-500">Material</span>
                  <select className="input" value={line.item_id}
                    onChange={(e) => setLines((c) => c.map((l, i) => (i === idx ? { ...l, item_id: e.target.value } : l)))}>
                    <option value="">Select…</option>
                    {materials.map((m) => (
                      <option key={m.id} value={m.id}>{m.label} · {m.onHand} {m.unit} on hand</option>
                    ))}
                  </select>
                </label>
                <label className="w-32">
                  <span className="mb-1 block text-xs font-medium text-gray-500">Quantity</span>
                  <input type="number" min="0" step="any" className="input" value={line.quantity}
                    onChange={(e) => setLines((c) => c.map((l, i) => (i === idx ? { ...l, quantity: e.target.value } : l)))} />
                </label>
                <button onClick={() => setLines((c) => c.filter((_, i) => i !== idx))}
                  className="mb-2 rounded p-1 text-gray-300 hover:text-red-500" aria-label="Remove line">
                  <X size={15} />
                </button>
                {short && (
                  <p className="w-full text-xs text-amber-600">
                    Only {mat.onHand} {mat.unit} in stock — the issue will be refused.
                  </p>
                )}
              </div>
            )
          })}
          <button onClick={() => setLines((c) => [...c, { item_id: '', quantity: '' }])}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:border-ocg-gold/40">
            <Plus size={12} /> Add material
          </button>
        </div>
      )}

      {step === 'output' && (
        <div className="grid gap-3 lg:grid-cols-3">
          <Field label={`Produced${product ? ` (${product.unit})` : ''}`}>
            <input type="number" min="0" step="any" className="input" value={output.produced_quantity}
              onChange={(e) => setOutput({ ...output, produced_quantity: e.target.value })} />
          </Field>
          <Field label="Accepted (goes to stock)">
            <input type="number" min="0" step="any" className="input" value={output.accepted_quantity}
              onChange={(e) => setOutput({ ...output, accepted_quantity: e.target.value })} />
          </Field>
          <Field label="Rejected (never stocked)">
            <input type="number" min="0" step="any" className="input" value={output.rejected_quantity}
              onChange={(e) => setOutput({ ...output, rejected_quantity: e.target.value })} />
          </Field>
          {stores.length > 0 && (
            <Field label="Finished goods store">
              <select className="input" value={output.destination_store_id}
                onChange={(e) => setOutput({ ...output, destination_store_id: e.target.value })}>
                <option value="">Default</option>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </Field>
          )}
          <Field label="Expiry date">
            <input type="date" className="input" value={output.expiry_date}
              onChange={(e) => setOutput({ ...output, expiry_date: e.target.value })} />
          </Field>
          <Field label="Remarks">
            <input className="input" value={output.remarks} onChange={(e) => setOutput({ ...output, remarks: e.target.value })} />
          </Field>
        </div>
      )}

      {error && <p className="mt-3 rounded-lg bg-red-50 p-2.5 text-sm text-red-600">{error}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        {step === 'run' && (
          <button onClick={startRun} disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60">
            <Factory size={15} /> {saving ? 'Starting…' : 'Start run'}
          </button>
        )}
        {step === 'materials' && (
          <button onClick={issue} disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60">
            {saving ? 'Issuing…' : 'Issue materials'}
          </button>
        )}
        {step === 'output' && (
          <button onClick={finish} disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60">
            <PackageCheck size={15} /> {saving ? 'Posting…' : 'Complete & transfer to finished goods'}
          </button>
        )}
        <button onClick={reset} className="rounded-lg px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
      </div>
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>
      {children}
    </label>
  )
}
