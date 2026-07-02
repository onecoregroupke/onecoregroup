'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDownCircle, ArrowUpCircle, CheckCircle2, Plus } from 'lucide-react'
import { api } from '@/lib/apiClient'

type Option = { id: string; label: string; brandId?: string | null }
type Votehead = { id: string; brand_id: string; name: string; kind: string }

/**
 * The daily bookkeeping panel: separate Money In and Money Out forms with the
 * fields accountants asked for — date, amount, reference, reason, votehead
 * (per brand), payment account (running balance updates automatically) — plus
 * inline votehead creation. `brands` is already scoped server-side, so a
 * per-brand accountant only ever sees their own brand here.
 */
export function MoneyForms({
  brands,
  accounts,
  voteheads,
  canEdit,
}: {
  brands: Option[]
  accounts: Option[]
  voteheads: Votehead[]
  canEdit: boolean
}) {
  const router = useRouter()
  const today = new Date().toISOString().slice(0, 10)
  const [direction, setDirection] = useState<'inflow' | 'outflow'>('inflow')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [values, setValues] = useState<Record<string, string>>({
    transaction_date: today,
    brand_id: brands.length === 1 ? brands[0].id : '',
  })

  // Votehead quick-add
  const [showVoteheadForm, setShowVoteheadForm] = useState(false)
  const [newVotehead, setNewVotehead] = useState('')
  const [addingVotehead, setAddingVotehead] = useState(false)

  const brandAccounts = useMemo(
    () => accounts.filter((a) => !values.brand_id || a.brandId === values.brand_id || a.brandId == null),
    [accounts, values.brand_id],
  )
  const brandVoteheads = useMemo(
    () =>
      voteheads.filter(
        (v) =>
          v.brand_id === values.brand_id &&
          (v.kind === 'both' || v.kind === (direction === 'inflow' ? 'income' : 'expense')),
      ),
    [voteheads, values.brand_id, direction],
  )

  function set(name: string, value: string) {
    setValues((current) => ({ ...current, [name]: value }))
  }

  async function submit() {
    setError(''); setSuccess('')
    if (!values.brand_id) { setError('Select the brand.'); return }
    if (!values.amount_ksh || Number(values.amount_ksh) <= 0) { setError('Enter an amount greater than 0.'); return }
    if (!values.description?.trim()) {
      setError(direction === 'inflow' ? 'Enter the source / reason for this income.' : 'Enter the reason for this expenditure.')
      return
    }
    setSaving(true)
    const { ok, data } = await api<{ error?: string; newBalance?: number | null }>('/api/finance', {
      method: 'POST',
      body: JSON.stringify({ action: 'record', values: { ...values, direction } }),
    })
    setSaving(false)
    if (!ok) { setError(data?.error ?? 'Failed to save.'); return }
    setSuccess(
      data.newBalance != null
        ? `Recorded. New account balance: KSh ${Number(data.newBalance).toLocaleString()}.`
        : 'Recorded.',
    )
    setValues((current) => ({
      transaction_date: today,
      brand_id: current.brand_id,
      account_id: current.account_id ?? '',
      votehead_id: current.votehead_id ?? '',
    }))
    router.refresh()
  }

  async function addVotehead() {
    if (!newVotehead.trim() || !values.brand_id) return
    setAddingVotehead(true); setError('')
    const { ok, data } = await api<{ error?: string }>('/api/finance', {
      method: 'POST',
      body: JSON.stringify({
        action: 'votehead',
        values: {
          brand_id: values.brand_id,
          name: newVotehead,
          kind: direction === 'inflow' ? 'income' : 'expense',
        },
      }),
    })
    setAddingVotehead(false)
    if (!ok) { setError(data?.error ?? 'Failed to add votehead.'); return }
    setNewVotehead(''); setShowVoteheadForm(false)
    router.refresh()
  }

  if (!canEdit) return null

  const inflow = direction === 'inflow'

  return (
    <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm" data-tour="money-forms">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ocg-gold">Record money</h2>
          <p className="mt-1 text-sm text-gray-500">Book income and expenditure to a brand votehead. Account balances update automatically.</p>
        </div>
        <div className="flex rounded-lg border border-gray-200 p-1">
          <button
            onClick={() => { setDirection('inflow'); setSuccess(''); setError('') }}
            className={`inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold transition-colors ${inflow ? 'bg-emerald-600 text-white' : 'text-gray-500 hover:text-gray-800'}`}
          >
            <ArrowDownCircle size={15} /> Money in
          </button>
          <button
            onClick={() => { setDirection('outflow'); setSuccess(''); setError('') }}
            className={`inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold transition-colors ${!inflow ? 'bg-red-600 text-white' : 'text-gray-500 hover:text-gray-800'}`}
          >
            <ArrowUpCircle size={15} /> Money out
          </button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-4">
        <Field label="Brand *">
          <select className="input" value={values.brand_id ?? ''} onChange={(e) => { set('brand_id', e.target.value); set('votehead_id', ''); set('account_id', '') }}>
            {brands.length !== 1 && <option value="">Choose brand</option>}
            {brands.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
        </Field>
        <Field label="Date *"><input type="date" className="input" value={values.transaction_date ?? ''} onChange={(e) => set('transaction_date', e.target.value)} /></Field>
        <Field label={inflow ? 'Amount received (KSh) *' : 'Amount sent (KSh) *'}>
          <input type="number" min="0" step="0.01" className="input" value={values.amount_ksh ?? ''} onChange={(e) => set('amount_ksh', e.target.value)} />
        </Field>
        <Field label="Reference"><input className="input" placeholder="M-Pesa code, receipt no…" value={values.reference ?? ''} onChange={(e) => set('reference', e.target.value)} /></Field>

        <Field label="Votehead">
          <div className="flex gap-1.5">
            <select className="input flex-1" value={values.votehead_id ?? ''} onChange={(e) => set('votehead_id', e.target.value)} disabled={!values.brand_id}>
              <option value="">{values.brand_id ? 'Choose votehead' : 'Choose brand first'}</option>
              {brandVoteheads.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            <button type="button" title="Add votehead" onClick={() => setShowVoteheadForm((s) => !s)} disabled={!values.brand_id}
              className="rounded-lg border border-gray-200 px-2.5 text-gray-500 hover:border-ocg-gold hover:text-ocg-gold disabled:opacity-40">
              <Plus size={15} />
            </button>
          </div>
        </Field>
        <Field label="Account (updates balance)">
          <select className="input" value={values.account_id ?? ''} onChange={(e) => set('account_id', e.target.value)}>
            <option value="">No account / cash tin</option>
            {brandAccounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
        </Field>
        <Field label={inflow ? 'Received from' : 'Paid to'}>
          <input className="input" placeholder="Person or organisation" value={values.counterparty_name ?? ''} onChange={(e) => set('counterparty_name', e.target.value)} />
        </Field>
        <Field label="Channel"><input className="input" placeholder="Till, Paybill, bank, cash…" value={values.payment_channel ?? ''} onChange={(e) => set('payment_channel', e.target.value)} /></Field>
      </div>

      {showVoteheadForm && (
        <div className="mt-3 flex items-end gap-2 rounded-lg bg-gray-50 p-3">
          <Field label={`New ${inflow ? 'income' : 'expense'} votehead for this brand`}>
            <input className="input" value={newVotehead} onChange={(e) => setNewVotehead(e.target.value)} placeholder="e.g. Tuition fees, Transport…" />
          </Field>
          <button onClick={addVotehead} disabled={addingVotehead || !newVotehead.trim()}
            className="rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60">
            {addingVotehead ? 'Adding…' : 'Add'}
          </button>
        </div>
      )}

      <Field label={inflow ? 'Source / reason *' : 'Reason for expenditure *'}>
        <textarea className="input mt-3 min-h-[56px]" value={values.description ?? ''} onChange={(e) => set('description', e.target.value)} />
      </Field>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {success && <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-emerald-700"><CheckCircle2 size={15} /> {success}</p>}
      <div className="mt-4 flex justify-end">
        <button onClick={submit} disabled={saving}
          className={`inline-flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-semibold text-white disabled:opacity-60 ${inflow ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}`}>
          {inflow ? <ArrowDownCircle size={16} /> : <ArrowUpCircle size={16} />}
          {saving ? 'Saving…' : inflow ? 'Record money in' : 'Record money out'}
        </button>
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
