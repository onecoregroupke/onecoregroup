'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UploadCloud, FileSpreadsheet, AlertTriangle, CheckCircle2, RotateCcw } from 'lucide-react'
import { getClient } from '@/lib/supabase'
import { importTypesForBrand, schoolForBrandSlug } from '@/lib/imports/brandScope'

interface Brand { id: string; label: string }
interface StagedRow { id: string; sheet_name: string; source_row: number | null; record_kind: string; dup_status: string; row_state: string; mapped_payload: Record<string, unknown>; messages: unknown[] }
interface ImportRec { id: string; source_filename: string; rows_scanned: number; duplicates_found: number; records_skipped: number; status: string }

export function ImportWizard({ brandId, brandSlug, brands, canEdit }: { brandId?: string | null; brandSlug?: string; brands: Brand[]; canEdit: boolean }) {
  const router = useRouter()
  // Brand-scoped type list; the school is derived from the brand (no picker).
  const types = importTypesForBrand(brandSlug)
  const school = schoolForBrandSlug(brandSlug) ?? ''
  const [importType, setImportType] = useState(types[0]?.value ?? 'petty-cash')
  const [brand, setBrand] = useState(brandId ?? brands[0]?.id ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ import: ImportRec; rows: StagedRow[]; totalRows: number; staged: { staged: number; skipped: number; duplicates: number }; priorImports: { id: string; source_filename: string }[] } | null>(null)
  const [commitMsg, setCommitMsg] = useState('')

  async function authHeaders(): Promise<Record<string, string>> {
    const { data } = await getClient().auth.getSession()
    const token = data.session?.access_token
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  async function upload() {
    if (!file) { setError('Choose a workbook first'); return }
    setBusy(true); setError(''); setResult(null); setCommitMsg('')
    const fd = new FormData()
    fd.set('file', file)
    fd.set('import_type', importType)
    fd.set('brand_id', brand)
    if (importType === 'school-ledger') fd.set('school', school)
    const res = await fetch('/api/imports', { method: 'POST', headers: await authHeaders(), body: fd })
    const data = await res.json()
    setBusy(false)
    if (!res.ok) { setError(data?.error ?? 'Upload failed'); return }
    setResult(data)
  }

  async function commit(dryRun: boolean, includeDuplicates = false) {
    if (!result) return
    setBusy(true); setError(''); setCommitMsg('')
    const res = await fetch('/api/imports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ action: 'commit', importId: result.import.id, dryRun, includeDuplicates }),
    })
    const data = await res.json()
    setBusy(false)
    if (!res.ok) { setError(data?.error ?? 'Commit failed'); return }
    const r = data.result
    setCommitMsg(dryRun
      ? `Dry run OK — ${r.created} would be created, ${r.skipped} skipped.`
      : `Committed: ${r.created} created, ${r.skipped} skipped, ${r.failed} failed.`)
    if (!dryRun) router.refresh()
  }

  async function rollback() {
    if (!result) return
    setBusy(true); setError('')
    const res = await fetch('/api/imports', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ action: 'rollback', importId: result.import.id }),
    })
    const data = await res.json()
    setBusy(false)
    if (!res.ok) { setError(data?.error ?? 'Rollback failed'); return }
    setCommitMsg(`Rolled back: ${data.result.removed} removed, ${data.result.blocked} blocked.`)
    router.refresh()
  }

  if (!canEdit) return <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500">You need finance edit access to import data.</p>

  const counts = result ? summarise(result.rows, result.totalRows) : null

  return (
    <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ocg-gold"><UploadCloud size={15} /> Excel import</h2>
        <p className="mt-1 text-sm text-gray-500">Upload a workbook → review detected records, duplicates &amp; warnings → dry-run → commit. Imports are brand-scoped, validated server-side, and reversible where safe.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs text-gray-500">Import type
          <select value={importType} onChange={(e) => setImportType(e.target.value)} className={inputCls}>{types.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
        </label>
        {!brandId && (
          <label className="text-xs text-gray-500">Brand
            <select value={brand} onChange={(e) => setBrand(e.target.value)} className={inputCls}><option value="">Select…</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}</select>
          </label>
        )}
        <label className="text-xs text-gray-500">Workbook (.xlsx)
          <input type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-sm" />
        </label>
      </div>

      <button onClick={upload} disabled={busy} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
        <FileSpreadsheet size={15} /> {busy ? 'Working…' : 'Upload & detect'}
      </button>
      {error && <p className="mt-3 flex items-center gap-1 text-sm text-red-600"><AlertTriangle size={14} /> {error}</p>}

      {result && counts && (
        <div className="mt-5 space-y-4">
          {result.priorImports.length > 0 && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800"><AlertTriangle size={14} className="mr-1 inline" /> This exact file was imported before ({result.priorImports.length}×). Duplicate rows are auto-skipped.</p>
          )}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <Stat label="Rows scanned" value={result.import.rows_scanned} />
            <Stat label="Importable" value={counts.importable} tone="text-emerald-600" />
            <Stat label="Duplicates" value={result.staged.duplicates} tone="text-amber-600" />
            <Stat label="Skipped (totals/blank)" value={counts.skipped} />
            <Stat label="Errors" value={counts.errors} tone={counts.errors ? 'text-red-600' : 'text-gray-900'} />
          </div>

          <div className="max-h-80 overflow-auto rounded-lg border border-gray-100">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400">
                  <th className="px-3 py-2">Sheet</th><th className="px-3 py-2">Row</th><th className="px-3 py-2">Kind</th>
                  <th className="px-3 py-2">Detected</th><th className="px-3 py-2">Dup</th><th className="px-3 py-2">State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {result.rows.slice(0, 200).map((r) => (
                  <tr key={r.id} className={r.row_state === 'error' ? 'bg-red-50/40' : r.dup_status !== 'new' && r.record_kind !== 'subtotal' ? 'bg-amber-50/30' : ''}>
                    <td className="px-3 py-2 text-gray-500">{r.sheet_name}</td>
                    <td className="px-3 py-2 text-gray-400">{r.source_row}</td>
                    <td className="px-3 py-2 text-gray-600">{r.record_kind}</td>
                    <td className="px-3 py-2 text-gray-700">{describe(r.mapped_payload)}</td>
                    <td className="px-3 py-2 text-gray-500">{r.dup_status === 'new' ? '' : r.dup_status}</td>
                    <td className="px-3 py-2 text-gray-500">{r.row_state}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.totalRows > result.rows.length && <p className="text-xs text-gray-400">Showing {result.rows.length} of {result.totalRows} staged rows.</p>}

          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => commit(true)} disabled={busy} className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 disabled:opacity-60">Dry run</button>
            <button onClick={() => commit(false)} disabled={busy} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"><CheckCircle2 size={15} /> Commit</button>
            <button onClick={() => commit(false, true)} disabled={busy} className="rounded-lg border border-amber-300 px-3 py-2 text-sm font-medium text-amber-700 disabled:opacity-60">Commit incl. duplicates</button>
            {result.import.status.includes('committed') && (
              <button onClick={rollback} disabled={busy} className="ml-auto inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 disabled:opacity-60"><RotateCcw size={14} /> Roll back</button>
            )}
          </div>
          {commitMsg && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{commitMsg}</p>}
        </div>
      )}
    </section>
  )
}

function summarise(rows: StagedRow[], total: number) {
  const importable = rows.filter((r) => (r.row_state === 'valid' || r.row_state === 'warning') && r.dup_status === 'new').length
  const skipped = rows.filter((r) => r.row_state === 'skipped').length
  const errors = rows.filter((r) => r.row_state === 'error').length
  return { importable: total > rows.length ? importable : importable, skipped, errors }
}
function describe(m: Record<string, unknown>): string {
  if (m['student_admission_no']) return `${m['student_admission_no']} · ${m['entry_type'] ?? ''} ${m['amount_ksh'] ?? ''}`.trim()
  if (m['payee'] || m['source_of_funds']) return `${m['payee'] ?? m['source_of_funds']} · ${m['expense_amount_ksh'] ?? m['cash_received_ksh'] ?? ''}`.trim()
  return Object.keys(m).length ? '—' : ''
}
const inputCls = 'mt-1 block w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm focus:border-ocg-gold focus:outline-none'
function Stat({ label, value, tone = 'text-gray-900' }: { label: string; value: number; tone?: string }) {
  return <div className="rounded-lg border border-gray-100 bg-white p-3 shadow-sm"><p className={`text-xl font-semibold ${tone}`}>{value}</p><p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</p></div>
}
