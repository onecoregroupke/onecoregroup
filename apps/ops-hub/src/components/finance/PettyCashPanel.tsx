'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Wallet, Plus, ArrowDownCircle, ArrowUpCircle, CheckCircle2 } from 'lucide-react'
import { api } from '@/lib/apiClient'
import { useAutosave, autosaveLabel } from '@/lib/useAutosave'
import { formatKsh, sumMoney, addMoney, subMoney } from '@/lib/money'

interface Account { id: string; name: string; brand_id: string | null; custodian: string; current_balance_ksh: number }
interface Brand { id: string; label: string }
interface Txn {
  id: string; account_id: string | null; brand_id: string | null; entry_kind: string; transaction_date: string
  cash_received_ksh: number; opening_float_ksh: number; source_of_funds: string
  expense_amount_ksh: number; payee: string; expense_category: string; description: string
  transaction_charge_ksh: number; secondary_charge_ksh: number; secondary_charge_label: string
  total_cash_out_ksh: number; running_balance_ksh: number | null; state: string
}

const STATES = ['draft', 'submitted', 'reviewed', 'approved', 'rejected', 'reconciled', 'closed']

export function PettyCashPanel({
  brandId, brands, accounts, transactions, canEdit,
}: {
  brandId?: string | null
  brands: Brand[]
  accounts: Account[]
  transactions: Txn[]
  canEdit: boolean
}) {
  const router = useRouter()
  const today = new Date().toISOString().slice(0, 10)
  const [kind, setKind] = useState<'income' | 'expense'>('expense')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showAccount, setShowAccount] = useState(false)
  const [accountName, setAccountName] = useState('')

  const [form, setForm] = useState<Record<string, string>>({
    transaction_date: today,
    account_id: accounts[0]?.id ?? '',
    brand_id: brandId ?? brands[0]?.id ?? '',
  })
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  // Autosave the in-progress form locally so a refresh/close never loses entry.
  const draftKey = `pettycash:${brandId ?? 'all'}:${form.account_id || 'na'}`
  const autosave = useAutosave<Record<string, string>>({
    storageKey: draftKey,
    onSave: async () => { /* local-only draft; explicit Record posts to the ledger */ },
  })
  const savelabel = autosaveLabel(autosave.status)

  const totals = useMemo(() => {
    const opening = sumMoney(transactions.map((t) => t.opening_float_ksh))
    const received = sumMoney(transactions.map((t) => t.cash_received_ksh))
    const expenses = sumMoney(transactions.map((t) => t.expense_amount_ksh))
    const charges = sumMoney(transactions.map((t) => addMoney(t.transaction_charge_ksh, t.secondary_charge_ksh)))
    const expected = subMoney(addMoney(opening, received), addMoney(expenses, charges))
    return { opening, received, expenses, charges, expected }
  }, [transactions])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError(''); setSuccess('')
    const res = await api('/api/petty-cash', {
      method: 'POST',
      body: JSON.stringify({
        action: 'record',
        values: {
          account_id: form.account_id || null,
          brand_id: form.brand_id || null,
          entry_kind: kind,
          transaction_date: form.transaction_date,
          cash_received_ksh: kind === 'income' ? Number(form.cash_received_ksh || 0) : 0,
          source_of_funds: kind === 'income' ? form.source_of_funds ?? '' : '',
          expense_amount_ksh: kind === 'expense' ? Number(form.expense_amount_ksh || 0) : 0,
          payee: kind === 'expense' ? form.payee ?? '' : '',
          expense_category: form.expense_category ?? '',
          description: form.description ?? '',
          transaction_charge_ksh: Number(form.transaction_charge_ksh || 0),
          secondary_charge_ksh: Number(form.secondary_charge_ksh || 0),
          secondary_charge_label: form.secondary_charge_ksh ? (form.secondary_charge_label || 'ZIIDI') : '',
          reference: form.reference ?? '',
          state: 'submitted',
        },
      }),
    })
    setSaving(false)
    if (!res.ok) { setError((res.data as { error?: string })?.error ?? 'Failed to record'); return }
    autosave.clearRecovered()
    setSuccess('Petty cash entry recorded')
    setForm({ transaction_date: today, account_id: form.account_id, brand_id: form.brand_id })
    router.refresh()
  }

  async function createAccount() {
    if (!accountName.trim()) return
    const res = await api('/api/petty-cash', {
      method: 'POST',
      body: JSON.stringify({ action: 'create-account', values: { name: accountName, brand_id: form.brand_id || null } }),
    })
    if (res.ok) { setShowAccount(false); setAccountName(''); router.refresh() }
    else setError((res.data as { error?: string })?.error ?? 'Failed')
  }

  async function advance(id: string, state: string) {
    const res = await api('/api/petty-cash', { method: 'POST', body: JSON.stringify({ action: 'set-state', values: { id, state } }) })
    if (res.ok) router.refresh()
  }

  return (
    <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ocg-gold"><Wallet size={15} /> Petty cash</h2>
          <p className="mt-1 text-sm text-gray-500">Float income, expenses, transaction &amp; ZIIDI charges, with a running balance and reconciliation totals.</p>
        </div>
        {canEdit && (
          <button onClick={() => setShowAccount((s) => !s)} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:border-ocg-gold/50">
            <Plus size={13} /> New float
          </button>
        )}
      </div>

      {showAccount && canEdit && (
        <div className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-gray-100 bg-gray-50 p-3">
          <label className="text-xs text-gray-500">Float name
            <input value={accountName} onChange={(e) => setAccountName(e.target.value)} className="mt-1 block w-56 rounded-md border border-gray-200 px-2 py-1.5 text-sm" placeholder="e.g. Manager float" />
          </label>
          <button onClick={createAccount} className="rounded-lg bg-ocg-navy px-3 py-2 text-xs font-semibold text-white">Create</button>
        </div>
      )}

      <div className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Opening float" value={totals.opening} />
        <Stat label="Cash received" value={totals.received} tone="text-emerald-600" />
        <Stat label="Expenses" value={totals.expenses} tone="text-red-600" />
        <Stat label="Charges (incl. ZIIDI)" value={totals.charges} tone="text-amber-600" />
        <Stat label="Expected closing" value={totals.expected} />
      </div>

      {canEdit && (
        <form onSubmit={submit} className="mb-5 rounded-lg border border-gray-100 p-4">
          <div className="mb-3 flex items-center gap-2">
            <TabBtn active={kind === 'expense'} onClick={() => setKind('expense')} icon={ArrowUpCircle} label="Expense" />
            <TabBtn active={kind === 'income'} onClick={() => setKind('income')} icon={ArrowDownCircle} label="Income" />
            <span className={`ml-auto text-xs ${savelabel.tone}`}>{savelabel.text}</span>
          </div>
          {autosave.recovered && (
            <div className="mb-3 flex items-center justify-between rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
              A draft from a previous session was found.
              <span className="flex gap-2">
                <button type="button" onClick={() => { setForm(autosave.recovered as Record<string, string>); autosave.clearRecovered() }} className="font-semibold underline">Restore</button>
                <button type="button" onClick={autosave.clearRecovered} className="text-amber-600">Discard</button>
              </span>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Date"><input type="date" value={form.transaction_date} onChange={(e) => { set('transaction_date', e.target.value); autosave.onChange({ ...form, transaction_date: e.target.value }) }} className={inputCls} /></Field>
            {!brandId && (
              <Field label="Brand"><select value={form.brand_id} onChange={(e) => set('brand_id', e.target.value)} className={inputCls}><option value="">Select…</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}</select></Field>
            )}
            <Field label="Float"><select value={form.account_id} onChange={(e) => set('account_id', e.target.value)} className={inputCls}><option value="">Unassigned</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
            {kind === 'expense' ? (
              <>
                <Field label="Amount (KES)"><input inputMode="decimal" value={form.expense_amount_ksh ?? ''} onChange={(e) => { set('expense_amount_ksh', e.target.value); autosave.onChange({ ...form, expense_amount_ksh: e.target.value }) }} className={inputCls} /></Field>
                <Field label="Payee"><input value={form.payee ?? ''} onChange={(e) => set('payee', e.target.value)} className={inputCls} /></Field>
                <Field label="Transaction charge"><input inputMode="decimal" value={form.transaction_charge_ksh ?? ''} onChange={(e) => set('transaction_charge_ksh', e.target.value)} className={inputCls} /></Field>
                <Field label="ZIIDI / secondary"><input inputMode="decimal" value={form.secondary_charge_ksh ?? ''} onChange={(e) => set('secondary_charge_ksh', e.target.value)} className={inputCls} /></Field>
                <Field label="Category"><input value={form.expense_category ?? ''} onChange={(e) => set('expense_category', e.target.value)} className={inputCls} /></Field>
              </>
            ) : (
              <>
                <Field label="Amount received (KES)"><input inputMode="decimal" value={form.cash_received_ksh ?? ''} onChange={(e) => { set('cash_received_ksh', e.target.value); autosave.onChange({ ...form, cash_received_ksh: e.target.value }) }} className={inputCls} /></Field>
                <Field label="Source of funds"><input value={form.source_of_funds ?? ''} onChange={(e) => set('source_of_funds', e.target.value)} className={inputCls} /></Field>
              </>
            )}
            <Field label="Description / note" wide><input value={form.description ?? ''} onChange={(e) => set('description', e.target.value)} className={inputCls} /></Field>
          </div>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          {success && <p className="mt-3 flex items-center gap-1 text-sm text-emerald-600"><CheckCircle2 size={14} /> {success}</p>}
          <button disabled={saving} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {saving ? 'Recording…' : `Record ${kind}`}
          </button>
        </form>
      )}

      {transactions.length === 0 ? (
        <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500">No petty cash entries yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-100">
          <table className="w-full min-w-[880px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400">
                <th className="px-3 py-2">Date</th><th className="px-3 py-2">Payee / source</th>
                <th className="px-3 py-2 text-right">In</th><th className="px-3 py-2 text-right">Out</th>
                <th className="px-3 py-2 text-right">Charge</th><th className="px-3 py-2 text-right">ZIIDI</th>
                <th className="px-3 py-2 text-right">Balance</th><th className="px-3 py-2">State</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {transactions.slice().reverse().slice(0, 100).map((t) => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2.5 whitespace-nowrap text-gray-600">{t.transaction_date}</td>
                  <td className="px-3 py-2.5 text-gray-700">{t.payee || t.source_of_funds || t.description || '—'}</td>
                  <td className="px-3 py-2.5 text-right text-emerald-700">{t.entry_kind === 'income' ? formatKsh(t.cash_received_ksh) : ''}</td>
                  <td className="px-3 py-2.5 text-right text-red-700">{t.entry_kind === 'expense' ? formatKsh(t.expense_amount_ksh) : ''}</td>
                  <td className="px-3 py-2.5 text-right text-gray-500">{t.transaction_charge_ksh ? formatKsh(t.transaction_charge_ksh) : ''}</td>
                  <td className="px-3 py-2.5 text-right text-gray-500">{t.secondary_charge_ksh ? formatKsh(t.secondary_charge_ksh) : ''}</td>
                  <td className="px-3 py-2.5 text-right text-gray-700">{t.running_balance_ksh != null ? formatKsh(t.running_balance_ksh) : '—'}</td>
                  <td className="px-3 py-2.5">
                    {canEdit ? (
                      <select value={t.state} onChange={(e) => advance(t.id, e.target.value)} className="rounded-md border border-gray-200 px-1.5 py-1 text-xs">
                        {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    ) : <span className="text-xs text-gray-500">{t.state}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

const inputCls = 'mt-1 block w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm focus:border-ocg-gold focus:outline-none'
function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={`text-xs text-gray-500 ${wide ? 'sm:col-span-2' : ''}`}>{label}{children}</label>
}
function TabBtn({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: React.ElementType; label: string }) {
  return <button type="button" onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${active ? 'bg-ocg-navy text-white' : 'border border-gray-200 text-gray-600'}`}><Icon size={15} /> {label}</button>
}
function Stat({ label, value, tone = 'text-gray-900' }: { label: string; value: number; tone?: string }) {
  return <div className="rounded-lg border border-gray-100 bg-white p-3 shadow-sm"><p className={`text-lg font-semibold ${tone}`}>{formatKsh(value)}</p><p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</p></div>
}
