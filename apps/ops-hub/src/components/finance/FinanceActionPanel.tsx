'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { api } from '@/lib/apiClient'

type Option = { id: string; label: string; brandId?: string | null }
type Mode = 'account' | 'transaction' | 'transfer' | 'reconciliation' | 'exception'

const MODE_LABEL: Record<Mode, string> = {
  account: 'Payment account',
  transaction: 'Transaction',
  transfer: 'Inter-brand transfer',
  reconciliation: 'Reconciliation batch',
  exception: 'Finance exception',
}

const MODE_TYPE: Record<Mode, string> = {
  account: 'finance_account',
  transaction: 'finance_transaction',
  transfer: 'finance_transfer',
  reconciliation: 'finance_reconciliation_batch',
  exception: 'finance_exception',
}

export function FinanceActionPanel({
  brands,
  accounts,
  transactions,
  team,
}: {
  brands: Option[]
  accounts: Option[]
  transactions: Option[]
  team: Option[]
}) {
  const router = useRouter()
  const today = new Date().toISOString().slice(0, 10)
  const [mode, setMode] = useState<Mode>('transaction')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [values, setValues] = useState<Record<string, string>>({
    account_type: 'mpesa_till',
    legal_owner: 'business',
    reconciliation_status: 'unmatched',
    direction: 'inflow',
    category: 'sales',
    transaction_date: today,
    transfer_date: today,
    status: 'pending_reconciliation',
    period_start: today.slice(0, 8) + '01',
    period_end: today,
    exception_type: 'unreconciled',
    severity: 'Medium',
    due_date: today,
  })

  function set(name: string, value: string) {
    setValues((current) => ({ ...current, [name]: value }))
  }

  function requiredFor(m: Mode): string | null {
    if (m === 'account') return values.account_name?.trim() ? null : 'Account name is required.'
    if (m === 'transaction') {
      if (!values.amount_ksh?.trim()) return 'Amount is required.'
      return values.description?.trim() ? null : 'Description is required.'
    }
    if (m === 'transfer') {
      if (!values.amount_ksh?.trim()) return 'Amount is required.'
      return values.purpose?.trim() ? null : 'Purpose is required.'
    }
    if (m === 'exception') return values.title?.trim() ? null : 'Exception title is required.'
    return null
  }

  async function submit() {
    setError('')
    const problem = requiredFor(mode)
    if (problem) {
      setError(problem)
      return
    }
    setSaving(true)
    const { ok, data } = await api<{ error?: string }>('/api/management', {
      method: 'POST',
      body: JSON.stringify({ type: MODE_TYPE[mode], values }),
    })
    setSaving(false)
    if (!ok) {
      setError(data?.error ?? 'Failed to save.')
      return
    }
    setValues((current) => ({
      account_type: current.account_type ?? 'mpesa_till',
      legal_owner: current.legal_owner ?? 'business',
      reconciliation_status: current.reconciliation_status ?? 'unmatched',
      direction: current.direction ?? 'inflow',
      category: current.category ?? 'sales',
      transaction_date: today,
      transfer_date: today,
      status: current.status ?? 'pending_reconciliation',
      period_start: current.period_start ?? today.slice(0, 8) + '01',
      period_end: today,
      exception_type: current.exception_type ?? 'unreconciled',
      severity: current.severity ?? 'Medium',
      due_date: current.due_date ?? today,
    }))
    router.refresh()
  }

  return (
    <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ocg-gold">Finance actions</h2>
          <p className="mt-1 text-sm text-gray-500">Capture accounts, cash movements, transfers, reconciliation work, and exceptions.</p>
        </div>
        <select className="input sm:w-56" value={mode} onChange={(event) => setMode(event.target.value as Mode)}>
          {(Object.keys(MODE_LABEL) as Mode[]).map((key) => <option key={key} value={key}>{MODE_LABEL[key]}</option>)}
        </select>
      </div>

      {mode === 'account' && (
        <div className="grid gap-3 lg:grid-cols-4">
          <Field label="Account name"><input className="input" value={values.account_name ?? ''} onChange={(e) => set('account_name', e.target.value)} /></Field>
          <Field label="Brand"><Select options={brands} value={values.brand_id ?? ''} onChange={(v) => set('brand_id', v)} empty="Shared / group" /></Field>
          <Field label="Type">
            <select className="input" value={values.account_type ?? ''} onChange={(e) => set('account_type', e.target.value)}>
              <optgroup label="Cash & channels">
                <option value="cash">Cash</option>
                <option value="petty_cash">Petty cash</option>
                <option value="mpesa_till">M-Pesa Till</option>
                <option value="paybill">Paybill</option>
                <option value="mpesa_number">M-Pesa number</option>
                <option value="bank_account">Bank account</option>
                <option value="mobile_money">Mobile money (other)</option>
              </optgroup>
              <optgroup label="Ledger classes">
                <option value="income">Income</option>
                <option value="expense">Expense</option>
                <option value="asset">Asset</option>
                <option value="liability">Liability</option>
                <option value="equity">Equity</option>
                <option value="receivable">Receivable</option>
                <option value="student_fee_receivable">Student fee receivable</option>
                <option value="payable">Payable</option>
                <option value="inventory">Inventory</option>
                <option value="cogs">Cost of goods sold</option>
              </optgroup>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="Provider"><input className="input" placeholder="Safaricom, KCB..." value={values.provider ?? ''} onChange={(e) => set('provider', e.target.value)} /></Field>
          <Field label="Identifier"><input className="input" placeholder="Till, paybill, line, account no." value={values.account_identifier ?? ''} onChange={(e) => set('account_identifier', e.target.value)} /></Field>
          <Field label="Legal owner">
            <select className="input" value={values.legal_owner ?? ''} onChange={(e) => set('legal_owner', e.target.value)}>
              <option value="business">Business</option>
              <option value="personal">Personal</option>
              <option value="shared">Shared</option>
            </select>
          </Field>
          <Field label="Owner person"><input className="input" placeholder="Nelson, Fatma..." value={values.owner_person ?? ''} onChange={(e) => set('owner_person', e.target.value)} /></Field>
          <Field label="Current balance"><input type="number" className="input" value={values.current_balance_ksh ?? ''} onChange={(e) => set('current_balance_ksh', e.target.value)} /></Field>
        </div>
      )}

      {mode === 'transaction' && (
        <div className="grid gap-3 lg:grid-cols-4">
          <Field label="Brand"><Select options={brands} value={values.brand_id ?? ''} onChange={(v) => set('brand_id', v)} empty="Unassigned" /></Field>
          <Field label="Account"><Select options={accounts} value={values.account_id ?? ''} onChange={(v) => set('account_id', v)} empty="Choose account" /></Field>
          <Field label="Date"><input type="date" className="input" value={values.transaction_date ?? ''} onChange={(e) => set('transaction_date', e.target.value)} /></Field>
          <Field label="Direction">
            <select className="input" value={values.direction ?? ''} onChange={(e) => set('direction', e.target.value)}>
              <option value="inflow">Income</option>
              <option value="outflow">Expense</option>
              <option value="transfer_in">Transfer in</option>
              <option value="transfer_out">Transfer out</option>
            </select>
          </Field>
          <Field label="Amount KSh"><input type="number" min="0" className="input" value={values.amount_ksh ?? ''} onChange={(e) => set('amount_ksh', e.target.value)} /></Field>
          <Field label="Category"><input className="input" value={values.category ?? ''} onChange={(e) => set('category', e.target.value)} /></Field>
          <Field label="Reference"><input className="input" value={values.reference ?? ''} onChange={(e) => set('reference', e.target.value)} /></Field>
          <Field label="Channel"><input className="input" placeholder="Till, Paybill, cash..." value={values.payment_channel ?? ''} onChange={(e) => set('payment_channel', e.target.value)} /></Field>
          <Field label="Counterparty brand"><Select options={brands} value={values.counterparty_brand_id ?? ''} onChange={(v) => set('counterparty_brand_id', v)} empty="None" /></Field>
          <Field label="Counterparty"><input className="input" value={values.counterparty_name ?? ''} onChange={(e) => set('counterparty_name', e.target.value)} /></Field>
          <Field label="Owner person"><input className="input" value={values.owner_person ?? ''} onChange={(e) => set('owner_person', e.target.value)} /></Field>
          <Field label="Recon status"><input className="input" value={values.reconciliation_status ?? ''} onChange={(e) => set('reconciliation_status', e.target.value)} /></Field>
          <Field label="Description"><input className="input" value={values.description ?? ''} onChange={(e) => set('description', e.target.value)} /></Field>
        </div>
      )}

      {mode === 'transfer' && (
        <div className="grid gap-3 lg:grid-cols-4">
          <Field label="From brand"><Select options={brands} value={values.from_brand_id ?? ''} onChange={(v) => set('from_brand_id', v)} empty="Unassigned" /></Field>
          <Field label="To brand"><Select options={brands} value={values.to_brand_id ?? ''} onChange={(v) => set('to_brand_id', v)} empty="Unassigned" /></Field>
          <Field label="From account"><Select options={accounts} value={values.from_account_id ?? ''} onChange={(v) => set('from_account_id', v)} empty="Unknown" /></Field>
          <Field label="To account"><Select options={accounts} value={values.to_account_id ?? ''} onChange={(v) => set('to_account_id', v)} empty="Unknown" /></Field>
          <Field label="Date"><input type="date" className="input" value={values.transfer_date ?? ''} onChange={(e) => set('transfer_date', e.target.value)} /></Field>
          <Field label="Amount KSh"><input type="number" min="0" className="input" value={values.amount_ksh ?? ''} onChange={(e) => set('amount_ksh', e.target.value)} /></Field>
          <Field label="Reference"><input className="input" value={values.reference ?? ''} onChange={(e) => set('reference', e.target.value)} /></Field>
          <Field label="Status"><input className="input" value={values.status ?? ''} onChange={(e) => set('status', e.target.value)} /></Field>
          <Field label="Purpose"><input className="input" value={values.purpose ?? ''} onChange={(e) => set('purpose', e.target.value)} /></Field>
          <Field label="Recorded by"><input className="input" value={values.recorded_by ?? ''} onChange={(e) => set('recorded_by', e.target.value)} /></Field>
        </div>
      )}

      {mode === 'reconciliation' && (
        <div className="grid gap-3 lg:grid-cols-4">
          <Field label="Account"><Select options={accounts} value={values.account_id ?? ''} onChange={(v) => set('account_id', v)} empty="Choose account" /></Field>
          <Field label="Brand"><Select options={brands} value={values.brand_id ?? ''} onChange={(v) => set('brand_id', v)} empty="Account default" /></Field>
          <Field label="Period start"><input type="date" className="input" value={values.period_start ?? ''} onChange={(e) => set('period_start', e.target.value)} /></Field>
          <Field label="Period end"><input type="date" className="input" value={values.period_end ?? ''} onChange={(e) => set('period_end', e.target.value)} /></Field>
          <Field label="Statement source"><input className="input" value={values.statement_source ?? ''} onChange={(e) => set('statement_source', e.target.value)} /></Field>
          <Field label="Statement reference"><input className="input" value={values.statement_reference ?? ''} onChange={(e) => set('statement_reference', e.target.value)} /></Field>
          <Field label="Closing balance"><input type="number" className="input" value={values.closing_balance_ksh ?? ''} onChange={(e) => set('closing_balance_ksh', e.target.value)} /></Field>
          <Field label="Reviewed by"><input className="input" value={values.reviewed_by ?? ''} onChange={(e) => set('reviewed_by', e.target.value)} /></Field>
        </div>
      )}

      {mode === 'exception' && (
        <div className="grid gap-3 lg:grid-cols-4">
          <Field label="Title"><input className="input" value={values.title ?? ''} onChange={(e) => set('title', e.target.value)} /></Field>
          <Field label="Brand"><Select options={brands} value={values.brand_id ?? ''} onChange={(v) => set('brand_id', v)} empty="Group-wide" /></Field>
          <Field label="Account"><Select options={accounts} value={values.account_id ?? ''} onChange={(v) => set('account_id', v)} empty="None" /></Field>
          <Field label="Transaction"><Select options={transactions} value={values.transaction_id ?? ''} onChange={(v) => set('transaction_id', v)} empty="None" /></Field>
          <Field label="Type"><input className="input" value={values.exception_type ?? ''} onChange={(e) => set('exception_type', e.target.value)} /></Field>
          <Field label="Severity"><input className="input" value={values.severity ?? ''} onChange={(e) => set('severity', e.target.value)} /></Field>
          <Field label="Owner"><Select options={team} value={values.owner_id ?? ''} onChange={(v) => set('owner_id', v)} empty="Unassigned" /></Field>
          <Field label="Due date"><input type="date" className="input" value={values.due_date ?? ''} onChange={(e) => set('due_date', e.target.value)} /></Field>
        </div>
      )}

      <Field label={mode === 'exception' ? 'Description' : 'Notes'}>
        <textarea className="input mt-3 min-h-[64px]" value={mode === 'exception' ? values.description ?? '' : values.notes ?? ''} onChange={(e) => set(mode === 'exception' ? 'description' : 'notes', e.target.value)} />
      </Field>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex justify-end">
        <button onClick={submit} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60">
          <Plus size={16} /> {saving ? 'Saving...' : `Save ${MODE_LABEL[mode].toLowerCase()}`}
        </button>
      </div>
    </section>
  )
}

function Select({ options, value, onChange, empty }: { options: Option[]; value: string; onChange: (value: string) => void; empty: string }) {
  return (
    <select className="input" value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">{empty}</option>
      {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
    </select>
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
