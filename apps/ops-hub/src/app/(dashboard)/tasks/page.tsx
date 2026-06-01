import Link from 'next/link'
import { listTasks, brandIdFromParam } from '@/lib/tasks'
import { listProjects } from '@/lib/projects'
import { listBrands } from '@/lib/brands'
import { listTeam } from '@/lib/team'
import { statusTone, priorityTone, TASK_STATUSES } from '@/lib/taskStatuses'
import { NewTaskButton } from '@/components/tasks/NewTaskButton'

export const dynamic = 'force-dynamic'

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const sp = await searchParams
  const brandId = await brandIdFromParam(sp.brand ?? null)
  const [tasks, projects, brands, team] = await Promise.all([
    listTasks({
      brandId,
      projectId: sp.project,
      status: sp.status,
      assignedTo: sp.assignee,
      activeOnly: sp.active === '1',
      limit: 500,
    }),
    listProjects(),
    listBrands(),
    listTeam(),
  ])
  const brandById = new Map(brands.map((b) => [b.id, b]))
  const activeBrand = sp.brand ? brands.find((b) => b.slug === sp.brand) : null

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            Tasks{activeBrand ? ` · ${activeBrand.name}` : ''}
          </h1>
          <p className="text-sm text-gray-500">{tasks.length} shown</p>
        </div>
        <NewTaskButton
          projects={projects.map((p) => ({ id: p.project_id, name: p.project_name }))}
          team={team.map((t) => t.name)}
        />
      </div>

      {/* Brand filter chips */}
      <div className="flex flex-wrap gap-2">
        <Chip href="/tasks" active={!sp.brand}>All brands</Chip>
        {brands.map((b) => (
          <Chip key={b.id} href={`/tasks?brand=${b.slug}`} active={sp.brand === b.slug}>
            {b.short_name || b.name}
          </Chip>
        ))}
      </div>

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-2">
        <Chip href={brandQuery(sp.brand)} active={!sp.status}>Any status</Chip>
        {TASK_STATUSES.map((s) => (
          <Chip key={s} href={brandQuery(sp.brand, s)} active={sp.status === s}>
            {s}
          </Chip>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        {tasks.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">No tasks match these filters.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400">
                <th className="px-4 py-3">Task</th>
                <th className="px-4 py-3">Brand</th>
                <th className="px-4 py-3">Assignee</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Due</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {tasks.map((t) => {
                const brand = t.brand_id ? brandById.get(t.brand_id) : undefined
                return (
                  <tr key={t.task_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link href={`/tasks/${t.task_id}`} className="font-medium text-gray-800 hover:text-ocg-gold">
                        {t.task_name}
                      </Link>
                      <p className="text-xs text-gray-400">{t.task_id} · {t.project_name}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {brand ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: brand.color_hex }} />
                          {brand.short_name || brand.name}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{t.assigned_to || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${priorityTone(t.priority)}`}>
                        {t.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{t.target_date || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${statusTone(t.current_status)}`}>
                        {t.current_status}
                      </span>
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

function brandQuery(brand?: string, status?: string): string {
  const p = new URLSearchParams()
  if (brand) p.set('brand', brand)
  if (status) p.set('status', status)
  const qs = p.toString()
  return qs ? `/tasks?${qs}` : '/tasks'
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? 'border-ocg-navy bg-ocg-navy text-white'
          : 'border-gray-200 bg-white text-gray-600 hover:border-ocg-gold/50'
      }`}
    >
      {children}
    </Link>
  )
}
