import { listTeam } from '@/lib/team'
import { listDuties, listDutyLogsForDate } from '@/lib/duties'
import { todayInEat } from '@/lib/serverClient'
import { DutySetupForm } from '@/components/duties/DutySetupForm'

export const dynamic = 'force-dynamic'

export default async function DailyDutiesPage() {
  const today = todayInEat()
  const [team, duties, logs] = await Promise.all([listTeam(), listDuties({ activeOnly: true }), listDutyLogsForDate(today)])
  const memberById = new Map(team.map((m) => [m.id, m]))
  const statusByDuty = new Map(logs.map((l) => [l.duty_id, l.status]))

  // Group duties by assignee.
  const groups = new Map<string, typeof duties>()
  for (const d of duties) {
    const key = d.assignee_id ?? 'unassigned'
    groups.set(key, [...(groups.get(key) ?? []), d])
  }

  const totalDone = duties.filter((d) => statusByDuty.get(d.id) === 'done').length

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ocg-gold">Management · Daily duties</p>
        <h1 className="mt-1 text-2xl font-semibold text-gray-900">Daily duties</h1>
        <p className="mt-1 text-sm text-gray-500">
          Recurring duties per person. Team members tick these off in their portal; progress for {today} is shown live and rolls into the daily report.
        </p>
      </div>

      <DutySetupForm team={team.map((m) => ({ id: m.id, label: m.name }))} />

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Active duties" value={duties.length} />
        <Stat label="Done today" value={totalDone} tone="text-emerald-600" />
        <Stat label="Outstanding" value={duties.length - totalDone} tone="text-amber-600" />
      </div>

      {duties.length === 0 ? (
        <p className="rounded-xl border border-gray-100 bg-white p-6 text-sm text-gray-500 shadow-sm">No daily duties set up yet. Add one above.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {[...groups.entries()].map(([key, list]) => {
            const member = key === 'unassigned' ? null : memberById.get(key)
            const done = list.filter((d) => statusByDuty.get(d.id) === 'done').length
            return (
              <section key={key} className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-gray-900">{member?.name ?? 'Unassigned'}</h2>
                  <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${done === list.length ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                    {done}/{list.length} done today
                  </span>
                </div>
                <ul className="space-y-2">
                  {list.map((d) => {
                    const status = statusByDuty.get(d.id) ?? 'pending'
                    return (
                      <li key={d.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2 text-sm">
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-gray-800">{d.title}</span>
                          {d.description && <span className="block truncate text-xs text-gray-400">{d.description}</span>}
                        </span>
                        <span className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-medium ${status === 'done' ? 'bg-emerald-50 text-emerald-700' : status === 'skipped' ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-500'}`}>
                          {status}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, tone = 'text-gray-900' }: { label: string; value: number; tone?: string }) {
  return <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm"><p className={`text-3xl font-light ${tone}`}>{value}</p><p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</p></div>
}
