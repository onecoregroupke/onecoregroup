'use client'

import { useEffect, useRef, useState } from 'react'
import {
  CheckCircle2, Circle, Clock, ClipboardList, FileText, Loader2, MapPin, Paperclip,
  RefreshCcw, Repeat, ShieldCheck, SkipForward, StickyNote,
} from 'lucide-react'
import { api } from '@/lib/apiClient'
import { describeReviewState } from '@/lib/reviewAuthority'
import {
  checklistProgress, dutyBodyMode, isOccurrenceSettled, progressLabel,
  type ChecklistItem, type DutyDefinitionDto, type OccurrenceDto,
} from '@/lib/dutyDetail'

// =============================================================================
// THE duty detail. One representation of a duty and its checklist, used by
// My Work, the Calendar's duty drawer and Duty Management, so the employee's
// view and the manager's view cannot drift apart again.
//
// Management wraps these with its own configuration controls; nothing in here
// can change a definition. Working an occurrence writes that DATE's result only.
// =============================================================================

/** "Every day · due 10:00 · Compound". */
export function DutyFacts({ frequency, timeOfDay, dueAt, location, dutyKind, className = '' }: {
  frequency: string
  timeOfDay?: string
  dueAt?: string | null
  location?: string
  dutyKind?: string
  className?: string
}) {
  const due = dueAt
    ? new Date(dueAt).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' })
    : timeOfDay
  return (
    <p className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 ${className}`}>
      {frequency && <span className="inline-flex items-center gap-1"><Repeat size={12} /> {frequency}</span>}
      {due && <span className="inline-flex items-center gap-1"><Clock size={12} /> due {due}</span>}
      {location && <span className="inline-flex items-center gap-1"><MapPin size={12} /> {location}</span>}
      {dutyKind && dutyKind !== 'task' && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium capitalize text-gray-500">{dutyKind}</span>}
    </p>
  )
}

/** "3 of 6" with a bar — the same count the calendar chip shows. */
export function ChecklistProgressBar({ done, total, settled = false }: { done: number; total: number; settled?: boolean }) {
  if (total === 0) return null
  const pct = Math.round((done / total) * 100)
  return (
    <div className="flex items-center gap-2" aria-label={`${progressLabel(done, total)} checklist items completed`}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
        <div className={`h-full rounded-full ${done === total ? 'bg-emerald-500' : settled ? 'bg-gray-400' : 'bg-ocg-gold'}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="shrink-0 text-xs font-medium tabular-nums text-gray-600">{progressLabel(done, total)}</span>
    </div>
  )
}

/**
 * Every checklist item, in definition order, with its hint and whether it is
 * optional. With `checked` it shows a date's state; without, the bare definition.
 */
