import Link from 'next/link'
import { notFound } from 'next/navigation'
import { activeTasks, dueWithinDays, getManagementData, isOverdue, workloadLabel } from '@/lib/management'
import { priorityTone, statusTone } from '@/lib/taskStatuses'
import { requireActor } from '@/lib/server-auth'
import { memberForEmail } from '@/lib/team'
import { getEmployeeProfile } from '@/lib/people'
import { canAccessEmployee } from '@/lib/governanceModel'
import { RoleCapabilityProfile } from '@/components/team/RoleCapabilityProfile'

export const dynamic = 'force-dynamic'

export default async function TeamMemberPage({
  params,
}: {
  params: Promise<{ memberId: string }>
}) {
  const actor = await requireActor()
  if (!actor.can('people', 'view')) notFound()
  const { memberId } = await params
  const [profile, me] = await Promise.all([getEmployeeProfile(memberId), memberForEmail(actor.email)])
  if (!profile) notFound()
  if (!canAccessEmployee({
    memberId: me?.id ?? null,
    department: me?.department ?? '',
    brandIds: actor.allowedBrandIds('people'),
    scope: actor.recordScope('people'),
  }, {
    memberId: profile.member.id,
    department: profile.member.department,
    brandIds: profile.member.brand_ids,
  })) notFound()
  const data = await getManagementData()
  const member = data.team.find((m) => m.id === memberId)
  if (!member) notFound()

  const assigned = data.tasks.filter((t) => matchesAssignee(t.assigned_to, member.name))
  const active = activeTasks(assigned)
  const overdue = active.filter((t) => isOverdue(t.target_date, data.today))
  const dueWeek = active.filter((t) => dueWithinDays(t.target_date, 7, data.today))
  const blocked = active.filter((t) => t.current_status === 'Blocked')
  const completed = data.completions.filter((c) => c.submitted_by === member.name || assigned.some((t) => t.task_id === c.task_id))
  const workload = workloadLabel(active.length, overdue.length)
  const brandById = new Map(data.brands.map((b) => [b.id, b]))

  return (
    <div className="space-y-6">
      <div>
        <Link href="/management/team" className="text-xs text-gray-400 hover:text-ocg-gold">← Team workload</Link>
        <h1 className="mt-1 text-2xl font-semibold text-gray-900">{member.name}</h1>
        <p className="mt-1 text-sm text-gray-500">
          {[member.job_title || member.role, member.department, member.email, member.phone]
            .filter(Boolean)
            .join(' · ')} · workload {workload}
        </p>
        {member.start_date && (
          <p className="mt-0.5 text-xs text-gray-400">With OCG since {member.start_date}</p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Active tasks" value={active.length} />
        <Stat label="Due this week" value={dueWeek.length} />
        <Stat label="Overdue" value={overdue.length} tone="text-red-600" />
        <Stat label="Blocked" value={blocked.length} tone="text-amber-600" />
      </div>

      <RoleCapabilityProfile
        profile={profile}
        brands={data.brands.map((brand) => ({ id: brand.id, name: brand.short_name || brand.name }))}
        team={data.team.map((person) => ({ id: person.id, name: person.name }))}
        canEdit={actor.can('people', 'edit') && ['management', 'group'].includes(actor.recordScope('people'))}
      />

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Panel title="Current work">
          {active.length === 0 ? (
            <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">No active assigned tasks.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400">
                  <th className="px-3 py-2">Task</th>
                  <th className="px-3 py-2">Brand</th>
                  <th className="px-3 py-2">Due</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {active.map((task) => {
                  const brand = task.brand_id ? brandById.get(task.brand_id) : null
                  return (
                    <tr key={task.task_id} className="hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <Link href={`/tasks/${task.task_id}`} className="font-medium text-gray-800 hover:text-ocg-gold">
                          {task.task_name}
                        </Link>
                        <p className="text-xs text-gray-400">{task.project_name}</p>
                      </td>
                      <td className="px-3 py-2 text-gray-500">{brand?.short_name || brand?.name || '—'}</td>
                      <td className={`px-3 py-2 ${isOverdue(task.target_date, data.today) ? 'text-red-600' : 'text-gray-500'}`}>
                        {task.target_date || '—'}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${statusTone(task.current_status)}`}>{task.current_status}</span>
                        <span className={`ml-1 rounded px-2 py-0.5 text-[10px] font-medium ${priorityTone(task.priority)}`}>{task.priority}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel title="Recent completions">
          {completed.length === 0 ? (
            <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">No completion records yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {completed.slice(0, 10).map((c) => (
                <li key={c.id} className="py-3">
                  <Link href={`/tasks/${c.task_id}`} className="text-sm font-medium text-gray-800 hover:text-ocg-gold">
                    {data.tasks.find((t) => t.task_id === c.task_id)?.task_name ?? c.task_id}
                  </Link>
                  <p className="line-clamp-2 text-xs text-gray-500">{c.summary || c.outcome || 'Completed'}</p>
                  <p className="mt-1 text-xs text-gray-400">{c.completion_date}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  )
}

function matchesAssignee(assignedTo: string, name: string): boolean {
  if (!assignedTo || !name) return false
  const lower = assignedTo.toLowerCase()
  const member = name.toLowerCase()
  return lower === member || lower.startsWith(member.split(' ')[0] ?? '')
}

function Stat({ label, value, tone = 'text-gray-900' }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <p className={`text-3xl font-light ${tone}`}>{value}</p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-ocg-gold">{title}</h2>
      {children}
    </section>
  )
}
