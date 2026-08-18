'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Wallet, X, ArrowRight } from 'lucide-react'
import { api } from '@/lib/apiClient'

export interface FloatSummary {
  id: string
  ref: string
  custodian: string
  status: string
  openedOn: string
  totalAvailable: number
  calculated: number
  carryDecision: string
  hasSuccessor: boolean
}

const ksh = (n: number) => `KSh ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/**
 * Float lifecycle controls: open, top up, close against a physical count, and
 * carry the remaining balance into the next cycle.
 *
 * The close dialog shows calculated vs counted and the difference between them,
 * and the server refuses a close where that difference is unexplained or where
 * supporting documents are still outstanding. Those refusals are surfaced
 * verbatim rather than pre-empted, because they are authorization decisions.
 */
export function FloatPanel({
  brands, custodians, defaultBrandId, floats,
}: {
  brands: { id: string; label: string }[]
  custodians: { id: string; label: string }[]
  defaultBrandId: string
  floats: FloatSummary[]
}) {
  const router = useRouter()
  const [mode, setMode] = useState<'none' | 'open' | 'close' | 'carry'>('none')
  const [target, setTarget] = useState<FloatSummary | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [openForm, setOpenForm] = useState({
    brand_id: defaultBrandId, custodian_id: '', custodian: '',
    opening_amount_ksh: '', funding_source: 'bank', funding_reference: '', purpose: '',
  })
  const [closeForm, setCloseForm] = useState({
    physical_balance_ksh: '', variance_explanation: '',
    carry_forward_decision: 'carried', amount_returned_ksh: '', amount_reimbursed_ksh: '', closure_notes: '',
  })
  const [carryForm, setCarryForm] = useState({ opening_amount_ksh: '', funding_reference: '' })

  async function post(body: Record<string, unknown>) {
    setSaving(true); setError('')
    const { ok, data } = await api<{ error?: string }>('/api/petty-cash/floats', {
      method: 'POST', body: JSON.stringify(body),
    })
    setSaving(false)
    if (!ok) { setError(data?.error ?? 'Something went wrong.'); return false }
    setMode('none'); setTarget(null)
    router.refresh()
    return true
  }

  const variance = target && closeForm.physical_balance_ksh !== ''
    ? Number(closeForm.physical_balance_ksh) - target.calculated
    : null

  return (
    <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ocg-gold">Float cycles</h2>
        <button onClick={() => { setMode('open'); setError('') }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-ocg-navy px-3 py-2 text-xs font-medium text-white hover:bg-slate-800">
          <Wallet size={14} /> Open a float
        </button>
      </div>

      {floats.length === 0 ? (
        <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">
          No float cycles yet. Open one to start recording petty cash against it.
        </p>
      ) : (
        <div className="space-y-2">
          {floats.map((f) => {
            const live = !['closed', 'reconciled', 'cancelled'].includes(f.status)
            return (
              <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-100 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-gray-800">
                    {f.ref} · {f.custodian || 'Unassigned'}
                  </p>
                  <p className="text-xs text-gray-400">
                    opened {f.openedOn} · available {ksh(f.totalAvailable)} · balance {ksh(f.calculated)}
                    {f.carryDecision && ` · ${f.carryDecision.replace(/_/g, ' ')}`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`rounded px-2 py-0.5 text-[10px] font-medium capitalize ${
                    live ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
                  }`}>{f.status.replace(/_/g, ' ')}</span>
                  {live && (
                    <button onClick={() => { setTarget(f); setMode('close'); setError('') }}
                      className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:border-ocg-gold/40">
                      Close
                    </button>
                  )}
                  {!live && !f.hasSuccessor && (
                    <button onClick={() => { setTarget(f); setMode('carry'); setError('') }}
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:border-ocg-gold/40">
                      Next cycle <ArrowRight size={11} />
                    </button>
                  )}
                  {!live && f.hasSuccessor && (
                    <span className="text-[10px] text-gray-400">carried forward</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {mode !== 'none' && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          onClick={() => setMode('none')}>
          <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-ocg-gold">
                {mode === 'open' && 'Open a float'}
                {mode === 'close' && `Close ${target?.ref}`}
                {mode === 'carry' && `Next cycle after ${target?.ref}`}
              </p>
              <button onClick={() => setMode('none')} className="rounded p-1 text-gray-400 hover:text-gray-600" aria-label="Close">
                <X size={17} />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
              {mode === 'open' && (
                <>
                  {brands.length > 1 && (
                    <Field label="Brand">
                      <select className="input" value={openForm.brand_id} onChange={(e) => setOpenForm({ ...openForm, brand_id: e.target.value })}>
                        {brands.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
                      </select>
                    </Field>
                  )}
                  <Field label="Custodian">
                    <select className="input" value={openForm.custodian_id}
                      onChange={(e) => {
                        const c = custodians.find((x) => x.id === e.target.value)
                        setOpenForm({ ...openForm, custodian_id: e.target.value, custodian: c?.label ?? '' })
                      }}>
                      <option value="">Select…</option>
                      {custodians.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                  </Field>
                  <Field label="Opening amount (KSh)">
                    <input type="number" step="any" min="0" className="input" value={openForm.opening_amount_ksh}
                      onChange={(e) => setOpenForm({ ...openForm, opening_amount_ksh: e.target.value })} />
                  </Field>
                  <Field label="Funding source">
                    <select className="input" value={openForm.funding_source} onChange={(e) => setOpenForm({ ...openForm, funding_source: e.target.value })}>
                      <option value="bank">Bank</option>
                      <option value="mpesa">M-Pesa</option>
                      <option value="cash">Cash</option>
                    </select>
                  </Field>
                  <Field label="Reference (M-Pesa / bank)">
                    <input className="input" value={openForm.funding_reference} onChange={(e) => setOpenForm({ ...openForm, funding_reference: e.target.value })} />
                  </Field>
                  <Field label="Purpose">
                    <input className="input" value={openForm.purpose} onChange={(e) => setOpenForm({ ...openForm, purpose: e.target.value })} />
                  </Field>
                  <p className="rounded-lg bg-gray-50 p-2.5 text-xs text-gray-500">
                    One custodian may hold only one open float at a time. If they already have one,
                    it must be closed first.
                  </p>
                </>
              )}

              {mode === 'close' && target && (
                <>
                  <div className="rounded-lg bg-gray-50 p-3 text-sm">
                    <div className="flex justify-between"><span className="text-gray-500">Calculated balance</span><span className="font-medium tabular-nums">{ksh(target.calculated)}</span></div>
                  </div>
                  <Field label="Physical cash counted (KSh)">
                    <input type="number" step="any" className="input" value={closeForm.physical_balance_ksh}
                      onChange={(e) => setCloseForm({ ...closeForm, physical_balance_ksh: e.target.value })} autoFocus />
                  </Field>
                  {variance !== null && Math.abs(variance) > 0.005 && (
                    <div className={`rounded-lg p-3 text-sm ${variance < 0 ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`}>
                      Difference of <strong>{ksh(Math.abs(variance))}</strong> {variance < 0 ? 'short' : 'over'}.
                      This must be explained before the float can close.
                    </div>
                  )}
                  <Field label="Explanation of any difference">
                    <textarea className="input min-h-[70px]" value={closeForm.variance_explanation}
                      onChange={(e) => setCloseForm({ ...closeForm, variance_explanation: e.target.value })} />
                  </Field>
                  <Field label="What happens to the balance">
                    <select className="input" value={closeForm.carry_forward_decision}
                      onChange={(e) => setCloseForm({ ...closeForm, carry_forward_decision: e.target.value })}>
                      <option value="carried">Carried into the next float</option>
                      <option value="returned">Returned to the office</option>
                      <option value="reimbursed">Reimbursed to the custodian</option>
                      <option value="written_off">Written off</option>
                    </select>
                  </Field>
                  <p className="rounded-lg bg-gray-50 p-2.5 text-xs text-gray-500">
                    A balance that is carried cannot also be returned or reimbursed — that is the
                    double-count the float cycle exists to prevent.
                  </p>
                  <Field label="Closure notes">
                    <input className="input" value={closeForm.closure_notes} onChange={(e) => setCloseForm({ ...closeForm, closure_notes: e.target.value })} />
                  </Field>
                </>
              )}

              {mode === 'carry' && target && (
                <>
                  <div className="rounded-lg bg-gray-50 p-3 text-sm">
                    <div className="flex justify-between"><span className="text-gray-500">Brought forward</span>
                      <span className="font-medium tabular-nums">
                        {target.carryDecision === 'carried' ? ksh(target.calculated) : ksh(0)}
                      </span>
                    </div>
                    {target.carryDecision !== 'carried' && (
                      <p className="mt-1 text-xs text-gray-500">
                        The previous balance was {target.carryDecision.replace(/_/g, ' ')}, so nothing carries.
                      </p>
                    )}
                  </div>
                  <Field label="New funding for this cycle (KSh)">
                    <input type="number" step="any" min="0" className="input" value={carryForm.opening_amount_ksh}
                      onChange={(e) => setCarryForm({ ...carryForm, opening_amount_ksh: e.target.value })} autoFocus />
                  </Field>
                  <Field label="Reference">
                    <input className="input" value={carryForm.funding_reference} onChange={(e) => setCarryForm({ ...carryForm, funding_reference: e.target.value })} />
                  </Field>
                </>
              )}

              {error && <p className="rounded-lg bg-red-50 p-2.5 text-sm text-red-600">{error}</p>}
            </div>

            <div className="flex shrink-0 justify-end gap-2 border-t border-gray-100 px-5 py-3">
              <button onClick={() => setMode('none')} className="rounded-lg px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
              <button
                disabled={saving}
                onClick={() => {
                  if (mode === 'open') return void post({ action: 'open-float', ...openForm, opening_amount_ksh: Number(openForm.opening_amount_ksh || 0) })
                  if (mode === 'close' && target) return void post({
                    action: 'close-float', float_id: target.id, ...closeForm,
                    physical_balance_ksh: Number(closeForm.physical_balance_ksh || 0),
                    amount_returned_ksh: Number(closeForm.amount_returned_ksh || 0),
                    amount_reimbursed_ksh: Number(closeForm.amount_reimbursed_ksh || 0),
                  })
                  if (mode === 'carry' && target) return void post({
                    action: 'carry-forward', previous_float_id: target.id,
                    opening_amount_ksh: Number(carryForm.opening_amount_ksh || 0),
                    funding_reference: carryForm.funding_reference,
                  })
                }}
                className="rounded-lg bg-ocg-navy px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60">
                {saving ? 'Saving…' : mode === 'open' ? 'Open float' : mode === 'close' ? 'Close float' : 'Open next cycle'}
              </button>
            </div>
          </div>
        </div>
      )}
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
