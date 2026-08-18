import Link from 'next/link'
import { ArrowUpRight, ShieldCheck } from 'lucide-react'
import { listTeam, memberForEmail } from '@/lib/team'
import { listBrands } from '@/lib/brands'
import { listDuties } from '@/lib/duties'
import { occurrencesOn, pendingReviews } from '@/lib/dutyOccurrences'
import { toOccurrenceDtos } from '@/lib/dutyView'
import { dutyScope, dutyCan, describeDutyTarget } from '@/lib/dutyModel'
import { describeRecurrence } from '@/lib/recurrence'
import { db, todayInEat } from '@/lib/serverClient'
import { DutyBuilder } from '@/components/duties/DutyBuilder'
import { DutyRowControls } from '@/components/duties/DutyRowControls'
import { DutyOccurrenceCard } from '@/components/duties/DutyOccurrenceCard'
import { DutyReviewQueue, type ReviewRow } from '@/components/duties/DutyReviewQueue'
import { requireSection } from '@/lib/server-auth'
import type { OcgFormTemplateRow, OcgDailyDutyRow } from '@ocg/db'

export const dynamic = 'force-dynamic'

/**
 * DAILY DUTIES — the manager surface.
 *
 * Shows today's derived occurrences (one per targeted person), the duty
 * templates behind them, and the review queue. Everything here reads the same
 * occurrence records the assignee sees at /duties; nothing is duplicated.
 */
export default async function DailyDutiesPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const actor = await requireSection('management')
  const params = await searchParams
  const date = params.date || todayInEat()

  const me = await memberForEmail(actor.email)
  const dutyActor = { permissions: actor.permissions, brandAccess: actor.brandAccess, teamMemberId: me?.id ?? null }
  const scope = dutyScope(dutyActor)
  const canEdit = dutyCan(dutyActor, 'edit')
  const canReview = dutyCan(dutyActor, 'review')

  const [team, brands, allDuties, occurrences, reviews, { data: templateRows }] = await Promise.all([
    listTeam(),
    listBrands(),
    listDuties({ activeOnly: false }),
    occurrencesOn(date, { scope, teamMemberId: me?.id ?? null }),
    canReview ? pendingReviews(scope) : Promise.resolve([]),
    db().from('ocg_form_templates').select('id, name').eq('active', true).limit(200),
  ])

  const items = await toOccurrenceDtos(occurrences)
  const memberById = new Map(team.map((m) => [m.id, m]))
  const dutyById = new Map(allDuties.map((d) => [d.id, d]))

  // Templates within scope, so a brand-scoped manager sees only their own.
  const duties = allDuties.filter((d) =>
    scope.kind === 'all' ? true
      : scope.kind === 'brands' ? !!d.brand_id && scope.brandIds.includes(d.brand_id)
        : d.assignee_id === me?.id)

  const done = items.filter((i) => i.status === 'done').length
  const outstanding = items.length - done
  const overdue = items.filter((i) => i.overdue).length

  const reviewRows: ReviewRow[] = reviews.map((r) => {
    const duty = dutyById.get(r.duty_id) as OcgDailyDutyRow | undefined
    return {
      logId: r.id,
      dutyTitle: duty?.title ?? 'Duty',
      date: r.duty_date,
      assigneeName: r.assignee_id ? (memberById.get(r.assignee_id)?.name ?? '') : '',
      completedBy: r.completed_by ?? '',
      note: r.note ?? '',
      checklistDone: r.checklist_done ?? 0,
      checklistTotal: r.checklist_total ?? 0,
      onTime: r.completed_on_time ?? null,
    }
  })

  // Distinct free-text values already in use, offered as suggestions.
  const uniq = (vals: (string | null | undefined)[]) =>
    [...new Set(vals.map((v) => (v ?? '').trim()).filter(Boolean))].sort()

  const lists = {
    team: team.map((m) => ({ id: m.id, label: m.name })),
    brands: brands.map((b) => ({ id: b.id, label: b.name })),
    teams: uniq(team.map((m) => (m as { team?: string }).team)),
    departments: uniq(team.map((m) => m.department)),
    roles: uniq(team.map((m) => m.role)),
    locations: uniq(team.map((m) => (m as { location?: string }).location)),
    formTemplates: ((templateRows as OcgFormTemplateRow[] | null) ?? []).map((t) => ({ id: t.id, label: t.name })),
  }

  // Group today's occurrences by person, which is how a manager reads the day.
  const byPerson = new Map<string, typeof items>()
  for (const item of items) {
    const key = item.assigneeName || 'Unassigned'
    byPerson.set(key, [...(byPerson.get(key) ?? []), item])
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ocg-gold">Management · Daily duties</p>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900">Daily duties</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Recurring duties targeted at people, teams, departments, roles, locations or brands.
            A group-targeted duty is one template that produces one occurrence per person per due
            day — never duplicate records. Progress for {date} is live.
          </p>
        </div>
        <Link href="/duties" className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:border-ocg-gold/40">
          My duties <ArrowUpRight size={14} />
        </Link>
      </div>

      {canEdit && <DutyBuilder lists={lists} />}

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Duty templates" value={duties.filter((d) => d.active).length} />
        <Stat label="Occurrences today" value={items.length} />
        <Stat label="Completed" value={done} tone="text-emerald-600" />
        <Stat label={overdue ? 'Overdue' : 'Outstanding'} value={overdue || outstanding} tone={overdue ? 'text-red-600' : 'text-amber-600'} />
      </div>

      {canReview && (
        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <ShieldCheck size={15} className="text-amber-500" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ocg-gold">Awaiting review</h2>
            {reviewRows.length > 0 && (
              <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">{reviewRows.length}</span>
            )}
          </div>
          <DutyReviewQueue rows={reviewRows} />
        </section>
      )}

      <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ocg-gold">Today · by person</h2>
        {items.length === 0 ? (
          <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">No duties fall due on {date}.</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {[...byPerson.entries()].map(([person, list]) => {
              const personDone = list.filter((i) => i.status === 'done').length
              return (
                <div key={person}>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-900">{person}</h3>
                    <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${
                      personDone === list.length ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                    }`}>{personDone}/{list.length}</span>
                  </div>
                  <div className="space-y-2">
                    {list.map((o) => (
                      <DutyOccurrenceCard key={`${o.dutyId}:${o.date}:${o.assigneeId ?? ''}`} occurrence={o} readOnly={!canEdit} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ocg-gold">Duty templates</h2>
        {duties.length === 0 ? (
          <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">No duties set up yet.</p>
        ) : (
          <ul className="space-y-2">
            {duties.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-gray-800">
                    {d.title}
                    {!d.active && <span className="ml-2 text-xs font-normal text-gray-400">· ended</span>}
                    {d.paused && <span className="ml-2 text-xs font-normal text-amber-600">· paused</span>}
                  </span>
                  <span className="block truncate text-xs text-gray-400">
                    {describeDutyTarget(d, d.assignee_id ? memberById.get(d.assignee_id)?.name : undefined)}
                    {' · '}{describeRecurrence(d)}
                    {d.time_of_day ? ` · ${d.time_of_day}` : ''}
                    {d.requires_approval ? ' · reviewed' : ''}
                    {d.requires_checklist ? ' · checklist' : ''}
                  </span>
                </span>
                {canEdit && <DutyRowControls id={d.id} paused={d.paused} />}
              </li>
            ))}
          </ul>
        )}
      </section>
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
