import Link from 'next/link'
import { listProjects } from '@/lib/projects'
import { listClients } from '@/lib/clients'
import { listBrands, brandMap } from '@/lib/brands'
import { listTasks } from '@/lib/tasks'
import { NewProjectButton } from '@/components/projects/NewProjectButton'
import { isActiveStatus } from '@/lib/taskStatuses'

export const dynamic = 'force-dynamic'

export default async function ProjectsPage() {
  const [projects, clients, brands, bmap, tasks] = await Promise.all([
    listProjects(),
    listClients(),
    listBrands(),
    brandMap(),
    listTasks({ limit: 1000 }),
  ])

  const taskCount = new Map<string, number>()
  for (const t of tasks) {
    if (isActiveStatus(t.current_status) && t.active === 'Yes') {
      taskCount.set(t.project_id, (taskCount.get(t.project_id) ?? 0) + 1)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Projects</h1>
          <p className="text-sm text-gray-500">{projects.length} total</p>
        </div>
        <NewProjectButton
          brands={brands.map((b) => ({ slug: b.slug, name: b.name }))}
          clients={clients.map((c) => ({ id: c.client_id, name: c.client_name }))}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {projects.length === 0 && (
          <p className="text-sm text-gray-500">No projects yet. Create one to start assigning tasks.</p>
        )}
        {projects.map((p) => {
          const brand = p.brand_id ? bmap.get(p.brand_id) : null
          return (
            <Link
              key={p.project_id}
              href={`/tasks?project=${p.project_id}`}
              className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-colors hover:border-ocg-gold/40"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">{p.project_id}</span>
                <span className="rounded bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">{p.status}</span>
              </div>
              <p className="mt-1 font-medium text-gray-800">{p.project_name}</p>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
                {brand && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: brand.color_hex }} />}
                {brand?.name ?? p.client_name ?? '—'}
              </p>
              <p className="mt-2 text-xs text-ocg-gold">{taskCount.get(p.project_id) ?? 0} active tasks</p>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
