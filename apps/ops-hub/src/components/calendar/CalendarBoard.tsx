'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, Loader2, CalendarDays, ListTodo, CalendarPlus, X, ExternalLink, Clock, MapPin } from 'lucide-react'
import { api } from '@/lib/apiClient'
import { CALENDAR_SCOPE_LABELS, type CalendarScope } from '@/lib/calendarScope'
import { EventComposer } from './EventComposer'
import { TaskComposer, type ComposerProject, type ComposerPerson } from './TaskComposer'

export interface FeedItem {
  id: string
  type: string
  title: string
  date: string
  startsAt: string | null
  endsAt: string | null
  allDay: boolean
  status: string
  brandId: string | null
  assigneeId: string | null
  assigneeName: string
  href: string
  canMove: boolean
  meta: Record<string, unknown>
}

type View = 'day' | 'week' | 'month'

/** One colour per item type, so the same kind of work always reads the same. */
const TYPE_STYLE: Record<string, { dot: string; chip: string; label: string }> = {
  task: { dot: 'bg-slate-500', chip: 'bg-slate-50 text-slate-700 border-slate-200', label: 'Task' },
  personal_task: { dot: 'bg-gray-400', chip: 'bg-gray-50 text-gray-600 border-gray-200', label: 'Personal' },
  duty: { dot: 'bg-ocg-gold', chip: 'bg-amber-50 text-amber-800 border-amber-200', label: 'Duty' },
  inspection: { dot: 'bg-orange-500', chip: 'bg-orange-50 text-orange-800 border-orange-200', label: 'Inspection' },
  meeting: { dot: 'bg-purple-500', chip: 'bg-purple-50 text-purple-700 border-purple-200', label: 'Meeting' },
  event: { dot: 'bg-blue-500', chip: 'bg-blue-50 text-blue-700 border-blue-200', label: 'Event' },
  leave: { dot: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Leave' },
  deadline: { dot: 'bg-red-500', chip: 'bg-red-50 text-red-700 border-red-200', label: 'Deadline' },
}
const styleFor = (t: string) => TYPE_STYLE[t] ?? TYPE_STYLE['event']!

const ALL_TYPES = ['task', 'personal_task', 'duty', 'inspection', 'meeting', 'event', 'leave', 'deadline'] as const

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// ─── Date helpers (UTC-anchored, matching viewWindow() on the server) ────────
const iso = (d: Date) => d.toISOString().slice(0, 10)
const parse = (s: string) => new Date(`${s}T00:00:00Z`)
function addDays(s: string, n: number) { const d = parse(s); d.setUTCDate(d.getUTCDate() + n); return iso(d) }
function addMonths(s: string, n: number) { const d = parse(s); d.setUTCMonth(d.getUTCMonth() + n); return iso(d) }
function startOfWeek(s: string) { const d = parse(s); return addDays(s, -((d.getUTCDay() + 6) % 7)) }
function monthGrid(s: string): string[] {
  const d = parse(s)
  const first = iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)))
  const last = iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)))
  const from = startOfWeek(first)
  const to = addDays(startOfWeek(last), 6)
  const out: string[] = []
  for (let cur = from; cur <= to; cur = addDays(cur, 1)) out.push(cur)
  return out
}
const monthOf = (s: string) => s.slice(0, 7)
const timeOf = (i: FeedItem) =>
  i.startsAt ? new Date(i.startsAt).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' }) : ''

/**
 * The calendar (§§5–7). Day / Week / Month over the unified feed.
 *
 * Every entry originates from an existing record — a task, a derived duty
 * occurrence, approved leave, or a calendar event. Nothing here creates a
 * shadow copy of work that already exists elsewhere, which is what keeps one
 * occurrence from becoming two records across six surfaces.
 */
