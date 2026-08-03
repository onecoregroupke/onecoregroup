'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Save, X } from 'lucide-react'
import { api } from '@/lib/apiClient'
import type { FinanceAccountRow } from '@ocg/db'

type BrandOption = { id: string; label: string }

export function FinanceAccountEditButton({
  account,
  brands,
  canUseShared,
}: {
  account: FinanceAccountRow
  brands: BrandOption[]
  canUseShared: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [values, setValues] = useState<Record<string, string>>({
    brand_id: account.brand_id ?? '',
    account_name: account.account_name,
    account_type: account.account_type,
    provider: account.provider,
    account_identifier: account.account_identifier,
    legal_owner: account.legal_owner,
    owner_person: account.owner_person,
    business_use_notes: account.business_use_notes,
    opening_balance_ksh: String(account.opening_balance_ksh ?? 0),
    current_balance_ksh: String(account.current_balance_ksh ?? 0),
    reconciliation_status: account.reconciliation_status,
    is_active: String(account.is_active),
    notes: account.notes,
  })

  function set(name: string, value: string) {
    setValues((current) => ({ ...current, [name]: value }))
  }

  async function submit() {
    setError('')
    if (!values.account_name.trim()) {
      setError('Account name is required.')
      return
    }
    setSaving(true)
    const { ok, data } = await api<{ error?: string }>('/api/management', {
      method: 'PATCH',
      body: JSON.stringify({
        type: 'finance_account',
        id: account.id,
        values: {
          ...values,
          is_active: values.is_active === 'true',
        },
      }),
    })
    setSaving(false)
    if (!ok) {
      setError(data?.error ?? 'Failed to save account.')
      return
    }
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Edit payment account"
        className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:border-ocg-gold hover:text-ocg-gold"
      >
        <Pencil size={14} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4">
          <div className="my-4 flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <p className="font-semibold text-gray-900">Edit payment account</p>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-700">
                <X size={18} />
              </button>
            </div>

            <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto p-5 sm:grid-cols-2">
              <Field label="Account name">
                <input className="input" value={values.account_name} onChange={(e) => set('account_name', e.target.value)} />
              </Field>
              <Field label="Brand">
                <select className="input" value={values.brand_id} onChange={(e) => set('brand_id', e.target.value)}>
                  {canUseShared && <option value="">Shared / group</option>}
                  {!canUseShared && !values.brand_id && <option value="">Choose brand</option>}
                  {brands.map((brand) => (
                    <option key={brand.id} value={brand.id}>{brand.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Type">
                <select className="input" value={values.account_type} onChange={(e) => set('account_type', e.target.value)}>
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
              <Field label="Provider">
                <input className="input" value={values.provider} onChange={(e) => set('provider', e.target.value)} placeholder="Safaricom, KCB..." />
              </Field>
              <Field label="Identifier">
                <input className="input" value={values.account_identifier} onChange={(e) => set('account_identifier', e.target.value)} placeholder="Till, paybill, line, account no." />
              </Field>
              <Field label="Legal owner">
                <select className="input" value={values.legal_owner} onChange={(e) => set('legal_owner', e.target.value)}>
                  <option value="business">Business</option>
                  <option value="personal">Personal</option>
                  <option value="shared">Shared</option>
                </select>
              </Field>
              <Field label="Owner person">
                <input className="input" value={values.owner_person} onChange={(e) => set('owner_person', e.target.value)} />
              </Field>
              <Field label="Reconciliation status">
                <input className="input" value={values.reconciliation_status} onChange={(e) => set('reconciliation_status', e.target.value)} />
              </Field>
              <Field label="Opening balance">
                <input type="number" className="input" value={values.opening_balance_ksh} onChange={(e) => set('opening_balance_ksh', e.target.value)} />
              </Field>
              <Field label="Current balance">
                <input type="number" className="input" value={values.current_balance_ksh} onChange={(e) => set('current_balance_ksh', e.target.value)} />
              </Field>
              <label className="flex items-center gap-2 pt-6 text-sm text-gray-600">
                <input type="checkbox" checked={values.is_active === 'true'} onChange={(e) => set('is_active', String(e.target.checked))} />
                Active
              </label>
              <Field label="Business use notes">
                <textarea className="input min-h-20" value={values.business_use_notes} onChange={(e) => set('business_use_notes', e.target.value)} />
              </Field>
              <Field label="Notes">
                <textarea className="input min-h-20" value={values.notes} onChange={(e) => set('notes', e.target.value)} />
              </Field>
              {error && <p className="sm:col-span-2 text-sm text-red-600">{error}</p>}
            </div>

            <div className="flex justify-end gap-2 border-t border-gray-100 p-4">
              <button onClick={() => setOpen(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600">Cancel</button>
              <button onClick={submit} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
                <Save size={15} /> {saving ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
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
