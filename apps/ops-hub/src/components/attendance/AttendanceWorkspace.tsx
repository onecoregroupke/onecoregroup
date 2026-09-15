'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  CalendarDays, ChevronLeft, ChevronRight, Clock3, LogIn, LogOut,
  RefreshCcw, Search, TriangleAlert, X,
} from 'lucide-react'
import { api } from '@/lib/apiClient'
import type { AttendanceConsoleRecord, AttendanceEvidenceDaily } from '@/lib/attendance'

type ViewMode = 'day' | 'week' | 'month'

interface AttendancePayload {
  ok: boolean
  error?: string
  records: AttendanceConsoleRecord[]
  evidence: AttendanceEvidenceDaily[]
  today: Array<{ id: string; direction: string; source: string; occurred_at: string }>
}

export function AttendanceWorkspace({ records: initialRecords, evidence: initialEvidence, today, todayDate, canManage, people }: {
  records: AttendanceConsoleRecord[]
  evidence: AttendanceEvidenceDaily[]
  today: Array<{ id: string; direction: string; source: string; occurred_at: string }>
  todayDate: string
  canManage: boolean
  people: Array<{ id: string; name: string }>
}) {
  const router = useRouter()
  const [records, setRecords] = useState(initialRecords)
  const [evidence, setEvidence] = useState(initialEvidence)
  const [selfEvents, setSelfEvents] = useState(today)
  const [view, setView] = useState<ViewMode>('day')
  const [date, setDate] = useState(todayDate)
  const [employee, setEmployee] = useState('')
  const [status, setStatus] = useState('')
  const [selected, setSelected] = useState<AttendanceConsoleRecord | null>(initialRecords[0] ?? null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [manual, setManual] = useState({ team_member_id: people[0]?.id ?? '', occurred_at: '', direction: 'in', reason: '', notes: '' })
  const [identity, setIdentity] = useState({ team_member_id: people[0]?.id ?? '', device_name: 'Deli S151', employee_code: '', notes: '' })

  const range = useMemo(() => rangeFor(view, date), [view, date])
  const filtered = useMemo(() => records
    .filter((record) => !employee || record.team_member_id === employee)
    .filter((record) => !status || statusFor(record) === status || record.status === status),
  [records, employee, status])
  const selectedRecord = selected ? records.find((record) => record.id === selected.id) ?? selected : null
  const selfIn = selfEvents.find((event) => event.source === 'employee_self' && event.direction === 'in')
  const selfOut = selfEvents.find((event) => event.source === 'employee_self' && event.direction === 'out')
  const todayOpen = filtered.filter((record) => record.attendance_date === todayDate && record.open_now)
  const todayClockedIn = filtered.filter((record) => record.attendance_date === todayDate && !!record.check_in_at)

  useEffect(() => {
    void loadRange()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to, employee])

  useEffect(() => {
    if (view !== 'day' || date !== todayDate) return
    const id = window.setInterval(() => { void loadRange({ quiet: true }) }, 20_000)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, date, employee, todayDate, range.from, range.to])

  async function loadRange(opts: { quiet?: boolean } = {}) {
    if (!opts.quiet) setBusy(true)
    const params = new URLSearchParams({ from: range.from, to: range.to })
    if (employee) params.set('employee', employee)
    const { ok, data } = await api<AttendancePayload>(`/api/attendance?${params.toString()}`)
    if (!opts.quiet) setBusy(false)
    if (!ok || !data?.ok) {
      if (!opts.quiet) setError(data?.error ?? 'Attendance could not be loaded.')
      return
    }
    setRecords(data.records ?? [])
    setEvidence(data.evidence ?? [])
    setSelfEvents(data.today ?? [])
  }

  async function post(body: Record<string, unknown>) {
    setBusy(true)
    setError('')
    const { ok, data } = await api<{ error?: string }>('/api/attendance', { method: 'POST', body: JSON.stringify(body) })
    setBusy(false)
    if (!ok) {
      setError(data?.error ?? 'Attendance could not be recorded.')
      return
    }
    await loadRange()
    router.refresh()
  }

  function move(amount: number) {
    setDate(shiftDate(date, view === 'day' ? amount : view === 'week' ? amount * 7 : 0, view === 'month' ? amount : 0))
  }

  return <div className="space-y-5">
    <section className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase text-ocg-gold">My attendance today</p>
          <p className="mt-1 text-sm text-gray-500">The server records the current time. Self-clock evidence updates today&apos;s attendance data.</p>
        </div>
        <div className="flex gap-2">
          <button disabled={busy || !!selfIn} onClick={() => post({ action: 'self-clock', direction: 'in' })} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"><LogIn size={15} /> {selfIn ? `In ${time(selfIn.occurred_at)}` : 'Clock in'}</button>
          <button disabled={busy || !selfIn || !!selfOut} onClick={() => post({ action: 'self-clock', direction: 'out' })} className="inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white disabled:opacity-40"><LogOut size={15} /> {selfOut ? `Out ${time(selfOut.occurred_at)}` : 'Clock out'}</button>
        </div>
      </div>
      {error && <p className="mt-3 rounded-lg bg-red-50 p-2.5 text-sm text-red-600">{error}</p>}
    </section>

    {canManage ? <section className="grid gap-3 md:grid-cols-3">
      <Stat label="Clocked in today" value={todayClockedIn.length} />
      <Stat label="Still at work" value={todayOpen.length} hint={todayOpen.map((row) => row.employee_name).join(', ')} />
      <Stat label="Late today" value={filtered.filter((row) => row.attendance_date === todayDate && row.late_minutes > 0).length} />
    </section> : null}

    <section className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-end gap-3">
        <button onClick={() => { setDate(todayDate); setView('day') }} className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700">Today</button>
        <button aria-label="Previous period" onClick={() => move(-1)} className="rounded-lg border border-gray-200 p-2 text-gray-600"><ChevronLeft size={18} /></button>
        <button aria-label="Next period" onClick={() => move(1)} className="rounded-lg border border-gray-200 p-2 text-gray-600"><ChevronRight size={18} /></button>
        <Field label="Date"><input type="date" className="input" value={date} onChange={(event) => setDate(event.target.value)} /></Field>
        <Field label="View"><select className="input" value={view} onChange={(event) => setView(event.target.value as ViewMode)}><option value="day">Day</option><option value="week">Week</option><option value="month">Month</option></select></Field>
        {canManage && <Field label="Employee"><select className="input min-w-52" value={employee} onChange={(event) => setEmployee(event.target.value)}><option value="">All employees</option>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></Field>}
        <Field label="Status"><select className="input" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All</option><option value="open">In now</option><option value="late">Late</option><option value="complete">Complete</option><option value="incomplete">Incomplete</option><option value="auto">Auto-closed</option></select></Field>
        <button disabled={busy} onClick={() => loadRange()} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 disabled:opacity-50"><RefreshCcw size={15} /> Refresh</button>
      </div>
      <p className="mt-3 flex items-center gap-2 text-xs text-gray-500"><CalendarDays size={14} /> Showing {range.from} to {range.to}{busy ? ' · loading' : ''}</p>
    </section>

    {view === 'day' && <DailyView records={filtered} selectedId={selectedRecord?.id ?? ''} onSelect={setSelected} />}
    {view === 'week' && <WeekView records={filtered} from={range.from} onSelect={setSelected} />}
    {view === 'month' && <MonthView records={filtered} date={date} people={employee ? people.filter((person) => person.id === employee) : people} onSelect={setSelected} />}

    {employee && <EmployeeMonthSummary records={records.filter((record) => record.team_member_id === employee)} />}

    {selectedRecord && <RecordDetail record={selectedRecord} evidence={evidence.filter((row) => row.team_member_id === selectedRecord.team_member_id && row.event_date === selectedRecord.attendance_date)} onClose={() => setSelected(null)} />}

    {canManage && <ManagerTools people={people} manual={manual} setManual={setManual} identity={identity} setIdentity={setIdentity} busy={busy} post={post} />}
  </div>
}

function DailyView({ records, selectedId, onSelect }: { records: AttendanceConsoleRecord[]; selectedId: string; onSelect: (record: AttendanceConsoleRecord) => void }) {
  if (records.length === 0) return <Empty label="No clock-in recorded for this day." />
  return <section className="overflow-hidden rounded-lg border border-gray-100 bg-white shadow-sm">
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] text-sm">
        <thead><tr className="border-b border-gray-100 text-left text-[11px] uppercase text-gray-400"><th className="px-4 py-3">Employee</th><th className="px-4 py-3">Expected</th><th className="px-4 py-3">Actual</th><th className="px-4 py-3">Worked</th><th className="px-4 py-3">Variance</th><th className="px-4 py-3">State</th></tr></thead>
        <tbody className="divide-y divide-gray-50">{records.map((record) => <tr key={record.id} className={selectedId === record.id ? 'bg-amber-50' : 'hover:bg-gray-50'}><td className="px-4 py-3"><button onClick={() => onSelect(record)} className="text-left"><span className="font-medium text-gray-900">{record.employee_name}</span><span className="block text-xs text-gray-400">{record.employee_email || record.employee_code || record.attendance_date}</span></button></td><td className="px-4 py-3 text-gray-600">{time(record.scheduled_start_at)} - {time(record.scheduled_end_at)}</td><td className="px-4 py-3 text-gray-600"><span className="block">In {time(record.check_in_at)}</span><span className="block text-xs text-gray-400">Out {record.is_auto_closed ? 'Auto-closed · 7:00 PM' : time(record.check_out_at)}</span></td><td className="px-4 py-3 text-gray-600">{duration(workedNow(record))}</td><td className="px-4 py-3"><Variance minutes={record.open_now ? workedNow(record) - record.expected_minutes : record.time_variance_minutes} /></td><td className="px-4 py-3"><StatusPill record={record} /></td></tr>)}</tbody>
      </table>
    </div>
  </section>
}

