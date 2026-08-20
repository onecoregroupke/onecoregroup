'use client'

import Link from 'next/link'
import { useMemo, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { ArchiveRestore, FileCheck2, GitCompareArrows, LockKeyhole, Plus } from 'lucide-react'
import { api } from '@/lib/apiClient'
import type { DataImportRow, HistoricalImportMappingRow, HistoricalImportSourceRow } from '@ocg/db'

type BrandOption = { id: string; name: string }
type DialogKind = 'source' | 'batch' | 'mapping' | 'reconcile'

export function HistoricalImportsWorkspace({
  sources, batches, mappings, brands, canEdit,
}: {
  sources: HistoricalImportSourceRow[]
  batches: DataImportRow[]
  mappings: HistoricalImportMappingRow[]
  brands: BrandOption[]
  canEdit: boolean
}) {
  const router = useRouter()
  const [dialog, setDialog] = useState<DialogKind | null>(null)
  const [selectedBatch, setSelectedBatch] = useState<DataImportRow | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null)
  const brandById = useMemo(() => new Map(brands.map((brand) => [brand.id, brand.name])), [brands])

  async function post(action: string, values: Record<string, unknown>) {
    setBusy(true); setError('')
    const { ok, data } = await api<{ error?: string; summary?: Record<string, unknown> }>('/api/historical-imports', {
      method: 'POST', body: JSON.stringify({ action, values }),
    })
    setBusy(false)
    if (!ok) { setError(data?.error ?? 'Could not complete that import action.'); return false }
    if (data?.summary) setSummary(data.summary)
    setDialog(null); router.refresh(); return true
  }

  async function transition(batch: DataImportRow, action: string) {
    if (['posted', 'locked'].includes(action) && !confirm(`${action === 'posted' ? 'Post' : 'Lock'} this historical batch?`)) return
    await post(action, { import_id: batch.id })
  }

  return <div className="space-y-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-ocg-gold">Management · Controlled migration</p><h1 className="mt-1 text-2xl font-semibold text-gray-900">Historical Imports</h1><p className="mt-1 max-w-3xl text-sm text-gray-500">Register evidence, stage raw rows, map exceptions, validate, approve, post, reconcile and lock—without writing source files straight into live ledgers.</p></div>{canEdit && <div className="flex gap-2"><button onClick={() => setDialog('mapping')} className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600">Add mapping</button><button onClick={() => setDialog('source')} className="inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white"><Plus size={15} /> Register source</button></div>}</div>
    <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900"><b>Progressive import rule:</b> July first → dry run → review → approve → post → reconcile → lock. Only then begin August. CSV/XLSX parsing continues through the existing <Link href="/finance" className="underline">Finance import wizard</Link>; PDFs and images may be registered as source evidence without fragile OCR.</div>
    {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    {summary && <div className="rounded-xl border border-gray-100 bg-white p-4"><p className="text-xs font-bold uppercase tracking-wide text-gray-500">Last dry-run summary</p><div className="mt-3 flex flex-wrap gap-2">{Object.entries(summary).map(([key, value]) => <span key={key} className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700">{key.replaceAll(/([A-Z])/g, ' $1')}: {String(value)}</span>)}</div></div>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Stat icon={ArchiveRestore} label="Registered sources" value={sources.length} /><Stat icon={FileCheck2} label="Controlled batches" value={batches.length} /><Stat icon={GitCompareArrows} label="Reusable mappings" value={mappings.filter((mapping) => mapping.status !== 'retired').length} /><Stat icon={LockKeyhole} label="Locked batches" value={batches.filter((batch) => batch.status === 'locked').length} /></div>

    <section className="rounded-xl border border-gray-100 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-gray-100 px-5 py-4"><h2 className="text-sm font-semibold text-gray-900">Import batches</h2>{canEdit && sources.length > 0 && <button onClick={() => setDialog('batch')} className="text-xs font-semibold text-ocg-gold">Create controlled batch</button>}</div>{batches.length === 0 ? <Empty text="No controlled historical batches. No real historical data has been imported." /> : <div className="divide-y divide-gray-100">{batches.map((batch) => <div key={batch.id} className="p-5"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><p className="font-medium text-gray-900">{batch.source_filename || batch.target_domain || batch.import_type}</p><p className="mt-1 text-xs text-gray-500">{batch.brand_id ? brandById.get(batch.brand_id) ?? 'Unknown entity' : 'Group'} · {batch.target_domain || batch.import_type} · {batch.period_start || 'period unknown'} → {batch.period_end || 'period unknown'}</p><p className="mt-1 text-[11px] text-gray-400">Batch {batch.id.slice(0, 8)} · {batch.records_created} created · {batch.failed_count} failed · {batch.duplicates_found} duplicate flags</p></div><Status value={batch.status} /></div>{canEdit && <div className="mt-3 flex flex-wrap gap-2"><Action label="Dry run" onClick={() => transition(batch, 'dry-run')} /><Action label="Ready for review" onClick={() => transition(batch, 'review')} /><Action label="Approve" onClick={() => transition(batch, 'approved')} /><Action label="Post" onClick={() => transition(batch, 'posted')} /><Action label="Add reconciliation" onClick={() => { setSelectedBatch(batch); setDialog('reconcile') }} /><Action label="Mark reconciled" onClick={() => transition(batch, 'reconciled')} /><Action label="Lock" onClick={() => transition(batch, 'locked')} /></div>}</div>)}</div>}</section>

    <div className="grid gap-5 xl:grid-cols-2"><section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm"><h2 className="mb-4 text-sm font-semibold text-gray-900">Source register</h2>{sources.length === 0 ? <Empty text="No historical source evidence registered." /> : <ul className="divide-y divide-gray-100">{sources.map((source) => <li key={source.id} className="py-3"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-medium text-gray-800">{source.source_ref} · {source.title}</p><p className="mt-0.5 text-xs text-gray-500">Class {source.evidence_class} · {source.source_type} · {source.brand_id ? brandById.get(source.brand_id) ?? 'Unknown entity' : 'Group'}</p></div><span className="text-[10px] text-gray-400">{source.checksum_sha256 ? 'checksum retained' : 'manual evidence'}</span></div></li>)}</ul>}</section><section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm"><h2 className="mb-4 text-sm font-semibold text-gray-900">Mappings & unresolved values</h2>{mappings.length === 0 ? <Empty text="No canonical mappings proposed." /> : <ul className="divide-y divide-gray-100">{mappings.map((mapping) => <li key={mapping.id} className="py-3"><p className="text-sm font-medium text-gray-800">{mapping.original_value} → {mapping.normalized_value || mapping.target_id || 'unresolved'}</p><p className="mt-0.5 text-xs text-gray-500">{mapping.target_domain} · {mapping.source_field} · {mapping.status}</p></li>)}</ul>}</section></div>
    {dialog && <ImportDialog kind={dialog} sources={sources} batches={batches} brands={brands} selectedBatch={selectedBatch} busy={busy} onClose={() => { setDialog(null); setSelectedBatch(null) }} onSubmit={post} />}
  </div>
}

function ImportDialog({ kind, sources, batches, brands, selectedBatch, busy, onClose, onSubmit }: { kind: DialogKind; sources: HistoricalImportSourceRow[]; batches: DataImportRow[]; brands: BrandOption[]; selectedBatch: DataImportRow | null; busy: boolean; onClose: () => void; onSubmit: (action: string, values: Record<string, unknown>) => Promise<boolean> }) {
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); await onSubmit(kind === 'source' ? 'register-source' : kind === 'batch' ? 'create-batch' : kind === 'mapping' ? 'add-mapping' : 'reconcile', Object.fromEntries(new FormData(event.currentTarget).entries())) }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><form onSubmit={submit} className="grid max-h-[90vh] w-full max-w-2xl gap-3 overflow-y-auto rounded-2xl bg-white p-5 shadow-xl sm:grid-cols-2"><h3 className="sm:col-span-2 font-semibold capitalize text-gray-900">{kind === 'source' ? 'Register historical source' : kind === 'batch' ? 'Create controlled batch' : kind === 'mapping' ? 'Add canonical mapping' : 'Add reconciliation control'}</h3>{kind === 'source' && <><Input name="title" label="Source title" required /><Input name="filename" label="Filename" /><Input name="source_type" label="Source type" placeholder="workbook, PDF, stock count…" required /><Select name="evidence_class" label="Evidence class" options={['1','2','3','4','5']} /><Brand brands={brands} required /><Input name="checksum_sha256" label="SHA-256 checksum" /><Input name="period_start" label="Period start" type="date" /><Input name="period_end" label="Period end" type="date" /><Input name="storage_path" label="Retained file location" /><Textarea name="description" label="Description / provenance" /></>}{kind === 'batch' && <><Source sources={sources.filter((source) => source.evidence_class !== 5)} /><Input name="target_domain" label="Target domain" placeholder="inventory, finance, sales…" required /><Select name="import_type" label="Available adapter" options={['petty-cash','school-ledger']} /><Input name="period_start" label="Period start" type="date" required /><Input name="period_end" label="Period end" type="date" required /></>}{kind === 'mapping' && <><Brand brands={brands} /><Input name="target_domain" label="Target domain" required /><Input name="source_field" label="Source field" required /><Input name="original_value" label="Original value (preserved)" required /><Input name="normalized_value" label="Canonical label" /><Input name="target_type" label="Target type" placeholder="inventory_item, supplier…" required /><Input name="target_id" label="Target record ID (optional)" /></>}{kind === 'reconcile' && <><input type="hidden" name="import_id" value={selectedBatch?.id ?? batches[0]?.id ?? ''} /><Select name="reconciliation_type" label="Control type" options={['finance','stock','sales','procurement','control_total']} /><Input name="control_name" label="Control name" required /><Input name="source_total" label="Source total" type="number" /><Input name="posted_total" label="Posted total" type="number" /><Select name="result" label="Result" options={['matched','explained','failed','pending']} /><Textarea name="notes" label="Reconciliation notes" /></>}<div className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600">Cancel</button><button disabled={busy} className="rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{busy ? 'Saving…' : 'Save'}</button></div></form></div>
}

