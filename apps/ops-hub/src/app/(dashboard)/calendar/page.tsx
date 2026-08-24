import { CalendarDays } from 'lucide-react'
import { requireActor } from '@/lib/server-auth'
import { memberForEmail, listTeam } from '@/lib/team'
import { listBrands } from '@/lib/brands'
import { listProjects } from '@/lib/projects'
import { calendarFeed } from '@/lib/calendarFeed'
import { canCreateEvent } from '@/lib/calendarModel'
import { availableScopes } from '@/lib/calendarScope'
import { todayInEat } from '@/lib/serverClient'
import { CalendarBoard, type FeedItem } from '@/components/calendar/CalendarBoard'
import { canAssignTaskFromCalendar, assignableProjects, assignablePeople } from '@/lib/calendarTasks'

export const dynamic = 'force-dynamic'

/**
 * THE CALENDAR (§§5–7, §§22–26).
 *
 * Day / week / month over one unified feed: tasks, personal tasks, derived duty
 * occurrences, approved leave and calendar events. The feed READS existing
 * records — it never copies them — so an item shown here and in My Work is the
 * same row, not two.
 *
 * The calendar is also a task INPUT STATION for authorised managers (§22). The
 * authority is resolved here, server-side, from the same permission
 * POST /api/tasks enforces — never from a client-side role string (§23) — and
 * the projects/people offered are scoped, so a brand manager cannot assign work
 * outside their brands by opening a menu (§24).
 */
export default async function CalendarPage() {
  const actor = await requireActor()
  const me = await memberForEmail(actor.email)
  const today = todayInEat()

  const viewer = {
    permissions: actor.permissions,
    brandAccess: actor.brandAccess,
    teamMemberId: me?.id ?? null,
    email: actor.email,
    team: (me as { team?: string } | null)?.team ?? '',
    department: me?.department ?? '',
    brandIds: me?.brand_ids ?? [],
  }

  // The exact predicate POST /api/tasks applies before creating a task.
  const canAssignTasks = canAssignTaskFromCalendar(actor.permissions, actor.isSuperAdmin)

  const [initial, brands, projects, team] = await Promise.all([
    // First paint: the viewer's own week. The client then refetches on any
    // view/scope change.
    calendarFeed(viewer, { view: 'week', date: today, memberIds: me ? [me.id] : [] }),
    listBrands(),
    canAssignTasks ? listProjects({ status: 'Active' }) : Promise.resolve([]),
    canAssignTasks ? listTeam() : Promise.resolve([]),
  ])

  const brandById = new Map(brands.map((b) => [b.id, b.short_name || b.name]))
  // A brand manager may only assign under their own brands' projects and to
  // their own brands' people — the same rules the API re-checks on submit.
  const scope = actor.taskScope
  const projectOptions = assignableProjects(
    projects.map((p) => ({
      id: p.project_id,
      label: p.project_name,
      brandId: p.brand_id,
      brandLabel: p.brand_id ? (brandById.get(p.brand_id) ?? '') : '',
    })),
    scope,
  )
  const peopleOptions = assignablePeople(
    team.map((m) => ({ id: m.id, name: m.name, brandIds: m.brand_ids ?? [] })),
    scope,
  ).map((m) => ({ id: m.id, name: m.name }))

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ocg-gold">Planning</p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-gray-900">
          <CalendarDays size={22} className="text-gray-400" /> Calendar
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-gray-500">
          Tasks, recurring duties, approved leave and events in one place. Entries come from the
          records that already exist — completing a duty here completes it everywhere
          {canAssignTasks ? ', and a task you assign from a day is a normal Ops Task' : ''}.
        </p>
      </div>

      <CalendarBoard
        initial={initial as { from: string; to: string; items: FeedItem[] }}
        today={today}
        scopes={availableScopes(viewer)}
        canCreateEvents={canCreateEvent(viewer, 'company', null) || canCreateEvent(viewer, 'team', null)}
        canAssignTasks={canAssignTasks}
        brands={brands.map((b) => ({ id: b.id, label: b.name }))}
        projects={projectOptions}
        people={peopleOptions}
      />
    </div>
  )
}
