'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ChevronDown, ChevronUp, ShieldCheck } from 'lucide-react'
import { describeReviewState } from '@/lib/reviewAuthority'
import { progressLabel, type OccurrenceDto } from '@/lib/dutyDetail'
import { DutyStatusIcon, DutyWorkPanel } from './DutyDetail'

export type { ChecklistItem, OccurrenceDto } from '@/lib/dutyDetail'

const TONE: Record<string, string> = {
  done: 'border-emerald-200 bg-emerald-50/40',
  skipped: 'border-gray-200 bg-gray-50',
  pending: 'border-gray-100 bg-white',
}

/**
 * One duty occurrence as a card: the header an employee scans, and the shared
 * duty detail (every checklist item, hint, note and action) beneath it.
 *
 * The detail is OPEN by default wherever the person is expected to do the work,
 * so the responsibilities are on the page rather than behind a chevron. Lists
 * that are for scanning (a manager's day across people, completed history) can
 * start it closed; one click on the labelled toggle opens it.
 *
 * The requirement checks are ALSO enforced server-side (dutyModel
 * `validateDutyCompletion`) — the UI mirrors them, the server is the authority.
 */
export function DutyOccurrenceCard({
  occurrence,
  readOnly = false,
  showAssignee = false,
  defaultOpen,
  onBehalf = false,
}: {
  occurrence: OccurrenceDto
  readOnly?: boolean
  showAssignee?: boolean
  /** Defaults to open while the occurrence still needs doing. */
  defaultOpen?: boolean
  /** A manager working someone else's occurrence. */
  onBehalf?: boolean
}) {
  const router = useRouter()
  const settled = occurrence.status === 'done' || occurrence.status === 'skipped'
  const [open, setOpen] = useState(defaultOpen ?? !settled)
  const done = occurrence.status === 'done'
  const review = describeReviewState(occurrence)
  const itemCount = occurrence.checklist.length

  return (
    <div className={`rounded-xl border shadow-sm transition-colors ${TONE[occurrence.status] ?? TONE['pending']}`}>
      <div className="flex items-start gap-3 p-4">
        <span className="mt-0.5 shrink-0" aria-label={done ? 'Done' : occurrence.status === 'skipped' ? 'Not done' : 'Not yet done'}>
          <DutyStatusIcon status={occurrence.status} />
        </span>

        <button type="button" onClick={() => setOpen((v) => !v)} className="min-w-0 flex-1 text-left" aria-expanded={open}>
          <span className="flex flex-wrap items-center gap-2">
            <span className={`text-sm font-medium ${done ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
              {occurrence.title}
            </span>
            {occurrence.overdue && (
              <span className="inline-flex items-center gap-1 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-600">
                <AlertTriangle size={10} /> Overdue
              </span>
            )}
            {occurrence.status === 'skipped' && (
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">Not done</span>
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
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">
            {showAssignee && <span className="font-medium text-gray-600">{occurrence.assigneeName || 'Unassigned'}</span>}
            {occurrence.frequency && <span>{occurrence.frequency}</span>}
            {itemCount > 0 && (
              <span className={`font-medium ${occurrence.checklistDone === itemCount ? 'text-emerald-700' : 'text-gray-600'}`}>
                · {progressLabel(occurrence.checklistDone, itemCount)} done
              </span>
            )}
            {occurrence.onTime === false && <span className="text-amber-600">· completed late</span>}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-500 hover:border-ocg-gold/40 hover:text-gray-700"
          aria-expanded={open}
        >
          {open ? <>Hide <ChevronUp size={13} /></> : <>{itemCount > 0 ? `${itemCount} items` : 'Details'} <ChevronDown size={13} /></>}
        </button>
      </div>

      {open && (
        <div className="border-t border-gray-100 px-4 py-4">
          <DutyWorkPanel occurrence={occurrence} readOnly={readOnly} onBehalf={onBehalf} onChanged={() => router.refresh()} />
        </div>
      )}
    </div>
  )
}