function WeekView({ records, from, onSelect }: { records: AttendanceConsoleRecord[]; from: string; onSelect: (record: AttendanceConsoleRecord) => void }) {
  const days = Array.from({ length: 7 }, (_, index) => shiftDate(from, index, 0))
  return <section className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
    <div className="grid gap-3 md:grid-cols-7">{days.map((day) => {
      const dayRecords = records.filter((record) => record.attendance_date === day)
      return <div key={day} className="min-h-40 rounded-lg border border-gray-100 p-3"><p className="text-xs font-semibold text-gray-500">{day}</p>{dayRecords.length === 0 ? <p className="mt-4 text-xs text-gray-400">No clock-in recorded</p> : <div className="mt-3 space-y-2">{dayRecords.map((record) => <button key={record.id} onClick={() => onSelect(record)} className="block w-full rounded border border-gray-100 p-2 text-left hover:border-ocg-gold"><span className="block truncate text-xs font-medium text-gray-800">{record.employee_name}</span><span className="text-xs text-gray-500">{time(record.check_in_at)} · {record.open_now ? 'IN NOW' : time(record.check_out_at)}</span></button>)}</div>}</div>
    })}</div>
  </section>
}

function MonthView({ records, date, people, onSelect }: { records: AttendanceConsoleRecord[]; date: string; people: Array<{ id: string; name: string }>; onSelect: (record: AttendanceConsoleRecord) => void }) {
  const days = daysInMonth(date)
  const visiblePeople = people.length > 0 ? people : uniquePeople(records)
  const byKey = new Map(records.map((record) => [`${record.team_member_id}:${record.attendance_date}`, record]))
  return <section className="overflow-hidden rounded-lg border border-gray-100 bg-white shadow-sm">
    <div className="grid grid-cols-4 gap-3 border-b border-gray-100 p-4 md:grid-cols-8"><Stat label="Clock-in days" value={records.filter((record) => record.check_in_at).length} compact /><Stat label="Worked" value={duration(sum(records, 'actual_minutes'))} compact /><Stat label="Expected" value={duration(sum(records, 'expected_minutes'))} compact /><Stat label="Late days" value={records.filter((record) => record.late_minutes > 0).length} compact /></div>
    <div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-xs"><thead><tr className="border-b border-gray-100 text-left text-gray-400"><th className="sticky left-0 bg-white px-3 py-2">Employee</th>{days.map((day) => <th key={day} className="px-2 py-2 text-center">{Number(day.slice(-2))}</th>)}</tr></thead><tbody className="divide-y divide-gray-50">{visiblePeople.map((person) => <tr key={person.id}><td className="sticky left-0 bg-white px-3 py-2 font-medium text-gray-800">{person.name}</td>{days.map((day) => { const record = byKey.get(`${person.id}:${day}`); return <td key={day} className="px-1 py-2 text-center">{record ? <button title={`${person.name} · ${day}`} onClick={() => onSelect(record)} className={`h-6 w-6 rounded ${cellClass(record)}`}>{cellText(record)}</button> : <span className="inline-block h-6 w-6 rounded bg-gray-50 text-gray-300">-</span>}</td> })}</tr>)}</tbody></table></div>
  </section>
}

