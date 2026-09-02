'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Factory, PackageCheck, X } from 'lucide-react'
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

export interface RunOption {
  id: string
  label: string
  productItemId: string | null
  actualQuantity: number
  acceptedQuantity: number
  rejectedQuantity: number
  wasteQuantity: number
}

/** Manufacturing captures the plan and actual output only. Stock movement is
 * intentionally absent: MRF → GIN issues inputs, and a linked GTN receives
 * accepted output into the finished-goods store. */
export function ProductionRunPanel({
  brands, products, runs,
}: {
  brands: { id: string; label: string }[]
  products: ItemOption[]
  runs: RunOption[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'plan' | 'output'>('plan')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [run, setRun] = useState({
    brand_id: brands[0]?.id ?? '', product_item_id: '', planned_quantity: '',
    batch_number: '', production_team: '', notes: '',
  })
  const [output, setOutput] = useState({
    run_id: runs[0]?.id ?? '', actual_quantity: '', accepted_quantity: '',
    rejected_quantity: '0', waste_quantity: '0', quality_result: '',
    quality_approved_by: '', expiry_date: '', notes: '',
  })

  const product = products.find((item) => item.id === run.product_item_id)
  const planned = Number(run.planned_quantity || 0)
  const groups = product?.requirements.reduce<Record<string, PackagingRequirementSummary[]>>((all, requirement) => {
    const key = requirement.requirementGroup || requirement.id
    all[key] = [...(all[key] ?? []), requirement]
    return all
  }, {}) ?? {}

  async function post(body: Record<string, unknown>) {
    setSaving(true); setError(''); setMessage('')
    const { ok, data } = await api<{ error?: string; row?: Record<string, unknown> }>('/api/manufacturing', {
      method: 'POST', body: JSON.stringify(body),
    })
    setSaving(false)
    if (!ok) { setError(data?.error ?? 'Something went wrong.'); return null }
    return data.row ?? {}
  }

  async function createRun() {
    if (!run.product_item_id || !(Number(run.planned_quantity) > 0)) {
      setError('Choose a product and enter a planned quantity greater than zero.'); return
    }
    const row = await post({ action: 'create-run', ...run, planned_quantity: Number(run.planned_quantity) })
    if (!row) return
    setMessage(`${String(row['run_ref'] ?? 'Production run')} created. Raise its MRF below; approval will not move stock.`)
    router.refresh()
  }

  async function recordOutput() {
    const actual = Number(output.actual_quantity)
    const accepted = Number(output.accepted_quantity)
    const rejected = Number(output.rejected_quantity || 0)
    if (!output.run_id || actual < 0 || accepted < 0 || rejected < 0 || accepted + rejected > actual) {
      setError('Choose a run. Accepted plus rejected must not exceed produced output.'); return
    }
    const row = await post({
      action: 'record-output', ...output,
      actual_quantity: actual, accepted_quantity: accepted,
      rejected_quantity: rejected, waste_quantity: Number(output.waste_quantity || 0),
      expiry_date: output.expiry_date || null,
    })
    if (!row) return
    setMessage('Output recorded for reconciliation. No stock moved; post a linked GTN to receive accepted goods.')
    router.refresh()
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
        <Factory size={15} /> Production run
      </button>
    )
  }

  return (
    <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-ocg-gold">Production execution</p>
          <p className="mt-1 text-sm text-gray-500">Plan the run or record actual output. Neither action changes inventory.</p>
        </div>
        <button onClick={() => setOpen(false)} className="rounded p-1 text-gray-400 hover:text-gray-600" aria-label="Close"><X size={17} /></button>
      </div>

      <div className="mb-4 flex gap-2">
        <ModeButton active={mode === 'plan'} onClick={() => setMode('plan')}>Plan run</ModeButton>
        <ModeButton active={mode === 'output'} onClick={() => setMode('output')}>Record output</ModeButton>
      </div>

      {mode === 'plan' ? (
        <div className="grid gap-3 lg:grid-cols-3">
          {brands.length > 1 && <Field label="Brand"><select className="input" value={run.brand_id} onChange={(e) => setRun({ ...run, brand_id: e.target.value })}>{brands.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}</select></Field>}
          <Field label="Finished product"><select className="input" value={run.product_item_id} onChange={(e) => setRun({ ...run, product_item_id: e.target.value })}><option value="">Select…</option>{products.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></Field>
          <Field label={`Planned quantity${product ? ` (${product.unit})` : ''}`}><input type="number" min="0" step="any" className="input" value={run.planned_quantity} onChange={(e) => setRun({ ...run, planned_quantity: e.target.value })} /></Field>
          <Field label="Batch number"><input className="input" value={run.batch_number} onChange={(e) => setRun({ ...run, batch_number: e.target.value })} /></Field>
          <Field label="Production team"><input className="input" value={run.production_team} onChange={(e) => setRun({ ...run, production_team: e.target.value })} /></Field>
          <Field label="Notes"><input className="input" value={run.notes} onChange={(e) => setRun({ ...run, notes: e.target.value })} /></Field>
          {product && (
            <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 p-3 lg:col-span-3">
              <p className="text-xs font-semibold text-emerald-800">{product.packageConfig ? formatPackageConfiguration(product.packageConfig) : product.unit} · {finishedGoodsQuantity(product.onHand, product.packSize).totalLabel} on hand</p>
              <p className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">BOM readiness</p>
              {Object.keys(groups).length === 0 ? <p className="mt-1 text-xs text-amber-700">No active packaging compatibility is mapped.</p> : (
                <div className="mt-1 grid gap-1 sm:grid-cols-2">{Object.entries(groups).map(([key, options]) => {
                  const oneOf = options[0]?.selectionMode === 'one_of'
                  const capacities = options.map((option) => option.onHand / Math.max(option.quantityPerUnit, 0.00001))
                  const available = oneOf ? capacities.reduce((sum, value) => sum + value, 0) : Math.min(...capacities)
                  const short = planned > 0 && available < planned
                  return <div key={key} className={`rounded border px-2 py-1.5 text-xs ${short ? 'border-red-200 bg-red-50 text-red-700' : 'border-white bg-white/80 text-gray-600'}`}><span className="font-medium">{options[0]?.role}</span>{oneOf ? ' · choose one' : ' · required'}<span className="block text-[11px]">{options.map((option) => `${option.componentName} (${option.onHand} ${option.unit})`).join(oneOf ? ' OR ' : ' + ')}</span></div>
                })}</div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-3">
          <Field label="Production run"><select className="input" value={output.run_id} onChange={(e) => setOutput({ ...output, run_id: e.target.value })}><option value="">Select…</option>{runs.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select></Field>
          <Field label="Produced"><input type="number" min="0" step="any" className="input" value={output.actual_quantity} onChange={(e) => setOutput({ ...output, actual_quantity: e.target.value })} /></Field>
          <Field label="Accepted by quality"><input type="number" min="0" step="any" className="input" value={output.accepted_quantity} onChange={(e) => setOutput({ ...output, accepted_quantity: e.target.value })} /></Field>
          <Field label="Rejected"><input type="number" min="0" step="any" className="input" value={output.rejected_quantity} onChange={(e) => setOutput({ ...output, rejected_quantity: e.target.value })} /></Field>
          <Field label="Waste"><input type="number" min="0" step="any" className="input" value={output.waste_quantity} onChange={(e) => setOutput({ ...output, waste_quantity: e.target.value })} /></Field>
          <Field label="Quality result"><input className="input" value={output.quality_result} onChange={(e) => setOutput({ ...output, quality_result: e.target.value })} /></Field>
          <Field label="Quality approved by"><input className="input" value={output.quality_approved_by} onChange={(e) => setOutput({ ...output, quality_approved_by: e.target.value })} /></Field>
          <Field label="Expiry date"><input type="date" className="input" value={output.expiry_date} onChange={(e) => setOutput({ ...output, expiry_date: e.target.value })} /></Field>
          <Field label="Notes"><input className="input" value={output.notes} onChange={(e) => setOutput({ ...output, notes: e.target.value })} /></Field>
        </div>
      )}

      {error && <p className="mt-3 rounded-lg bg-red-50 p-2.5 text-sm text-red-600">{error}</p>}
      {message && <p className="mt-3 rounded-lg bg-emerald-50 p-2.5 text-sm text-emerald-700">{message}</p>}
      <button onClick={mode === 'plan' ? createRun : recordOutput} disabled={saving} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60">
        {mode === 'plan' ? <Factory size={15} /> : <PackageCheck size={15} />}{saving ? 'Saving…' : mode === 'plan' ? 'Create run' : 'Save output (no stock movement)'}
      </button>
    </section>
  )
}

function ModeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={`rounded-full px-3 py-1.5 text-xs font-medium ${active ? 'bg-ocg-navy text-white' : 'bg-gray-100 text-gray-500'}`}>{children}</button>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>{children}</label>
}
