import Link from 'next/link'
import { listTasks, brandIdFromParam } from '@/lib/tasks'
import { taskViewToFilter, TASK_VIEWS } from '@/lib/taskFilters'
import { listProjects } from '@/lib/projects'
import { listBrands } from '@/lib/brands'
import { listClients } from '@/lib/clients'
import { listTeam } from '@/lib/team'
import { TASK_STATUSES, TASK_CATEGORIES, TASK_PRIORITIES } from '@/lib/taskStatuses'
import { todayInEat } from '@/lib/serverClient'
import { requireSection } from '@/lib/server-auth'
import { NewTaskButton } from '@/components/tasks/NewTaskButton'
import { TaskBulkList } from '@/components/tasks/TaskBulkList'

export const dynamic = 'force-dynamic'

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const actor = await requireSection('ops')
  const sp = await searchParams
  const brandId = await brandIdFromParam(sp.brand ?? null)
  // Scope: super admins see everything (assignee filter honoured); brand
  // managers see every task WITHIN their brands; everyone else their own only.
  const scope = actor.taskScope
  const assignedTo = scope.kind === 'own' ? actor.name : sp.assignee
  const brandIds = scope.kind === 'brands' ? scope.brandIds : undefined
  // Category / quick-view / priority filters are applied server-side (the fix
  // for "Finance tasks" showing everything) and compose with brand + status.
  const viewFilter = taskViewToFilter(sp.view, todayInEat())
  const [tasks, projects, allBrands, clients, team] = await Promise.all([
    listTasks({
      brandId,
      brandIds,
      projectId: sp.project,
      status: sp.status,
      category: sp.category,
      priority: sp.priority,
      assignedTo,
      activeOnly: sp.active === '1',
      ...viewFilter,
      limit: 500,
    }),
    listProjects(),
    listBrands(),
    listClients(),
    listTeam(),
  ])
  // Brand managers only see their own brands' filter chips + creation targets.
  const brands = brandIds ? allBrands.filter((b) => brandIds.includes(b.id)) : allBrands
  const activeBrand = sp.brand ? brands.find((b) => b.slug === sp.brand) : null
  const canEdit = actor.can('ops', 'edit')
  const activeCategory = sp.category && TASK_CATEGORIES.includes(sp.category as never) ? sp.category : undefined
  const activeView = TASK_VIEWS.find((v) => v.value === sp.view)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            Tasks{activeBrand ? ` · ${activeBrand.name}` : ''}{activeCategory ? ` · ${activeCategory}` : ''}
            {activeView ? ` · ${activeView.label}` : ''}
          </h1>
          <p className="text-sm text-gray-500">{tasks.length} shown</p>
        </div>
        {canEdit && (
          <NewTaskButton
            projects={(brandIds ? projects.filter((p) => p.brand_id && brandIds.includes(p.brand_id)) : projects)
              .map((p) => ({ id: p.project_id, name: p.project_name }))}
            brands={brands.map((b) => ({ slug: b.slug, name: b.name }))}
            clients={clients.map((c) => ({ id: c.client_id, name: c.client_name }))}
            team={team.map((t) => t.name)}
          />
        )}
      </div>

      {/* Quick views (composable with every other filter) */}
      <div className="flex flex-wrap gap-2">
        <Chip href={hrefWith(sp, { view: undefined })} active={!sp.view}>All tasks</Chip>
        {TASK_VIEWS.map((v) => (
          <Chip key={v.value} href={hrefWith(sp, { view: v.value })} active={sp.view === v.value}>
            {v.label}
          </Chip>
        ))}
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap gap-2">
        <Chip href={hrefWith(sp, { category: undefined })} active={!sp.category}>All categories</Chip>
        {TASK_CATEGORIES.map((c) => (
          <Chip key={c} href={hrefWith(sp, { category: c })} active={sp.category === c}>{c}</Chip>
        ))}
      </div>

      {/* Priority filter */}
      <div className="flex flex-wrap gap-2">
        <Chip href={hrefWith(sp, { priority: undefined })} active={!sp.priority}>Any priority</Chip>
        {TASK_PRIORITIES.map((p) => (
          <Chip key={p} href={hrefWith(sp, { priority: p })} active={sp.priority === p}>{p}</Chip>
        ))}
      </div>

      {/* Brand filter chips */}
      <div className="flex flex-wrap gap-2">
        <Chip href={hrefWith(sp, { brand: undefined })} active={!sp.brand}>All brands</Chip>
        {brands.map((b) => (
          <Chip key={b.id} href={hrefWith(sp, { brand: b.slug })} active={sp.brand === b.slug}>
            {b.short_name || b.name}
          </Chip>
        ))}
      </div>

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-2">
        <Chip href={hrefWith(sp, { status: undefined })} active={!sp.status}>Any status</Chip>
        {TASK_STATUSES.map((s) => (
          <Chip key={s} href={hrefWith(sp, { status: s })} active={sp.status === s}>
            {s}
          </Chip>
        ))}
      </div>

      <TaskBulkList tasks={tasks} brands={brands} team={team.map((t) => ({ id: t.id, name: t.name }))} canEdit={canEdit} />
    </div>
  )
}

/** Merge the current query with a patch (undefined clears a key) so every filter
 *  chip preserves the others — the filters are composable, not exclusive. */
function hrefWith(
  sp: Record<string, string | undefined>,
  patch: Record<string, string | undefined>,
): string {
  const p = new URLSearchParams()
  const merged = { ...sp, ...patch }
  for (const key of ['brand', 'status', 'category', 'priority', 'view', 'assignee', 'project', 'active'] as const) {
    const v = merged[key]
    if (v) p.set(key, v)
  }
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
