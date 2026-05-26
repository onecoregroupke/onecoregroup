'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, Save, Sparkles, CheckCircle, AlertCircle } from 'lucide-react'
import { usePermissions } from '@/contexts/PermissionsContext'
import { apiFetch } from '@/lib/marketing/client'
import {
  REPORT_STATUS_LABELS,
  type ExecutiveReport,
  type ReportStatus,
} from '@/lib/marketing/types'

const TRANSITIONS: Record<ReportStatus, ReportStatus[]> = {
  drafting: ['approved', 'cancelled'],
  approved: ['sending', 'drafting', 'cancelled'],
  sending: ['sent', 'cancelled'],
  sent: [],
  cancelled: [],
}

export default function ReportDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id
  const { can, isAdmin } = usePermissions()
  const canEdit = isAdmin || can('marketing', 'edit')

  const [report, setReport] = useState<ExecutiveReport | null>(null)
  const [subject, setSubject] = useState('')
  const [preheader, setPreheader] = useState('')
  const [recipients, setRecipients] = useState('')
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  function hydrate(r: ExecutiveReport) {
    setReport(r)
    setSubject(r.subject)
    setPreheader(r.preheader ?? '')
    setRecipients(r.recipients.join(', '))
    setBody(r.bodyMarkdown)
  }

  async function load() {
    if (!id) return
    setLoading(true)
    try {
      const { report: r } = await apiFetch<{ report: ExecutiveReport }>(`/api/marketing/reports?id=${id}`)
      hydrate(r)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function save() {
    setSaving(true); setError(''); setMessage('')
    try {
      const { report: r } = await apiFetch<{ report: ExecutiveReport }>('/api/marketing/reports', {
        method: 'PATCH',
        body: JSON.stringify({
          id,
          subject: subject.trim(),
          preheader: preheader.trim() || null,
          bodyMarkdown: body,
          recipients: recipients.split(',').map((x) => x.trim()).filter(Boolean),
        }),
      })
      hydrate(r)
      setMessage('Report saved.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  async function regenerate() {
    setBusy(true); setError(''); setMessage('')
    try {
      const { report: r } = await apiFetch<{ report: ExecutiveReport }>('/api/marketing/reports', {
        method: 'PATCH',
        body: JSON.stringify({ id, action: 'regenerate' }),
      })
      hydrate(r)
      setMessage('Narrative regenerated.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Regenerate failed.')
    } finally {
      setBusy(false)
    }
  }

  async function transition(toStatus: ReportStatus) {
    setBusy(true); setError(''); setMessage('')
    try {
      const { report: r } = await apiFetch<{ report: ExecutiveReport }>('/api/marketing/reports', {
        method: 'PATCH',
        body: JSON.stringify({ id, action: 'transition', toStatus }),
      })
      hydrate(r)
      setMessage(`Moved to ${REPORT_STATUS_LABELS[r.status]}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transition failed.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <p className="text-sm text-gray-400">Loading…</p>
  if (!report) return <p className="text-sm text-gray-400">Report not found.</p>

  const allowed = TRANSITIONS[report.status]

  return (
    <div className="space-y-6">
      <Link href="/marketing/reports" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft size={15} /> Back to reports
      </Link>

      {message && (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-700">
          <CheckCircle size={16} /> {message}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4 flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-900">{report.periodStart} → {report.periodEnd}</p>
            <span className="rounded-full bg-gray-100 px-3 py-0.5 text-xs font-medium text-gray-600">
              {REPORT_STATUS_LABELS[report.status]}
            </span>
          </div>
          <div className="p-5 space-y-4">
            <Field label="Subject"><input value={subject} onChange={(e) => setSubject(e.target.value)} className={inputCls} /></Field>
            <Field label="Preheader"><input value={preheader} onChange={(e) => setPreheader(e.target.value)} className={inputCls} /></Field>
            <Field label="Recipients (comma-separated)"><input value={recipients} onChange={(e) => setRecipients(e.target.value)} className={inputCls} /></Field>
            <Field label="Body (Markdown)">
              <textarea value={body} rows={18} onChange={(e) => setBody(e.target.value)} className={`${inputCls} font-mono text-xs`} />
            </Field>
            {canEdit && (
              <div className="flex justify-end border-t border-gray-100 pt-4">
                <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60">
                  <Save size={16} /> {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            )}
          </div>
        </section>

        <aside className="space-y-6">
          {report.aiNarrative && (
            <section className="bg-white rounded-2xl border border-gray-100 shadow-sm">
              <div className="border-b border-gray-100 px-5 py-3">
                <p className="text-sm font-semibold text-gray-900">AI narrative</p>
              </div>
              <p className="p-5 text-sm text-gray-600 whitespace-pre-wrap">{report.aiNarrative}</p>
            </section>
          )}

          {canEdit && (
            <section className="bg-white rounded-2xl border border-gray-100 shadow-sm">
              <div className="border-b border-gray-100 px-5 py-3">
                <p className="text-sm font-semibold text-gray-900">Actions</p>
              </div>
              <div className="p-4 space-y-2">
                <button onClick={regenerate} disabled={busy} className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60">
                  <Sparkles size={15} /> Regenerate narrative
                </button>
                {allowed.map((s) => (
                  <button key={s} onClick={() => transition(s)} disabled={busy} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60">
                    Move to {REPORT_STATUS_LABELS[s]}
                  </button>
                ))}
                {allowed.length === 0 && <p className="text-xs text-gray-400">No further transitions.</p>}
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  )
}

const inputCls =
  'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-ocg-navy'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">{label}</span>
      {children}
    </label>
  )
}
