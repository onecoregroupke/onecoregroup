import Link from 'next/link'
import { ManagementStatusButton } from './ManagementActionPanel'
import { activeTasks, dueWithinDays, isOverdue, workloadLabel } from '@/lib/management'
import { priorityTone, statusTone } from '@/lib/taskStatuses'
import type {
  Brand,
  MarketingCampaignRow,
  MarketingContentRow,
  NptReminderRow,
  NptServiceJobRow,
  OcgApprovalRow,
  OcgBlockerRow,
  OpsCompletionRecordRow,
  OpsProjectRow,
  OpsTaskRow,
  OpsTeamMemberRow,
  RayyanAdmissionRow,
  RayyanAdminTaskRow,
  RayyanFeeFollowupRow,
  RayyanSchoolpayPaymentSnapshotRow,
  RayyanStudentRow,
} from '@ocg/db'

export function Panel({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ocg-gold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">{children}</p>
}

export function BrandOverviewCard({
  brands,
  projects,
  tasks,
}: {
  brands: Brand[]
  projects: OpsProjectRow[]
  tasks: OpsTaskRow[]
}) {
  return (
    <Panel title="Brand health">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {brands.map((brand) => {
          const brandTasks = tasks.filter((t) => t.brand_id === brand.id)
          const active = activeTasks(brandTasks)
          const overdue = active.filter((t) => isOverdue(t.target_date))
          const blocked = brandTasks.filter((t) => t.current_status === 'Blocked')
          const brandProjects = projects.filter((p) => p.brand_id === brand.id && p.status !== 'Archived')
          return (
            <Link
              key={brand.id}
              href={`/tasks?brand=${brand.slug}`}
              className="rounded-lg border border-gray-100 p-4 transition-colors hover:border-ocg-gold/50"
            >
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: brand.color_hex }} />
                <p className="truncate text-sm font-semibold text-gray-900">{brand.short_name || brand.name}</p>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <Metric label="Active" value={active.length} />
                <Metric label="Overdue" value={overdue.length} tone={overdue.length ? 'text-red-600' : undefined} />
                <Metric label="Blocked" value={blocked.length} tone={blocked.length ? 'text-amber-600' : undefined} />
              </div>
              <p className="mt-3 text-xs text-gray-400">{brandProjects.length} active project{brandProjects.length === 1 ? '' : 's'}</p>
            </Link>
          )
        })}
      </div>
    </Panel>
  )
}

export function TaskRiskCard({ tasks, blockers, today }: { tasks: OpsTaskRow[]; blockers: OcgBlockerRow[]; today: string }) {
  const active = activeTasks(tasks)
  const dueToday = active.filter((t) => t.target_date === today)
  const overdue = active.filter((t) => isOverdue(t.target_date, today))
  const blocked = tasks.filter((t) => t.current_status === 'Blocked')
  const openBlockers = blockers.filter((b) => b.status !== 'resolved')

  return (
    <Panel title="Task risk">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Due today" value={dueToday.length} />
        <Stat label="Overdue" value={overdue.length} tone="text-red-600" />
        <Stat label="Blocked tasks" value={blocked.length} tone="text-amber-600" />
        <Stat label="Risk register" value={openBlockers.length} tone="text-amber-600" />
      </div>
      {overdue.length + blocked.length === 0 ? (
        <p className="mt-4 text-sm text-gray-400">No overdue or blocked Ops tasks are currently visible.</p>
      ) : (
        <ul className="mt-4 divide-y divide-gray-100">
          {[...overdue, ...blocked].slice(0, 6).map((task) => (
            <TaskLine key={task.task_id} task={task} />
          ))}
        </ul>
      )}
    </Panel>
  )
}

export function ApprovalQueueCard({ approvals, draftReady }: { approvals: OcgApprovalRow[]; draftReady: OpsTaskRow[] }) {
  const pending = approvals.filter((a) => a.status === 'pending' || a.status === 'requested')
  return (
    <Panel title="Approval queue" action={<Link className="text-xs text-ocg-gold hover:underline" href="/agents">Drafts</Link>}>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Formal approvals" value={pending.length} />
        <Stat label="AI drafts" value={draftReady.length} tone="text-ocg-gold" />
      </div>
      {pending.length === 0 && draftReady.length === 0 ? (
        <p className="mt-4 text-sm text-gray-400">No approvals or AI drafts are waiting.</p>
      ) : (
        <ul className="mt-4 divide-y divide-gray-100">
          {pending.slice(0, 3).map((a) => (
            <li key={a.id} className="py-2">
              <p className="text-sm font-medium text-gray-800">{a.title}</p>
              <p className="text-xs text-gray-400">{a.approval_type} · {a.priority}</p>
              <div className="mt-2 flex gap-2">
                <ManagementStatusButton type="approval" id={a.id} values={{ status: 'approved' }}>Approve</ManagementStatusButton>
                <ManagementStatusButton type="approval" id={a.id} values={{ status: 'changes_requested' }}>Request changes</ManagementStatusButton>
              </div>
            </li>
          ))}
          {draftReady.slice(0, 3).map((task) => <TaskLine key={task.task_id} task={task} />)}
        </ul>
      )}
    </Panel>
  )
}

