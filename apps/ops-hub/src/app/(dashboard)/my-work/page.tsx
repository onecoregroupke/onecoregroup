import Link from 'next/link'
import {
  BriefcaseBusiness, AlertTriangle, CalendarCheck, ListTodo, CalendarClock,
  MapPin, Lock, CheckCircle2,
} from 'lucide-react'
import { requireActor } from '@/lib/server-auth'
import { todayInEat, nowIso } from '@/lib/serverClient'
import { formatEatRange } from '@/lib/kenyaTime'
import {
  loadMyWork, dutyToWorkItem, taskToWorkItem, openTasks, completedTasks,
  type MyWorkData,
} from '@/lib/myWork'
import { buildToday, parseTab, isOverdue, type MyWorkTab } from '@/lib/myWorkModel'
import { DutyOccurrenceCard, type OccurrenceDto } from '@/components/duties/DutyOccurrenceCard'
import { AssignedTaskList, type AssignedTask } from '@/components/tasks/AssignedTaskList'
import type { OpsTaskRow } from '@ocg/db'

export const dynamic = 'force-dynamic'

/**
 * MY WORK (§§5–10) — the one place an employee looks to answer "what do I need
 * to do today?".
 *
 * This is a composed VIEW, not a new work database. Daily Duties are the derived
 * occurrences from ocg_daily_duties; Assigned Tasks are ops_tasks rows;
 * appointments are npt_appointments. Each keeps its own record, its own
 * completion flow and its own type tag — a Teacher Daily Diary does not become
 * satisfiable by a generic Done toggle just because it is listed next to a task
 * (§6B).
 *
 * Scope is the signed-in person's own work and cannot be widened by a query
 * parameter (§40.1–2).
 */
export default async function MyWorkPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; date?: string }>
}) {
  const actor = await requireActor()
  const params = await searchParams
  const tab = parseTab(params.tab)
  const today = todayInEat()
  // A date may be inspected, but it never widens WHOSE work is shown.
  const date = params.date || today

  const data = await loadMyWork({ email: actor.email, name: actor.name }, { date })

  return (
    <div className="space-y-5">
      <Header name={actor.name} counts={summarise(data, today)} />
      <Tabs tab={tab} counts={summarise(data, today)} />

      {!data.member && <NoEmployeeRecord hasTasks={data.tasks.length > 0} />}

      {tab === 'today' && <TodayView data={data} today={today} />}
      {tab === 'duties' && <DutiesView data={data} />}
      {tab === 'tasks' && <TasksView data={data} today={today} />}
      {tab === 'completed' && <CompletedView data={data} />}

      <p className="rounded-xl border border-gray-100 bg-white p-4 text-xs leading-relaxed text-gray-500 shadow-sm">
        <strong className="text-gray-700">Duties and tasks are different things.</strong>{' '}
        <span className="font-medium text-gray-600">Daily Duties</span> are the recurring
        responsibilities that come with your role. <span className="font-medium text-gray-600">Assigned
        Tasks</span> are specific pieces of work management gave you. Your own private to-dos live in{' '}
        <Link href="/personal" className="inline-flex items-center gap-1 font-medium text-ocg-gold hover:underline">
          <Lock size={11} /> Personal
        </Link>{' '}
        and are not company work.
      </p>
    </div>
  )
}

// ─── Assembly ───────────────────────────────────────────────────────────────

interface Counts {
  overdue: number
  dutiesOutstanding: number
  dutiesTotal: number
  tasksOpen: number
  appointments: number
  completed: number
}

function summarise(data: MyWorkData, today: string): Counts {
  const now = nowIso()
  const items = [
    ...data.dutiesToday.map(dutyToWorkItem),
    ...data.dutiesOverdue.map(dutyToWorkItem),
    ...openTasks(data.tasks).map(taskToWorkItem),
  ]
  const buckets = buildToday(items, today, now)
  return {
    overdue: buckets.counts.overdue,
    dutiesOutstanding: buckets.counts.dutiesOutstanding,
    dutiesTotal: data.dutiesToday.length,
    tasksOpen: buckets.counts.tasksOpen,
    appointments: data.appointments.length,
    completed: data.dutiesRecent.length + completedTasks(data.tasks).length,
  }
}

function toAssignedTask(t: OpsTaskRow, today: string): AssignedTask {
  return {
    taskId: t.task_id,
    name: t.task_name,
    projectName: t.project_name,
    targetDate: t.target_date,
    priority: t.priority,
    status: t.current_status,
    overdue: isOverdue(
      { kind: 'task', status: t.current_status, dueDate: t.target_date || '', dueAt: null },
      today,
    ),
    requiresApproval: t.requires_approval === true,
  }
}

/** Duty occurrences, most urgent first, keyed uniquely across duty × date × person. */
function dutyKey(o: OccurrenceDto): string {
  return `${o.dutyId}:${o.date}:${o.assigneeId ?? ''}`
}

// ─── Views ──────────────────────────────────────────────────────────────────

