import type { SchoolAssessmentRow } from '@ocg/db'

export type TranscriptTerm = {
  key: string
  label: string
  rows: SchoolAssessmentRow[]
}

/**
 * Group a student's assessments into transcript terms (academic year + term),
 * newest first, subjects alphabetical within a term. Pure — used by the Rhythms
 * and Darul transcripts (server) and covered by unit tests.
 */
export function groupAssessmentsByTerm(assessments: SchoolAssessmentRow[]): TranscriptTerm[] {
  const groups = new Map<string, SchoolAssessmentRow[]>()
  for (const a of assessments) {
    const year = a.academic_year?.trim() || '—'
    const term = a.term?.trim() || '—'
    const key = `${year}||${term}`
    groups.set(key, [...(groups.get(key) ?? []), a])
  }
  return [...groups.entries()]
    .map(([key, rows]) => {
      const [year, term] = key.split('||')
      const label = [year !== '—' ? year : '', term !== '—' ? term : ''].filter(Boolean).join(' · ') || 'Unassigned term'
      return {
        key,
        label,
        rows: [...rows].sort((a, b) => a.subject.localeCompare(b.subject)),
      }
    })
    .sort((a, b) => b.key.localeCompare(a.key))
}

/** Display a score as "72/100", or the status when there is no numeric mark. */
export function formatMark(a: Pick<SchoolAssessmentRow, 'score' | 'max_score' | 'grade' | 'status'>): string {
  if (a.score != null) return `${a.score}/${a.max_score}${a.grade ? ` (${a.grade})` : ''}`
  if (a.grade) return a.grade
  if (a.status && a.status !== 'recorded') return a.status
  return '—'
}
