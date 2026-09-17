'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

/** How often a range that includes today refreshes itself. */
const LIVE_REFRESH_MS = 20_000

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
  // Only the id is held: the drawer always renders the LATEST loaded copy of the
  // record, so a refresh can never leave a stale snapshot on screen.
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)
  const [manual, setManual] = useState({ team_member_id: people[0]?.id ?? '', occurred_at: '', direction: 'in', reason: '', notes: '' })
  const [identity, setIdentity] = useState({ team_member_id: people[0]?.id ?? '', device_name: 'Deli S151', employee_code: '', notes: '' })
  const loadSeq = useRef(0)

  const range = useMemo(() => rangeFor(view, date), [view, date])
  const live = range.from <= todayDate && todayDate <= range.to
  const filtered = useMemo(() => records
    .filter((record) => !employee || record.team_member_id === employee)
    .filter((record) => !status || statusFor(record) === status || record.status === status),
  [records, employee, status])
  const selectedRecord = selectedId ? records.find((record) => record.id === selectedId) ?? null : null
  const selfIn = selfEvents.find((event) => event.source === 'employee_self' && event.direction === 'in')
  const selfOut = selfEvents.find((event) => event.source === 'employee_self' && event.direction === 'out')
  const todayOpen = filtered.filter((record) => record.attendance_date === todayDate && record.open_now)
  const todayClockedIn = filtered.filter((record) => record.attendance_date === todayDate && !!record.check_in_at)
  const personName = employee ? people.find((person) => person.id === employee)?.name ?? '' : ''

  const loadRange = useCallback(async (opts: { quiet?: boolean } = {}) => {
    // Responses can land out of order when the person, date or view changes
    // quickly; only the most recent request may update the screen.
    const seq = ++loadSeq.current
    if (!opts.quiet) setBusy(true)
    const params = new URLSearchParams({ from: range.from, to: range.to })
    if (employee) params.set('employee', employee)
    const { ok, data } = await api<AttendancePayload>(`/api/attendance?${params.toString()}`)
    if (seq !== loadSeq.current) return
    if (!opts.quiet) setBusy(false)
    if (!ok || !data?.ok) {
      if (!opts.quiet) setError(data?.error ?? 'Attendance could not be loaded.')
      return
    }
    setError('')
    setRecords(data.records ?? [])
    setEvidence(data.evidence ?? [])
    setSelfEvents(data.today ?? [])
    setUpdatedAt(Date.now())
  }, [range.from, range.to, employee])

  useEffect(() => { void loadRange() }, [loadRange])

  // Live whenever the loaded period includes today — a person's week or month
  // is as live as the day view. Paused while the tab is hidden.
  useEffect(() => {
    if (!live) return
    const tick = () => { if (document.visibilityState === 'visible') void loadRange({ quiet: true }) }
    const id = window.setInterval(tick, LIVE_REFRESH_MS)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [live, loadRange])

  async function post(body: Record<string, unknown>): Promise<boolean> {
    setBusy(true)
    setError('')
    const { ok, data } = await api<{ error?: string }>('/api/attendance', { method: 'POST', body: JSON.stringify(body) })
    setBusy(false)
    if (!ok) {
      setError(data?.error ?? 'Attendance could not be recorded.')
      return false
    }
    await loadRange()
    router.refresh()
    return true
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

    {canManage ? <section className="grid gap-3 md:grid-cols-4">
      <Stat label="Clocked in today" value={todayClockedIn.length} />
      <Stat label="Still at work" value={todayOpen.length} hint={todayOpen.map((row) => row.employee_name).join(', ')} />
      <Stat label="Late today" value={filtered.filter((row) => row.attendance_date === todayDate && row.late_minutes > 0).length} />
      <Stat label="Arrival time needed" value={filtered.filter((row) => row.is_checkin_missing).length} hint="Single evening punch · in this period" />
    </section> : null}

    <section className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-end gap-3">
        <button onClick={() => { setDate(todayDate); setView('day') }} className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700">Today</button>
        <button aria-label="Previous period" onClick={() => move(-1)} className="rounded-lg border border-gray-200 p-2 text-gray-600"><ChevronLeft size={18} /></button>
        <button aria-label="Next period" onClick={() => move(1)} className="rounded-lg border border-gray-200 p-2 text-gray-600"><ChevronRight size={18} /></button>
        <Field label="Date"><input type="date" className="input" value={date} onChange={(event) => event.target.value && setDate(event.target.value)} /></Field>
        <Field label="View"><select className="input" value={view} onChange={(event) => setView(event.target.value as ViewMode)}><option value="day">Day</option><option value="week">Week</option><option value="month">Month</option></select></Field>
        {canManage && <Field label="Employee"><select className="input min-w-52" value={employee} onChange={(event) => setEmployee(event.target.value)}><option value="">All employees</option>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></Field>}
        <Field label="Status"><select className="input" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All</option><option value="open">In now</option><option value="capped">Missing checkout</option><option value="checkin_missing">Check-in missing</option><option value="late">Late</option><option value="complete">Complete</option><option value="incomplete">Incomplete</option><option value="auto">Auto-closed</option></select></Field>
        <button disabled={busy} onClick={() => loadRange()} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 disabled:opacity-50"><RefreshCcw size={15} /> Refresh</button>
      </div>
      <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
        <CalendarDays size={14} /> Showing {personName ? `${personName} · ` : ''}{range.from} to {range.to}{busy ? ' · loading' : ''}
        {live
          ? <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> Live{updatedAt ? ` · updated ${clock(updatedAt)}` : ''}</span>
          : updatedAt ? <span className="text-gray-400">· loaded {clock(updatedAt)}</span> : null}
      </p>
    </section>

    {view === 'day' && <DailyView records={filtered} selectedId={selectedRecord?.id ?? ''} onSelect={(record) => setSelectedId(record.id)} />}
    {view === 'week' && <WeekView records={filtered} from={range.from} onSelect={(record) => setSelectedId(record.id)} />}
    {view === 'month' && <MonthView records={filtered} date={date} people={employee ? people.filter((person) => person.id === employee) : people} onSelect={(record) => setSelectedId(record.id)} />}

    {employee && <EmployeeSummary name={personName} from={range.from} to={range.to} records={records.filter((record) => record.team_member_id === employee)} />}

    {selectedRecord && <RecordDrawer
      record={selectedRecord}
      evidence={evidence.filter((row) => row.team_member_id === selectedRecord.team_member_id && row.event_date === selectedRecord.attendance_date)}
      canManage={canManage}
      busy={busy}
      live={live}
      post={post}
      onClose={() => setSelectedId(null)}
    />}

    {canManage && <ManagerTools people={people} manual={manual} setManual={setManual} identity={identity} setIdentity={setIdentity} busy={busy} post={post} />}
  </div>
}

function DailyView({ records, selectedId, onSelect }: { records: AttendanceConsoleRecord[]; selectedId: string; onSelect: (record: AttendanceConsoleRecord) => void }) {
  if (records.length === 0) return <Empty label="No attendance recorded for this day." />
  return <section className="overflow-hidden rounded-lg border border-gray-100 bg-white shadow-sm">
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] text-sm">
        <thead><tr className="border-b border-gray-100 text-left text-[11px] uppercase text-gray-400"><th className="px-4 py-3">Employee</th><th className="px-4 py-3">Expected</th><th className="px-4 py-3">Actual</th><th className="px-4 py-3">Worked</th><th className="px-4 py-3">Variance</th><th className="px-4 py-3">State</th></tr></thead>
        <tbody className="divide-y divide-gray-50">{records.map((record) => <tr key={record.id} onClick={() => onSelect(record)} className={`cursor-pointer ${selectedId === record.id ? 'bg-amber-50' : 'hover:bg-gray-50'}`}><td className="px-4 py-3"><button onClick={(event) => { event.stopPropagation(); onSelect(record) }} className="text-left"><span className="font-medium text-gray-900">{record.employee_name}</span><span className="block text-xs text-gray-400">{record.employee_email || record.employee_code || record.attendance_date}</span></button></td><td className="px-4 py-3 text-gray-600">{time(record.scheduled_start_at)} - {time(record.scheduled_end_at)}</td><td className="px-4 py-3 text-gray-600"><span className="block">In {inLabel(record)}</span><span className="block text-xs text-gray-400">Out {outLabel(record)}</span></td><td className="px-4 py-3 text-gray-600">{workedLabel(record)}</td><td className="px-4 py-3">{record.is_checkin_missing ? <span className="text-gray-400">-</span> : <Variance minutes={record.time_variance_minutes} />}</td><td className="px-4 py-3"><StatusPill record={record} /></td></tr>)}</tbody>
      </table>
    </div>
  </section>
}

