'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Clock3, LogIn, LogOut, TriangleAlert } from 'lucide-react'
import { api } from '@/lib/apiClient'
import type { AttendanceEvidenceDaily } from '@/lib/attendance'

const SOURCES = ['biometric', 'employee_self', 'reviewer_manual'] as const
const SOURCE_LABEL = { biometric: 'Biometric', employee_self: 'Self clock', reviewer_manual: 'Manual / reviewer' }

export function AttendanceWorkspace({ evidence, today, todayDate, canManage, people }: {
  evidence: AttendanceEvidenceDaily[]
  today: Array<{ id: string; direction: string; source: string; occurred_at: string }>
  todayDate: string
  canManage: boolean
  people: Array<{ id: string; name: string }>
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [manual, setManual] = useState({ team_member_id: people[0]?.id ?? '', occurred_at: '', direction: 'in', reason: '', notes: '' })
  const [identity, setIdentity] = useState({ team_member_id: people[0]?.id ?? '', device_name: 'Deli S151', employee_code: '', notes: '' })
  const selfIn = today.find((event) => event.source === 'employee_self' && event.direction === 'in')
  const selfOut = today.find((event) => event.source === 'employee_self' && event.direction === 'out')
  const currentlySelfClockedIn = evidence.filter((row) => row.source === 'employee_self'
    && row.event_date === todayDate && !!row.check_in_at && !row.check_out_at)

  const days = useMemo(() => {
    const map = new Map<string, { memberId: string; name: string; email: string; date: string; bySource: Map<string, AttendanceEvidenceDaily> }>()
    for (const row of evidence) {
      const key = `${row.team_member_id}:${row.event_date}`
      const current = map.get(key) ?? { memberId: row.team_member_id, name: row.employee_name, email: row.employee_email, date: row.event_date, bySource: new Map() }
      current.bySource.set(row.source, row)
      map.set(key, current)
    }
    return [...map.values()].sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name))
  }, [evidence])

  async function post(body: Record<string, unknown>) {
    setBusy(true); setError('')
    const { ok, data } = await api<{ error?: string }>('/api/attendance', { method: 'POST', body: JSON.stringify(body) })
    setBusy(false)
    if (!ok) { setError(data?.error ?? 'Attendance could not be recorded.'); return }
    router.refresh()
  }

  return <div className="space-y-5">
    <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-ocg-gold">My attendance today</p><p className="mt-1 text-sm text-gray-500">The server records the current time. Self-clock evidence never replaces biometric evidence.</p></div><div className="flex gap-2"><button disabled={busy || !!selfIn} onClick={() => post({ action: 'self-clock', direction: 'in' })} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"><LogIn size={15} /> {selfIn ? `In ${time(selfIn.occurred_at)}` : 'Clock in'}</button><button disabled={busy || !selfIn || !!selfOut} onClick={() => post({ action: 'self-clock', direction: 'out' })} className="inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white disabled:opacity-40"><LogOut size={15} /> {selfOut ? `Out ${time(selfOut.occurred_at)}` : 'Clock out'}</button></div></div>
      {error && <p className="mt-3 rounded-lg bg-red-50 p-2.5 text-sm text-red-600">{error}</p>}
    </section>

    {canManage ? <section className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm"><p className="text-2xl font-light tabular-nums text-gray-900">{currentlySelfClockedIn.length}</p><p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Currently self-clocked in</p>{currentlySelfClockedIn.length > 0 ? <p className="mt-2 text-xs text-gray-500">{currentlySelfClockedIn.map((row) => row.employee_name).join(', ')}</p> : null}</section> : null}

    {canManage && <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wider text-ocg-gold">Reviewer / manual evidence</p><p className="mt-1 text-sm text-gray-500">Manual evidence is explicitly labelled and requires a reviewer reason.</p><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5"><Field label="Employee"><select className="input" value={manual.team_member_id} onChange={(event) => setManual({ ...manual, team_member_id: event.target.value })}>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></Field><Field label="Date & time"><input type="datetime-local" className="input" value={manual.occurred_at} onChange={(event) => setManual({ ...manual, occurred_at: event.target.value })} /></Field><Field label="Direction"><select className="input" value={manual.direction} onChange={(event) => setManual({ ...manual, direction: event.target.value })}><option value="in">IN</option><option value="out">OUT</option></select></Field><Field label="Reason"><input className="input" value={manual.reason} onChange={(event) => setManual({ ...manual, reason: event.target.value })} /></Field><Field label="Notes"><input className="input" value={manual.notes} onChange={(event) => setManual({ ...manual, notes: event.target.value })} /></Field></div><button disabled={busy} onClick={() => post({ action: 'manual-evidence', ...manual, occurred_at: manual.occurred_at ? `${manual.occurred_at}:00+03:00` : '', idempotency_key: crypto.randomUUID() })} className="mt-3 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Record manual evidence</button><div className="mt-5 border-t border-gray-100 pt-4"><p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Biometric identity mapping</p><p className="mt-1 text-xs text-gray-500">Map device codes explicitly; names are never guessed.</p><div className="mt-3 grid gap-3 md:grid-cols-4"><Field label="Employee"><select className="input" value={identity.team_member_id} onChange={(event) => setIdentity({ ...identity, team_member_id: event.target.value })}>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></Field><Field label="Device"><input className="input" value={identity.device_name} onChange={(event) => setIdentity({ ...identity, device_name: event.target.value })} /></Field><Field label="Employee code"><input className="input" value={identity.employee_code} onChange={(event) => setIdentity({ ...identity, employee_code: event.target.value })} /></Field><Field label="Notes"><input className="input" value={identity.notes} onChange={(event) => setIdentity({ ...identity, notes: event.target.value })} /></Field></div><button disabled={busy || !identity.employee_code.trim()} onClick={() => post({ action: 'map-device-identity', ...identity })} className="mt-3 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 disabled:opacity-50">Save device mapping</button></div></section>}

    <section className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm"><div className="border-b border-gray-100 p-5"><p className="text-xs font-semibold uppercase tracking-wider text-ocg-gold">Evidence reconciliation</p><p className="mt-1 text-sm text-gray-500">Each source stays independent. Flags highlight timing differences; they never alter evidence.</p></div>{days.length === 0 ? <p className="p-6 text-sm text-gray-500">No attendance evidence yet.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-sm"><thead><tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400"><th className="px-4 py-3">Date / employee</th>{SOURCES.map((source) => <th key={source} className="px-4 py-3">{SOURCE_LABEL[source]}</th>)}<th className="px-4 py-3">Reconciliation</th></tr></thead><tbody className="divide-y divide-gray-50">{days.map((day) => { const discrepancy = hasDiscrepancy([...day.bySource.values()]); return <tr key={`${day.memberId}:${day.date}`} className="hover:bg-gray-50"><td className="px-4 py-3"><p className="font-medium text-gray-800">{day.name}</p><p className="text-xs text-gray-400">{day.date} · {day.email}</p></td>{SOURCES.map((source) => { const row = day.bySource.get(source); return <td key={source} className="px-4 py-3 text-gray-600"><span className="block">IN {time(row?.check_in_at)}</span><span className="block text-xs text-gray-400">OUT {time(row?.check_out_at)}</span></td> })}<td className="px-4 py-3">{discrepancy ? <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700"><TriangleAlert size={12} /> Review difference</span> : <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><Clock3 size={12} /> Aligned</span>}</td></tr> })}</tbody></table></div>}</section>
  </div>
}

function time(value: string | null | undefined) { return value ? new Date(value).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' }) : '—' }
function hasDiscrepancy(rows: AttendanceEvidenceDaily[]) { const points = rows.flatMap((row) => [row.check_in_at, row.check_out_at]).filter(Boolean).map((value) => new Date(value!).getTime()); if (points.length < 2) return false; const ins = rows.map((row) => row.check_in_at).filter(Boolean).map((value) => new Date(value!).getTime()); const outs = rows.map((row) => row.check_out_at).filter(Boolean).map((value) => new Date(value!).getTime()); return (ins.length > 1 && Math.max(...ins) - Math.min(...ins) > 10 * 60_000) || (outs.length > 1 && Math.max(...outs) - Math.min(...outs) > 10 * 60_000) }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label><span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>{children}</label> }