export function CalendarBoard({
  initial,
  today,
  scopes,
  canCreateEvents,
  canAssignTasks,
  brands,
  projects,
  people,
  filterPeople,
}: {
  initial: { from: string; to: string; items: FeedItem[] }
  today: string
  scopes: CalendarScope[]
  canCreateEvents: boolean
  /** Resolved server-side from the SAME permission POST /api/tasks enforces (§23). */
  canAssignTasks: boolean
  brands: { id: string; label: string }[]
  projects: ComposerProject[]
  people: ComposerPerson[]
  filterPeople: Array<{ id: string; name: string; team: string; department: string }>
}) {
  const [view, setView] = useState<View>('week')
  const [anchor, setAnchor] = useState(today)
  const [scope, setScope] = useState<CalendarScope>(scopes[0] ?? 'personal')
  const [types, setTypes] = useState<string[]>([...ALL_TYPES])
  const [items, setItems] = useState<FeedItem[]>(initial.items)
  const [loading, setLoading] = useState(false)
  /** What is being composed, and for which day. */
  const [composing, setComposing] = useState<{ kind: 'event' | 'task'; date: string } | null>(null)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<FeedItem | null>(null)
  const [personFilter, setPersonFilter] = useState('')
  const [teamFilter, setTeamFilter] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState('')
  const [brandFilter, setBrandFilter] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    // Fetch the complete scoped window once. Type chips are deliberately local
    // so toggling them never incurs a round-trip or makes the calendar flash.
    const params = new URLSearchParams({ view, date: anchor, scope })
    // A month view renders whole weeks, so ask for the padded window.
    if (view === 'month') {
      const grid = monthGrid(anchor)
      params.set('from', grid[0]!)
      params.set('to', grid[grid.length - 1]!)
    }
    const { ok, data } = await api<{ items?: FeedItem[]; error?: string }>(`/api/calendar?${params}`)
    setLoading(false)
    if (!ok) { setError(data?.error ?? 'Could not load the calendar.'); return }
    setItems(data.items ?? [])
  }, [view, anchor, scope])

  useEffect(() => { void load() }, [load])

  const personById = useMemo(() => new Map(filterPeople.map((person) => [person.id, person])), [filterPeople])
  const filteredItems = useMemo(() => items.filter((item) => {
    if (!types.includes(item.type)) return false
    const person = item.assigneeId ? personById.get(item.assigneeId) : null
    if (personFilter && item.assigneeId !== personFilter) return false
    if (teamFilter && person?.team !== teamFilter) return false
    if (departmentFilter && person?.department !== departmentFilter) return false
    if (brandFilter && item.brandId !== brandFilter) return false
    return true
  }), [items, types, personById, personFilter, teamFilter, departmentFilter, brandFilter])

  const byDate = useMemo(() => {
    const map = new Map<string, FeedItem[]>()
    for (const item of filteredItems) map.set(item.date, [...(map.get(item.date) ?? []), item])
    for (const list of map.values()) {
      list.sort((a, b) => (a.allDay === b.allDay ? (a.startsAt ?? '').localeCompare(b.startsAt ?? '') : a.allDay ? -1 : 1))
    }
    return map
  }, [filteredItems])

  function step(dir: -1 | 1) {
    setAnchor((a) => (view === 'month' ? addMonths(a, dir) : addDays(a, view === 'week' ? 7 * dir : dir)))
  }

  /** Clicking a specific day prefills that day (§24). */
  const openDay = useCallback((kind: 'event' | 'task', date: string) => {
    setComposing({ kind, date })
  }, [])

  const heading = useMemo(() => {
    const d = parse(anchor)
    if (view === 'month') return d.toLocaleDateString('en-KE', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    if (view === 'day') return d.toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    const from = startOfWeek(anchor)
    const to = addDays(from, 6)
    return `${parse(from).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', timeZone: 'UTC' })} – ${parse(to).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}`
  }, [anchor, view])

  return (
    <div className="space-y-4">
      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-0.5">
          <button onClick={() => step(-1)} className="rounded p-1.5 text-gray-500 hover:bg-gray-50" aria-label="Previous">
            <ChevronLeft size={16} />
          </button>
          <button onClick={() => setAnchor(today)} className="px-2 py-1 text-xs font-medium text-gray-600 hover:text-gray-900">
            Today
          </button>
          <button onClick={() => step(1)} className="rounded p-1.5 text-gray-500 hover:bg-gray-50" aria-label="Next">
            <ChevronRight size={16} />
          </button>
        </div>

        <h2 className="mr-auto text-sm font-semibold text-gray-900">{heading}</h2>

        {loading && <Loader2 size={15} className="animate-spin text-gray-300" />}

        <div className="flex rounded-lg border border-gray-200 bg-white p-0.5">
          {(['day', 'week', 'month'] as View[]).map((v) => (
            <button key={v} onClick={() => setView(v)}
              className={`rounded px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                view === v ? 'bg-ocg-navy text-white' : 'text-gray-500 hover:text-gray-900'
              }`}>{v}</button>
          ))}
        </div>

        {scopes.length > 1 && (
          <select value={scope} onChange={(e) => setScope(e.target.value as CalendarScope)}
            className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600">
            {scopes.map((s) => <option key={s} value={s}>{CALENDAR_SCOPE_LABELS[s]}</option>)}
          </select>
        )}

        <AddButton
          canAssignTasks={canAssignTasks}
          onPick={(kind) => setComposing({ kind, date: anchor })}
        />
      </div>

      {/* ── Type filters ────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1.5">
        {ALL_TYPES.map((t) => {
          const on = types.includes(t)
          const s = styleFor(t)
          return (
            <button key={t}
              onClick={() => setTypes((c) => (on ? c.filter((x) => x !== t) : [...c, t]))}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-opacity ${s.chip} ${on ? '' : 'opacity-35'}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} /> {s.label}
            </button>
          )
        })}
      </div>

      {scopes[0] === 'management' && <div className="grid gap-2 rounded-xl border border-gray-100 bg-white p-3 sm:grid-cols-2 lg:grid-cols-4">
        <FilterSelect label="Person" value={personFilter} onChange={setPersonFilter} options={filterPeople.map((person) => ({ value: person.id, label: person.name }))} />
        <FilterSelect label="Team" value={teamFilter} onChange={setTeamFilter} options={[...new Set(filterPeople.map((person) => person.team).filter(Boolean))].sort().map((value) => ({ value, label: value }))} />
        <FilterSelect label="Department" value={departmentFilter} onChange={setDepartmentFilter} options={[...new Set(filterPeople.map((person) => person.department).filter(Boolean))].sort().map((value) => ({ value, label: value }))} />
        <FilterSelect label="Brand" value={brandFilter} onChange={setBrandFilter} options={brands.map((brand) => ({ value: brand.id, label: brand.label }))} />
      </div>}

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}

      {/* ── Grid ────────────────────────────────────────────────────── */}
      {view === 'month' && <MonthView anchor={anchor} today={today} byDate={byDate} onAdd={openDay} canAssignTasks={canAssignTasks} onSelect={setSelected} />}
      {view === 'week' && <WeekView anchor={anchor} today={today} byDate={byDate} onAdd={openDay} canAssignTasks={canAssignTasks} onSelect={setSelected} />}
      {view === 'day' && <DayView date={anchor} today={today} items={byDate.get(anchor) ?? []} onSelect={setSelected} />}

      {composing?.kind === 'event' && (
        <EventComposer
          date={composing.date}
          brands={brands}
          canCreateShared={canCreateEvents}
          onClose={() => setComposing(null)}
          onCreated={() => { setComposing(null); void load() }}
        />
      )}

      {composing?.kind === 'task' && (
        <TaskComposer
          date={composing.date}
          projects={projects}
          people={people}
          onClose={() => setComposing(null)}
          // §26: the new task is a normal Ops Task, so simply reloading the feed
          // brings it in — no local copy is spliced into state.
          onCreated={() => { setComposing(null); void load() }}
        />
      )}
      {selected && <ItemDrawer item={selected} brands={brands} onClose={() => setSelected(null)} />}
    </div>
  )
}

