'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CalendarClock, MapPin } from 'lucide-react'
import { api } from '@/lib/apiClient'
import { statusTone, priorityTone, TASK_STATUSES } from '@/lib/taskStatuses'
import { formatEatRange } from '@/lib/kenyaTime'
import { MyDuties } from '@/components/duties/MyDuties'
import { PrivateTasks } from '@/components/personal/PrivateTasks'
import type { OpsTaskRow } from '@ocg/db'
import type { MyAppointment } from '@/app/api/my-tasks/route'

export default function MyTasksPage() {
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [tasks, setTasks] = useState<OpsTaskRow[]>([])
  const [appointments, setAppointments] = useState<MyAppointment[]>([])

  useEffect(() => {
    load()
  }, [])

  function load() {
    setLoading(true)
    api<{ name: string; tasks: OpsTaskRow[]; appointments: MyAppointment[] }>('/api/my-tasks').then(({ data }) => {
      setName(data.name ?? '')
      setTasks(data.tasks ?? [])
      setAppointments(data.appointments ?? [])
      setLoading(false)
    })
  }

  const open = tasks.filter((t) => t.current_status !== 'Completed')
  const done = tasks.filter((t) => t.current_status === 'Completed')

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">My tasks</h1>
        <p className="text-sm text-gray-500">{name ? `Assigned to ${name}` : 'Your assigned work'}</p>
      </div>

      <MyDuties />

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <>
          {appointments.length > 0 && (
            <Section title={`My appointments (${appointments.length})`}>
              {appointments.map((a) => (
                <div key={a.id} className="grid gap-2 rounded-lg border border-gray-100 p-3 md:grid-cols-[1fr_auto] md:items-center">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 truncate text-sm font-medium text-gray-800">
                      <CalendarClock size={14} className="shrink-0 text-ocg-gold" /> {a.title}
                      {a.customer_name && <span className="text-gray-400">· {a.customer_name}</span>}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-gray-400">
                      {formatEatRange(a.start_at, a.end_at)}
                      {a.location && <><MapPin size={11} className="ml-1 shrink-0" /> {a.location}</>}
                    </p>
                  </div>
                  <span className="w-fit rounded bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">{a.status}</span>
                </div>
              ))}
            </Section>
          )}
          <Section title={`Open (${open.length})`}>
            {open.length === 0 ? (
              <Empty>Nothing open. Nice.</Empty>
            ) : (
              open.map((t) => <Row key={t.task_id} t={t} onChanged={load} />)
            )}
          </Section>
          {done.length > 0 && (
            <Section title={`Completed (${done.length})`}>
              {done.slice(0, 20).map((t) => <Row key={t.task_id} t={t} muted onChanged={load} />)}
            </Section>
          )}
        </>
      )}

      <PrivateTasks />
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ocg-gold">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">{children}</p>
}

function Row({ t, muted, onChanged }: { t: OpsTaskRow; muted?: boolean; onChanged: () => void }) {
  const [status, setStatus] = useState(t.current_status)
  const [saving, setSaving] = useState(false)

  async function updateStatus() {
    setSaving(true)
    await api(`/api/tasks/${t.task_id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status, note: 'Updated from My Tasks portal.' }),
    })
    setSaving(false)
    onChanged()
  }

  return (
    <div className={`grid gap-3 rounded-lg border border-gray-100 p-3 hover:border-ocg-gold/40 md:grid-cols-[1fr_auto] md:items-center ${muted ? 'opacity-60' : ''}`}>
      <div className="min-w-0">
        <Link href={`/tasks/${t.task_id}`} className="truncate text-sm font-medium text-gray-800 hover:text-ocg-gold">{t.task_name}</Link>
        <p className="truncate text-xs text-gray-400">{t.project_name}{t.target_date ? ` · due ${t.target_date}` : ''}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${priorityTone(t.priority)}`}>{t.priority}</span>
        <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${statusTone(t.current_status)}`}>{t.current_status}</span>
        <select className="input h-8 py-1 md:w-40" value={status} onChange={(event) => setStatus(event.target.value)}>
          {TASK_STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <button
          onClick={updateStatus}
          disabled={saving || status === t.current_status}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-ocg-gold hover:text-ocg-gold disabled:opacity-40"
        >
          {saving ? 'Saving...' : 'Update'}
        </button>
      </div>
    </div>
  )
}
