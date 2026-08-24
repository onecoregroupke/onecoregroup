'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  CheckCircle2, Circle, AlertTriangle, Clock, ClipboardList,
  ShieldCheck, Paperclip, ChevronDown, ChevronUp, SkipForward, FileText,
} from 'lucide-react'
import { api } from '@/lib/apiClient'
import { describeReviewState } from '@/lib/reviewAuthority'

export interface ChecklistItem {
  id: string
  label: string
  hint: string
  required: boolean
}

export interface OccurrenceDto {
  dutyId: string
  date: string
  title: string
  description: string
  instructions: string
  dutyKind: string
  priority: string
  category: string
  location: string
  assigneeId: string | null
  assigneeName: string
  dueAt: string | null
  status: string
  overdue: boolean
  onTime: boolean | null
  reviewState: string
  reviewComment: string
  /** The named countersignatory, when the duty reserves one (§12). */
  reviewerName: string
  /** Who actually signed, captured at the time of signing. */
  reviewedBy: string
  reviewedAt: string | null
  /** Set when the duty cannot be completed without a specific form (§8). */
  requiredFormTemplateId: string | null
  formSubmissionId: string | null
  note: string
  checklistDone: number
  checklistTotal: number
  requiresNote: boolean
  requiresProof: boolean
  requiresChecklist: boolean
  requiresApproval: boolean
  checklist: ChecklistItem[]
  /** item_id → checked, from the saved result rows. */
  checked: Record<string, boolean>
}

const TONE: Record<string, string> = {
  done: 'border-emerald-200 bg-emerald-50/40',
  skipped: 'border-gray-200 bg-gray-50',
  pending: 'border-gray-100 bg-white',
}

/**
 * One duty occurrence, with the completion controls its template requires.
 *
 * The requirement checks are ALSO enforced server-side (dutyModel
 * `validateDutyCompletion`) — this UI mirrors them so the person sees what is
 * missing before submitting, but the server is the authority. A 422 carries the
 * full problem list back and it is rendered verbatim.
 */