export function TeamWorkloadCard({ team, tasks }: { team: OpsTeamMemberRow[]; tasks: OpsTaskRow[] }) {
  return (
    <Panel title="Team workload" action={<Link className="text-xs text-ocg-gold hover:underline" href="/management/team">Open team</Link>}>
      {team.length === 0 ? (
        <EmptyState>No team members are configured yet.</EmptyState>
      ) : (
        <ul className="space-y-2">
          {team.slice(0, 8).map((member) => {
            const assigned = activeTasks(tasks).filter((t) => t.assigned_to === member.name || t.assigned_to.startsWith(member.name.split(' ')[0] ?? ''))
            const overdue = assigned.filter((t) => isOverdue(t.target_date))
            const label = workloadLabel(assigned.length, overdue.length)
            return (
              <li key={member.id} className="flex items-center justify-between rounded-lg border border-gray-100 p-3">
                <div>
                  <Link href={`/management/team/${member.id}`} className="text-sm font-medium text-gray-800 hover:text-ocg-gold">
                    {member.name}
                  </Link>
                  <p className="text-xs text-gray-400">{assigned.length} active · {overdue.length} overdue</p>
                </div>
                <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${workloadTone(label)}`}>{label}</span>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}

export function RecentCompletionsCard({ completions, tasks }: { completions: OpsCompletionRecordRow[]; tasks: OpsTaskRow[] }) {
  const taskById = new Map(tasks.map((t) => [t.task_id, t]))
  return (
    <Panel title="Recent completions">
      {completions.length === 0 ? (
        <EmptyState>No completion records are available yet.</EmptyState>
      ) : (
        <ul className="divide-y divide-gray-100">
          {completions.slice(0, 8).map((c) => {
            const task = taskById.get(c.task_id)
            return (
              <li key={c.id} className="py-3">
                <Link href={`/tasks/${c.task_id}`} className="text-sm font-medium text-gray-800 hover:text-ocg-gold">
                  {task?.task_name ?? c.task_id}
                </Link>
                <p className="line-clamp-2 text-xs text-gray-500">{c.summary || c.outcome || 'Completed'}</p>
                <p className="mt-1 text-xs text-gray-400">{c.completion_date} · {c.submitted_by || task?.assigned_to || 'unassigned'}</p>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}

export function MarketingPipelineCard({
  content,
  campaigns,
}: {
  content: MarketingContentRow[]
  campaigns: MarketingCampaignRow[]
}) {
  const inProduction = content.filter((c) => c.production_status && c.production_status !== 'none')
  const scheduled = content.filter((c) => c.status === 'scheduled')
  const review = content.filter((c) => c.status === 'review' || c.status === 'approved')
  const activeCampaigns = campaigns.filter((c) => c.status !== 'archived' && c.status !== 'completed')
  return (
    <Panel title="Marketing production">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="In production" value={inProduction.length} />
        <Stat label="Scheduled" value={scheduled.length} />
        <Stat label="Review/approved" value={review.length} />
        <Stat label="Campaigns" value={activeCampaigns.length} />
      </div>
      {content.length === 0 ? (
        <p className="mt-4 text-sm text-gray-400">No marketing content data is available yet.</p>
      ) : (
        <p className="mt-4 text-sm text-gray-500">
          Marketing Hub remains the production engine; this cockpit shows delivery pressure and approval state.
        </p>
      )}
    </Panel>
  )
}

export function ServiceOperationsCard({
  jobs,
  reminders,
}: {
  jobs: NptServiceJobRow[]
  reminders: NptReminderRow[]
}) {
  const scheduled = jobs.filter((j) => j.status === 'Scheduled' || j.scheduled_at)
  const unpaid = jobs.filter((j) => j.status === 'Invoice sent')
  const pendingReminders = reminders.filter((r) => r.status === 'pending')
  return (
    <Panel title="NPT service operations" action={<Link className="text-xs text-ocg-gold hover:underline" href="/npt">Open NPT</Link>}>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Jobs" value={jobs.length} />
        <Stat label="Scheduled" value={scheduled.length} />
        <Stat label="Reminders" value={pendingReminders.length} />
      </div>
      {jobs.length === 0 ? (
        <p className="mt-4 text-sm text-gray-400">Connect this module to start replacing Gazelle-style service tracking.</p>
      ) : (
        <p className="mt-4 text-sm text-gray-500">{unpaid.length} job{unpaid.length === 1 ? '' : 's'} may need invoice/payment follow-up.</p>
      )}
    </Panel>
  )
}

export function SchoolAdminCard({
  students,
  admissions,
  feeFollowups,
  adminTasks,
  snapshots,
}: {
  students: RayyanStudentRow[]
  admissions: RayyanAdmissionRow[]
  feeFollowups: RayyanFeeFollowupRow[]
  adminTasks: RayyanAdminTaskRow[]
  snapshots: RayyanSchoolpayPaymentSnapshotRow[]
}) {
  const enrolled = students.filter((s) => s.enrollment_status === 'enrolled')
  const pendingFees = feeFollowups.filter((f) => f.follow_up_status !== 'resolved')
  const dueAdmin = adminTasks.filter((t) => t.status !== 'done')
  return (
    <Panel title="Ar Rayyan admin" action={<Link className="text-xs text-ocg-gold hover:underline" href="/rayyan">Open Rayyan</Link>}>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Students" value={students.length} />
        <Stat label="Enrolled" value={enrolled.length} />
        <Stat label="Admissions" value={admissions.length} />
        <Stat label="Fee follow-ups" value={pendingFees.length} tone="text-amber-600" />
      </div>
      <p className="mt-4 text-sm text-gray-500">
        Payments remain in SchoolPay. This layer tracks admissions, follow-up, admin tasks, and {snapshots.length} reconciliation snapshot{snapshots.length === 1 ? '' : 's'}.
      </p>
      {dueAdmin.length > 0 && <p className="mt-2 text-xs text-amber-600">{dueAdmin.length} admin task{dueAdmin.length === 1 ? '' : 's'} still open.</p>}
    </Panel>
  )
}

export function ThisWeekPrioritiesCard({ tasks, recurring }: { tasks: OpsTaskRow[]; recurring: { title: string; next_run_at: string | null; priority: string }[] }) {
  const due = activeTasks(tasks).filter((t) => dueWithinDays(t.target_date, 7)).slice(0, 8)
  return (
    <Panel title="This week's priorities">
      {due.length === 0 && recurring.length === 0 ? (
        <EmptyState>No dated priorities are visible for the next seven days.</EmptyState>
      ) : (
        <ul className="divide-y divide-gray-100">
          {due.map((task) => <TaskLine key={task.task_id} task={task} />)}
          {recurring.slice(0, 4).map((item) => (
            <li key={`${item.title}-${item.next_run_at}`} className="py-3">
              <p className="text-sm font-medium text-gray-800">{item.title}</p>
              <p className="text-xs text-gray-400">Recurring · {item.next_run_at?.slice(0, 10) || 'not scheduled'} · {item.priority}</p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function Metric({ label, value, tone = 'text-gray-900' }: { label: string; value: number; tone?: string }) {
  return (
    <div>
      <p className={`text-lg font-semibold ${tone}`}>{value}</p>
      <p className="text-gray-400">{label}</p>
    </div>
  )
}

function Stat({ label, value, tone = 'text-gray-900' }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg bg-gray-50 p-3">
      <p className={`text-2xl font-light ${tone}`}>{value}</p>
      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{label}</p>
    </div>
  )
}

function TaskLine({ task }: { task: OpsTaskRow }) {
  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <Link href={`/tasks/${task.task_id}`} className="block truncate text-sm font-medium text-gray-800 hover:text-ocg-gold">
          {task.task_name}
        </Link>
        <p className="truncate text-xs text-gray-400">{task.project_name} · {task.assigned_to || 'unassigned'} · {task.target_date || 'no date'}</p>
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${priorityTone(task.priority)}`}>{task.priority}</span>
        <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${statusTone(task.current_status)}`}>{task.current_status}</span>
      </div>
    </li>
  )
}

function workloadTone(label: string): string {
  if (label === 'Overloaded') return 'bg-red-50 text-red-700'
  if (label === 'Heavy') return 'bg-amber-50 text-amber-700'
  if (label === 'Normal') return 'bg-emerald-50 text-emerald-700'
  return 'bg-gray-100 text-gray-600'
}
