import Link from 'next/link'
import { activeTasks, getManagementData, isOverdue, workloadLabel } from '@/lib/management'
import { TeamMemberCreateForm } from '@/components/team/TeamMemberCreateForm'
import { requireSection } from '@/lib/server-auth'

export const dynamic = 'force-dynamic'

export default async function TeamWorkloadPage() {
  await requireSection('management')
  const { team, tasks, brands, completions } = await getManagementData()
  const active = activeTasks(tasks)
  const brandById = new Map(brands.map((b) => [b.id, b]))

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ocg-gold">
          Management · Team
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-gray-900">Team workload</h1>
        <p className="mt-1 text-sm text-gray-500">
          Accountability by person, using existing task assignments and completion records.
        </p>
      </div>

      <TeamMemberCreateForm brands={brands.map((brand) => ({ id: brand.id, label: brand.name }))} />

      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        {team.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">No team members are configured yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400">
                <th className="px-4 py-3">Team member</th>
                <th className="px-4 py-3">Brands</th>
                <th className="px-4 py-3">Active</th>
                <th className="px-4 py-3">Overdue</th>
                <th className="px-4 py-3">Blocked</th>
                <th className="px-4 py-3">Completed</th>
                <th className="px-4 py-3">Workload</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {team.map((member) => {
                const memberActive = active.filter((t) => matchesAssignee(t.assigned_to, member.name))
                const overdue = memberActive.filter((t) => isOverdue(t.target_date))
                const blocked = memberActive.filter((t) => t.current_status === 'Blocked')
                const completed = completions.filter((c) => c.submitted_by === member.name || tasks.find((t) => t.task_id === c.task_id && matchesAssignee(t.assigned_to, member.name)))
                const workload = workloadLabel(memberActive.length, overdue.length)
                return (
                  <tr key={member.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link href={`/management/team/${member.id}`} className="font-medium text-gray-800 hover:text-ocg-gold">
                        {member.name}
                      </Link>
                      <p className="text-xs text-gray-400">{member.role}{member.email ? ` · ${member.email}` : ''}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {member.brand_ids.length === 0 ? (
                        <span className="text-gray-300">All/none set</span>
                      ) : (
                        <span className="flex flex-wrap gap-1">
                          {member.brand_ids.map((id) => (
                            <span key={id} className="rounded bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">
                              {brandById.get(id)?.short_name || brandById.get(id)?.name || 'Brand'}
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{memberActive.length}</td>
                    <td className="px-4 py-3 text-red-600">{overdue.length}</td>
                    <td className="px-4 py-3 text-amber-600">{blocked.length}</td>
                    <td className="px-4 py-3 text-gray-700">{completed.length}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${workloadTone(workload)}`}>{workload}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
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

function workloadTone(label: string): string {
  if (label === 'Overloaded') return 'bg-red-50 text-red-700'
  if (label === 'Heavy') return 'bg-amber-50 text-amber-700'
  if (label === 'Normal') return 'bg-emerald-50 text-emerald-700'
  return 'bg-gray-100 text-gray-600'
}