function WeekView({ records, from, onSelect }: { records: AttendanceConsoleRecord[]; from: string; onSelect: (record: AttendanceConsoleRecord) => void }) {
  const days = Array.from({ length: 7 }, (_, index) => shiftDate(from, index, 0))
  return <section className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
    <div className="grid gap-3 md:grid-cols-7">{days.map((day) => {
      const dayRecords = records.filter((record) => record.attendance_date === day)
      return <div key={day} className="min-h-40 rounded-lg border border-gray-100 p-3"><p className="text-xs font-semibold text-gray-500">{day}</p>{dayRecords.length === 0 ? <p className="mt-4 text-xs text-gray-400">No attendance recorded</p> : <div className="mt-3 space-y-2">{dayRecords.map((record) => <button key={record.id} onClick={() => onSelect(record)} className="block w-full rounded border border-gray-100 p-2 text-left hover:border-ocg-gold"><span className="block truncate text-xs font-medium text-gray-800">{record.employee_name}</span><span className={`text-xs ${record.is_checkin_missing ? 'text-orange-700' : 'text-gray-500'}`}>{record.is_checkin_missing ? `Arrival missing · out ${time(record.check_out_at)}` : `${time(record.check_in_at)} · ${record.open_now ? 'IN NOW' : outLabel(record)}`}</span></button>)}</div>}</div>
    })}</div>
  </section>
}