function Stat({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number }) { return <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm"><Icon size={17} className="text-ocg-gold" /><p className="mt-2 text-2xl font-light text-gray-900">{value}</p><p className="text-xs text-gray-500">{label}</p></div> }
function Status({ value }: { value: string }) { const tone = value === 'locked' || value === 'reconciled' ? 'bg-green-50 text-green-700' : value === 'validation_failed' || value === 'failed' ? 'bg-red-50 text-red-700' : value === 'approved' || value === 'ready_for_review' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600'; return <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${tone}`}>{value.replaceAll('_', ' ')}</span> }
function Action({ label, onClick }: { label: string; onClick: () => void }) { return <button onClick={onClick} className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-600 hover:border-ocg-gold hover:text-ocg-gold">{label}</button> }
function Empty({ text }: { text: string }) { return <p className="m-5 rounded-lg bg-gray-50 p-4 text-sm text-gray-500">{text}</p> }
function Input({ name, label, required, type = 'text', placeholder }: { name: string; label: string; required?: boolean; type?: string; placeholder?: string }) { return <label><span className="mb-1 block text-xs font-medium text-gray-500">{label}</span><input className="input" name={name} required={required} type={type} placeholder={placeholder} step={type === 'number' ? '0.01' : undefined} /></label> }
function Textarea({ name, label }: { name: string; label: string }) { return <label className="sm:col-span-2"><span className="mb-1 block text-xs font-medium text-gray-500">{label}</span><textarea className="input min-h-20" name={name} /></label> }
function Select({ name, label, options }: { name: string; label: string; options: string[] }) { return <label><span className="mb-1 block text-xs font-medium text-gray-500">{label}</span><select className="input" name={name}>{options.map((option) => <option key={option} value={option}>{option.replaceAll('_', ' ')}</option>)}</select></label> }
function Brand({ brands, required }: { brands: BrandOption[]; required?: boolean }) { return <label><span className="mb-1 block text-xs font-medium text-gray-500">Entity / brand</span><select className="input" name="brand_id" required={required}><option value="">Group / unknown</option>{brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></label> }
function Source({ sources }: { sources: HistoricalImportSourceRow[] }) { return <label><span className="mb-1 block text-xs font-medium text-gray-500">Registered source</span><select className="input" name="source_id" required><option value="">Select source</option>{sources.map((source) => <option key={source.id} value={source.id}>{source.source_ref} · {source.title}</option>)}</select></label> }
