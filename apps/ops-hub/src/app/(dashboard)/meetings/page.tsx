import Link from 'next/link'
import { CalendarClock, CalendarCheck2, ListChecks, Sparkles } from 'lucide-react'
import { listMeetingsForActor, listMeetingTemplatesForActor } from '@/lib/meetings'
import { listBrands } from '@/lib/brands'
import { listProjects } from '@/lib/projects'
import { listTeam } from '@/lib/team'
import { NewMeetingButton } from '@/components/meetings/NewMeetingButton'
import { requireActor } from '@/lib/server-auth'
import { db } from '@/lib/serverClient'
import type { OcgMeetingActionItemRow, OcgMeetingRow } from '@ocg/db'

export const dynamic = 'force-dynamic'

export default async function MeetingsPage() {
  const actor = await requireActor()
  const [meetings, templates, brands, projects, team] = await Promise.all([
    listMeetingsForActor(actor),
    listMeetingTemplatesForActor(actor),
    listBrands(),
    listProjects(),
    listTeam(),
  ])

  // Open action items across all meetings (the follow-through board).
  const { data: actionRows } = await db()
    .from('ocg_meeting_action_items')
    .select('*')
    .in('status', ['open', 'carried_over'])
    .order('due_date', { ascending: true })
    .limit(50)
  const meetingById = new Map(meetings.map((m) => [m.id, m]))
  const openActions = ((actionRows as OcgMeetingActionItemRow[] | null) ?? [])
    .filter((action) => meetingById.has(action.meeting_id))

  const nowIso = new Date().toISOString()
  const upcoming = meetings
    .filter((m) => m.status !== 'cancelled' && m.meeting_date >= nowIso)
    .sort((a, b) => a.meeting_date.localeCompare(b.meeting_date))
  const past = meetings.filter((m) => m.meeting_date < nowIso)
  const brandById = new Map(brands.map((b) => [b.id, b]))

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ocg-gold">Management · Meetings</p>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900">Meetings</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Schedule meetings, keep minutes and action points, and open each one with an AI prep
            brief built from the previous meeting and the live state of the work.
          </p>
        </div>
        <NewMeetingButton
          brands={brands.map((b) => ({ id: b.id, label: b.short_name || b.name }))}
          projects={projects.filter((p) => !p.parent_project_id).map((p) => ({ id: p.project_id, label: p.project_name }))}
          team={team.map((m) => ({ id: m.id, label: m.name, email: m.email ?? '' }))}
          templates={templates.map((t) => ({
            id: t.id,
            title: t.title,
            brand_id: t.brand_id ?? '',
            project_id: t.project_id ?? '',
            location: t.location,
            agenda: t.agenda,
            attendees: t.attendee_member_ids,
            meeting_mode: t.meeting_mode,
            meeting_url: t.meeting_url,
          }))}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
            <SectionTitle icon={CalendarClock} title="Upcoming" description="Scheduled meetings — generate the prep brief before you walk in." />
            {upcoming.length === 0 ? (
              <Empty text="Nothing scheduled. Create a meeting to get started." />
            ) : (
              <div className="space-y-3">
                {upcoming.map((m) => (
                  <MeetingRow key={m.id} meeting={m} brandName={brandById.get(m.brand_id ?? '')?.short_name} />
                ))}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
            <SectionTitle icon={CalendarCheck2} title="Past meetings" description="Minutes and decisions, newest first." />
            {past.length === 0 ? (
              <Empty text="No past meetings recorded yet." />
            ) : (
              <div className="space-y-3">
                {past.slice(0, 15).map((m) => (
                  <MeetingRow key={m.id} meeting={m} brandName={brandById.get(m.brand_id ?? '')?.short_name} />
                ))}
              </div>
            )}
          </section>
        </div>

        <section className="h-fit rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <SectionTitle icon={ListChecks} title="Open action points" description="Agreed in meetings and not yet delivered." />
          {openActions.length === 0 ? (
            <Empty text="No open action points. Everything agreed has been closed." />
          ) : (
            <div className="space-y-2.5">
              {openActions.slice(0, 20).map((a) => {
                const meeting = meetingById.get(a.meeting_id)
                return (
                  <Link key={a.id} href={meeting ? `/meetings/${meeting.id}` : '/meetings'} className="block rounded-lg border border-gray-100 p-3 hover:border-ocg-gold/40">
                    <p className="text-sm font-medium text-gray-800">{a.description}</p>
                    <p className="mt-1 text-xs text-gray-400">
                      {a.owner || 'Unassigned'} · {meeting?.title ?? 'Meeting'}{a.due_date ? ` · due ${a.due_date}` : ''}
                      {a.ops_task_id ? ` · ${a.ops_task_id}` : ''}
                    </p>
                  </Link>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function MeetingRow({ meeting, brandName }: { meeting: OcgMeetingRow; brandName?: string }) {
  const date = new Date(meeting.meeting_date)
  return (
    <Link href={`/meetings/${meeting.id}`} className="flex items-center gap-4 rounded-lg border border-gray-100 p-3.5 transition-colors hover:border-ocg-gold/40">
      <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg bg-ocg-navy text-white">
        <span className="text-[10px] uppercase leading-none opacity-70">{date.toLocaleString('en-KE', { month: 'short' })}</span>
        <span className="text-lg font-semibold leading-tight">{date.getDate()}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-gray-800">{meeting.title}</p>
        <p className="mt-0.5 text-xs text-gray-400">
          {date.toLocaleString('en-KE', { hour: '2-digit', minute: '2-digit' })} · {brandName ?? 'Group'} · {meeting.location || 'No location'} · {meeting.attendees.length} attendee{meeting.attendees.length === 1 ? '' : 's'}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {meeting.prep_brief && <Sparkles size={14} className="text-ocg-gold" aria-label="Prep brief ready" />}
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
          meeting.status === 'held' ? 'bg-emerald-50 text-emerald-700'
          : meeting.status === 'cancelled' ? 'bg-red-50 text-red-500'
          : 'bg-blue-50 text-blue-700'
        }`}>{meeting.status}</span>
      </div>
    </Link>
  )
}

function SectionTitle({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ocg-gold">{title}</h2>
        <p className="mt-1 text-sm text-gray-500">{description}</p>
      </div>
      <Icon size={18} className="text-gray-400" />
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500">{text}</p>
}
