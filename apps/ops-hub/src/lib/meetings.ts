import Groq from 'groq-sdk'
import { hubUrl } from './auth-emails'
import { ensureConversationMembers, postConversationMessage, startConversation } from './chat'
import { sendMeetingInvite } from './email'
import { createNotification } from './notifications'
import { db, nowIso } from './serverClient'
import { createTask } from './tasks'
import type {
  OcgMeetingRow,
  OcgMeetingActionItemRow,
  OcgMeetingTemplateRow,
  OpsTaskRow,
  OpsTeamMemberRow,
} from '@ocg/db'
import type { Actor } from './server-auth'
import { canAccessMeeting, canEditMeetingNotes, cleanEmail, cleanEmailList } from './meetingAccess'

// Re-export so existing importers (`@/lib/meetings`) keep working.
export { canAccessMeeting, canEditMeetingNotes }

// =============================================================================
// Meetings — scheduling, minutes, action items, and the context-aware prep
// brief. Prep narration uses Groq (same report-only policy as lib/reporting.ts
// — this is a narration, not task drafting) with a structured non-AI fallback.
// =============================================================================

export function slugifySeries(title: string): string {
  return title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export async function listMeetings(limit = 200): Promise<OcgMeetingRow[]> {
  const { data } = await db()
    .from('ocg_meetings')
    .select('*')
    .order('meeting_date', { ascending: false })
    .limit(limit)
  return (data as OcgMeetingRow[] | null) ?? []
}

export async function listMeetingsForActor(actor: Actor, limit = 200): Promise<OcgMeetingRow[]> {
  const meetings = await listMeetings(limit)
  // Participant-scoped by default; canAccessMeeting also honours a "view all"
  // grant (optionally brand-scoped) — no management/ops inheritance any more.
  return meetings.filter((meeting) => canAccessMeeting(actor, meeting))
}

export async function listMeetingTemplatesForActor(actor: Actor): Promise<OcgMeetingTemplateRow[]> {
  const { data } = await db()
    .from('ocg_meeting_templates')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(200)
  const templates = (data as OcgMeetingTemplateRow[] | null) ?? []
  const email = cleanEmail(actor.email ?? '')
  const ownTemplate = (t: OcgMeetingTemplateRow) =>
    cleanEmail(t.created_by_email) === email || t.attendee_emails.map(cleanEmail).includes(email)
  if (actor.can('meetings', 'view')) {
    const brandIds = actor.allowedBrandIds('meetings')
    if (brandIds === null) return templates
    return templates.filter((t) => (t.brand_id && brandIds.includes(t.brand_id)) || ownTemplate(t))
  }
  return templates.filter(ownTemplate)
}

export async function getMeeting(id: string): Promise<OcgMeetingRow | null> {
  const { data } = await db().from('ocg_meetings').select('*').eq('id', id).maybeSingle()
  return (data as OcgMeetingRow | null) ?? null
}

export async function listActionItems(meetingId: string): Promise<OcgMeetingActionItemRow[]> {
  const { data } = await db()
    .from('ocg_meeting_action_items')
    .select('*')
    .eq('meeting_id', meetingId)
    .order('created_at', { ascending: true })
  return (data as OcgMeetingActionItemRow[] | null) ?? []
}

export interface CreateMeetingInput {
  title: string
  meeting_date: string
  brand_id?: string | null
  project_id?: string | null
  location?: string
  agenda?: string
  attendees?: string[]
  attendee_emails?: string[]
  attendee_member_ids?: string[]
  meeting_mode?: string
  meeting_url?: string
  series_key?: string
  created_by: string
  created_by_email?: string | null
  save_as_template?: boolean
}

export async function createMeeting(input: CreateMeetingInput): Promise<OcgMeetingRow> {
  if (!input.title?.trim()) throw new Error('Meeting title is required')
  const attendeeEmails = cleanEmailList(input.attendee_emails ?? [])
  const attendeeMemberIds = [...new Set((input.attendee_member_ids ?? []).filter(Boolean))]
  const { data, error } = await db()
    .from('ocg_meetings')
    .insert({
      title: input.title.trim(),
      meeting_date: input.meeting_date || nowIso(),
      brand_id: input.brand_id || null,
      project_id: input.project_id || null,
      location: input.location ?? '',
      agenda: input.agenda ?? '',
      attendees: input.attendees ?? [],
      attendee_emails: attendeeEmails,
      attendee_member_ids: attendeeMemberIds,
      meeting_mode: input.meeting_mode || 'in_person',
      meeting_url: input.meeting_url ?? '',
      series_key: input.series_key?.trim() || slugifySeries(input.title),
      status: 'scheduled',
      created_by: input.created_by,
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  const meeting = data as OcgMeetingRow
  if (input.save_as_template) {
    await saveMeetingTemplateFromMeeting(meeting, input.created_by, input.created_by_email ?? '')
  }
  await notifyMeetingInvites(meeting, {
    createdByName: input.created_by,
    createdByEmail: input.created_by_email ?? '',
  })
  return meeting
}

const MEETING_EDITABLE = new Set([
  'title', 'meeting_date', 'brand_id', 'project_id', 'location', 'agenda',
  'attendees', 'series_key', 'status', 'notes', 'summary',
  'attendee_emails', 'attendee_member_ids', 'meeting_mode', 'meeting_url',
])

export async function updateMeeting(id: string, values: Record<string, unknown>): Promise<OcgMeetingRow> {
  const patch: Record<string, unknown> = { updated_at: nowIso() }
  for (const [k, v] of Object.entries(values)) {
    if (MEETING_EDITABLE.has(k) && v !== undefined) patch[k] = v
  }
  const { data, error } = await db().from('ocg_meetings').update(patch).eq('id', id).select('*').single()
  if (error) throw new Error(error.message)
  return data as OcgMeetingRow
}

export async function updateMeetingAttendees(
  id: string,
  input: {
    attendees: string[]
    attendee_emails: string[]
    attendee_member_ids: string[]
    actorName: string
    actorEmail: string
  },
): Promise<OcgMeetingRow> {
  const before = await getMeeting(id)
  if (!before) throw new Error('Meeting not found')
  const previous = new Set(before.attendee_emails.map(cleanEmail))
  const nextEmails = cleanEmailList(input.attendee_emails)
  const newEmails = nextEmails.filter((email) => !previous.has(email))
  const { data, error } = await db()
    .from('ocg_meetings')
    .update({
      attendees: input.attendees,
      attendee_emails: nextEmails,
      attendee_member_ids: [...new Set(input.attendee_member_ids.filter(Boolean))],
      updated_at: nowIso(),
    })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  const meeting = data as OcgMeetingRow
  if (newEmails.length > 0) {
    await notifyMeetingInvites({ ...meeting, attendee_emails: newEmails }, {
      createdByName: input.actorName,
      createdByEmail: input.actorEmail,
    })
  }
  return meeting
}

export async function updateMeetingNotes(
  id: string,
  values: { notes?: string; summary?: string },
  actorName: string,
): Promise<OcgMeetingRow> {
  const patch: Record<string, unknown> = {
    updated_at: nowIso(),
    notes_updated_by: actorName,
    notes_updated_at: nowIso(),
  }
  if (values.notes !== undefined) patch.notes = values.notes
  if (values.summary !== undefined) patch.summary = values.summary
  const { data, error } = await db().from('ocg_meetings').update(patch).eq('id', id).select('*').single()
  if (error) throw new Error(error.message)
  return data as OcgMeetingRow
}

export async function saveMeetingTemplateFromMeeting(
  meeting: OcgMeetingRow,
  createdBy: string,
  createdByEmail: string,
): Promise<OcgMeetingTemplateRow> {
  const { data, error } = await db()
    .from('ocg_meeting_templates')
    .insert({
      title: meeting.title,
      brand_id: meeting.brand_id,
      project_id: meeting.project_id,
      location: meeting.location,
      agenda: meeting.agenda,
      attendees: meeting.attendees,
      attendee_emails: meeting.attendee_emails,
      attendee_member_ids: meeting.attendee_member_ids,
      meeting_mode: meeting.meeting_mode,
      meeting_url: meeting.meeting_url,
      series_key: meeting.series_key,
      created_by: createdBy,
      created_by_email: cleanEmail(createdByEmail),
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as OcgMeetingTemplateRow
}

export async function addActionItem(input: {
  meeting_id: string
  description: string
  owner?: string
  due_date?: string | null
  notes?: string
}): Promise<OcgMeetingActionItemRow> {
  if (!input.description?.trim()) throw new Error('Action item description is required')
  const meeting = await getMeeting(input.meeting_id)
  if (!meeting) throw new Error('Meeting not found')
  const { data, error } = await db()
    .from('ocg_meeting_action_items')
    .insert({
      meeting_id: input.meeting_id,
      brand_id: meeting.brand_id,
      description: input.description.trim(),
      owner: input.owner ?? '',
      due_date: input.due_date || null,
      notes: input.notes ?? '',
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as OcgMeetingActionItemRow
}

export async function updateActionItem(
  id: string,
  values: Record<string, unknown>,
): Promise<OcgMeetingActionItemRow> {
  const editable = new Set(['description', 'owner', 'due_date', 'status', 'notes'])
  const patch: Record<string, unknown> = { updated_at: nowIso() }
  for (const [k, v] of Object.entries(values)) {
    if (editable.has(k) && v !== undefined) patch[k] = v
  }
  const { data, error } = await db()
    .from('ocg_meeting_action_items')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as OcgMeetingActionItemRow
}

/** Turn an action item into a tracked ops task (meeting must be linked to a
 *  project — tasks always live under a project). */
export async function actionItemToTask(actionItemId: string, createdBy: string): Promise<OpsTaskRow> {
  const supabase = db()
  const { data: item } = await supabase
    .from('ocg_meeting_action_items')
    .select('*')
    .eq('id', actionItemId)
    .maybeSingle()
  if (!item) throw new Error('Action item not found')
  const action = item as OcgMeetingActionItemRow
  if (action.ops_task_id) throw new Error('This action item already has a task')
  const meeting = await getMeeting(action.meeting_id)
  if (!meeting?.project_id) {
    throw new Error('Link the meeting to a project first — tasks live under projects.')
  }
  const task = await createTask({
    task_name: action.description.slice(0, 140),
    project_id: meeting.project_id,
    task_description: `${action.description}\n\nFrom meeting: ${meeting.title} (${meeting.meeting_date.slice(0, 10)})`,
    assigned_to: action.owner,
    target_date: action.due_date ?? '',
    category: 'Operations',
    created_by: createdBy,
    agent_eligible: 'No',
    source_kind: 'meeting_action',
    source_ref: action.id,
  })
  await supabase
    .from('ocg_meeting_action_items')
    .update({ ops_task_id: task.task_id, updated_at: nowIso() })
    .eq('id', action.id)
  return task
}

// ── Smart prep ───────────────────────────────────────────────────────────────

interface PrepContext {
  meeting: OcgMeetingRow
  previous: OcgMeetingRow | null
  previousActions: (OcgMeetingActionItemRow & { task_status?: string })[]
  openSeriesActions: (OcgMeetingActionItemRow & { task_status?: string; meeting_title?: string })[]
  projectTasks: OpsTaskRow[]
  projectContext: string
}

async function gatherPrepContext(meeting: OcgMeetingRow): Promise<PrepContext> {
  const supabase = db()

  // Most recent earlier meeting in the same series.
  const { data: prevRows } = await supabase
    .from('ocg_meetings')
    .select('*')
    .eq('series_key', meeting.series_key)
    .neq('id', meeting.id)
    .lt('meeting_date', meeting.meeting_date)
    .order('meeting_date', { ascending: false })
    .limit(5)
  const seriesMeetings = (prevRows as OcgMeetingRow[] | null) ?? []
  const previous = seriesMeetings[0] ?? null

  // Action items from the whole series (previous meetings), enriched with the
  // live status of any linked ops task — that's what makes the prep evolve
  // with the actual work rather than the minutes alone.
  const seriesIds = seriesMeetings.map((m) => m.id)
  let seriesActions: OcgMeetingActionItemRow[] = []
  if (seriesIds.length > 0) {
    const { data } = await supabase
      .from('ocg_meeting_action_items')
      .select('*')
      .in('meeting_id', seriesIds)
      .order('created_at', { ascending: true })
    seriesActions = (data as OcgMeetingActionItemRow[] | null) ?? []
  }

  const taskIds = seriesActions.map((a) => a.ops_task_id).filter(Boolean) as string[]
  const taskStatus = new Map<string, string>()
  if (taskIds.length > 0) {
    const { data } = await supabase.from('ops_tasks').select('task_id, current_status').in('task_id', taskIds)
    for (const t of (data as Pick<OpsTaskRow, 'task_id' | 'current_status'>[] | null) ?? []) {
      taskStatus.set(t.task_id, t.current_status)
    }
  }
  const meetingTitle = new Map(seriesMeetings.map((m) => [m.id, `${m.title} (${m.meeting_date.slice(0, 10)})`]))
  const withStatus = seriesActions.map((a) => ({
    ...a,
    task_status: a.ops_task_id ? taskStatus.get(a.ops_task_id) : undefined,
    meeting_title: meetingTitle.get(a.meeting_id),
  }))

  const previousActions = withStatus.filter((a) => previous && a.meeting_id === previous.id)
  const openSeriesActions = withStatus.filter(
    (a) => a.status === 'open' || a.status === 'carried_over' ||
      (a.task_status && a.task_status !== 'Completed'),
  )

  // Linked project: living context + active tasks (incl. sub-projects).
  let projectTasks: OpsTaskRow[] = []
  let projectContext = ''
  if (meeting.project_id) {
    const { data: subRows } = await supabase
      .from('ops_projects')
      .select('project_id')
      .eq('parent_project_id', meeting.project_id)
    const projectIds = [meeting.project_id, ...((subRows as { project_id: string }[] | null) ?? []).map((r) => r.project_id)]
    const { data: taskRows } = await supabase
      .from('ops_tasks')
      .select('*')
      .in('project_id', projectIds)
      .eq('active', 'Yes')
      .neq('current_status', 'Completed')
      .order('target_date', { ascending: true })
      .limit(25)
    projectTasks = (taskRows as OpsTaskRow[] | null) ?? []
    const { data: ctx } = await supabase
      .from('ops_project_context')
      .select('content')
      .eq('project_id', meeting.project_id)
      .maybeSingle()
    projectContext = (ctx as { content: string } | null)?.content ?? ''
  }

  return { meeting, previous, previousActions, openSeriesActions, projectTasks, projectContext }
}

function structuredBrief(ctx: PrepContext): string {
  const lines: string[] = []
  const { meeting, previous, previousActions, openSeriesActions, projectTasks } = ctx
  lines.push(`Prep brief — ${meeting.title} · ${meeting.meeting_date.slice(0, 10)}`)
  if (previous) {
    lines.push('', `Previous meeting: ${previous.title} on ${previous.meeting_date.slice(0, 10)}.`)
    if (previous.summary || previous.notes) {
      lines.push(`Key notes: ${(previous.summary || previous.notes).slice(0, 600)}`)
    }
    if (previousActions.length) {
      lines.push('', 'Action points agreed last time:')
      for (const a of previousActions) {
        const status = a.task_status ? `task ${a.task_status}` : a.status
        lines.push(`- ${a.description} — ${a.owner || 'unassigned'} · ${status}${a.due_date ? ` · due ${a.due_date}` : ''}`)
      }
    }
  } else {
    lines.push('', 'No previous meeting found in this series — this is the first one.')
  }
  const stillOpen = openSeriesActions.filter((a) => !previousActions.some((p) => p.id === a.id))
  if (stillOpen.length) {
    lines.push('', 'Still open from earlier meetings:')
    for (const a of stillOpen.slice(0, 10)) {
      lines.push(`- ${a.description} — ${a.owner || 'unassigned'} (${a.meeting_title ?? 'earlier meeting'})`)
    }
  }
  if (projectTasks.length) {
    lines.push('', 'Live tasks in the linked project:')
    for (const t of projectTasks.slice(0, 12)) {
      lines.push(`- ${t.task_name} — ${t.assigned_to || 'unassigned'} · ${t.current_status}${t.target_date ? ` · due ${t.target_date}` : ''}`)
    }
  }
  if (meeting.agenda) lines.push('', `Agenda for this meeting:\n${meeting.agenda}`)
  return lines.join('\n')
}

/**
 * Build (and store) the context-aware prep brief for a meeting: previous
 * meeting notes + agreed action points with their LIVE task statuses + the
 * linked project's active work. Narrated by Groq when configured; otherwise
 * the structured brief is stored as-is.
 */
export async function generatePrepBrief(meetingId: string): Promise<OcgMeetingRow> {
  const meeting = await getMeeting(meetingId)
  if (!meeting) throw new Error('Meeting not found')
  const ctx = await gatherPrepContext(meeting)
  const structured = structuredBrief(ctx)

  let brief = structured
  if (process.env['GROQ_API_KEY']) {
    try {
      const groq = new Groq({ apiKey: process.env['GROQ_API_KEY']! })
      const completion = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        temperature: 0.4,
        max_tokens: 900,
        messages: [
          {
            role: 'system',
            content:
              'You are the Chief of Staff for One Core Group, a Kenyan multi-brand group. ' +
              'Write a meeting prep brief (150–300 words) for the chairperson. Structure: ' +
              '1) Where we left off (previous meeting decisions), 2) Follow-ups — who delivered on their action points and who has not (use the live task statuses), ' +
              '3) What needs attention in the linked project work, 4) Suggested focus for this meeting. ' +
              'Be direct and name owners. Clear Kenyan English. Use ONLY the facts provided — no invention.',
          },
          { role: 'user', content: structured + '\n\nProject context (background):\n' + ctx.projectContext.slice(0, 1500) },
        ],
      })
      brief = completion.choices[0]?.message?.content?.trim() || structured
    } catch {
      brief = structured // Groq unavailable — the structured brief still delivers.
    }
  }

  return updateMeetingPrep(meetingId, brief)
}

async function updateMeetingPrep(id: string, brief: string): Promise<OcgMeetingRow> {
  const { data, error } = await db()
    .from('ocg_meetings')
    .update({ prep_brief: brief, prep_generated_at: nowIso(), updated_at: nowIso() })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as OcgMeetingRow
}

async function teamByEmail(): Promise<Map<string, OpsTeamMemberRow>> {
  const { data } = await db().from('ops_team_members').select('*').eq('active', true)
  const team = (data as OpsTeamMemberRow[] | null) ?? []
  return new Map(team.filter((m) => m.email).map((m) => [cleanEmail(m.email!), m]))
}

async function notifyMeetingInvites(
  meeting: OcgMeetingRow,
  creator: { createdByName: string; createdByEmail: string },
): Promise<void> {
  const emails = cleanEmailList(meeting.attendee_emails)
  if (emails.length === 0) return
  const members = await teamByEmail()
  const meetingUrl = `${hubUrl()}/meetings/${meeting.id}`
  const invitedMembers = emails.map((email) => ({
    email,
    name: members.get(email)?.name || meeting.attendees.find((a) => a.toLowerCase() === email) || email,
  }))

  let conversationId = meeting.chat_conversation_id
  try {
    if (creator.createdByEmail && invitedMembers.length > 0) {
      if (!conversationId) {
        const conversation = await startConversation({
          creator_email: creator.createdByEmail,
          creator_name: creator.createdByName,
          member_emails: invitedMembers,
          name: meeting.title,
        })
        conversationId = conversation.id
        await db().from('ocg_meetings').update({ chat_conversation_id: conversationId }).eq('id', meeting.id)
      } else {
        await ensureConversationMembers(conversationId, [
          { email: creator.createdByEmail, name: creator.createdByName },
          ...invitedMembers,
        ])
      }
      await postConversationMessage({
        conversation_id: conversationId,
        sender_email: creator.createdByEmail,
        sender_name: creator.createdByName,
        body:
          `Meeting invite: ${meeting.title}\n` +
          `When: ${new Date(meeting.meeting_date).toLocaleString('en-KE', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Africa/Nairobi' })}\n` +
          `${meeting.location ? `Where: ${meeting.location}\n` : ''}` +
          `${meeting.agenda ? `Agenda:\n${meeting.agenda}\n` : ''}` +
          `Notes: ${meetingUrl}`,
      })
    }
  } catch {
    // Chat is helpful but non-critical; email + portal inbox still deliver.
  }

  await Promise.all(invitedMembers.map(async (member) => {
    await createNotification({
      recipient_email: member.email,
      recipient_name: member.name,
      sender_email: creator.createdByEmail,
      sender_name: creator.createdByName,
      kind: 'meeting_invite',
      title: `Meeting invite: ${meeting.title}`,
      body: `${new Date(meeting.meeting_date).toLocaleString('en-KE', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Africa/Nairobi' })}${meeting.location ? ` · ${meeting.location}` : ''}`,
      href: `/meetings/${meeting.id}`,
      metadata: { meeting_id: meeting.id, chat_conversation_id: conversationId },
    })
    await sendMeetingInvite({
      to: member.email,
      name: member.name,
      meetingTitle: meeting.title,
      meetingDate: meeting.meeting_date,
      location: meeting.location,
      agenda: meeting.agenda,
      invitedBy: creator.createdByName,
      meetingUrl,
      meetingJoinUrl: meeting.meeting_url || undefined,
    })
  }))
}