/**
 * §23: an ordinary user gets "Event"; someone with genuine task-assignment
 * authority gets a "+ Add" menu offering Event or Assign Task.
 *
 * `canAssignTasks` is resolved on the SERVER from the same permission
 * POST /api/tasks enforces — never from a client-side role string — so hiding
 * the option is a courtesy, not the control (§40.12).
 */
function AddButton({
  canAssignTasks, onPick,
}: {
  canAssignTasks: boolean
  onPick: (kind: 'event' | 'task') => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  if (!canAssignTasks) {
    return (
      <button onClick={() => onPick('event')}
        className="inline-flex items-center gap-1.5 rounded-lg bg-ocg-navy px-3 py-2 text-xs font-medium text-white hover:bg-slate-800">
        <Plus size={14} /> Event
      </button>
    )
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu" aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-lg bg-ocg-navy px-3 py-2 text-xs font-medium text-white hover:bg-slate-800">
        <Plus size={14} /> Add
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
          <button role="menuitem"
            onClick={() => { setOpen(false); onPick('event') }}
            className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-gray-50">
            <CalendarPlus size={15} className="mt-0.5 shrink-0 text-blue-500" />
            <span>
              <span className="block text-sm font-medium text-gray-800">Event</span>
              <span className="block text-[11px] text-gray-400">Something happening at a time</span>
            </span>
          </button>
          <button role="menuitem"
            onClick={() => { setOpen(false); onPick('task') }}
            className="flex w-full items-start gap-2.5 border-t border-gray-100 px-3 py-2.5 text-left hover:bg-gray-50">
            <ListTodo size={15} className="mt-0.5 shrink-0 text-slate-500" />
            <span>
              <span className="block text-sm font-medium text-gray-800">Assign Task</span>
              <span className="block text-[11px] text-gray-400">Work for someone to do</span>
            </span>
          </button>
        </div>
      )}
    </div>
  )
}

