import Link from 'next/link'
import { CornerDownRight, FolderKanban } from 'lucide-react'
import { listProjects } from '@/lib/projects'
import { listClients } from '@/lib/clients'
import { listBrands } from '@/lib/brands'
import { listTasks } from '@/lib/tasks'
import { NewProjectButton } from '@/components/projects/NewProjectButton'
import { isActiveStatus } from '@/lib/taskStatuses'
import { requireSection } from '@/lib/server-auth'
import type { OpsProjectRow } from '@ocg/db'

export const dynamic = 'force-dynamic'

export default async function ProjectsPage() {
  const actor = await requireSection('ops')
  const [projects, clients, brands, tasks] = await Promise.all([
    listProjects(),
    listClients(),
    listBrands(),
    // Per-project task counts reflect only the viewer's own tasks unless they
    // may see all tasks.
    listTasks({ limit: 1000, assignedTo: actor.isSuperAdmin ? undefined : actor.name }),
  ])

  const taskCount = new Map<string, number>()
  for (const t of tasks) {
    if (isActiveStatus(t.current_status) && t.active === 'Yes') {
      taskCount.set(t.project_id, (taskCount.get(t.project_id) ?? 0) + 1)
    }
  }

  // brand → top-level projects; each top-level project → its sub-projects.
  const children = new Map<string, OpsProjectRow[]>()
  for (const p of projects) {
    if (p.parent_project_id) {
      const list = children.get(p.parent_project_id) ?? []
      list.push(p)
      children.set(p.parent_project_id, list)
    }
  }
  const topLevel = projects.filter((p) => !p.parent_project_id)
  const brandGroups = brands
    .map((brand) => ({ brand, projects: topLevel.filter((p) => p.brand_id === brand.id) }))
    .filter((g) => g.projects.length > 0)
  const clientProjects = topLevel.filter((p) => !p.brand_id)

  const parentOptions = topLevel.map((p) => ({ id: p.project_id, name: p.project_name }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Projects</h1>
          <p className="text-sm text-gray-500">
            {projects.length} total · organised by brand · sub-projects nest under their parent
          </p>
        </div>
        <NewProjectButton
          brands={brands.map((b) => ({ slug: b.slug, name: b.name }))}
          clients={clients.map((c) => ({ id: c.client_id, name: c.client_name }))}
          parents={parentOptions}
        />
      </div>

      {projects.length === 0 && (
        <p className="text-sm text-gray-500">No projects yet. Create one to start assigning tasks.</p>
      )}

      {brandGroups.map(({ brand, projects: brandProjects }) => (
        <section key={brand.id}>
          <div className="mb-3 flex items-center gap-2">
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: brand.color_hex }} />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-700">{brand.name}</h2>
            <span className="text-xs text-gray-400">
              {brandProjects.length} project{brandProjects.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {brandProjects.map((p) => (
              <ProjectCard key={p.project_id} project={p} subs={children.get(p.project_id) ?? []} taskCount={taskCount} />
            ))}
          </div>
        </section>
      ))}

      {clientProjects.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <FolderKanban size={14} className="text-gray-400" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-700">External clients</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {clientProjects.map((p) => (
              <ProjectCard key={p.project_id} project={p} subs={children.get(p.project_id) ?? []} taskCount={taskCount} clientName={p.client_name} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function ProjectCard({
  project,
  subs,
  taskCount,
  clientName,
}: {
  project: OpsProjectRow
  subs: OpsProjectRow[]
  taskCount: Map<string, number>
  clientName?: string
}) {
  const ownActive = taskCount.get(project.project_id) ?? 0
  const totalActive = ownActive + subs.reduce((sum, s) => sum + (taskCount.get(s.project_id) ?? 0), 0)
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-colors hover:border-ocg-gold/40">
      <Link href={`/tasks?project=${project.project_id}`} className="block">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">{project.project_id}</span>
          <span className="rounded bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">{project.status}</span>
        </div>
        <p className="mt-1 font-medium text-gray-800">{project.project_name}</p>
        {clientName && <p className="mt-1 text-xs text-gray-500">{clientName}</p>}
        <p className="mt-2 text-xs text-ocg-gold">{totalActive} active task{totalActive === 1 ? '' : 's'}</p>
      </Link>
      {subs.length > 0 && (
        <div className="mt-3 space-y-1.5 border-t border-gray-50 pt-3">
          {subs.map((s) => (
            <Link
              key={s.project_id}
              href={`/tasks?project=${s.project_id}`}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            >
              <CornerDownRight size={13} className="shrink-0 text-gray-300" />
              <span className="flex-1 truncate">{s.project_name}</span>
              <span className="text-xs text-ocg-gold">{taskCount.get(s.project_id) ?? 0}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
