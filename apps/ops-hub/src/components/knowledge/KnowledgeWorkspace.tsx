'use client'

import { useMemo, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { BookOpenCheck, ChevronRight, History, Plus, ShieldCheck } from 'lucide-react'
import { api } from '@/lib/apiClient'
import type { KnowledgeRecord } from '@/lib/knowledge'

type BrandOption = { id: string; name: string }

/**
 * §37: `canPublish` is a PER-RECORD decision keyed by entry id, resolved on the
 * server from the same authority check the publish endpoint runs. Editing a
 * document and being allowed to make it company policy are different rights, so
 * a Publish button shown on `canEdit` alone advertises an action the server will
 * refuse — and, worse, implies the person holds authority they do not.
 */
export function KnowledgeWorkspace({ records, brands, canEdit, canPublish = {} }: {
  records: KnowledgeRecord[]
  brands: BrandOption[]
  canEdit: boolean
  canPublish?: Record<string, boolean>
}) {
  const router = useRouter()
  const [showCreate, setShowCreate] = useState(false)
  const [versionFor, setVersionFor] = useState<KnowledgeRecord | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const brandById = useMemo(() => new Map(brands.map((brand) => [brand.id, brand.name])), [brands])

  async function post(action: string, values: Record<string, unknown>) {
    setBusy(true); setError('')
    const { ok, data } = await api<{ error?: string }>('/api/knowledge', { method: 'POST', body: JSON.stringify({ action, values }) })
    setBusy(false)
    if (!ok) { setError(data?.error ?? 'Could not save knowledge.'); return false }
    setShowCreate(false); setVersionFor(null); router.refresh(); return true
  }

  async function publish(record: KnowledgeRecord, versionId: string) {
    if (!confirm('Publish this reviewed draft as current knowledge? The previous current version will be superseded.')) return
    await post('publish', { entry_id: record.id, version_id: versionId })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-ocg-gold">OCG Group Operating System</p><h1 className="mt-1 text-2xl font-semibold text-gray-900">Knowledge</h1><p className="mt-1 max-w-3xl text-sm text-gray-500">Policies, SOPs, routines, training and institutional memory—with current and legacy material kept visibly distinct.</p></div>
        {canEdit && <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white"><Plus size={15} /> New knowledge entry</button>}
      </div>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {records.length === 0 ? <div className="rounded-xl border border-dashed border-gray-200 bg-white p-10 text-center"><BookOpenCheck className="mx-auto text-gray-300" size={36} /><p className="mt-3 font-medium text-gray-700">No knowledge entries in your scope</p><p className="mt-1 text-sm text-gray-500">Legacy documents will remain legacy until deliberately reviewed and replaced by an approved current version.</p></div> : (
        <div className="grid gap-4 xl:grid-cols-2">{records.map((record) => {
          const shown = record.currentVersion ?? record.versions[0] ?? null
          const draft = record.versions.find((version) => version.status === 'draft')
          return <article key={record.id} className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm transition hover:border-ocg-gold/40 hover:shadow-md">
            <Link href={`/knowledge/${record.id}`} className="block">
              <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{record.knowledge_type.replaceAll('_', ' ')}</p><h2 className="mt-1 flex items-center gap-1 font-semibold text-gray-900 hover:text-ocg-gold">{record.title}<ChevronRight size={15} className="text-gray-300" /></h2></div><Status value={shown?.status ?? 'draft'} /></div>
              <p className="mt-3 line-clamp-4 whitespace-pre-wrap text-sm text-gray-600">{shown?.content_body || 'File-based knowledge entry'}</p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-gray-500"><span>{record.brand_id ? brandById.get(record.brand_id) ?? 'Unknown entity' : 'Group'}</span>{record.department && <span>· {record.department}</span>}<span>· v{shown?.version_no ?? 1}</span>{record.tags.map((tag) => <span key={tag} className="rounded-full bg-gray-100 px-2 py-0.5">{tag}</span>)}</div>
              {shown?.status === 'legacy' && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Legacy/reference material—not current approved policy.</p>}
            </Link>
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
              <Link href={`/knowledge/${record.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-ocg-navy hover:text-ocg-gold">Open & read <ChevronRight size={13} /></Link>
              <span className="inline-flex items-center gap-1 text-xs text-gray-400"><History size={13} /> {record.versions.length} version{record.versions.length === 1 ? '' : 's'}</span>
              {canEdit && <button onClick={() => setVersionFor(record)} className="ml-auto rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600">New version</button>}
              {canPublish[record.id] && draft && <button disabled={busy} onClick={() => publish(record, draft.id)} className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"><ShieldCheck size={13} /> Publish draft</button>}
              {canEdit && !canPublish[record.id] && draft && <span className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs text-gray-500" title="Publishing needs explicit knowledge approval authority for this entity.">Draft awaiting approval</span>}
            </div>
          </article>
        })}</div>
      )}
      {showCreate && <KnowledgeDialog brands={brands} busy={busy} onClose={() => setShowCreate(false)} onSubmit={(values) => post('create', values)} />}
      {versionFor && <VersionDialog record={versionFor} busy={busy} onClose={() => setVersionFor(null)} onSubmit={(values) => post('new-version', { ...values, entry_id: versionFor.id })} />}
    </div>
  )
}

export function KnowledgeStatus({ value }: { value: string }) { const tone = value === 'current' ? 'bg-green-50 text-green-700' : value === 'legacy' ? 'bg-amber-50 text-amber-700' : value === 'draft' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600'; return <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${tone}`}>{value}</span> }
const Status = KnowledgeStatus

function KnowledgeDialog({ brands, busy, onClose, onSubmit }: { brands: BrandOption[]; busy: boolean; onClose: () => void; onSubmit: (values: Record<string, unknown>) => Promise<boolean> }) {
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); await onSubmit(Object.fromEntries(new FormData(event.currentTarget).entries())) }
  return <Dialog title="New knowledge entry" busy={busy} onClose={onClose}><form onSubmit={submit} className="grid gap-3 sm:grid-cols-2"><Input name="title" label="Title" required /><Select name="knowledge_type" label="Knowledge type" options={['policy','sop','procedure','job_description','operational_routine','checklist','control','rule','company_information','product_service_knowledge','training','historical_legacy_system','reference_material']} /><BrandSelect brands={brands} /><Input name="department" label="Department / area" /><Select name="visibility_scope" label="Visibility" options={['department','management','group','own']} /><Select name="source_class" label="Source class" options={['live','legacy','historical','reference']} /><Input name="tags" label="Tags (comma-separated)" /><Input name="source_title" label="Source title" /><Input name="source_date" label="Source date" type="date" /><Input name="file_url" label="File reference / URL" /><Textarea name="content_body" label="Content / summary" /><Submit busy={busy} onClose={onClose} /></form></Dialog>
}

export function KnowledgeVersionDialog({ record, busy, onClose, onSubmit }: { record: KnowledgeRecord; busy: boolean; onClose: () => void; onSubmit: (values: Record<string, unknown>) => Promise<boolean> }) {
  const current = record.currentVersion ?? record.versions[0]
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); await onSubmit(Object.fromEntries(new FormData(event.currentTarget).entries())) }
  return <Dialog title={`New version · ${record.title}`} busy={busy} onClose={onClose}><form onSubmit={submit} className="grid gap-3"><Textarea name="content_body" label="Revised content" defaultValue={current?.content_body} /><Input name="file_url" label="File reference / URL" defaultValue={current?.file_url} /><Input name="change_summary" label="What changed?" required /><Submit busy={busy} onClose={onClose} /></form></Dialog>
}
const VersionDialog = KnowledgeVersionDialog

export function Dialog({ title, children, onClose }: { title: string; children: React.ReactNode; busy: boolean; onClose: () => void }) { return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"><h3 className="mb-4 font-semibold text-gray-900">{title}</h3>{children}<button type="button" onClick={onClose} className="sr-only">Close</button></div></div> }
function Submit({ busy, onClose }: { busy: boolean; onClose: () => void }) { return <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600">Cancel</button><button disabled={busy} className="rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{busy ? 'Saving…' : 'Save'}</button></div> }
function Input({ name, label, required, type = 'text', defaultValue }: { name: string; label: string; required?: boolean; type?: string; defaultValue?: string }) { return <label><span className="mb-1 block text-xs font-medium text-gray-500">{label}</span><input className="input" name={name} required={required} type={type} defaultValue={defaultValue} /></label> }
function Textarea({ name, label, defaultValue }: { name: string; label: string; defaultValue?: string }) { return <label className="sm:col-span-2"><span className="mb-1 block text-xs font-medium text-gray-500">{label}</span><textarea className="input min-h-32" name={name} defaultValue={defaultValue} /></label> }
function Select({ name, label, options }: { name: string; label: string; options: string[] }) { return <label><span className="mb-1 block text-xs font-medium text-gray-500">{label}</span><select className="input" name={name}>{options.map((option) => <option key={option} value={option}>{option.replaceAll('_', ' ')}</option>)}</select></label> }
function BrandSelect({ brands }: { brands: BrandOption[] }) { return <label><span className="mb-1 block text-xs font-medium text-gray-500">Entity / brand</span><select className="input" name="brand_id"><option value="">Group</option>{brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></label> }