function MonthView({ records, date, people, onSelect }: { records: AttendanceConsoleRecord[]; date: string; people: Array<{ id: string; name: string }>; onSelect: (record: AttendanceConsoleRecord) => void }) {
  const days = daysInMonth(date)
  const visiblePeople = people.length > 0 ? people : uniquePeople(records)
  const byKey = new Map(records.map((record) => [`${record.team_member_id}:${record.attendance_date}`, record]))
  return <section className="overflow-hidden rounded-lg border border-gray-100 bg-white shadow-sm">
    <div className="grid grid-cols-2 gap-3 border-b border-gray-100 p-4 md:grid-cols-5"><Stat label="Clock-in days" value={records.filter((record) => record.check_in_at).length} compact /><Stat label="Worked" value={duration(sumEffective(records))} compact /><Stat label="Expected" value={duration(sum(records, 'expected_minutes'))} compact /><Stat label="Late days" value={records.filter((record) => record.late_minutes > 0).length} compact /><Stat label="Arrival missing" value={records.filter((record) => record.is_checkin_missing).length} compact /></div>
    <div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-xs"><thead><tr className="border-b border-gray-100 text-left text-gray-400"><th className="sticky left-0 bg-white px-3 py-2">Employee</th>{days.map((day) => <th key={day} className="px-2 py-2 text-center">{Number(day.slice(-2))}</th>)}</tr></thead><tbody className="divide-y divide-gray-50">{visiblePeople.map((person) => <tr key={person.id}><td className="sticky left-0 bg-white px-3 py-2 font-medium text-gray-800">{person.name}</td>{days.map((day) => { const record = byKey.get(`${person.id}:${day}`); return <td key={day} className="px-1 py-2 text-center">{record ? <button title={`${person.name} · ${day} · ${recordStatusText(record)}`} onClick={() => onSelect(record)} className={`h-6 w-6 rounded ${cellClass(record)}`}>{cellText(record)}</button> : <span className="inline-block h-6 w-6 rounded bg-gray-50 text-gray-300">-</span>}</td> })}</tr>)}</tbody></table></div>
    <p className="flex flex-wrap gap-x-4 gap-y-1 border-t border-gray-100 px-4 py-2.5 text-[11px] text-gray-500">
      <Legend className="bg-gray-800 text-white" text="✓" label="Complete" />
      <Legend className="bg-emerald-100 text-emerald-800" text="I" label="In now" />
      <Legend className="bg-amber-100 text-amber-800" text="L" label="Late" />
      <Legend className="bg-orange-100 text-orange-800" text="C" label="Checkout missing (capped)" />
      <Legend className="bg-purple-100 text-purple-800" text="?" label="Arrival missing" />
      <Legend className="bg-blue-100 text-blue-800" text="A" label="Auto-closed" />
      <Legend className="bg-red-100 text-red-800" text="!" label="Incomplete" />
    </p>
  </section>
}

