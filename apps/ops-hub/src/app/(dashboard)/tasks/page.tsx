import Link from 'next/link'
import { listTasks, brandIdFromParam } from '@/lib/tasks'
import { listProjects } from '@/lib/projects'
import { listBrands } from '@/lib/brands'
import { listTeam } from '@/lib/team'
import { TASK_STATUSES } from '@/lib/taskStatuses'
import { NewTaskButton } from '@/components/tasks/NewTaskButton'
import { TaskBulkList } from '@/components/tasks/TaskBulkList'

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

      <TaskBulkList tasks={tasks} brands={brands} team={team.map((t) => ({ id: t.id, name: t.name }))} />
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