export function DutyChecklist({ items, checked, editable = false, onToggle, requiresChecklist = false }: {
  items: ChecklistItem[]
  checked?: Record<string, boolean>
  editable?: boolean
  onToggle?: (itemId: string, value: boolean) => void
  requiresChecklist?: boolean
}) {
  const optional = items.filter((item) => !item.required).length
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
        Checklist · {items.length} {items.length === 1 ? 'item' : 'items'}
        <span className="ml-1 font-normal normal-case tracking-normal text-gray-400">
          {optional === 0 ? '· all required' : `· ${items.length - optional} required, ${optional} optional`}
          {requiresChecklist && optional === 0 ? ' before the duty can be marked done' : ''}
        </span>
      </p>
      <ol className="space-y-1">
        {items.map((item, index) => {
          const isChecked = !!checked?.[item.id]
          const body = (
            <span className="min-w-0 flex-1">
              <span className={`block text-sm ${isChecked ? 'text-gray-500 line-through decoration-gray-300' : 'text-gray-800'}`}>
                <span className="mr-1.5 tabular-nums text-gray-400">{index + 1}.</span>{item.label}
                {!item.required && <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 align-middle text-[10px] font-medium text-gray-500">Optional</span>}
              </span>
              {item.hint && <span className="mt-0.5 block text-xs leading-relaxed text-gray-500">{item.hint}</span>}
            </span>
          )
          if (!checked) {
            return (
              <li key={item.id} className="flex items-start gap-2 rounded-lg px-2 py-1.5">
                <ClipboardList size={14} className="mt-0.5 shrink-0 text-gray-300" />
                {body}
              </li>
            )
          }
          return (
            <li key={item.id}>
              <label className={`flex items-start gap-2.5 rounded-lg px-2 py-1.5 ${editable ? 'cursor-pointer hover:bg-gray-50' : ''}`}>
                <input
                  type="checkbox"
                  disabled={!editable}
                  checked={isChecked}
                  onChange={(e) => onToggle?.(item.id, e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[#1a1a2e] disabled:opacity-70"
                />
                {body}
              </label>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/** Description and instructions — the whole body when a duty has no checklist. */
function DutyText({ description, instructions }: { description: string; instructions: string }) {
  if (!description && !instructions) return null
  return (
    <div className="space-y-2">
      {description && <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{description}</p>}
      {instructions && (
        <div className="rounded-lg bg-gray-50 p-3">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Instructions</p>
          <p className="whitespace-pre-wrap text-xs leading-relaxed text-gray-600">{instructions}</p>
        </div>
      )}
    </div>
  )
}

/** The definition alone, for Duty Management's preview. */
export function DutyDefinitionPreview({ definition }: { definition: DutyDefinitionDto }) {
  const flags = [
    definition.requiresChecklist ? 'Checklist required' : '',
    definition.requiresNote ? 'Note required' : '',
    definition.requiresProof ? 'Evidence required' : '',
    definition.requiresApproval ? 'Manager review' : '',
  ].filter(Boolean)
  return (
    <div className="space-y-3">
      <DutyFacts frequency={definition.frequency} timeOfDay={definition.timeOfDay} location={definition.location} dutyKind={definition.dutyKind} />
      {flags.length > 0 && (
        <p className="flex flex-wrap gap-1.5">
          {flags.map((flag) => <span key={flag} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">{flag}</span>)}
        </p>
      )}
      <DutyText description={definition.description} instructions={definition.instructions} />
      {definition.checklist.length > 0
        ? <DutyChecklist items={definition.checklist} requiresChecklist={definition.requiresChecklist} />
        : dutyBodyMode(definition) === 'empty' && <p className="text-xs text-gray-400">No checklist or instructions configured.</p>}
    </div>
  )
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

/**
 * One occurrence — read or worked.
 *
 * Ticks save themselves (as that date's progress) a moment after the last
 * change, so leaving the page or closing the calendar drawer never loses them.
 * Marking done / not done is explicit and is where requirements are enforced;
 * the server re-checks everything and its problem list is shown verbatim.
 */
export function DutyWorkPanel({ occurrence, readOnly = false, onBehalf = false, onChanged }: {
  occurrence: OccurrenceDto
  readOnly?: boolean
  /** Working someone else's occurrence under a duty edit grant. */
  onBehalf?: boolean
  /** Called after the server accepted a change, so the host can reload. */
  onChanged?: () => void | Promise<void>
}) {
  const [checked, setChecked] = useState<Record<string, boolean>>(occurrence.checked)
  const [note, setNote] = useState(occurrence.note)
  const [attachments, setAttachments] = useState(occurrence.requiresProof && occurrence.status === 'done' ? 1 : 0)
  const [busy, setBusy] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [problems, setProblems] = useState<string[]>([])

  const checkedRef = useRef(checked)
  const noteRef = useRef(note)
  const dirty = useRef(false)
  const inFlight = useRef(false)
  const queued = useRef(false)
  const timer = useRef<number | null>(null)

  // Adopt the server's copy after a reload, unless the person has unsaved ticks.
  useEffect(() => {
    if (dirty.current || inFlight.current) return
    checkedRef.current = occurrence.checked
    noteRef.current = occurrence.note
    setChecked(occurrence.checked)
    setNote(occurrence.note)
  }, [occurrence])

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current) }, [])

  const settled = isOccurrenceSettled(occurrence.status)
  const done = occurrence.status === 'done'
  const editable = !readOnly && !settled
  const progress = checklistProgress(occurrence.checklist, checked)
  const review = describeReviewState(occurrence)
  const mode = dutyBodyMode(occurrence)

  function payload(status: string) {
    return {
      duty_id: occurrence.dutyId,
      assignee_id: occurrence.assigneeId,
      date: occurrence.date,
      status,
      note: noteRef.current,
      attachment_count: attachments,
      checklist: Object.fromEntries(
        occurrence.checklist.map((item) => [item.id, { checked: !!checkedRef.current[item.id] }]),
      ),
    }
  }

  async function saveProgress(): Promise<void> {
    if (inFlight.current) { queued.current = true; return }
    inFlight.current = true
    setSaveState('saving')
    const { ok, data } = await api<{ error?: string; problems?: string[] }>('/api/duties/complete', {
      method: 'POST',
      body: JSON.stringify(payload('pending')),
    })
    inFlight.current = false
    if (!ok) {
      setSaveState('error')
      setProblems(data?.problems ?? [data?.error ?? 'Progress could not be saved.'])
      return
    }
    if (queued.current) {
      queued.current = false
      return saveProgress()
    }
    dirty.current = false
    setProblems([])
    setSaveState('saved')
    await onChanged?.()
  }

  function scheduleSave() {
    dirty.current = true
    setSaveState('idle')
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => { timer.current = null; void saveProgress() }, 600)
  }

  function toggle(itemId: string, value: boolean) {
    const next = { ...checkedRef.current, [itemId]: value }
    checkedRef.current = next
    setChecked(next)
    scheduleSave()
  }

  async function submit(status: 'done' | 'skipped' | 'pending') {
    if (timer.current) { window.clearTimeout(timer.current); timer.current = null }
    setBusy(true)
    setProblems([])
    const { ok, data } = await api<{ error?: string; problems?: string[] }>('/api/duties/complete', {
      method: 'POST',
      body: JSON.stringify(payload(status)),
    })
    setBusy(false)
    if (!ok) {
      setProblems(data?.problems ?? [data?.error ?? 'Could not save.'])
      return
    }
    dirty.current = false
    setSaveState('idle')
    await onChanged?.()
  }

  return (
    <div className="space-y-4">
      <DutyFacts
        frequency={occurrence.frequency}
        timeOfDay={occurrence.timeOfDay}
        dueAt={occurrence.dueAt}
        location={occurrence.location}
        dutyKind={occurrence.dutyKind}
      />

      <DutyText description={occurrence.description} instructions={occurrence.instructions} />

      {mode === 'checklist' && (
        <div className="space-y-2.5 rounded-xl border border-gray-100 bg-white p-3">
          <ChecklistProgressBar done={progress.done} total={progress.total} settled={settled} />
          <DutyChecklist
            items={occurrence.checklist}
            checked={checked}
            editable={editable}
            onToggle={toggle}
            requiresChecklist={occurrence.requiresChecklist}
          />
          {!readOnly && (
            <p className="flex items-center gap-1.5 text-[11px] text-gray-400">
              {saveState === 'saving' && <><Loader2 size={11} className="animate-spin" /> Saving progress for {occurrence.date}…</>}
              {saveState === 'saved' && <><CheckCircle2 size={11} className="text-emerald-500" /> Progress saved for {occurrence.date}</>}
              {saveState === 'error' && <span className="text-red-600">Progress not saved — tick again or use the buttons below.</span>}
              {saveState === 'idle' && (settled
                ? `Recorded for ${occurrence.date}. Reopen it to change the ticks.`
                : `Ticks are saved for ${occurrence.date} only; the duty itself is unchanged.`)}
            </p>
          )}
        </div>
      )}
      {mode === 'empty' && <p className="text-xs text-gray-400">No checklist or instructions have been configured for this duty.</p>}

      {(editable || note) && (
        <label className="block">
          <span className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            <StickyNote size={11} /> Note {occurrence.requiresNote && <span className="text-red-500">· required</span>}
          </span>
          <textarea
            className="input min-h-[64px]"
            disabled={!editable}
            value={note}
            onChange={(e) => { noteRef.current = e.target.value; setNote(e.target.value) }}
            onBlur={() => { if (editable && note !== occurrence.note) scheduleSave() }}
            placeholder="What was done, and anything the manager should know."
          />
        </label>
      )}

      {occurrence.requiresProof && (
        <label className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <Paperclip size={13} className="shrink-0" />
          <input
            type="checkbox"
            disabled={!editable}
            checked={attachments > 0}
            onChange={(e) => setAttachments(e.target.checked ? 1 : 0)}
            className="h-4 w-4 accent-[#b07a00]"
          />
          <span>Evidence attached (photo or document handed to the manager)</span>
        </label>
      )}

      {/* §8: a duty that requires a specific form is completed by that form, not a tick. */}
      {occurrence.requiredFormTemplateId && !occurrence.formSubmissionId && (
        <p className="flex items-start gap-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
          <FileText size={13} className="mt-0.5 shrink-0" />
          <span>
            This duty is completed by submitting its form.{' '}
            <a href={`/forms?template=${occurrence.requiredFormTemplateId}&duty=${occurrence.dutyId}&date=${occurrence.date}`} className="font-medium underline">
              Open the form
            </a>{' '}
            — the duty is marked done once the form is in.
          </span>
        </p>
      )}

      {review.detail && (
        <p className={`flex items-start gap-1.5 rounded-lg px-3 py-2 text-xs ${
          review.tone === 'reopened' ? 'bg-red-50 text-red-700'
            : review.tone === 'accepted' ? 'bg-emerald-50 text-emerald-800'
              : 'bg-amber-50 text-amber-800'
        }`}>
          <ShieldCheck size={13} className="mt-0.5 shrink-0" /> {review.detail}
        </p>
      )}

      {problems.length > 0 && (
        <ul className="space-y-1 rounded-lg bg-red-50 p-2.5 text-xs text-red-700">
          {problems.map((p) => <li key={p}>· {p}</li>)}
        </ul>
      )}

      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          {!settled && (
            <>
              <button
                onClick={() => submit('done')}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
              >
                <CheckCircle2 size={15} /> {busy ? 'Saving…' : 'Mark done'}
              </button>
              <button
                onClick={() => submit('skipped')}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600 hover:border-gray-300 disabled:opacity-60"
              >
                <SkipForward size={15} /> Not done today
              </button>
            </>
          )}
          {settled && (
            <button
              onClick={() => submit('pending')}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600 hover:border-gray-300 disabled:opacity-60"
            >
              <RefreshCcw size={14} /> {busy ? 'Reopening…' : done ? 'Reopen (undo done)' : 'Reopen (undo not done)'}
            </button>
          )}
          {onBehalf && <span className="text-xs text-amber-700">Recorded as on behalf of {occurrence.assigneeName || 'the assignee'}.</span>}
        </div>
      )}
    </div>
  )
}

/** The small status mark used in list headers. */
export function DutyStatusIcon({ status }: { status: string }) {
  if (status === 'done') return <CheckCircle2 size={20} className="text-emerald-600" />
  if (status === 'skipped') return <SkipForward size={18} className="text-gray-400" />
  return <Circle size={20} className="text-gray-300" />
}
