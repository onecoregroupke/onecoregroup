'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, Circle, Lock, Plus, Trash2 } from 'lucide-react'
import { getClient } from '@/lib/supabase'
import type { OcgPersonalTaskRow } from '@ocg/db'

const CATEGORIES = ['Personal', 'Home', 'Family', 'Errand', 'Finance', 'Health']
const PRIORITIES = ['Low', 'Medium', 'High']

// Every portal user's private space — the API only ever serves the signed-in
// user's own rows, so no permission gate is needed here.
export default function PersonalPage() {
  const [tasks, setTasks] = useState<OcgPersonalTaskRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ title: '', category: 'Personal', priority: 'Medium', due_date: '', notes: '' })
  const [saving, setSaving] = useState(false)

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
      setForm({ title: '', category: form.category, priority: 'Medium', due_date: '', notes: '' })
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
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Lock size={18} className="text-ocg-navy" />
          <h1 className="text-2xl font-semibold text-gray-900">Personal</h1>
        </div>
        <p className="text-sm text-gray-500">Your private home &amp; personal tasks — only you can see these; managers and admins can&apos;t. These never appear in management reports.</p>
      </div>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-6">
          <label className="block lg:col-span-2">
            <span className="mb-1 block text-xs font-medium text-gray-500">Task</span>
            <input className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Pay school fees" onKeyDown={e => e.key === 'Enter' && add()} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Category</span>
            <select className="input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Priority</span>
            <select className="input" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>{PRIORITIES.map(p => <option key={p}>{p}</option>)}</select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Due</span>
            <input type="date" className="input" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
          </label>
          <div className="flex items-end">
            <button onClick={add} disabled={saving || !form.title.trim()} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"><Plus size={16} /> Add</button>
          </div>
        </div>
      </section>

      {loading ? <p className="text-sm text-gray-500">Loading…</p> : (
        <>
          <List title={`To do (${open.length})`} items={open} onToggle={toggle} onRemove={remove} />
          {done.length > 0 && <List title={`Done (${done.length})`} items={done} onToggle={toggle} onRemove={remove} muted />}
        </>
      )}
    </div>
  )
}

function List({ title, items, onToggle, onRemove, muted }: {
  title: string; items: OcgPersonalTaskRow[]
  onToggle: (t: OcgPersonalTaskRow) => void; onRemove: (t: OcgPersonalTaskRow) => void; muted?: boolean
}) {
  return (
    <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ocg-gold">{title}</h2>
      {items.length === 0 ? <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">Nothing here.</p> : (
        <div className="space-y-2">
          {items.map(t => (
            <div key={t.id} className={`flex items-center gap-3 rounded-lg border border-gray-100 p-3 ${muted ? 'opacity-60' : ''}`}>
              <button onClick={() => onToggle(t)} className="shrink-0">
                {t.status === 'done' ? <CheckCircle2 size={18} className="text-emerald-600" /> : <Circle size={18} className="text-gray-300" />}
              </button>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium ${t.status === 'done' ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{t.title}</p>
                <p className="text-xs text-gray-400">{t.category}{t.due_date ? ` · due ${t.due_date}` : ''}</p>
              </div>
              <span className="shrink-0 rounded bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">{t.priority}</span>
              <button onClick={() => onRemove(t)} className="shrink-0 text-gray-300 hover:text-red-500"><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
