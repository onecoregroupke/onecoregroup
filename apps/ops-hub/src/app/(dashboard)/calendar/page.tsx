import { CalendarDays } from 'lucide-react'
import { requireActor } from '@/lib/server-auth'
import { memberForEmail } from '@/lib/team'
import { listBrands } from '@/lib/brands'
import { calendarFeed } from '@/lib/calendarFeed'
import { canCreateEvent } from '@/lib/calendarModel'
import { availableScopes } from '@/lib/calendarScope'
import { todayInEat } from '@/lib/serverClient'
import { CalendarBoard, type FeedItem } from '@/components/calendar/CalendarBoard'

export const dynamic = 'force-dynamic'

/**
 * THE CALENDAR (§§5–7).
 *
 * Day / week / month over one unified feed: tasks, personal tasks, derived duty
 * occurrences, approved leave and calendar events. The feed READS existing
 * records — it never copies them — so an item shown here and in My Tasks is the
 * same row, not two.
 *
 * Scope defaults to the viewer's own calendar; team / department / company /
 * management appear only where permissions allow, and are resolved server-side.
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

  const [initial, brands] = await Promise.all([
    // First paint: the viewer's own week. The client then refetches on any
    // view/scope change.
    calendarFeed(viewer, { view: 'week', date: today, memberIds: me ? [me.id] : [] }),
    listBrands(),
  ])

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ocg-gold">Planning</p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-gray-900">
          <CalendarDays size={22} className="text-gray-400" /> Calendar
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-gray-500">
          Tasks, recurring duties, approved leave and events in one place. Entries come from the
          records that already exist — completing a duty here completes it everywhere.
        </p>
      </div>

      <CalendarBoard
        initial={initial as { from: string; to: string; items: FeedItem[] }}
        today={today}
        scopes={availableScopes(viewer)}
        canCreateEvents={canCreateEvent(viewer, 'company', null) || canCreateEvent(viewer, 'team', null)}
        brands={brands.map((b) => ({ id: b.id, label: b.name }))}
      />
    </div>
  )
}