function EmployeeSummary({ name, from, to, records }: { name: string; from: string; to: string; records: AttendanceConsoleRecord[] }) {
  return <section className="space-y-2">
    <p className="text-xs font-semibold uppercase text-gray-400">{name || 'Employee'} · summary for {from} to {to}</p>
    <div className="grid gap-3 md:grid-cols-5">
      <Stat label="Recorded clock-in days" value={records.filter((record) => record.check_in_at).length} />
      <Stat label="Total worked" value={duration(sumEffective(records))} />
      <Stat label="Expected" value={duration(sum(records, 'expected_minutes'))} />
      <Stat label="Worked variance" value={signedDuration(sumEffective(records) - sum(records, 'expected_minutes'))} />
      <Stat label="Late total" value={duration(sum(records, 'late_minutes'))} />
      <Stat label="Early departures" value={`${records.filter((record) => record.early_departure_minutes > 0).length} · ${duration(sum(records, 'early_departure_minutes'))}`} />
      <Stat label="Verified overtime" value={duration(sum(records, 'overtime_minutes'))} />
      <Stat label="Incomplete" value={records.filter((record) => record.status === 'incomplete' || record.is_checkout_missing).length} />
      <Stat label="Arrival missing" value={records.filter((record) => record.is_checkin_missing).length} />
      <Stat label="Auto-closed" value={records.filter((record) => record.is_auto_closed).length} />
    </div>
  </section>
}