function TodayView({ data, today }: { data: MyWorkData; today: string }) {
  const now = nowIso()
  const overdueTasks = openTasks(data.tasks)
    .map((t) => toAssignedTask(t, today))
    .filter((t) => t.overdue)
  const dueTasks = openTasks(data.tasks)
    .map((t) => toAssignedTask(t, today))
    .filter((t) => !t.overdue)
    .sort((a, b) => rankTask(a, today) - rankTask(b, today))

  // A duty already past its due time today belongs in Overdue, not below it.
  const dutiesLateToday = data.dutiesToday.filter((o) =>
    isOverdue({ kind: 'duty', status: o.status, dueDate: o.date, dueAt: o.dueAt }, today, now))
  const dutiesDueToday = data.dutiesToday.filter((o) => !dutiesLateToday.includes(o))
  const overdueDuties = [...data.dutiesOverdue, ...dutiesLateToday]

  const nothing =
    overdueDuties.length === 0 && overdueTasks.length === 0 &&
    dutiesDueToday.length === 0 && dueTasks.length === 0 && data.appointments.length === 0

  return (
    <div className="space-y-5">
      {(overdueDuties.length > 0 || overdueTasks.length > 0) && (
        <Section
          title="Overdue"
          tone="red"
          icon={<AlertTriangle size={15} className="text-red-500" />}
          hint="Late work, oldest first. Clear these before starting today's."
        >
          <div className="space-y-2">
            {overdueDuties.map((o) => (
              <div key={dutyKey(o)}>
                <p className="mb-1 text-[11px] font-medium text-gray-400">{o.date}</p>
                <DutyOccurrenceCard occurrence={o} />
              </div>
            ))}
            {overdueTasks.length > 0 && <AssignedTaskList tasks={overdueTasks} emptyMessage="" />}
          </div>
        </Section>
      )}

      <Section
        title="Daily Duties"
        icon={<CalendarCheck size={15} className="text-ocg-gold" />}
        hint="Your recurring responsibilities."
        count={dutiesDueToday.length}
      >
        {dutiesDueToday.length === 0 ? (
          <Empty>No duties fall due for you today.</Empty>
        ) : (
          <div className="space-y-2">
            {dutiesDueToday.map((o) => <DutyOccurrenceCard key={dutyKey(o)} occurrence={o} />)}
          </div>
        )}
      </Section>

      <Section
        title="Assigned Tasks"
        icon={<ListTodo size={15} className="text-slate-500" />}
        hint="Specific work assigned to you by management."
        count={dueTasks.length}
      >
        <AssignedTaskList tasks={dueTasks} emptyMessage="Nothing assigned to you is open right now." />
      </Section>

      {data.appointments.length > 0 && (
        <Section
          title="Appointments"
          icon={<CalendarClock size={15} className="text-blue-500" />}
          hint="Scheduled engagements already booked for you."
          count={data.appointments.length}
        >
          <div className="space-y-2">
            {data.appointments.map((a) => (
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
          </div>
        </Section>
      )}

      {nothing && data.member && (
        <p className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-6 text-sm text-emerald-800">
          <CheckCircle2 size={16} className="mr-1.5 inline" />
          Nothing outstanding. You have no duties due, no open assigned tasks and nothing overdue.
        </p>
      )}
    </div>
  )
}

const TASK_PRIORITY_RANK: Record<string, number> = { Urgent: 0, High: 1, Medium: 2, Low: 3 }

/** Due today first, then priority, then anything undated (§6C). */
function rankTask(t: AssignedTask, today: string): number {
  const dueToday = t.targetDate === today ? 0 : t.targetDate ? 1 : 2
  return dueToday * 10 + (TASK_PRIORITY_RANK[t.priority] ?? 2)
}

function DutiesView({ data }: { data: MyWorkData }) {
  return (
    <div className="space-y-5">
      {data.dutiesOverdue.length > 0 && (
        <Section
          title="Overdue duties"
          tone="red"
          icon={<AlertTriangle size={15} className="text-red-500" />}
          hint="Unfinished occurrences from the last 7 days."
        >
          <div className="space-y-2">
            {data.dutiesOverdue.map((o) => (
              <div key={dutyKey(o)}>
                <p className="mb-1 text-[11px] font-medium text-gray-400">{o.date}</p>
                <DutyOccurrenceCard occurrence={o} />
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section
        title="Daily Duties"
        icon={<CalendarCheck size={15} className="text-ocg-gold" />}
        hint={`Your recurring responsibilities for ${data.date}. Completing one here completes it everywhere.`}
        count={data.dutiesToday.length}
      >
        {data.dutiesToday.length === 0 ? (
          <Empty>No duties are scheduled for you on this day.</Empty>
        ) : (
          <div className="space-y-2">
            {data.dutiesToday.map((o) => <DutyOccurrenceCard key={dutyKey(o)} occurrence={o} />)}
          </div>
        )}
      </Section>
    </div>
  )
}

function TasksView({ data, today }: { data: MyWorkData; today: string }) {
  const open = openTasks(data.tasks)
    .map((t) => toAssignedTask(t, today))
    .sort((a, b) => (Number(b.overdue) - Number(a.overdue)) || rankTask(a, today) - rankTask(b, today))

  return (
    <Section
      title="Assigned Tasks"
      icon={<ListTodo size={15} className="text-slate-500" />}
      hint="Specific work assigned to you by management. You cannot create assigned tasks here."
      count={open.length}
    >
      <AssignedTaskList tasks={open} emptyMessage="No open tasks are assigned to you right now." />
    </Section>
  )
}

function CompletedView({ data }: { data: MyWorkData }) {
  const done = completedTasks(data.tasks).map((t) => toAssignedTask(t, data.date))
  return (
    <div className="space-y-5">
      <Section
        title="Completed duties"
        icon={<CalendarCheck size={15} className="text-emerald-600" />}
        hint="Duty occurrences you recorded in the last 30 days."
        count={data.dutiesRecent.length}
      >
        {data.dutiesRecent.length === 0 ? (
          <Empty>No duty occurrences recorded yet.</Empty>
        ) : (
          <div className="space-y-2">
            {data.dutiesRecent.map((o) => (
              <div key={dutyKey(o)}>
                <p className="mb-1 text-[11px] font-medium text-gray-400">{o.date}</p>
                <DutyOccurrenceCard occurrence={o} readOnly />
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section
        title="Completed tasks"
        icon={<ListTodo size={15} className="text-emerald-600" />}
        hint="Assigned tasks that are closed."
        count={done.length}
      >
        <AssignedTaskList tasks={done} emptyMessage="Nothing completed yet." />
      </Section>
    </div>
  )
}

// ─── Chrome ─────────────────────────────────────────────────────────────────

function Header({ name, counts }: { name: string; counts: Counts }) {
  const parts = [
    counts.overdue > 0 ? `${counts.overdue} overdue` : '',
    `${counts.dutiesOutstanding} ${counts.dutiesOutstanding === 1 ? 'duty' : 'duties'} outstanding`,
    `${counts.tasksOpen} ${counts.tasksOpen === 1 ? 'task' : 'tasks'} open`,
  ].filter(Boolean)

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ocg-gold">My work</p>
      <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-gray-900">
        <BriefcaseBusiness size={22} className="text-gray-400" />
        {name ? `Good day, ${name.split(' ')[0]}` : 'My work'}
      </h1>
      <p className="mt-1 max-w-2xl text-sm text-gray-500">
        Everything the company expects of you today — {parts.join(' · ')}.
      </p>
    </div>
  )
}

const TAB_LABELS: Record<MyWorkTab, string> = {
  today: 'Today',
  duties: 'Duties',
  tasks: 'Assigned Tasks',
  completed: 'Completed',
}

function Tabs({ tab, counts }: { tab: MyWorkTab; counts: Counts }) {
  const badge: Record<MyWorkTab, number> = {
    today: counts.overdue + counts.dutiesOutstanding + counts.tasksOpen,
    duties: counts.dutiesOutstanding,
    tasks: counts.tasksOpen,
    completed: counts.completed,
  }
  return (
    <div className="flex flex-wrap gap-1.5" role="tablist">
      {(Object.keys(TAB_LABELS) as MyWorkTab[]).map((key) => {
        const active = key === tab
        return (
          <Link
            key={key}
            href={key === 'today' ? '/my-work' : `/my-work?tab=${key}`}
            role="tab"
            aria-selected={active}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? 'border-ocg-navy bg-ocg-navy text-white'
                : 'border-gray-200 bg-white text-gray-600 hover:border-ocg-gold/40'
            }`}
          >
            {TAB_LABELS[key]}
            {badge[key] > 0 && (
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                active ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
              }`}>{badge[key]}</span>
            )}
          </Link>
        )
      })}
    </div>
  )
}

function Section({
  title, hint, icon, count, tone = 'gray', children,
}: {
  title: string
  hint?: string
  icon?: React.ReactNode
  count?: number
  tone?: 'gray' | 'red'
  children: React.ReactNode
}) {
  return (
    <section className={`rounded-xl border bg-white p-5 shadow-sm ${
      tone === 'red' ? 'border-red-100' : 'border-gray-100'
    }`}>
      <div className="mb-1 flex items-center gap-2">
        {icon}
        <h2 className={`text-xs font-semibold uppercase tracking-wider ${
          tone === 'red' ? 'text-red-600' : 'text-ocg-gold'
        }`}>{title}</h2>
        {count != null && count > 0 && (
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">{count}</span>
        )}
      </div>
      {hint && <p className="mb-3 text-xs text-gray-400">{hint}</p>}
      {children}
    </section>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">{children}</p>
}

function NoEmployeeRecord({ hasTasks }: { hasTasks: boolean }) {
  return (
    <p className="rounded-xl border border-amber-100 bg-amber-50 p-5 text-sm text-amber-900">
      Your sign-in is not linked to a team-member record yet, so no duties or appointments can be
      assigned to you{hasTasks ? ' — the tasks below matched your name only' : ''}. Ask a manager to
      add you under Management → Team with this email address.
    </p>
  )
}