/** The per-day "+" in month/week views. Same choice as the toolbar (§23). */
function DayAdd({
  date, canAssignTasks, onAdd, size = 13,
}: {
  date: string
  canAssignTasks: boolean
  onAdd: (kind: 'event' | 'task', date: string) => void
  size?: number
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  if (!canAssignTasks) {
    return (
      <button onClick={() => onAdd('event', date)}
        className="opacity-0 transition-opacity group-hover:opacity-100" aria-label={`Add on ${date}`}>
        <Plus size={size} className="text-gray-300 hover:text-ocg-gold" />
      </button>
    )
  }

  return (
    <span className="relative" ref={ref}>
      <button onClick={() => setOpen((v) => !v)}
        className={`transition-opacity ${open ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
        aria-haspopup="menu" aria-expanded={open} aria-label={`Add on ${date}`}>
        <Plus size={size} className="text-gray-300 hover:text-ocg-gold" />
      </button>
      {open && (
        <span role="menu" className="absolute right-0 z-30 mt-1 flex w-36 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
          <button role="menuitem" onClick={() => { setOpen(false); onAdd('event', date) }}
            className="px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50">Event</button>
          <button role="menuitem" onClick={() => { setOpen(false); onAdd('task', date) }}
            className="border-t border-gray-100 px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50">Assign Task</button>
        </span>
      )}
    </span>
  )
}

// ─── Views ──────────────────────────────────────────────────────────────────

function MonthView({ anchor, today, byDate, onAdd, canAssignTasks, onSelect }: {
  anchor: string
  today: string
  byDate: Map<string, FeedItem[]>
  onAdd: (kind: 'event' | 'task', date: string) => void
  canAssignTasks: boolean
  onSelect: (item: FeedItem) => void
}) {
  const days = monthGrid(anchor)
  const current = monthOf(anchor)
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50">
        {WEEKDAYS.map((d) => (
          <div key={d} className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-gray-400">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const list = byDate.get(day) ?? []
          const outside = monthOf(day) !== current
          return (
            <div key={day}
              className={`group min-h-[92px] border-b border-r border-gray-100 p-1.5 ${outside ? 'bg-gray-50/60' : 'bg-white'}`}>
              <div className="mb-1 flex items-center justify-between">
                <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-medium ${
                  day === today ? 'bg-ocg-navy text-white' : outside ? 'text-gray-300' : 'text-gray-600'
                }`}>{Number(day.slice(8, 10))}</span>
                <DayAdd date={day} canAssignTasks={canAssignTasks} onAdd={onAdd} size={12} />
              </div>
              <div className="space-y-0.5">
                {list.slice(0, 3).map((i) => <Chip key={i.id} item={i} compact onSelect={onSelect} />)}
                {list.length > 3 && <p className="px-1 text-[10px] text-gray-400">+{list.length - 3} more</p>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function WeekView({ anchor, today, byDate, onAdd, canAssignTasks, onSelect }: {
  anchor: string
  today: string
  byDate: Map<string, FeedItem[]>
  onAdd: (kind: 'event' | 'task', date: string) => void
  canAssignTasks: boolean
  onSelect: (item: FeedItem) => void
}) {
  const from = startOfWeek(anchor)
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i))
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="grid min-w-[720px] grid-cols-7">
        {days.map((day, idx) => {
          const list = byDate.get(day) ?? []
          const d = parse(day)
          return (
            <div key={day} className={`group min-h-[280px] border-b border-gray-100 p-2 ${idx < 6 ? 'border-r' : ''}`}>
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                    {d.toLocaleDateString('en-KE', { weekday: 'short', timeZone: 'UTC' })}
                  </p>
                  <p className={`text-sm font-medium ${day === today ? 'text-ocg-navy' : 'text-gray-600'}`}>
                    {day === today
                      ? <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-ocg-navy text-white">{Number(day.slice(8, 10))}</span>
                      : Number(day.slice(8, 10))}
                  </p>
                </div>
                <DayAdd date={day} canAssignTasks={canAssignTasks} onAdd={onAdd} />
              </div>
              <div className="space-y-1">
                {list.length === 0
                  ? <p className="px-1 text-[11px] text-gray-300">—</p>
                  : list.map((i) => <Chip key={i.id} item={i} onSelect={onSelect} />)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DayView({ date, today, items, onSelect }: { date: string; today: string; items: FeedItem[]; onSelect: (item: FeedItem) => void }) {
  const allDay = items.filter((i) => i.allDay)
  const timed = items.filter((i) => !i.allDay)
  return (
    <div className="space-y-4">
      {allDay.length > 0 && (
        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">All day</h3>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {allDay.map((i) => <Row key={i.id} item={i} onSelect={onSelect} />)}
          </div>
        </section>
      )}
      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
          Scheduled {date === today && <span className="text-ocg-gold">· today</span>}
        </h3>
        {timed.length === 0 ? (
          <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">
            {items.length === 0 ? 'Nothing scheduled on this day.' : 'Nothing with a set time.'}
          </p>
        ) : (
          <div className="space-y-1.5">{timed.map((i) => <Row key={i.id} item={i} onSelect={onSelect} />)}</div>
        )}
      </section>
    </div>
  )
}

// ─── Item renderers ─────────────────────────────────────────────────────────

/** "10:00–12:00" where the item has a window, else its start time (§43). */
function rangeOf(item: FeedItem): string {
  if (!item.startsAt) return ''
  const t = (iso: string) => new Date(iso).toLocaleTimeString('en-KE', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Africa/Nairobi',
  })
  return item.endsAt ? `${t(item.startsAt)}–${t(item.endsAt)}` : t(item.startsAt)
}

function Chip({ item, compact = false, onSelect }: { item: FeedItem; compact?: boolean; onSelect: (item: FeedItem) => void }) {
  const s = styleFor(item.type)
  const done = item.status === 'done' || item.status === 'Completed'
  const overdue = item.meta?.['overdue'] === true
  const due = item.meta?.['dueDate']
  // A scheduled task shows where it sits AND when it is actually due, so
  // "scheduled Wednesday, due Friday" is legible from the calendar itself.
  const title = [
    `${s.label}: ${item.title}`,
    item.assigneeName || '',
    rangeOf(item),
    typeof due === 'string' && due && due !== item.date ? `due ${due}` : '',
  ].filter(Boolean).join(' · ')

  return (
    <button type="button" onClick={() => onSelect(item)} title={title}
      className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] leading-tight transition-colors hover:brightness-95 ${s.chip} ${
        done ? 'opacity-50' : ''} ${overdue ? 'ring-1 ring-red-300' : ''}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${s.dot}`} />
      {!compact && item.startsAt && <span className="shrink-0 font-medium tabular-nums">{timeOf(item)}</span>}
      <span className={`truncate ${done ? 'line-through' : ''}`}>{item.title}</span>
    </button>
  )
}

function Row({ item, onSelect }: { item: FeedItem; onSelect: (item: FeedItem) => void }) {
  const s = styleFor(item.type)
  const done = item.status === 'done' || item.status === 'Completed'
  const range = rangeOf(item)
  const due = item.meta?.['dueDate']
  const location = item.meta?.['location']
  return (
    <button type="button" onClick={() => onSelect(item)}
      className="flex w-full items-center gap-3 rounded-lg border border-gray-100 px-3 py-2 text-left transition-colors hover:border-ocg-gold/40">
      {/* Day and week views show the full window, not just the start (§43). */}
      <span className="w-24 shrink-0 text-xs font-medium tabular-nums text-gray-500">{range || '—'}</span>
      <span className={`h-2 w-2 shrink-0 rounded-full ${s.dot}`} />
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-sm ${done ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{item.title}</span>
        <span className="block truncate text-xs text-gray-400">
          {s.label}{item.assigneeName ? ` · ${item.assigneeName}` : ''}
          {typeof location === 'string' && location ? ` · ${location}` : ''}
          {typeof due === 'string' && due && due !== item.date ? ` · due ${due}` : ''}
          {item.meta?.['overdue'] === true ? ' · overdue' : ''}
        </span>
      </span>
      <CalendarDays size={13} className="shrink-0 text-gray-200" />
    </button>
  )
}

function FilterSelect({ label, value, onChange, options }: {
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
}) {
  return <label><span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</span><select className="input" value={value} onChange={(event) => onChange(event.target.value)}><option value="">All {label.toLowerCase()}</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
}

function ItemDrawer({ item, brands, onClose }: { item: FeedItem; brands: Array<{ id: string; label: string }>; onClose: () => void }) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', close)
    return () => document.removeEventListener('keydown', close)
  }, [onClose])
  const style = styleFor(item.type)
  const description = item.meta?.['description']
  const project = item.meta?.['project']
  const priority = item.meta?.['priority']
  const location = item.meta?.['location']
  const dueDate = item.meta?.['dueDate']
  const checklistDone = item.meta?.['checklistDone']
  const checklistTotal = item.meta?.['checklistTotal']
  const brandLabel = item.brandId ? brands.find((brand) => brand.id === item.brandId)?.label ?? 'Authorised brand' : ''
  const openLabel = item.type === 'task' || item.type === 'deadline' ? 'Open full task'
    : item.type === 'duty' || item.type === 'inspection' ? 'Open full duty' : 'Open full event'
  return (
    <div className="fixed inset-0 z-50 bg-black/20" onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-label={`${style.label} details`} className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-ocg-gold">{style.label} details</p><h2 className="mt-1 text-xl font-semibold text-gray-900">{item.title}</h2></div><button onClick={onClose} aria-label="Close details" className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><X size={19} /></button></div>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          <div className="flex flex-wrap gap-2"><span className={`rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${style.chip}`}>{item.status.replace(/_/g, ' ')}</span>{typeof priority === 'string' && priority && <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">{priority} priority</span>}</div>
          <dl className="grid gap-3 text-sm">
            <Detail icon={<Clock size={15} />} label="When" value={item.allDay ? `${item.date} · all day` : `${item.date} · ${rangeOf(item)}`} />
            {item.assigneeName && <Detail label="Assignee" value={item.assigneeName} />}
            {(typeof project === 'string' && project) || brandLabel ? <Detail label="Project / brand" value={[typeof project === 'string' ? project : '', brandLabel].filter(Boolean).join(' · ')} /> : null}
            {typeof dueDate === 'string' && dueDate && <Detail label="Deadline" value={dueDate} />}
            {typeof location === 'string' && location && <Detail icon={<MapPin size={15} />} label="Location" value={location} />}
            {typeof checklistTotal === 'number' && checklistTotal > 0 && <Detail label="Checklist / review" value={`${Number(checklistDone ?? 0)} of ${checklistTotal} complete · ${String(item.meta?.['reviewState'] ?? 'not reviewed').replace(/_/g, ' ')}`} />}
            {item.type === 'event' || item.type === 'meeting' ? <Detail label="Visibility / attendees" value={`${String(item.meta?.['visibility'] ?? 'private').replace(/_/g, ' ')} · ${(item.meta?.['attendeeIds'] as unknown[] | undefined)?.length ?? 0} attendee(s)`} /> : null}
          </dl>
          {typeof description === 'string' && description && <div><p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Description</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-gray-600">{description}</p></div>}
          {typeof item.meta?.['notes'] === 'string' && item.meta['notes'] && <div><p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Notes</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-gray-600">{String(item.meta['notes'])}</p></div>}
          {item.meta?.['recurring'] === true && <p className="rounded-lg bg-blue-50 p-3 text-xs text-blue-800">Recurring occurrence {String(item.meta?.['occurrenceNumber'] ?? '')}. Its completion state is independent from every other occurrence.</p>}
        </div>
        <div className="border-t border-gray-100 p-4"><a href={item.href} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-ocg-navy px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800">{openLabel} <ExternalLink size={14} /></a></div>
      </aside>
    </div>
  )
}

function Detail({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return <div><dt className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">{icon}{label}</dt><dd className="mt-1 text-gray-700">{value}</dd></div>
}