function EmployeeMonthSummary({ records }: { records: AttendanceConsoleRecord[] }) {
  return <section className="grid gap-3 md:grid-cols-5">
    <Stat label="Recorded clock-in days" value={records.filter((record) => record.check_in_at).length} />
    <Stat label="Total worked" value={duration(sum(records, 'actual_minutes'))} />
    <Stat label="Expected" value={duration(sum(records, 'expected_minutes'))} />
    <Stat label="Worked variance" value={signedDuration(sum(records, 'actual_minutes') - sum(records, 'expected_minutes'))} />
    <Stat label="Late total" value={duration(sum(records, 'late_minutes'))} />
    <Stat label="Early departures" value={`${records.filter((record) => record.early_departure_minutes > 0).length} · ${duration(sum(records, 'early_departure_minutes'))}`} />
    <Stat label="Verified overtime" value={duration(sum(records, 'overtime_minutes'))} />
    <Stat label="Incomplete" value={records.filter((record) => record.status === 'incomplete' || record.open_now).length} />
    <Stat label="Auto-closed" value={records.filter((record) => record.is_auto_closed).length} />
  </section>
}

function RecordDetail({ record, evidence, onClose }: { record: AttendanceConsoleRecord; evidence: AttendanceEvidenceDaily[]; onClose: () => void }) {
  return <section className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
    <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase text-ocg-gold">Attendance record</p><h2 className="mt-1 text-lg font-semibold text-gray-900">{record.employee_name}</h2><p className="text-sm text-gray-500">{record.attendance_date}</p></div><button aria-label="Close detail" onClick={onClose} className="rounded-lg border border-gray-200 p-2 text-gray-500"><X size={16} /></button></div>
    <div className="mt-4 grid gap-3 md:grid-cols-4"><Meta label="Expected IN" value={time(record.scheduled_start_at)} /><Meta label="Expected OUT" value={time(record.scheduled_end_at)} /><Meta label="Actual IN" value={`${time(record.check_in_at)} ${record.check_in_label ? `· ${record.check_in_label}` : ''}`} /><Meta label="Actual OUT" value={record.is_auto_closed ? 'Auto-closed · 7:00 PM' : `${time(record.check_out_at)} ${record.check_out_label ? `· ${record.check_out_label}` : ''}`} /><Meta label="Worked" value={duration(record.actual_minutes)} /><Meta label="Expected duration" value={duration(record.expected_minutes)} /><Meta label="Late" value={duration(record.late_minutes)} /><Meta label="Early departure" value={duration(record.early_departure_minutes)} /><Meta label="Verified overtime" value={duration(record.overtime_minutes)} /><Meta label="Time variance" value={signedDuration(record.time_variance_minutes)} /><Meta label="Status" value={record.status} /><Meta label="Punch count" value={String(record.punch_count)} /></div>
    <div className="mt-5 grid gap-4 md:grid-cols-2"><div><p className="text-xs font-semibold uppercase text-gray-400">Punch timeline</p><div className="mt-2 space-y-2">{record.all_punches.length === 0 ? <p className="text-sm text-gray-500">No event timeline attached.</p> : record.all_punches.map((punch) => <p key={punch.id} className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">{time(punch.at)} · {punch.direction.toUpperCase()} · {punch.label}</p>)}</div></div><div><p className="text-xs font-semibold uppercase text-gray-400">Evidence by source</p><div className="mt-2 space-y-2">{evidence.length === 0 ? <p className="text-sm text-gray-500">No source evidence rows.</p> : evidence.map((row) => <p key={`${row.source}:${row.event_date}`} className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">{sourceName(row.source)} · IN {time(row.check_in_at)} · OUT {time(row.check_out_at)}</p>)}</div></div></div>
  </section>
}