/** A person's day, as a drawer so opening it is visible wherever the row was clicked. */
function RecordDrawer({ record, evidence, canManage, busy, live, post, onClose }: {
  record: AttendanceConsoleRecord
  evidence: AttendanceEvidenceDaily[]
  canManage: boolean
  busy: boolean
  live: boolean
  post: (body: Record<string, unknown>) => Promise<boolean>
  onClose: () => void
}) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', close)
    return () => document.removeEventListener('keydown', close)
  }, [onClose])

  return <div className="fixed inset-0 z-50 bg-black/20" onClick={onClose}>
    <aside role="dialog" aria-modal="true" aria-label={`Attendance record for ${record.employee_name}`} onClick={(event) => event.stopPropagation()}
      className="absolute inset-y-0 right-0 flex max-h-[100dvh] w-full max-w-xl flex-col overflow-hidden bg-white shadow-2xl">
      <div className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-100 px-5 py-4">
        <div>
          <p className="text-xs font-semibold uppercase text-ocg-gold">Attendance record</p>
          <h2 className="mt-1 text-lg font-semibold text-gray-900">{record.employee_name}</h2>
          <p className="flex items-center gap-2 text-sm text-gray-500">{record.attendance_date}{live && <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> live</span>}</p>
        </div>
        <button aria-label="Close detail" onClick={onClose} className="rounded-lg border border-gray-200 p-2 text-gray-500"><X size={16} /></button>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
        {record.is_checkin_missing && <MissingArrival record={record} canManage={canManage} busy={busy} post={post} />}

        <div className="grid gap-3 sm:grid-cols-2"><Meta label="Expected IN" value={time(record.scheduled_start_at)} /><Meta label="Expected OUT" value={time(record.scheduled_end_at)} /><Meta label="Actual IN" value={record.is_checkin_missing ? 'Missing — needs manual entry' : `${time(record.check_in_at)} ${record.check_in_label ? `· ${record.check_in_label}` : ''}`} /><Meta label="Actual OUT" value={record.check_out_at && record.check_out_label && !record.is_auto_closed ? `${outLabel(record)} · ${record.check_out_label}` : outLabel(record)} /><Meta label="Worked" value={workedLabel(record)} /><Meta label="Expected duration" value={duration(record.expected_minutes)} /><Meta label="Late" value={duration(record.late_minutes)} /><Meta label="Early departure" value={duration(record.early_departure_minutes)} /><Meta label="Verified overtime" value={duration(record.overtime_minutes)} /><Meta label="Time variance" value={record.is_checkin_missing ? 'Not calculated' : signedDuration(record.time_variance_minutes)} /><Meta label="Status" value={recordStatusText(record)} /><Meta label="Punch count" value={String(record.punch_count)} />{record.auto_close_processed_at ? <Meta label="Auto-close processed" value={time(record.auto_close_processed_at)} /> : null}</div>

        <div>
          <p className="text-xs font-semibold uppercase text-gray-400">Punch timeline</p>
          <div className="mt-2 space-y-2">{record.all_punches.length === 0
            ? <p className="text-sm text-gray-500">No event timeline attached.</p>
            : record.all_punches.map((punch) => <p key={punch.id} className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">{time(punch.at)} · {punchDirectionLabel(punch.direction)} · {punch.label}</p>)}</div>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase text-gray-400">Evidence by source</p>
          <div className="mt-2 space-y-2">{evidence.length === 0
            ? <p className="text-sm text-gray-500">No source evidence rows.</p>
            : evidence.map((row) => <p key={`${row.source}:${row.event_date}`} className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">{sourceName(row.source)} · IN {time(row.check_in_at)} · OUT {time(row.check_out_at)}</p>)}</div>
          {record.lone_punch_closeout && record.stored_check_in_at && <p className="mt-2 text-xs text-gray-400">The device evidence lists this punch as IN because the reader has no IN/OUT key; the record reads it as the close-out.</p>}
        </div>
      </div>
    </aside>
  </div>
}

/** The single-evening-punch contingency: no hours until someone supplies the arrival. */
function MissingArrival({ record, canManage, busy, post }: {
  record: AttendanceConsoleRecord
  canManage: boolean
  busy: boolean
  post: (body: Record<string, unknown>) => Promise<boolean>
}) {
  const [arrival, setArrival] = useState(hhmm(record.scheduled_start_at))
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [saved, setSaved] = useState(false)

  async function submit() {
    if (!record.team_member_id || !/^\d{2}:\d{2}$/.test(arrival) || !reason.trim()) return
    const ok = await post({
      action: 'manual-evidence',
      team_member_id: record.team_member_id,
      occurred_at: `${record.attendance_date}T${arrival}:00+03:00`,
      direction: 'in',
      reason: reason.trim(),
      notes: notes.trim() || 'Arrival for a single evening punch',
      idempotency_key: crypto.randomUUID(),
    })
    if (ok) setSaved(true)
  }

  const beforeCloseout = !record.check_out_at || !/^\d{2}:\d{2}$/.test(arrival) || arrival < hhmm(record.check_out_at)

  return <section className="rounded-lg border border-purple-200 bg-purple-50 p-4">
    <p className="flex items-center gap-2 text-sm font-semibold text-purple-900"><TriangleAlert size={15} /> Arrival time needed</p>
    <p className="mt-1 text-sm leading-relaxed text-purple-900">
      The only fingerprint punch on {record.attendance_date} was at {time(record.check_out_at)}. A single punch from 17:00 is
      read as the close-out, not the arrival, so no hours are calculated until the arrival time is recorded.
    </p>
    {canManage ? (
      <div className="mt-3 space-y-3">
        <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
          <Field label="Arrived at"><input type="time" className="input" value={arrival} onChange={(event) => setArrival(event.target.value)} /></Field>
          <Field label="Reason (required)"><input className="input" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Confirmed with supervisor; forgot to punch in" /></Field>
        </div>
        <Field label="Notes"><input className="input" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional" /></Field>
        {!beforeCloseout && <p className="text-xs text-red-700">The arrival must be before the close-out at {time(record.check_out_at)}.</p>}
        <div className="flex flex-wrap items-center gap-3">
          <button disabled={busy || saved || !reason.trim() || !/^\d{2}:\d{2}$/.test(arrival) || !beforeCloseout} onClick={() => void submit()} className="rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? 'Saving…' : 'Record arrival time'}</button>
          <p className="text-xs text-purple-800">Saved as reviewer evidence with your name and the reason; the hours are then calculated.</p>
        </div>
      </div>
    ) : (
      <p className="mt-2 text-xs text-purple-800">Ask your supervisor to record your arrival time for this day.</p>
    )}
  </section>
}

function ManagerTools({ people, manual, setManual, identity, setIdentity, busy, post }: {
  people: Array<{ id: string; name: string }>
  manual: { team_member_id: string; occurred_at: string; direction: string; reason: string; notes: string }
  setManual: (value: { team_member_id: string; occurred_at: string; direction: string; reason: string; notes: string }) => void
  identity: { team_member_id: string; device_name: string; employee_code: string; notes: string }
  setIdentity: (value: { team_member_id: string; device_name: string; employee_code: string; notes: string }) => void
  busy: boolean
  post: (body: Record<string, unknown>) => Promise<boolean>
}) {
  return <section className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
    <p className="text-xs font-semibold uppercase text-ocg-gold">Reviewer tools</p>
    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5"><Field label="Employee"><select className="input" value={manual.team_member_id} onChange={(event) => setManual({ ...manual, team_member_id: event.target.value })}>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></Field><Field label="Date & time"><input type="datetime-local" className="input" value={manual.occurred_at} onChange={(event) => setManual({ ...manual, occurred_at: event.target.value })} /></Field><Field label="Direction"><select className="input" value={manual.direction} onChange={(event) => setManual({ ...manual, direction: event.target.value })}><option value="in">IN</option><option value="out">OUT</option></select></Field><Field label="Reason"><input className="input" value={manual.reason} onChange={(event) => setManual({ ...manual, reason: event.target.value })} /></Field><Field label="Notes"><input className="input" value={manual.notes} onChange={(event) => setManual({ ...manual, notes: event.target.value })} /></Field></div>
    <button disabled={busy} onClick={() => void post({ action: 'manual-evidence', ...manual, occurred_at: manual.occurred_at ? `${manual.occurred_at}:00+03:00` : '', idempotency_key: crypto.randomUUID() })} className="mt-3 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Record manual evidence</button>
    <div className="mt-5 border-t border-gray-100 pt-4"><p className="text-xs font-semibold uppercase text-gray-400">Biometric identity mapping</p><div className="mt-3 grid gap-3 md:grid-cols-4"><Field label="Employee"><select className="input" value={identity.team_member_id} onChange={(event) => setIdentity({ ...identity, team_member_id: event.target.value })}>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></Field><Field label="Device"><input className="input" value={identity.device_name} onChange={(event) => setIdentity({ ...identity, device_name: event.target.value })} /></Field><Field label="Employee code"><input className="input" value={identity.employee_code} onChange={(event) => setIdentity({ ...identity, employee_code: event.target.value })} /></Field><Field label="Notes"><input className="input" value={identity.notes} onChange={(event) => setIdentity({ ...identity, notes: event.target.value })} /></Field></div><button disabled={busy || !identity.employee_code.trim()} onClick={() => void post({ action: 'map-device-identity', ...identity })} className="mt-3 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 disabled:opacity-50">Save device mapping</button></div>
  </section>
}

function Stat({ label, value, hint, compact = false }: { label: string; value: string | number; hint?: string; compact?: boolean }) {
  return <div className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm"><p className={`${compact ? 'text-lg' : 'text-2xl'} font-light text-gray-900`}>{value}</p><p className="mt-1 text-[11px] font-semibold uppercase text-gray-400">{label}</p>{hint ? <p className="mt-2 truncate text-xs text-gray-500">{hint}</p> : null}</div>
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>{children}</label> }
function Meta({ label, value }: { label: string; value: string }) { return <div className="rounded-lg bg-gray-50 p-3"><p className="text-[11px] font-semibold uppercase text-gray-400">{label}</p><p className="mt-1 text-sm font-medium text-gray-800">{value || '-'}</p></div> }
function Legend({ className, text, label }: { className: string; text: string; label: string }) { return <span className="inline-flex items-center gap-1.5"><span className={`inline-flex h-4 w-4 items-center justify-center rounded text-[10px] ${className}`}>{text}</span>{label}</span> }
function Empty({ label }: { label: string }) { return <section className="rounded-lg border border-dashed border-gray-200 bg-white p-8 text-center text-sm text-gray-500"><Search className="mx-auto mb-2 text-gray-300" size={22} />{label}</section> }
function StatusPill({ record }: { record: AttendanceConsoleRecord }) { const text = recordStatusText(record); const cls = record.open_now ? 'bg-emerald-50 text-emerald-700' : record.is_checkin_missing ? 'bg-purple-50 text-purple-700' : record.is_hours_capped ? 'bg-orange-50 text-orange-700' : record.late_minutes > 0 ? 'bg-amber-50 text-amber-700' : record.status === 'incomplete' ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-700'; return <span className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold ${cls}`}>{record.late_minutes > 0 || record.is_checkout_missing || record.is_checkin_missing ? <TriangleAlert size={12} /> : <Clock3 size={12} />}{text}</span> }
function Variance({ minutes }: { minutes: number }) { const cls = minutes < 0 ? 'text-red-600' : minutes > 0 ? 'text-emerald-700' : 'text-gray-600'; return <span className={cls}>{signedDuration(minutes)}</span> }
function sourceName(source: string) { if (source === 'employee_self') return 'Self clock'; if (source === 'reviewer_manual') return 'Manual / reviewer'; if (source === 'system_auto') return 'System auto'; if (source === 'biometric') return 'Biometric'; return 'Historical import' }
function statusFor(record: AttendanceConsoleRecord) { if (record.open_now) return 'open'; if (record.is_checkin_missing) return 'checkin_missing'; if (record.is_hours_capped) return 'capped'; if (record.is_auto_closed) return 'auto'; if (record.status === 'incomplete') return 'incomplete'; if (record.late_minutes > 0) return 'late'; if (record.check_in_at && record.check_out_at) return 'complete'; return record.status }
function punchDirectionLabel(direction: string) { return direction === 'in' ? 'IN' : direction === 'out' ? 'OUT' : 'PUNCH' }
function time(value: string | null | undefined) { return value ? new Date(value).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' }) : '-' }
/** 'HH:MM' Nairobi wall clock for form values and comparisons (EAT = UTC+3, no DST). */
function hhmm(value: string | null | undefined) { const t = value ? Date.parse(value) : NaN; return Number.isFinite(t) ? new Date(t + 3 * 60 * 60_000).toISOString().slice(11, 16) : '' }
function clock(ms: number) { return new Date(ms).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Africa/Nairobi' }) }
function duration(minutes: number) { const safe = Math.max(0, Math.round(minutes || 0)); const h = Math.floor(safe / 60); const m = safe % 60; return h ? `${h}h ${m}m` : `${m}m` }
function signedDuration(minutes: number) { const rounded = Math.round(minutes || 0); if (rounded === 0) return '0m'; return `${rounded > 0 ? '+' : '-'}${duration(Math.abs(rounded))}` }
function sum(records: AttendanceConsoleRecord[], key: 'actual_minutes' | 'expected_minutes' | 'late_minutes' | 'early_departure_minutes' | 'overtime_minutes') { return records.reduce((total, record) => total + Number(record[key] ?? 0), 0) }
function sumEffective(records: AttendanceConsoleRecord[]) { return records.reduce((total, record) => total + Number(record.effective_actual_minutes ?? 0), 0) }
function rangeFor(view: ViewMode, date: string) { if (view === 'day') return { from: date, to: date }; if (view === 'week') { const d = new Date(`${date}T00:00:00+03:00`); const day = d.getUTCDay(); const mondayOffset = day === 0 ? -6 : 1 - day; const from = shiftDate(date, mondayOffset, 0); return { from, to: shiftDate(from, 6, 0) } } const first = `${date.slice(0, 7)}-01`; return { from: first, to: daysInMonth(date).at(-1) ?? first } }
function shiftDate(date: string, days: number, months: number) { const d = new Date(`${date}T00:00:00+03:00`); if (months) d.setUTCMonth(d.getUTCMonth() + months); if (days) d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10) }
function daysInMonth(date: string) { const [year, month] = date.split('-').map(Number); const count = new Date(year, month, 0).getDate(); return Array.from({ length: count }, (_, index) => `${year}-${String(month).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`) }
function uniquePeople(records: AttendanceConsoleRecord[]) { const map = new Map<string, { id: string; name: string }>(); records.forEach((record) => { if (record.team_member_id) map.set(record.team_member_id, { id: record.team_member_id, name: record.employee_name }) }); return [...map.values()] }
function cellClass(record: AttendanceConsoleRecord) { if (record.open_now) return 'bg-emerald-100 text-emerald-800'; if (record.is_checkin_missing) return 'bg-purple-100 text-purple-800'; if (record.is_hours_capped) return 'bg-orange-100 text-orange-800'; if (record.is_auto_closed) return 'bg-blue-100 text-blue-800'; if (record.late_minutes > 0) return 'bg-amber-100 text-amber-800'; if (record.status === 'incomplete') return 'bg-red-100 text-red-800'; return 'bg-gray-800 text-white' }
function cellText(record: AttendanceConsoleRecord) { if (record.open_now) return 'I'; if (record.is_checkin_missing) return '?'; if (record.is_hours_capped) return 'C'; if (record.is_auto_closed) return 'A'; if (record.late_minutes > 0) return 'L'; if (record.status === 'incomplete') return '!'; return '✓' }
function inLabel(record: AttendanceConsoleRecord) { return record.is_checkin_missing ? 'missing' : time(record.check_in_at) }
function workedLabel(record: AttendanceConsoleRecord) { return record.is_checkin_missing ? 'Not calculated' : duration(record.effective_actual_minutes) }
function outLabel(record: AttendanceConsoleRecord) { if (record.is_auto_closed) return `${time(record.effective_check_out_at)} · Auto-closed`; if (record.is_hours_capped) return `Checkout missing · hours capped at ${time(record.effective_check_out_at)}`; if (record.open_now) return '-'; return time(record.check_out_at) }
function recordStatusText(record: AttendanceConsoleRecord) { if (record.open_now) return 'IN NOW'; if (record.is_checkin_missing) return 'CHECK-IN MISSING · HOURS PENDING'; if (record.is_hours_capped) return `CHECKOUT MISSING · CAPPED AT ${time(record.effective_check_out_at)}`; if (record.is_auto_closed) return 'AUTO-CLOSED'; return record.status.toUpperCase() }
