'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, Circle, Lock, Plus, Trash2 } from 'lucide-react'
import { getClient } from '@/lib/supabase'
import type { OcgPersonalTaskRow } from '@ocg/db'

const CATEGORIES = ['Personal', 'Home', 'Family', 'Errand', 'Finance', 'Health', 'Work prep']
const PRIORITIES = ['Low', 'Medium', 'High']

/**
 * The signed-in user's PRIVATE to-do list, embedded in My Tasks. Rows live in
 * ocg_personal_tasks scoped to the owner's email — they are never visible to
 * admins or brand managers and never feed the ops reports. Every portal user
 * gets this space to run their own work their own way.
 */
export function PrivateTasks() {
  const [tasks, setTasks] = useState<OcgPersonalTaskRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ title: '', category: 'Personal', priority: 'Medium', due_date: '' })
  const [saving, setSaving] = useState(false)
  const [showDone, setShowDone] = useState(false)

  async function authHeaders() {
    const { data: { session } } = await getClient().auth.getSession()
    if (!session) throw new Error('Session expired.')
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }
  }

  async function load() {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/personal', { headers: await authHeaders() })
      const json = await res.json() as { tasks?: OcgPersonalTaskRow[]; error?: string }
      if (!res.ok) throw new Error(json.error)
      setTasks(json.tasks ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load.')
    } finally { setLoading(false) }
  }

  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function add() {
    if (!form.title.trim()) return
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/personal', { method: 'POST', headers: await authHeaders(), body: JSON.stringify(form) })
      const json = await res.json() as { task?: OcgPersonalTaskRow; error?: string }
      if (!res.ok) throw new Error(json.error)
      setTasks(prev => [json.task!, ...prev])
      setForm({ title: '', category: form.category, priority: 'Medium', due_date: '' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add.')
    } finally { setSaving(false) }
  }

  async function toggle(t: OcgPersonalTaskRow) {
    const status = t.status === 'done' ? 'open' : 'done'
    setTasks(prev => prev.map(x => x.id === t.id ? { ...x, status } : x))
    await fetch('/api/personal', { method: 'PATCH', headers: await authHeaders(), body: JSON.stringify({ id: t.id, status }) })
  }

  async function remove(t: OcgPersonalTaskRow) {
    setTasks(prev => prev.filter(x => x.id !== t.id))
    await fetch(`/api/personal?id=${t.id}`, { method: 'DELETE', headers: await authHeaders() })
  }

  const open = tasks.filter(t => t.status !== 'done')
  const done = tasks.filter(t => t.status === 'done')

  return (
    <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ocg-gold">
            <Lock size={12} /> Private tasks ({open.length})
          </h2>
          <p className="mt-0.5 text-xs text-gray-400">Only you can see these — they are not tracked by admins or managers.</p>
        </div>
        {done.length > 0 && (
          <button onClick={() => setShowDone(v => !v)} className="text-xs font-medium text-gray-400 hover:text-gray-700">
            {showDone ? 'Hide done' : `Done (${done.length})`}
          </button>
        )}
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 p-2.5 text-sm text-red-700">{error}</p>}

      <div className="mb-3 grid gap-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]">
        <input className="input" value={form.title} placeholder="Add a private to-do…"
          onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          onKeyDown={e => e.key === 'Enter' && add()} />
        <select className="input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
        <select className="input" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
          {PRIORITIES.map(p => <option key={p}>{p}</option>)}
        </select>
        <input type="date" className="input" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
        <button onClick={add} disabled={saving || !form.title.trim()}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60">
          <Plus size={15} /> Add
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : open.length === 0 && (!showDone || done.length === 0) ? (
        <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500">Nothing private on your list. Add one above — nobody else will see it.</p>
      ) : (
        <div className="space-y-1.5">
          {open.map(t => <Row key={t.id} t={t} onToggle={toggle} onRemove={remove} />)}
          {showDone && done.map(t => <Row key={t.id} t={t} onToggle={toggle} onRemove={remove} muted />)}
        </div>
      )}
    </section>
  )
}

function Row({ t, onToggle, onRemove, muted }: {
  t: OcgPersonalTaskRow
  onToggle: (t: OcgPersonalTaskRow) => void
  onRemove: (t: OcgPersonalTaskRow) => void
  muted?: boolean
}) {
  return (
    <div className={`flex items-center gap-3 rounded-lg border border-gray-100 px-3 py-2 ${muted ? 'opacity-60' : ''}`}>
      <button onClick={() => onToggle(t)} className="shrink-0">
        {t.status === 'done' ? <CheckCircle2 size={17} className="text-emerald-600" /> : <Circle size={17} className="text-gray-300" />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm font-medium ${t.status === 'done' ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{t.title}</p>
        <p className="text-xs text-gray-400">{t.category}{t.due_date ? ` · due ${t.due_date}` : ''}</p>
      </div>
      <span className="shrink-0 rounded bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">{t.priority}</span>
      <button onClick={() => onRemove(t)} className="shrink-0 text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
    </div>
  )
}