function ManagerTools({ people, manual, setManual, identity, setIdentity, busy, post }: {
  people: Array<{ id: string; name: string }>
  manual: { team_member_id: string; occurred_at: string; direction: string; reason: string; notes: string }
  setManual: (value: { team_member_id: string; occurred_at: string; direction: string; reason: string; notes: string }) => void
  identity: { team_member_id: string; device_name: string; employee_code: string; notes: string }
  setIdentity: (value: { team_member_id: string; device_name: string; employee_code: string; notes: string }) => void
  busy: boolean
  post: (body: Record<string, unknown>) => void
}) {
  return <section className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
    <p className="text-xs font-semibold uppercase text-ocg-gold">Reviewer tools</p>
    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5"><Field label="Employee"><select className="input" value={manual.team_member_id} onChange={(event) => setManual({ ...manual, team_member_id: event.target.value })}>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></Field><Field label="Date & time"><input type="datetime-local" className="input" value={manual.occurred_at} onChange={(event) => setManual({ ...manual, occurred_at: event.target.value })} /></Field><Field label="Direction"><select className="input" value={manual.direction} onChange={(event) => setManual({ ...manual, direction: event.target.value })}><option value="in">IN</option><option value="out">OUT</option></select></Field><Field label="Reason"><input className="input" value={manual.reason} onChange={(event) => setManual({ ...manual, reason: event.target.value })} /></Field><Field label="Notes"><input className="input" value={manual.notes} onChange={(event) => setManual({ ...manual, notes: event.target.value })} /></Field></div>
    <button disabled={busy} onClick={() => post({ action: 'manual-evidence', ...manual, occurred_at: manual.occurred_at ? `${manual.occurred_at}:00+03:00` : '', idempotency_key: crypto.randomUUID() })} className="mt-3 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Record manual evidence</button>
    <div className="mt-5 border-t border-gray-100 pt-4"><p className="text-xs font-semibold uppercase text-gray-400">Biometric identity mapping</p><div className="mt-3 grid gap-3 md:grid-cols-4"><Field label="Employee"><select className="input" value={identity.team_member_id} onChange={(event) => setIdentity({ ...identity, team_member_id: event.target.value })}>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></Field><Field label="Device"><input className="input" value={identity.device_name} onChange={(event) => setIdentity({ ...identity, device_name: event.target.value })} /></Field><Field label="Employee code"><input className="input" value={identity.employee_code} onChange={(event) => setIdentity({ ...identity, employee_code: event.target.value })} /></Field><Field label="Notes"><input className="input" value={identity.notes} onChange={(event) => setIdentity({ ...identity, notes: event.target.value })} /></Field></div><button disabled={busy || !identity.employee_code.trim()} onClick={() => post({ action: 'map-device-identity', ...identity })} className="mt-3 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 disabled:opacity-50">Save device mapping</button></div>
  </section>
}

