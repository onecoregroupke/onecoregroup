'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { RotateCcw } from 'lucide-react'
import { api } from '@/lib/apiClient'

interface PositionOption {
  key: string
  itemId: string
  productionStoreId: string | null
  label: string
  batch: string
  state: string
  quantity: number
  unit: string
}

export function ReworkStagingPanel({ positions, runs, incidents }: {
  positions: PositionOption[]
  runs: Array<{ id: string; label: string; incidentId: string | null }>
  incidents: Array<{ id: string; label: string }>
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [values, setValues] = useState({ positionKey: '', runId: '', incidentId: '', quantity: '', reason: '' })
  const position = useMemo(() => positions.find((row) => row.key === values.positionKey), [positions, values.positionKey])
  const run = runs.find((row) => row.id === values.runId)

  async function submit() {
    if (!position || !run) return
    setBusy(true)
    setError('')
    const result = await api<{ error?: string }>('/api/manufacturing', {
      method: 'POST',
      body: JSON.stringify({
        action: 'stage-production-rework',
        item_id: position.itemId,
        production_store_id: position.productionStoreId,
        batch_number: position.batch,
        source_state: position.state,
        quantity: Number(values.quantity),
        unit: position.unit,
        production_run_id: run.id,
        quality_incident_id: values.incidentId || run.incidentId || null,
        reason: values.reason,
        idempotency_key: crypto.randomUUID(),
      }),
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.data.error ?? 'Production stock could not be staged for rework.')
      return
    }
    setOpen(false)
    setValues({ positionKey: '', runId: '', incidentId: '', quantity: '', reason: '' })
    router.refresh()
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-lg border border-purple-200 bg-purple-50 px-4 py-2 text-sm font-medium text-purple-800">
        <RotateCcw size={15} /> Allocate Production stock to rework
      </button>
    )
  }

  return (
    <section className="rounded-xl border border-purple-100 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ocg-gold">Existing Production stock → linked run input</h2>
          <p className="mt-1 text-sm text-gray-500">Allocate WIP or packaging already held in Production without inventing a new GIN. Total Production custody remains unchanged.</p>
        </div>
        <button onClick={() => setOpen(false)} className="text-xs font-medium text-gray-500">Close</button>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <Field label="Production position">
          <select className="input" value={values.positionKey} onChange={(event) => setValues({ ...values, positionKey: event.target.value, quantity: '' })}>
            <option value="">Select…</option>
            {positions.map((row) => <option key={row.key} value={row.key}>{row.label} · {row.quantity} {row.unit}</option>)}
          </select>
        </Field>
        <Field label="Rework / recovery run">
          <select className="input" value={values.runId} onChange={(event) => {
            const next = runs.find((row) => row.id === event.target.value)
            setValues({ ...values, runId: event.target.value, incidentId: next?.incidentId ?? values.incidentId })
          }}>
            <option value="">Select…</option>
            {runs.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
          </select>
        </Field>
        <Field label="Quality incident">
          <select className="input" value={values.incidentId} onChange={(event) => setValues({ ...values, incidentId: event.target.value })}>
            <option value="">Optional</option>
            {incidents.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
          </select>
        </Field>
        <Field label={`Quantity${position ? ` (${position.unit})` : ''}`}>
          <input className="input" type="number" min="0" max={position?.quantity} step="any" value={values.quantity} onChange={(event) => setValues({ ...values, quantity: event.target.value })} />
        </Field>
        <Field label="Reason">
          <input className="input" value={values.reason} onChange={(event) => setValues({ ...values, reason: event.target.value })} />
        </Field>
      </div>
      {error ? <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p> : null}
      <button disabled={busy || !position || !run || !(Number(values.quantity) > 0) || !values.reason.trim()} onClick={submit} className="mt-4 rounded-lg bg-ocg-navy px-5 py-2 text-sm font-medium text-white disabled:opacity-50">
        {busy ? 'Allocating…' : 'Allocate to run'}
      </button>
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label><span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>{children}</label>
}
