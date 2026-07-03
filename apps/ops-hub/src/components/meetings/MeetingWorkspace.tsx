'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  CalendarClock, CheckCircle2, CircleDashed, ClipboardList, ListTodo,
  Copy, Download, ExternalLink, MapPin, MessageSquare, NotebookPen, Plus, RefreshCw, Save, Sparkles, Users,
} from 'lucide-react'
import { api } from '@/lib/apiClient'
import type { OcgMeetingRow, OcgMeetingActionItemRow } from '@ocg/db'

type Option = { id: string; label: string; email?: string }

/**
 * The interactive meeting page: minutes + summary editing, status, the action
 * point register (add / close / carry over / convert to a tracked task), and
 * the context-aware prep brief generated from the previous meeting in the
 * series plus the live task state.
 */
export function MeetingWorkspace({
  meeting,
  actions,
  team,
  brandName,
  brandColor,
  projectName,
  canEdit,
  canManageMeeting,
}: {
  meeting: OcgMeetingRow
  actions: OcgMeetingActionItemRow[]
  team: Option[]
  brandName: string | null
  brandColor: string | null
  projectName: string | null
  canEdit: boolean
  canManageMeeting: boolean
}) {
  const router = useRouter()
  const [notes, setNotes] = useState(meeting.notes)
  const [summary, setSummary] = useState(meeting.summary)
  const [saving, setSaving] = useState(false)
  const [prepLoading, setPrepLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [selectedMembers, setSelectedMembers] = useState<string[]>(
    meeting.attendee_member_ids?.length
      ? meeting.attendee_member_ids
      : team.filter((m) => meeting.attendees.includes(m.label)).map((m) => m.id),
  )
  const [savingAttendees, setSavingAttendees] = useState(false)

  // New action item form
  const [newAction, setNewAction] = useState({ description: '', owner: '', due_date: '' })
  const [addingAction, setAddingAction] = useState(false)

  const date = new Date(meeting.meeting_date)

  async function call(body: Record<string, unknown>, okMessage?: string) {
    setError(''); setMessage('')
    const { ok, data } = await api<{ error?: string }>('/api/meetings', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    if (!ok) { setError(data?.error ?? 'Request failed.'); return false }
    if (okMessage) setMessage(okMessage)
    router.refresh()
    return true
  }

  async function saveMinutes() {
    setSaving(true)
    await call({ action: 'update_meeting', id: meeting.id, values: { notes, summary } }, 'Minutes saved.')
    setSaving(false)
  }

  async function copyMinutes() {
    const text = [
      meeting.title,
      date.toLocaleString('en-KE', { dateStyle: 'full', timeStyle: 'short' }),
      '',
      'Summary',
      summary || 'No summary recorded.',
      '',
      'Notes',
      notes || 'No notes recorded.',
    ].join('\n')
    await navigator.clipboard.writeText(text)
    setMessage('Meeting notes copied.')
  }

  async function setStatus(status: string) {
    await call({ action: 'update_meeting', id: meeting.id, values: { status } })
  }

  async function generatePrep() {
    setPrepLoading(true)
    await call({ action: 'generate_prep', id: meeting.id }, 'Prep brief updated.')
    setPrepLoading(false)
  }

  async function addAction() {
    if (!newAction.description.trim()) return
    setAddingAction(true)
    const ok = await call({
      action: 'add_action',
      values: { meeting_id: meeting.id, ...newAction },
    })
    if (ok) setNewAction({ description: '', owner: '', due_date: '' })
    setAddingAction(false)
  }

  async function setActionStatus(id: string, status: string) {
    await call({ action: 'update_action', id, values: { status } })
  }

  async function toTask(id: string) {
    await call({ action: 'to_task', id }, 'Task created from action point.')
  }

  function toggleMember(id: string) {
    setSelectedMembers((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  async function saveAttendees() {
    setSavingAttendees(true)
    const selected = team.filter((m) => selectedMembers.includes(m.id))
    await call({
      action: 'update_attendees',
      id: meeting.id,
      values: {
        attendees: selected.map((m) => m.label),
        attendee_emails: selected.map((m) => m.email).filter(Boolean),
        attendee_member_ids: selectedMembers,
      },
    }, 'Attendees updated. New attendees have been invited.')
    setSavingAttendees(false)
  }

  const openActions = actions.filter((a) => a.status === 'open' || a.status === 'carried_over')
  const closedActions = actions.filter((a) => a.status === 'done' || a.status === 'dropped')

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            {brandColor && <span className="h-3 w-3 rounded-full" style={{ backgroundColor: brandColor }} />}
            <h1 className="text-2xl font-semibold text-gray-900">{meeting.title}</h1>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
            <span className="inline-flex items-center gap-1.5"><CalendarClock size={14} /> {date.toLocaleString('en-KE', { dateStyle: 'full', timeStyle: 'short' })}</span>
            {meeting.location && <span className="inline-flex items-center gap-1.5"><MapPin size={14} /> {meeting.location}</span>}
            {brandName && <span>{brandName}</span>}
            {projectName && <span className="inline-flex items-center gap-1.5"><ClipboardList size={14} /> {projectName}</span>}
            {meeting.meeting_mode !== 'in_person' && <span>{meeting.meeting_mode.replace('_', ' ')}</span>}
          </div>
          {meeting.attendees.length > 0 && (
            <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-gray-500">
              <Users size={14} /> {meeting.attendees.join(', ')}
            </p>
          )}
          {meeting.chat_conversation_id && (
            <Link href="/chat" className="mt-2 inline-flex items-center gap-1.5 text-sm text-ocg-gold hover:underline">
              <MessageSquare size={14} /> Meeting chat is active
            </Link>
          )}
          {meeting.meeting_url && (
            <a href={meeting.meeting_url} target="_blank" rel="noreferrer" className="mt-2 ml-0 inline-flex items-center gap-1.5 rounded-lg bg-ocg-navy px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 sm:ml-3">
              <ExternalLink size={14} /> Join meeting
            </a>
          )}
        </div>
        {canManageMeeting && (
          <div className="flex shrink-0 gap-2">
            {meeting.status !== 'held' && (
              <button onClick={() => setStatus('held')} className="rounded-lg border border-emerald-200 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50">
                Mark held
              </button>
            )}
            {meeting.status !== 'cancelled' && (
              <button onClick={() => setStatus('cancelled')} className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50">
                Cancel
              </button>
            )}
          </div>
        )}
      </div>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {message && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}

      <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
        <div className="space-y-6">
          {/* Prep brief */}
          <section className="rounded-xl border border-ocg-gold/30 bg-gradient-to-br from-amber-50/60 to-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ocg-gold">
                  <Sparkles size={14} /> Prep brief
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  Built from the previous “{meeting.title}” meeting, its action points, and the live task board.
                  {meeting.prep_generated_at && ` Last generated ${new Date(meeting.prep_generated_at).toLocaleString('en-KE')}.`}
                </p>
              </div>
              {canEdit && (
                <button onClick={generatePrep} disabled={prepLoading}
                  className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-ocg-navy px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60">
                  <RefreshCw size={14} className={prepLoading ? 'animate-spin' : ''} />
                  {prepLoading ? 'Preparing…' : meeting.prep_brief ? 'Regenerate' : 'Generate brief'}
                </button>
              )}
            </div>
            {meeting.prep_brief ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{meeting.prep_brief}</p>
            ) : (
              <p className="rounded-lg bg-white/70 p-3 text-sm text-gray-400">
                No brief yet. Generate it before the meeting to walk in with full context.
              </p>
            )}
          </section>

          {/* Minutes */}
          <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ocg-gold">
                  <NotebookPen size={14} /> Shared notes workspace
                </h2>
                <p className="mt-1 text-xs text-gray-400">
                  {meeting.notes_updated_at
                    ? `Last edited by ${meeting.notes_updated_by || 'a collaborator'} · ${new Date(meeting.notes_updated_at).toLocaleString('en-KE')}`
                    : 'Everyone invited to this meeting can open and edit these notes.'}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button onClick={copyMinutes} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50">
                  <Copy size={14} /> Copy
                </button>
                <a href={`/api/meetings/${meeting.id}/notes/docx`} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50">
                  <Download size={14} /> DOCX
                </a>
              </div>
            </div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Meeting notes</label>
            <textarea className="input min-h-[180px]" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!canEdit}
              placeholder="What was discussed, decisions made, numbers shared…" />
            <label className="mb-1 mt-3 block text-xs font-medium text-gray-500">Executive summary</label>
            <textarea className="input min-h-[70px]" value={summary} onChange={(e) => setSummary(e.target.value)} disabled={!canEdit}
              placeholder="2–3 sentence wrap-up (feeds the next meeting's prep brief)" />
            {canEdit && (
              <div className="mt-3 flex justify-end">
                <button onClick={saveMinutes} disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60">
                  <Save size={14} /> {saving ? 'Saving…' : 'Save minutes'}
                </button>
              </div>
            )}
          </section>
        </div>

        {/* Action points */}
        <div className="space-y-6">
        <section className="h-fit rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ocg-gold">
            <Users size={14} /> Attendees
          </h2>
          <div className="flex flex-wrap gap-2">
            {team.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => toggleMember(m.id)}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  selectedMembers.includes(m.id)
                    ? 'border-ocg-navy bg-ocg-navy text-white'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          {canEdit && (
            <button
              onClick={saveAttendees}
              disabled={savingAttendees}
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60"
            >
              <Save size={14} /> {savingAttendees ? 'Saving...' : 'Save attendees'}
            </button>
          )}
        </section>

        <section className="h-fit rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ocg-gold">
            <ListTodo size={14} /> Action points
          </h2>

          {canEdit && (
            <div className="mb-4 space-y-2 rounded-lg bg-gray-50 p-3">
              <input className="input" placeholder="What was agreed? *" value={newAction.description}
                onChange={(e) => setNewAction((f) => ({ ...f, description: e.target.value }))} />
              <div className="grid grid-cols-2 gap-2">
                <select className="input" value={newAction.owner} onChange={(e) => setNewAction((f) => ({ ...f, owner: e.target.value }))}>
                  <option value="">Owner…</option>
                  {team.map((m) => <option key={m.id} value={m.label}>{m.label}</option>)}
                </select>
                <input type="date" className="input" value={newAction.due_date}
                  onChange={(e) => setNewAction((f) => ({ ...f, due_date: e.target.value }))} />
              </div>
              <button onClick={addAction} disabled={addingAction || !newAction.description.trim()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-ocg-navy px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60">
                <Plus size={14} /> {addingAction ? 'Adding…' : 'Add action point'}
              </button>
            </div>
          )}

          {actions.length === 0 && <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500">No action points recorded yet.</p>}

          <div className="space-y-2.5">
            {openActions.map((a) => (
              <div key={a.id} className="rounded-lg border border-gray-100 p-3">
                <div className="flex items-start gap-2">
                  <CircleDashed size={15} className="mt-0.5 shrink-0 text-amber-500" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800">{a.description}</p>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {a.owner || 'Unassigned'}{a.due_date ? ` · due ${a.due_date}` : ''}
                      {a.ops_task_id && <> · <Link href={`/tasks/${a.ops_task_id}`} className="text-ocg-gold hover:underline">{a.ops_task_id}</Link></>}
                    </p>
                  </div>
                </div>
                {canManageMeeting && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <MiniBtn onClick={() => setActionStatus(a.id, 'done')} tone="green">Done</MiniBtn>
                    <MiniBtn onClick={() => setActionStatus(a.id, 'carried_over')} tone="amber">Carry over</MiniBtn>
                    <MiniBtn onClick={() => setActionStatus(a.id, 'dropped')} tone="gray">Drop</MiniBtn>
                    {!a.ops_task_id && <MiniBtn onClick={() => toTask(a.id)} tone="navy">Make it a task</MiniBtn>}
                  </div>
                )}
              </div>
            ))}
            {closedActions.map((a) => (
              <div key={a.id} className="flex items-start gap-2 rounded-lg border border-gray-50 bg-gray-50/60 p-3 opacity-70">
                <CheckCircle2 size={15} className={`mt-0.5 shrink-0 ${a.status === 'done' ? 'text-emerald-500' : 'text-gray-300'}`} />
                <div>
                  <p className="text-sm text-gray-600 line-through decoration-gray-300">{a.description}</p>
                  <p className="mt-0.5 text-xs text-gray-400">{a.owner || 'Unassigned'} · {a.status}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
        </div>
      </div>
    </div>
  )
}

function MiniBtn({ children, onClick, tone }: { children: React.ReactNode; onClick: () => void; tone: 'green' | 'amber' | 'gray' | 'navy' }) {
  const tones: Record<string, string> = {
    green: 'border-emerald-200 text-emerald-700 hover:bg-emerald-50',
    amber: 'border-amber-200 text-amber-700 hover:bg-amber-50',
    gray: 'border-gray-200 text-gray-500 hover:bg-gray-50',
    navy: 'border-ocg-navy/30 text-ocg-navy hover:bg-slate-50',
  }
  return (
    <button onClick={onClick} className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${tones[tone]}`}>
      {children}
    </button>
  )
}
