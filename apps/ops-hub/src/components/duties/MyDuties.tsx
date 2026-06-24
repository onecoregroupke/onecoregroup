'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, Circle } from 'lucide-react'
import { api } from '@/lib/apiClient'

type Duty = { id: string; title: string; description: string; status: string }

export function MyDuties() {
  const [duties, setDuties] = useState<Duty[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    api<{ duties: Duty[] }>('/api/my-duties').then(({ data }) => {
      setDuties(data.duties ?? [])
      setLoaded(true)
    })
  }, [])

  async function toggle(duty: Duty) {
    const next = duty.status === 'done' ? 'pending' : 'done'
    setBusy(duty.id)
    const { ok } = await api('/api/duties/log', { method: 'POST', body: JSON.stringify({ duty_id: duty.id, status: next }) })
    setBusy(null)
    if (ok) setDuties((prev) => prev.map((d) => (d.id === duty.id ? { ...d, status: next } : d)))
  }

  if (!loaded || duties.length === 0) return null

  const done = duties.filter((d) => d.status === 'done').length

  return (
    <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ocg-gold">Today&apos;s duties</h2>
        <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${done === duties.length ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{done}/{duties.length} done</span>
      </div>
      <div className="space-y-2">
        {duties.map((d) => (
          <button
            key={d.id}
            onClick={() => toggle(d)}
            disabled={busy === d.id}
            className="flex w-full items-center gap-3 rounded-lg border border-gray-100 p-3 text-left hover:border-ocg-gold/40 disabled:opacity-60"
          >
            {d.status === 'done' ? <CheckCircle2 size={18} className="shrink-0 text-emerald-600" /> : <Circle size={18} className="shrink-0 text-gray-300" />}
            <span className="min-w-0">
              <span className={`block text-sm font-medium ${d.status === 'done' ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{d.title}</span>
              {d.description && <span className="block truncate text-xs text-gray-400">{d.description}</span>}
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
