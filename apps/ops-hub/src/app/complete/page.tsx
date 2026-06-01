'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

interface TaskSummary {
  task_id: string
  task_name: string
  project_name: string
  priority: string
  target_date: string
  current_status: string
  assigned_to: string
}

function CompleteInner() {
  const sp = useSearchParams()
  const task = sp.get('task') ?? ''
  const token = sp.get('token') ?? ''

  const [state, setState] = useState<'loading' | 'ready' | 'invalid' | 'done'>('loading')
  const [reason, setReason] = useState('')
  const [summary, setSummary] = useState<TaskSummary | null>(null)
  const [form, setForm] = useState({ status: 'Completed', summary: '', outcome: '', blockers_notes: '', submitted_by: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!task || !token) {
      setState('invalid')
      setReason('Missing task or token.')
      return
    }
    fetch(`/api/complete/verify?task=${encodeURIComponent(task)}&token=${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setSummary(d.task)
          setForm((f) => ({ ...f, submitted_by: d.task.assigned_to ?? '' }))
          setState('ready')
        } else {
          setReason(d.error ?? 'This link is not valid.')
          setState('invalid')
        }
      })
      .catch(() => {
        setReason('Could not verify this link.')
        setState('invalid')
      })
  }, [task, token])

  async function submit() {
    setSaving(true)
    const res = await fetch('/api/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task, token, ...form }),
    })
    setSaving(false)
    if (res.ok) setState('done')
  }

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-12">
      <div className="mx-auto max-w-lg">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-ocg-gold text-sm font-bold text-white">
            OCG
          </div>
          <p className="text-sm text-gray-500">One Core Group · Task completion</p>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm">
          {state === 'loading' && <p className="text-sm text-gray-500">Verifying link…</p>}

          {state === 'invalid' && (
            <div>
              <h1 className="text-lg font-semibold text-gray-900">Link not valid</h1>
              <p className="mt-1 text-sm text-gray-500">{reason}</p>
            </div>
          )}

          {state === 'done' && (
            <div>
              <h1 className="text-lg font-semibold text-gray-900">Thank you ✓</h1>
              <p className="mt-1 text-sm text-gray-500">Your update was recorded and the task has been advanced.</p>
            </div>
          )}

          {state === 'ready' && summary && (
            <div className="space-y-4">
              <div>
                <p className="text-xs uppercase tracking-wider text-gray-400">
                  {summary.task_id} · {summary.project_name}
                </p>
                <h1 className="mt-1 text-lg font-semibold text-gray-900">{summary.task_name}</h1>
                <p className="text-xs text-gray-500">
                  {summary.priority} priority{summary.target_date ? ` · due ${summary.target_date}` : ''}
                </p>
              </div>

              <Field label="Status">
                <select className="inp" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                  <option>Completed</option>
                  <option>Partially Completed</option>
                  <option>Blocked</option>
                </select>
              </Field>
              <Field label="What did you do?">
                <textarea className="inp min-h-[90px]" value={form.summary} onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))} />
              </Field>
              <Field label="Outcome / result (optional)">
                <input className="inp" value={form.outcome} onChange={(e) => setForm((f) => ({ ...f, outcome: e.target.value }))} />
              </Field>
              <Field label="Blockers (optional)">
                <input className="inp" value={form.blockers_notes} onChange={(e) => setForm((f) => ({ ...f, blockers_notes: e.target.value }))} />
              </Field>
              <Field label="Your name">
                <input className="inp" value={form.submitted_by} onChange={(e) => setForm((f) => ({ ...f, submitted_by: e.target.value }))} />
              </Field>

              <button
                onClick={submit}
                disabled={saving}
                className="w-full rounded-lg bg-ocg-navy py-3 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {saving ? 'Submitting…' : 'Submit'}
              </button>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        :global(.inp) {
          width: 100%;
          border: 1px solid #e5e7eb;
          border-radius: 0.5rem;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
        }
        :global(.inp:focus) { outline: none; box-shadow: 0 0 0 2px #1a1a2e33; }
      `}</style>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-500">{label}</label>
      {children}
    </div>
  )
}

export default function CompletePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-100" />}>
      <CompleteInner />
    </Suspense>
  )
}
