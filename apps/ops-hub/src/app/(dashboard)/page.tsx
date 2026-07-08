import Link from 'next/link'
import { listTasks } from '@/lib/tasks'
import { listProjects } from '@/lib/projects'
import { listBrands } from '@/lib/brands'
import { statusTone, priorityTone, isActiveStatus } from '@/lib/taskStatuses'
import { todayInEat } from '@/lib/serverClient'
import { requireSection } from '@/lib/server-auth'
import { DayCloseCard } from '@/components/dayclose/DayCloseCard'
import type { OpsTaskRow, Brand } from '@ocg/db'

export const dynamic = 'force-dynamic'

async function getData(assignedTo?: string, brandIds?: string[]) {
  try {
    const [tasks, projects, brands] = await Promise.all([
      // 'own' users only see their own tasks in these aggregates; brand
      // managers see their whole brand; group admins see everything.
      listTasks({ limit: 500, assignedTo, brandIds }),
      listProjects(),
      listBrands(),
    ])
    return { tasks, projects, brands }
  } catch {
    return { tasks: [] as OpsTaskRow[], projects: [], brands: [] as Brand[] }
  }
}

export default async function OpsDashboard() {
  const actor = await requireSection('ops')
  const scope = actor.taskScope
  const { tasks, projects: allProjects, brands: allBrands } = await getData(
    scope.kind === 'own' ? actor.name : undefined,
    scope.kind === 'brands' ? scope.brandIds : undefined,
  )
  // Brand managers get a dashboard of THEIR organisation only.
  const brands = scope.kind === 'brands' ? allBrands.filter((b) => scope.brandIds.includes(b.id)) : allBrands
  const projects = scope.kind === 'brands'
    ? allProjects.filter((p) => p.brand_id && scope.brandIds.includes(p.brand_id))
    : allProjects
  const today = todayInEat()

  const active = tasks.filter((t) => t.active === 'Yes' && isActiveStatus(t.current_status))
  const draftReady = tasks.filter((t) => t.current_status === 'AI Draft Ready')
  const dueToday = active.filter((t) => t.target_date === today)
  const overdue = active.filter((t) => t.target_date && t.target_date < today)

  const brandById = new Map(brands.map((b) => [b.id, b]))
  const perBrand = brands.map((b) => {
    const bt = tasks.filter((t) => t.brand_id === b.id)
    return {
      brand: b,
      total: bt.length,
      active: bt.filter((t) => isActiveStatus(t.current_status) && t.active === 'Yes').length,
      done: bt.filter((t) => t.current_status === 'Completed').length,
    }
  })

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ocg-gold">
          Internal · Ops Hub
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-gray-900">
          {scope.kind === 'brands'
            ? `Your organisation · ${brands.map((b) => b.short_name || b.name).join(', ') || 'no brands assigned'}`
            : 'Task delivery across the group'}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {brands.length} brands · {projects.length} projects · {active.length} active tasks
        </p>
      </div>

      {actor.can('management', 'edit') && <DayCloseCard />}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Active tasks" value={active.length} href="/tasks?active=1" />
        <Stat label="Due today" value={dueToday.length} tone="text-amber-600" href="/tasks" />
        <Stat label="Overdue" value={overdue.length} tone="text-red-600" href="/tasks" />
        <Stat label="AI drafts to review" value={draftReady.length} tone="text-ocg-gold" href="/agents" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Due today & overdue">
          {dueToday.length + overdue.length === 0 ? (
            <Empty>Nothing due today and nothing overdue. Calm waters.</Empty>
          ) : (
            <ul className="divide-y divide-gray-100">
              {[...overdue, ...dueToday].slice(0, 12).map((t) => (
                <TaskRow key={t.task_id} t={t} brand={t.brand_id ? brandById.get(t.brand_id) : undefined} />
              ))}
            </ul>
          )}
        </Card>

        <Card title="By brand">
          <ul className="space-y-3">
            {perBrand.map(({ brand, active: a, total, done }) => (
              <li key={brand.id} className="rounded-lg border border-gray-100 p-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-medium text-gray-800">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: brand.color_hex }}
                    />
                    {brand.short_name || brand.name}
                  </span>
                  <Link
                    href={`/tasks?brand=${brand.slug}`}
                    className="text-xs font-semibold text-ocg-gold hover:underline"
                  >
                    {a} active
                  </Link>
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  {total} total · {done} completed
                </p>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="AI drafts awaiting review">
        {draftReady.length === 0 ? (
          <Empty>No agent drafts are waiting. Run a specialist from a task to generate one.</Empty>
        ) : (
          <ul className="divide-y divide-gray-100">
            {draftReady.slice(0, 10).map((t) => (
              <TaskRow key={t.task_id} t={t} brand={t.brand_id ? brandById.get(t.brand_id) : undefined} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

function Stat({
  label,
  value,
  tone = 'text-gray-900',
  href,
}: {
  label: string
  value: number
  tone?: string
  href?: string
}) {
  const inner = (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-colors hover:border-ocg-gold/40">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
      <p className={`mt-2 text-3xl font-light ${tone}`}>{value}</p>
    </div>
  )
  return href ? <Link href={href}>{inner}</Link> : inner
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-ocg-gold">{title}</h2>
      {children}
    </section>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">{children}</p>
}

function TaskRow({ t, brand }: { t: OpsTaskRow; brand?: Brand }) {
  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <Link href={`/tasks/${t.task_id}`} className="block truncate text-sm font-medium text-gray-800 hover:text-ocg-gold">
          {t.task_name}
        </Link>
        <p className="truncate text-xs text-gray-400">
          {brand ? `${brand.short_name || brand.name} · ` : ''}
          {t.project_name} · {t.assigned_to || 'unassigned'}
        </p>
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${priorityTone(t.priority)}`}>
          {t.priority}
        </span>
        <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${statusTone(t.current_status)}`}>
          {t.current_status}
        </span>
      </div>
    </li>
  )
}
