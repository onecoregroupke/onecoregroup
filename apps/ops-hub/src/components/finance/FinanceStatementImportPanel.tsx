'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, RefreshCw, Upload } from 'lucide-react'
import { api } from '@/lib/apiClient'

type BrandOption = { id: string; label: string }
type AccountOption = { id: string; label: string; brandId?: string | null }
type StatementLine = {
  id: string
  statement_date: string | null
  raw_description: string
  reference: string
  counterparty_name: string
  counterparty_account_hint: string
  direction: string
  amount_ksh: number
  transaction_cost_ksh: number
  running_balance_ksh: number | null
  suggested_category: string
  matched_transaction_id: string | null
  confidence: number
  review_status: string
  notes: string
}
type StatementImport = {
  id: string
  statement_type: string
  source_filename: string
  parse_status: string
  created_at: string
  file_url: string | null
  lines: StatementLine[]
}

export function FinanceStatementImportPanel({
  brands,
  accounts,
  canEdit,
}: {
  brands: BrandOption[]
  accounts: AccountOption[]
  canEdit: boolean
}) {
  const router = useRouter()
  const [statementType, setStatementType] = useState<'mpesa' | 'bank'>('mpesa')
  const [brandId, setBrandId] = useState(brands.length === 1 ? brands[0].id : '')
  const [accountId, setAccountId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [approving, setApproving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [activeImport, setActiveImport] = useState<StatementImport | null>(null)
  const [lines, setLines] = useState<StatementLine[]>([])

  const accountChoices = useMemo(
    () => accounts.filter((account) => !brandId || !account.brandId || account.brandId === brandId),
    [accounts, brandId],
  )

  function setLine(id: string, patch: Partial<StatementLine>) {
    setLines((current) => current.map((line) => line.id === id ? { ...line, ...patch } : line))
  }

  async function upload() {
    setError(''); setSuccess('')
    if (!file) { setError('Choose a PDF statement.'); return }
    if (!brandId) { setError('Choose the brand this statement belongs to.'); return }
    if (!accountId) { setError('Choose the payment account this statement represents.'); return }
    const form = new FormData()
    form.set('file', file)
    form.set('statement_type', statementType)
    form.set('brand_id', brandId)
    form.set('account_id', accountId)
    setUploading(true)
    const { ok, data } = await api<{ error?: string; import?: StatementImport; candidateCount?: number }>('/api/finance/statements', {
      method: 'POST',
      body: form,
    })
    setUploading(false)
    if (!ok || !data.import) { setError(data?.error ?? 'Failed to import statement.'); return }
    setActiveImport(data.import)
    setLines(data.import.lines.map((line) => ({
      ...line,
      review_status: line.matched_transaction_id ? 'match_existing' : 'approve_new',
    })))
    setSuccess(`Imported ${data.candidateCount ?? data.import.lines.length} candidate transaction${(data.candidateCount ?? data.import.lines.length) === 1 ? '' : 's'} for review.`)
  }

  async function approve() {
    if (!activeImport) return
    setError(''); setSuccess(''); setApproving(true)
    const { ok, data } = await api<{ error?: string; posted?: number; matched?: number }>('/api/finance/statements', {
      method: 'PATCH',
      body: JSON.stringify({ import_id: activeImport.id, lines }),
    })
    setApproving(false)
    if (!ok) { setError(data?.error ?? 'Failed to approve statement.'); return }
    setSuccess(`Approved. Posted ${data.posted ?? 0} new transaction(s), matched ${data.matched ?? 0} existing transaction(s).`)
    router.refresh()
  }

  if (!canEdit) return null

  return (
    <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ocg-gold">Statement imports</h2>
          <p className="mt-1 max-w-3xl text-sm text-gray-500">
            Upload M-Pesa or bank statements, review extracted transactions, classify costs/transfers, then approve into the finance ledger.
          </p>
        </div>
        <FileText size={18} className="hidden text-gray-400 lg:block" />
      </div>

      <div className="grid gap-3 lg:grid-cols-[160px_1fr_1fr_1.2fr_auto]">
        <Field label="Type">
          <select className="input" value={statementType} onChange={(e) => setStatementType(e.target.value as 'mpesa' | 'bank')}>
            <option value="mpesa">M-Pesa statement</option>
            <option value="bank">Bank statement</option>
          </select>
        </Field>
        <Field label="Brand">
          <select className="input" value={brandId} onChange={(e) => { setBrandId(e.target.value); setAccountId('') }}>
            {brands.length !== 1 && <option value="">Choose brand</option>}
            {brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.label}</option>)}
          </select>
        </Field>
        <Field label="Statement account">
          <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Choose account</option>
            {accountChoices.map((account) => <option key={account.id} value={account.id}>{account.label}</option>)}
          </select>
        </Field>
        <Field label="PDF statement">
          <input type="file" accept="application/pdf,.pdf,.txt,.csv" className="input" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </Field>
        <div className="flex items-end">
          <button onClick={upload} disabled={uploading} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
            {uploading ? <RefreshCw size={15} className="animate-spin" /> : <Upload size={15} />}
            {uploading ? 'Reading...' : 'Upload'}
          </button>
        </div>
      </div>

      {error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {success && <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p>}

      {activeImport && (
        <div className="mt-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-gray-900">{activeImport.source_filename}</p>
              <p className="text-xs text-gray-400">{lines.length} candidate lines · {activeImport.parse_status}</p>
            </div>
            {activeImport.file_url && (
              <a href={activeImport.file_url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-ocg-gold hover:text-ocg-navy">Open uploaded file</a>
            )}
          </div>
          {lines.length === 0 ? (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
              No transactions were detected automatically. This can happen with scanned statements; export text/CSV or enter the transactions manually for now.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-100">
              <table className="w-full min-w-[1180px] text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400">
                    <th className="px-3 py-2">Review</th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Direction</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2 text-right">Cost</th>
                    <th className="px-3 py-2">Reference</th>
                    <th className="px-3 py-2">Classification</th>
                    <th className="px-3 py-2">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {lines.map((line) => (
                    <tr key={line.id} className="align-top">
                      <td className="px-3 py-2">
                        <select className="input min-w-36" value={line.review_status} onChange={(e) => setLine(line.id, { review_status: e.target.value })}>
                          <option value="approve_new">Approve new</option>
                          <option value="match_existing" disabled={!line.matched_transaction_id}>Match existing</option>
                          <option value="skip">Skip</option>
                        </select>
                        <p className="mt-1 text-[10px] text-gray-400">{Math.round(Number(line.confidence ?? 0) * 100)}% confidence</p>
                      </td>
                      <td className="px-3 py-2"><input type="date" className="input min-w-36" value={line.statement_date ?? ''} onChange={(e) => setLine(line.id, { statement_date: e.target.value })} /></td>
                      <td className="px-3 py-2">
                        <select className="input min-w-28" value={line.direction} onChange={(e) => setLine(line.id, { direction: e.target.value })}>
                          <option value="inflow">In</option>
                          <option value="outflow">Out</option>
                        </select>
                      </td>
                      <td className="px-3 py-2"><input type="number" className="input min-w-28 text-right" value={line.amount_ksh} onChange={(e) => setLine(line.id, { amount_ksh: Number(e.target.value) })} /></td>
                      <td className="px-3 py-2"><input type="number" className="input min-w-24 text-right" value={line.transaction_cost_ksh} onChange={(e) => setLine(line.id, { transaction_cost_ksh: Number(e.target.value) })} /></td>
                      <td className="px-3 py-2"><input className="input min-w-32" value={line.reference} onChange={(e) => setLine(line.id, { reference: e.target.value })} /></td>
                      <td className="px-3 py-2"><input className="input min-w-44" value={line.suggested_category} onChange={(e) => setLine(line.id, { suggested_category: e.target.value })} /></td>
                      <td className="px-3 py-2">
                        <textarea className="input min-h-16 min-w-80" value={line.raw_description} onChange={(e) => setLine(line.id, { raw_description: e.target.value })} />
                        {line.matched_transaction_id && <p className="mt-1 text-[10px] text-emerald-600">Possible existing ledger match</p>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {lines.length > 0 && (
            <div className="mt-4 flex justify-end">
              <button onClick={approve} disabled={approving} className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
                {approving ? 'Approving...' : 'Approve reviewed lines'}
              </button>
            </div>
          )}
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
