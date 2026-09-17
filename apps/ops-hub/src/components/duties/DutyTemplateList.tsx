'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Pencil } from 'lucide-react'
import type { DutyDefinitionDto } from '@/lib/dutyDetail'
import { DutyDefinitionPreview } from './DutyDetail'
import { DutyBuilder, type BuilderLists, type ChecklistDraft, type DutyDraft } from './DutyBuilder'
import { DutyRowControls } from './DutyRowControls'

export interface DutyTemplateEntry {
  definition: DutyDefinitionDto
  draft: DutyDraft
  checklist: ChecklistDraft[]
}

/**
 * Duty Management's list of recurring definitions.
 *
 * The preview is the SAME definition view the employee's duty detail is built
 * from, so what a manager configures is exactly what the person reads. Editing,
 * pausing and ending wrap around it here and exist nowhere else.
 */
export function DutyTemplateList({ templates, lists, canEdit }: {
  templates: DutyTemplateEntry[]
  lists: BuilderLists
  canEdit: boolean
}) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  if (templates.length === 0) {
    return <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">No duties set up yet.</p>
  }

  return (
    <ul className="space-y-2">
      {templates.map(({ definition: d, draft, checklist }) => {
        const open = openId === d.id
        const editing = editingId === d.id
        return (
          <li key={d.id} className="rounded-lg border border-gray-100">
            <div className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <button type="button" onClick={() => setOpenId(open ? null : d.id)} className="min-w-0 flex-1 text-left" aria-expanded={open}>
                <span className="block truncate font-medium text-gray-800">
                  {d.title}
                  {!d.active && <span className="ml-2 text-xs font-normal text-gray-400">· ended</span>}
                  {d.paused && <span className="ml-2 text-xs font-normal text-amber-600">· paused</span>}
                </span>
                <span className="block truncate text-xs text-gray-400">
                  {d.targetLabel} · {d.frequency}
                  {d.timeOfDay ? ` · ${d.timeOfDay}` : ''}
                  {d.checklist.length > 0 ? ` · ${d.checklist.length} checklist items` : ''}
                  {d.requiresApproval ? ' · reviewed' : ''}
                </span>
              </button>
              <span className="flex shrink-0 items-center gap-1">
                <button type="button" onClick={() => setOpenId(open ? null : d.id)}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-500 hover:border-ocg-gold/40">
                  {open ? <>Hide <ChevronUp size={13} /></> : <>Preview <ChevronDown size={13} /></>}
                </button>
                {canEdit && d.active && (
                  <button type="button" title="Edit definition"
                    onClick={() => { setEditingId(editing ? null : d.id); setOpenId(null) }}
                    className="rounded p-1 text-gray-400 hover:text-ocg-navy">
                    <Pencil size={13} />
                  </button>
                )}
                {canEdit && <DutyRowControls id={d.id} paused={d.paused} />}
              </span>
            </div>

            {open && !editing && (
              <div className="border-t border-gray-100 px-4 py-3">
                <p className="mb-2 text-[11px] text-gray-400">This is exactly what the assignee sees in My Work and on the Calendar.</p>
                <DutyDefinitionPreview definition={d} />
              </div>
            )}

            {editing && (
              <div className="border-t border-gray-100 p-2">
                <DutyBuilder lists={lists} initial={draft} checklist={checklist} onDone={() => setEditingId(null)} />
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