export function DutyOccurrenceCard({
  occurrence,
  readOnly = false,
  showAssignee = false,
}: {
  occurrence: OccurrenceDto
  readOnly?: boolean
  showAssignee?: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problems, setProblems] = useState<string[]>([])
  const [note, setNote] = useState(occurrence.note)
  const [checked, setChecked] = useState<Record<string, boolean>>(occurrence.checked)
  const [attachments, setAttachments] = useState(occurrence.requiresProof && occurrence.status === 'done' ? 1 : 0)

  const done = occurrence.status === 'done'
  const ticked = occurrence.checklist.filter((i) => checked[i.id]).length
  // A duty that demands a note, a checklist, evidence or a specific form is
  // never satisfiable by the one-click tick (§6B) — the panel is the only route.
  const needsPanel =
    occurrence.requiresNote || occurrence.requiresChecklist || occurrence.requiresProof ||
    !!occurrence.requiredFormTemplateId ||
    occurrence.checklist.length > 0 || occurrence.instructions.length > 0
  const review = describeReviewState(occurrence)

  async function submit(status: 'done' | 'skipped' | 'pending') {
    setBusy(true)
    setProblems([])
    const { ok, data } = await api<{ error?: string; problems?: string[] }>('/api/duties/complete', {
      method: 'POST',
      body: JSON.stringify({
        duty_id: occurrence.dutyId,
        assignee_id: occurrence.assigneeId,
        date: occurrence.date,
        status,
        note,
        attachment_count: attachments,
        checklist: Object.fromEntries(
          occurrence.checklist.map((i) => [i.id, { checked: !!checked[i.id] }]),
        ),
      }),
    })
    setBusy(false)
    if (!ok) {
      setProblems(data?.problems ?? [data?.error ?? 'Could not save.'])
      setOpen(true)
      return
    }
    router.refresh()
  }

  return (
    <div className={`rounded-xl border shadow-sm transition-colors ${TONE[occurrence.status] ?? TONE['pending']}`}>
      <div className="flex items-start gap-3 p-4">
        <button
          type="button"
          disabled={readOnly || busy}
          onClick={() => (needsPanel && !done ? setOpen(true) : submit(done ? 'pending' : 'done'))}
          className="mt-0.5 shrink-0 disabled:opacity-50"
          aria-label={done ? 'Mark not done' : 'Mark done'}
        >
          {done
            ? <CheckCircle2 size={20} className="text-emerald-600" />
            : <Circle size={20} className="text-gray-300 hover:text-ocg-gold" />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className={`text-sm font-medium ${done ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
              {occurrence.title}
            </p>
            {occurrence.overdue && (
              <span className="inline-flex items-center gap-1 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-600">
                <AlertTriangle size={10} /> Overdue
              </span>
            )}
            {occurrence.dutyKind !== 'task' && (
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium capitalize text-gray-500">
                {occurrence.dutyKind}
              </span>
            )}
            {review.tone === 'pending' && (
              <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                <ShieldCheck size={10} /> {review.label}
              </span>
            )}
            {review.tone === 'accepted' && (
              <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                <ShieldCheck size={10} /> {review.label}
              </span>
            )}
            {review.tone === 'reopened' && (
              <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-600">{review.label}</span>
            )}
          </div>

          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-400">
            {showAssignee && <span className="font-medium text-gray-500">{occurrence.assigneeName || 'Unassigned'}</span>}
            {occurrence.dueAt && (
              <span className="inline-flex items-center gap-1">
                <Clock size={11} /> due {new Date(occurrence.dueAt).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            {occurrence.location && <span>· {occurrence.location}</span>}
            {occurrence.checklistTotal > 0 && (
              <span className="inline-flex items-center gap-1">
                <ClipboardList size={11} /> {done ? occurrence.checklistDone : ticked}/{occurrence.checklistTotal}
              </span>
            )}
            {occurrence.onTime === false && <span className="text-amber-600">· completed late</span>}
            {occurrence.description && <span className="truncate">· {occurrence.description}</span>}
          </p>

          {/* §15: the employee must be able to read what happened and what to
              do next, without decoding a state word. */}
          {review.detail && (
            <p className={`mt-1.5 rounded px-2 py-1 text-xs ${
              review.tone === 'reopened' ? 'bg-red-50 text-red-700'
                : review.tone === 'accepted' ? 'bg-emerald-50/70 text-emerald-800'
                  : 'bg-white/70 text-gray-600'
            }`}>
              {review.detail}
            </p>
          )}
        </div>

        {needsPanel && (
          <button type="button" onClick={() => setOpen((v) => !v)} className="shrink-0 text-gray-300 hover:text-gray-500">
            {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        )}
      </div>

      {open && (
        <div className="space-y-3 border-t border-gray-100 px-4 py-3">
          {occurrence.instructions && (
            <p className="rounded-lg bg-gray-50 p-2.5 text-xs leading-relaxed text-gray-600">{occurrence.instructions}</p>
          )}

          {occurrence.checklist.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                Checklist {occurrence.requiresChecklist && <span className="text-red-500">· all required</span>}
              </p>
              <div className="space-y-1">
                {occurrence.checklist.map((item) => (
                  <label key={item.id} className="flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-gray-50">
                    <input
                      type="checkbox"
                      disabled={readOnly}
                      checked={!!checked[item.id]}
                      onChange={(e) => setChecked((c) => ({ ...c, [item.id]: e.target.checked }))}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-[#1a1a2e]"
                    />
                    <span className="min-w-0">
                      <span className="block text-gray-700">{item.label}</span>
                      {item.hint && <span className="block text-xs text-gray-400">{item.hint}</span>}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {(occurrence.requiresNote || note) && (
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                Completion note {occurrence.requiresNote && <span className="text-red-500">· required</span>}
              </span>
              <textarea
                className="input min-h-[70px]"
                disabled={readOnly}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What was done, and anything the manager should know."
              />
            </label>
          )}

          {occurrence.requiresProof && (
            <label className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <Paperclip size={13} className="shrink-0" />
              <input
                type="checkbox"
                disabled={readOnly}
                checked={attachments > 0}
                onChange={(e) => setAttachments(e.target.checked ? 1 : 0)}
                className="h-4 w-4 accent-[#b07a00]"
              />
              <span>Evidence attached (photo or document handed to the manager)</span>
            </label>
          )}

          {/* §8: a duty that requires a specific form (a Teacher Daily Diary,
              say) is not satisfiable by a generic tick. The server refuses the
              completion; this states the requirement up front rather than
              letting the person discover it by being rejected. */}
          {occurrence.requiredFormTemplateId && !occurrence.formSubmissionId && (
            <p className="flex items-start gap-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
              <FileText size={13} className="mt-0.5 shrink-0" />
              <span>
                This duty is completed by submitting its form.{' '}
                <a
                  href={`/forms?template=${occurrence.requiredFormTemplateId}&duty=${occurrence.dutyId}&date=${occurrence.date}`}
                  className="font-medium underline"
                >
                  Open the form
                </a>{' '}
                — the duty is marked done once the form is in.
              </span>
            </p>
          )}

          {problems.length > 0 && (
            <ul className="space-y-1 rounded-lg bg-red-50 p-2.5 text-xs text-red-700">
              {problems.map((p) => <li key={p}>· {p}</li>)}
            </ul>
          )}

          {!readOnly && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => submit('done')}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
              >
                <CheckCircle2 size={15} /> {busy ? 'Saving…' : done ? 'Update' : 'Mark done'}
              </button>
              <button
                onClick={() => submit('skipped')}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600 hover:border-gray-300 disabled:opacity-60"
              >
                <SkipForward size={15} /> Not done today
              </button>
              {done && (
                <button
                  onClick={() => submit('pending')}
                  disabled={busy}
                  className="rounded-lg px-3 py-2 text-sm text-gray-400 hover:text-gray-600 disabled:opacity-60"
                >
                  Undo
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