function Stat({ label, value, hint, compact = false }: { label: string; value: string | number; hint?: string; compact?: boolean }) {
  return <div className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm"><p className={`${compact ? 'text-lg' : 'text-2xl'} font-light text-gray-900`}>{value}</p><p className="mt-1 text-[11px] font-semibold uppercase text-gray-400">{label}</p>{hint ? <p className="mt-2 truncate text-xs text-gray-500">{hint}</p> : null}</div>
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label><span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>{children}</label> }
function Meta({ label, value }: { label: string; value: string }) { return <div className="rounded-lg bg-gray-50 p-3"><p className="text-[11px] font-semibold uppercase text-gray-400">{label}</p><p className="mt-1 text-sm font-medium text-gray-800">{value || '-'}</p></div> }
function Empty({ label }: { label: string }) { return <section className="rounded-lg border border-dashed border-gray-200 bg-white p-8 text-center text-sm text-gray-500"><Search className="mx-auto mb-2 text-gray-300" size={22} />{label}</section> }
function StatusPill({ record }: { record: AttendanceConsoleRecord }) { const text = record.open_now ? 'IN NOW' : record.is_auto_closed ? 'AUTO-CLOSED' : record.status.toUpperCase(); const cls = record.open_now ? 'bg-emerald-50 text-emerald-700' : record.late_minutes > 0 ? 'bg-amber-50 text-amber-700' : record.status === 'incomplete' ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-700'; return <span className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold ${cls}`}>{record.late_minutes > 0 ? <TriangleAlert size={12} /> : <Clock3 size={12} />}{text}</span> }
function Variance({ minutes }: { minutes: number }) { const cls = minutes < 0 ? 'text-red-600' : minutes > 0 ? 'text-emerald-700' : 'text-gray-600'; return <span className={cls}>{signedDuration(minutes)}</span> }
function sourceName(source: string) { if (source === 'employee_self') return 'Self clock'; if (source === 'reviewer_manual') return 'Manual / reviewer'; if (source === 'system_auto') return 'System auto'; if (source === 'biometric') return 'Biometric'; return 'Historical import' }
function statusFor(record: AttendanceConsoleRecord) { if (record.open_now) return 'open'; if (record.is_auto_closed) return 'auto'; if (record.status === 'incomplete') return 'incomplete'; if (record.late_minutes > 0) return 'late'; if (record.check_in_at && record.check_out_at) return 'complete'; return record.status }
function time(value: string | null | undefined) { return value ? new Date(value).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' }) : '-' }
function duration(minutes: number) { const safe = Math.max(0, Math.round(minutes || 0)); const h = Math.floor(safe / 60); const m = safe % 60; return h ? `${h}h ${m}m` : `${m}m` }
function signedDuration(minutes: number) { const rounded = Math.round(minutes || 0); if (rounded === 0) return '0m'; return `${rounded > 0 ? '+' : '-'}${duration(Math.abs(rounded))}` }
function workedNow(record: AttendanceConsoleRecord) { if (!record.open_now || !record.check_in_at) return record.actual_minutes; const minutes = Math.round((Date.now() - Date.parse(record.check_in_at)) / 60_000) - record.break_minutes; return Math.max(0, minutes) }
function sum(records: AttendanceConsoleRecord[], key: 'actual_minutes' | 'expected_minutes' | 'late_minutes' | 'early_departure_minutes' | 'overtime_minutes') { return records.reduce((total, record) => total + Number(record[key] ?? 0), 0) }
function rangeFor(view: ViewMode, date: string) { if (view === 'day') return { from: date, to: date }; if (view === 'week') { const d = new Date(`${date}T00:00:00+03:00`); const day = d.getUTCDay(); const mondayOffset = day === 0 ? -6 : 1 - day; const from = shiftDate(date, mondayOffset, 0); return { from, to: shiftDate(from, 6, 0) } } const first = `${date.slice(0, 7)}-01`; return { from: first, to: daysInMonth(date).at(-1) ?? first } }
function shiftDate(date: string, days: number, months: number) { const d = new Date(`${date}T00:00:00+03:00`); if (months) d.setUTCMonth(d.getUTCMonth() + months); if (days) d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10) }
function daysInMonth(date: string) { const [year, month] = date.split('-').map(Number); const count = new Date(year, month, 0).getDate(); return Array.from({ length: count }, (_, index) => `${year}-${String(month).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`) }
function uniquePeople(records: AttendanceConsoleRecord[]) { const map = new Map<string, { id: string; name: string }>(); records.forEach((record) => { if (record.team_member_id) map.set(record.team_member_id, { id: record.team_member_id, name: record.employee_name }) }); return [...map.values()] }
function cellClass(record: AttendanceConsoleRecord) { if (record.open_now) return 'bg-emerald-100 text-emerald-800'; if (record.is_auto_closed) return 'bg-blue-100 text-blue-800'; if (record.late_minutes > 0) return 'bg-amber-100 text-amber-800'; if (record.status === 'incomplete') return 'bg-red-100 text-red-800'; return 'bg-gray-800 text-white' }
function cellText(record: AttendanceConsoleRecord) { if (record.open_now) return 'I'; if (record.is_auto_closed) return 'A'; if (record.late_minutes > 0) return 'L'; if (record.status === 'incomplete') return '!'; return '✓' }
