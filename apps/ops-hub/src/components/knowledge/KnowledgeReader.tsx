'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, History, ShieldCheck } from 'lucide-react'
import { api } from '@/lib/apiClient'
import type { KnowledgeRecord } from '@/lib/knowledge'
import type { KnowledgeVersionRow } from '@ocg/db'
import { KnowledgeStatus, KnowledgeVersionDialog } from './KnowledgeWorkspace'

/**
 * The knowledge detail reader (`/knowledge/[entryId]`). Every version is
 * already loaded server-side, so switching versions is a client-only view
 * change — it never mutates `current_version_id`. Publish/new-version still
 * go through the same `/api/knowledge` actions the list page uses, so the
 * server-side authority/scope checks are the only real enforcement.
 */
export function KnowledgeReader({
  record, brandName, canEdit, canPublish,
}: {
  record: KnowledgeRecord
  brandName: string | null
  canEdit: boolean
  canPublish: boolean
}) {
  const router = useRouter()
  const versions = record.versions
  const defaultVersion = record.currentVersion ?? versions[0] ?? null
  const [viewingId, setViewingId] = useState<string | null>(defaultVersion?.id ?? null)
  const [showVersionDialog, setShowVersionDialog] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const viewing = useMemo(
    () => versions.find((version) => version.id === viewingId) ?? defaultVersion,
    [versions, viewingId, defaultVersion],
  )
  const isCurrent = Boolean(viewing && record.current_version_id === viewing.id)

  async function post(action: string, values: Record<string, unknown>) {
    setBusy(true); setError('')
    const { ok, data } = await api<{ error?: string }>('/api/knowledge', { method: 'POST', body: JSON.stringify({ action, values }) })
    setBusy(false)
    if (!ok) { setError(data?.error ?? 'Could not save.'); return false }
    setShowVersionDialog(false)
    router.refresh()
    return true
  }

  async function publish(version: KnowledgeVersionRow) {
    if (!confirm('Publish this reviewed draft as current knowledge? The previous current version will be superseded.')) return
    await post('publish', { entry_id: record.id, version_id: version.id })
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <BackLink />

      {!viewing ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
          This entry has no content yet.
        </div>
      ) : (
        <>
          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ocg-gold">{record.knowledge_type.replaceAll('_', ' ')}</p>
                <h1 className="mt-1 text-2xl font-semibold text-gray-900">{record.title}</h1>
              </div>
              <KnowledgeStatus value={viewing.status} />
            </div>

            {!isCurrent && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                {viewing.status === 'draft'
                  ? 'Draft version — not yet published as current knowledge.'
                  : `Historical version ${viewing.version_no} — not the current operating instruction.`}
              </p>
            )}

            <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              <Meta label="Entity / brand" value={brandName ?? 'Group'} />
              <Meta label="Department" value={record.department || '—'} />
              <Meta label="Operational area" value={record.operational_area || '—'} />
              <Meta label="Visibility" value={record.visibility_scope} />
              <Meta label="Version" value={`v${viewing.version_no}`} />
              <Meta label="Status" value={viewing.status} />
              <Meta label="Effective from" value={viewing.effective_from ?? '—'} />
              <Meta label="Effective until" value={viewing.effective_until ?? '—'} />
              <Meta label="Review date" value={viewing.review_date ?? '—'} />
            </dl>

            {record.tags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {record.tags.map((tag) => <span key={tag} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600">{tag}</span>)}
              </div>
            )}

            {(viewing.source_title || viewing.source_type || viewing.source_reference || viewing.file_url) && (
              <div className="mt-4 rounded-lg bg-gray-50 px-4 py-3 text-xs text-gray-500">
                <p className="font-semibold uppercase tracking-wide text-gray-400">Source</p>
                <p className="mt-1">{[viewing.source_title, viewing.source_type, viewing.source_date, viewing.source_reference].filter(Boolean).join(' · ') || '—'}</p>
                {viewing.file_url && <a href={viewing.file_url} target="_blank" rel="noreferrer" className="mt-1 inline-block break-all text-ocg-navy hover:underline">{viewing.file_url}</a>}
              </div>
            )}

            {viewing.status !== 'draft' && viewing.approved_by && (
              <p className="mt-3 text-xs text-gray-400">
                Approved by {viewing.approved_by}{viewing.approved_at ? ` on ${new Date(viewing.approved_at).toLocaleDateString()}` : ''}
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
            <div className="whitespace-pre-wrap text-[15px] leading-7 text-gray-800">
              {viewing.content_body || 'No content recorded for this version.'}
            </div>
          </section>

          {(canEdit || (canPublish && viewing.status === 'draft')) && (
            <div className="flex flex-wrap items-center gap-2">
              {canEdit && (
                <button onClick={() => setShowVersionDialog(true)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600">
                  New version
                </button>
              )}
              {canPublish && viewing.status === 'draft' && (
                <button disabled={busy} onClick={() => publish(viewing)} className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
                  <ShieldCheck size={15} /> Publish this version
                </button>
              )}
            </div>
          )}
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ocg-gold">
              <History size={14} /> Version history
            </h2>
            <ul className="divide-y divide-gray-100">
              {versions.map((version) => {
                const active = version.id === viewing.id
                const current = version.id === record.current_version_id
                return (
                  <li key={version.id}>
                    <button
                      onClick={() => setViewingId(version.id)}
                      className={`flex w-full flex-wrap items-center justify-between gap-2 py-3 text-left text-sm ${active ? 'text-ocg-navy' : 'text-gray-600 hover:text-gray-900'}`}
                    >
                      <span className="flex items-center gap-2">
                        <span className="font-medium">v{version.version_no}</span>
                        <KnowledgeStatus value={version.status} />
                        {current && <span className="text-[10px] font-bold uppercase tracking-wide text-green-600">current</span>}
                        {active && <span className="text-[10px] font-semibold uppercase tracking-wide text-ocg-gold">viewing</span>}
                      </span>
                      <span className="text-xs text-gray-400">
                        {version.created_by}{version.created_at ? ` · ${new Date(version.created_at).toLocaleDateString()}` : ''}
                      </span>
                    </button>
                    {version.change_summary && <p className="pb-2 pl-0.5 text-xs text-gray-400">{version.change_summary}</p>}
                  </li>
                )
              })}
            </ul>
          </section>
        </>
      )}

      {showVersionDialog && (
        <KnowledgeVersionDialog
          record={record}
          busy={busy}
          onClose={() => setShowVersionDialog(false)}
          onSubmit={(values) => post('new-version', { ...values, entry_id: record.id })}
        />
      )}
    </div>
  )
}

function BackLink() {
  return (
    <Link href="/knowledge" className="inline-flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-ocg-gold">
      <ArrowLeft size={13} /> Back to Knowledge
    </Link>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className="mt-0.5 text-gray-800">{value}</dd>
    </div>
  )
}
