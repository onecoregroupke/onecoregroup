import { NextResponse, type NextRequest } from 'next/server'
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx'
import { canAccessMeeting, getMeeting, listActionItems } from '@/lib/meetings'
import { getActor } from '@/lib/server-auth'

export const runtime = 'nodejs'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> },
) {
  const actor = await getActor()
  if (!actor) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const { meetingId } = await params
  const meeting = await getMeeting(meetingId)
  if (!meeting) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
  if (!canAccessMeeting(actor, meeting)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })

  const actions = await listActionItems(meeting.id)
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ text: meeting.title, heading: HeadingLevel.TITLE }),
        new Paragraph({
          children: [
            new TextRun({ text: 'Date: ', bold: true }),
            new TextRun(new Date(meeting.meeting_date).toLocaleString('en-KE', {
              dateStyle: 'full',
              timeStyle: 'short',
              timeZone: 'Africa/Nairobi',
            })),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'Attendees: ', bold: true }),
            new TextRun(meeting.attendees.length ? meeting.attendees.join(', ') : 'None recorded'),
          ],
        }),
        ...(meeting.location ? [new Paragraph({
          children: [new TextRun({ text: 'Location: ', bold: true }), new TextRun(meeting.location)],
        })] : []),
        new Paragraph({ text: 'Summary', heading: HeadingLevel.HEADING_1 }),
        ...paragraphs(meeting.summary || 'No summary recorded.'),
        new Paragraph({ text: 'Meeting Notes', heading: HeadingLevel.HEADING_1 }),
        ...paragraphs(meeting.notes || 'No notes recorded.'),
        new Paragraph({ text: 'Action Points', heading: HeadingLevel.HEADING_1 }),
        ...(actions.length
          ? actions.flatMap((action) => paragraphs(
              `- ${action.description} — ${action.owner || 'Unassigned'} · ${action.status}${action.due_date ? ` · due ${action.due_date}` : ''}`,
            ))
          : paragraphs('No action points recorded.')),
      ],
    }],
  })
  const buffer = await Packer.toBuffer(doc)
  const body = new Uint8Array(buffer)
  const filename = `${meeting.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 80) || 'meeting-notes'}.docx`
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

function paragraphs(text: string): Paragraph[] {
  return text.split(/\n+/).map((line) => new Paragraph({ text: line.trim() || ' ' }))
}
