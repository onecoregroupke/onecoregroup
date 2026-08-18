import Link from 'next/link'
import { CalendarCheck, AlertTriangle, ArrowUpRight } from 'lucide-react'
import { requireActor } from '@/lib/server-auth'
import { memberForEmail } from '@/lib/team'
import { occurrencesOn, overdueOccurrences } from '@/lib/dutyOccurrences'
import { toOccurrenceDtos } from '@/lib/dutyView'
import { dutyCan } from '@/lib/dutyModel'
import { todayInEat } from '@/lib/serverClient'
import { DutyOccurrenceCard } from '@/components/duties/DutyOccurrenceCard'

export const dynamic = 'force-dynamic'

/**
 * MY DUTIES — every signed-in user, their own recurring duties only.
 *
 * The scope is fixed to 'own' here and cannot be widened by a query parameter;
 * the team/company view lives at /management/duties behind its own grant.
 */
export default async function MyDutiesPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const actor = await requireActor()
  const params = await searchParams
  const date = params.date || todayInEat()

  const me = await memberForEmail(actor.email)
  const canManage = dutyCan(
    { permissions: actor.permissions, brandAccess: actor.brandAccess, teamMemberId: me?.id ?? null },
    'edit',
  )

  if (!me) {
    return (
      <div className="space-y-6">
        <Header date={date} canManage={canManage} />
        <p className="rounded-xl border border-gray-100 bg-white p-6 text-sm text-gray-500 shadow-sm">
          Your sign-in is not linked to a team-member record yet, so no duties can be assigned to you.
          Ask a manager to add you under Management → Team with this email address.
        </p>
      </div>
    )
  }

  const [today, overdue] = await Promise.all([
    occurrencesOn(date, { scope: { kind: 'own' }, teamMemberId: me.id }),
    overdueOccurrences({ scope: { kind: 'own' }, teamMemberId: me.id, date, lookbackDays: 7 }),
  ])
  const [items, overdueItems] = await Promise.all([
    toOccurrenceDtos(today),
    toOccurrenceDtos(overdue),
  ])

  const done = items.filter((i) => i.status === 'done').length
  const outstanding = items.length - done

  return (
    <div className="space-y-6">
      <Header date={date} canManage={canManage} />

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Due today" value={items.length} />
        <Stat label="Completed" value={done} tone="text-emerald-600" />
        <Stat label="Outstanding" value={outstanding} tone={outstanding ? 'text-amber-600' : 'text-gray-900'} />
      </div>

      {overdueItems.length > 0 && (
        <section className="rounded-xl border border-red-100 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle size={15} className="text-red-500" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-red-600">
              Overdue · last 7 days
            </h2>
          </div>
          <div className="space-y-2">
            {overdueItems.map((o) => (
              <div key={`${o.dutyId}:${o.date}`}>
                <p className="mb-1 text-[11px] font-medium text-gray-400">{o.date}</p>
                <DutyOccurrenceCard occurrence={o} />
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ocg-gold">
          {date === todayInEat() ? "Today's duties" : `Duties for ${date}`}
        </h2>
        {items.length === 0 ? (
          <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">
            No duties are scheduled for you on this day.
          </p>
        ) : (
          <div className="space-y-2">
            {items.map((o) => <DutyOccurrenceCard key={`${o.dutyId}:${o.date}`} occurrence={o} />)}
          </div>
        )}
      </section>
    </div>
  )
}

function Header({ date, canManage }: { date: string; canManage: boolean }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ocg-gold">My work · Recurring duties</p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-gray-900">
          <CalendarCheck size={22} className="text-gray-400" /> My duties
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-gray-500">
          Your recurring duties for {date}. These are the same records that appear in your morning
          brief, task list and calendar — completing one here completes it everywhere.
        </p>
      </div>
      {canManage && (
        <Link
          href="/management/duties"
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:border-ocg-gold/40"
        >
          Manage duties <ArrowUpRight size={14} />
        </Link>
      )}
    </div>
  )
}

function Stat({ label, value, tone = 'text-gray-900' }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <p className={`text-3xl font-light ${tone}`}>{value}</p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
    </div>
  )
}
