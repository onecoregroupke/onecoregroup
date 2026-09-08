import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, CalendarDays, Clock, MapPin, Users } from 'lucide-react'
import type { OcgCalendarEventAttendeeRow, OcgCalendarEventRow } from '@ocg/db'
import { requireActor } from '@/lib/server-auth'
import { db } from '@/lib/serverClient'
import { memberForEmail, listTeam } from '@/lib/team'
import { listBrands } from '@/lib/brands'
import { canSeeEvent } from '@/lib/calendarModel'

export const dynamic = 'force-dynamic'

export default async function CalendarEventPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor()
  const { id } = await params
  const [me, team, brands, eventResult, attendeeResult] = await Promise.all([
    memberForEmail(actor.email),
    listTeam(),
    listBrands(),
    db().from('ocg_calendar_events').select('*').eq('id', id).maybeSingle(),
    db().from('ocg_calendar_event_attendees').select('*').eq('event_id', id),
  ])
  const event = eventResult.data as OcgCalendarEventRow | null
  if (!event) notFound()
  const attendees = (attendeeResult.data as OcgCalendarEventAttendeeRow[] | null) ?? []
  const attendeeIds = attendees.map((row) => row.team_member_id).filter((value): value is string => !!value)
  const viewer = {
    permissions: actor.permissions,
    brandAccess: actor.brandAccess,
    teamMemberId: me?.id ?? null,
    email: actor.email,
    team: me?.team ?? '',
    department: me?.department ?? '',
    brandIds: me?.brand_ids ?? [],
  }
  if (!canSeeEvent(viewer, { ...event, attendee_member_ids: attendeeIds })) notFound()
  const names = team.filter((member) => attendeeIds.includes(member.id)).map((member) => member.name)
  const brand = event.brand_id ? brands.find((row) => row.id === event.brand_id) : null
  const when = event.all_day
    ? `${date(event.starts_at)} · all day`
    : `${date(event.starts_at)} · ${time(event.starts_at)}${event.ends_at ? `–${time(event.ends_at)}` : ''}`

  return <div className="mx-auto max-w-3xl space-y-5">
    <Link href="/calendar" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"><ArrowLeft size={15} /> Calendar</Link>
    <section className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ocg-gold">{event.event_kind.replace(/_/g, ' ')}</p>
      <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-gray-900"><CalendarDays size={21} className="text-gray-400" /> {event.title}</h1>
      <div className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
        <Detail icon={<Clock size={15} />} label="When" value={when} />
        <Detail icon={<Users size={15} />} label="Visibility" value={`${event.visibility.replace(/_/g, ' ')}${brand ? ` · ${brand.name}` : ''}`} />
        {event.location ? <Detail icon={<MapPin size={15} />} label="Location" value={event.location} /> : null}
        <Detail label="Status" value={event.status.replace(/_/g, ' ')} />
        <Detail label="Created by" value={event.created_by || '—'} />
        <Detail label="Attendees" value={names.join(', ') || 'No named attendees'} />
      </div>
      {event.description ? <TextBlock label="Description" value={event.description} /> : null}
      {event.notes ? <TextBlock label="Notes" value={event.notes} /> : null}
    </section>
  </div>
}

function date(value: string) {
  return new Date(value).toLocaleDateString('en-KE', { dateStyle: 'full', timeZone: 'Africa/Nairobi' })
}

function time(value: string) {
  return new Date(value).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' })
}

function Detail({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return <div><p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">{icon}{label}</p><p className="mt-1 capitalize text-gray-700">{value}</p></div>
}

function TextBlock({ label, value }: { label: string; value: string }) {
  return <div className="mt-5 border-t border-gray-100 pt-5"><p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-gray-600">{value}</p></div>
}
