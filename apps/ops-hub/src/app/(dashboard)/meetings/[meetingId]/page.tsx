import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { canAccessMeeting, getMeeting, listActionItems } from '@/lib/meetings'
import { listTeam } from '@/lib/team'
import { brandMap } from '@/lib/brands'
import { getProject } from '@/lib/projects'
import { requireActor } from '@/lib/server-auth'
import { MeetingWorkspace } from '@/components/meetings/MeetingWorkspace'

export const dynamic = 'force-dynamic'

export default async function MeetingDetailPage({
  params,
}: {
  params: Promise<{ meetingId: string }>
}) {
  const actor = await requireActor()
  const { meetingId } = await params
  const meeting = await getMeeting(meetingId)
  if (!meeting) notFound()
  if (!canAccessMeeting(actor, meeting)) notFound()

  const [actions, team, bmap, project] = await Promise.all([
    listActionItems(meeting.id),
    listTeam(),
    brandMap(),
    meeting.project_id ? getProject(meeting.project_id) : Promise.resolve(null),
  ])
  const brand = meeting.brand_id ? bmap.get(meeting.brand_id) : null

  return (
    <div className="space-y-5">
      <Link href="/meetings" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
        <ArrowLeft size={15} /> All meetings
      </Link>
      <MeetingWorkspace
        meeting={meeting}
        actions={actions}
        team={team.map((m) => ({ id: m.id, label: m.name, email: m.email ?? '' }))}
        brandName={brand ? brand.short_name || brand.name : null}
        brandColor={brand?.color_hex ?? null}
        projectName={project?.project_name ?? null}
        canEdit={actor.can('meetings', 'edit') || canAccessMeeting(actor, meeting)}
        canManageMeeting={actor.can('meetings', 'edit')}
      />
    </div>
  )
}
