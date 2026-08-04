import { test } from 'node:test'
import assert from 'node:assert/strict'
import { groupAssessmentsByTerm, formatMark } from './transcript'
import type { SchoolAssessmentRow } from '@ocg/db'

function mk(p: Partial<SchoolAssessmentRow>): SchoolAssessmentRow {
  return {
    id: Math.random().toString(36).slice(2), school: 'rhythms', brand_id: null, student_id: 's1',
    student_admission_no: '', subject: 'Piano', academic_year: '2026', term: 'Term 1',
    assessment_type: 'exam', score: 80, max_score: 100, grade: 'A', status: 'recorded',
    remarks: '', teacher: '', assessed_on: null, recorded_by: '', created_at: '', updated_at: '',
    ...p,
  } as SchoolAssessmentRow
}

test('groups by year+term, newest term first', () => {
  const groups = groupAssessmentsByTerm([
    mk({ academic_year: '2025', term: 'Term 2', subject: 'Theory' }),
    mk({ academic_year: '2026', term: 'Term 1', subject: 'Piano' }),
    mk({ academic_year: '2026', term: 'Term 1', subject: 'Aural' }),
  ])
  assert.equal(groups.length, 2)
  assert.equal(groups[0].label, '2026 · Term 1')
  assert.equal(groups[1].label, '2025 · Term 2')
})

test('sorts subjects alphabetically within a term', () => {
  const [group] = groupAssessmentsByTerm([
    mk({ subject: 'Theory' }), mk({ subject: 'Aural' }), mk({ subject: 'Piano' }),
  ])
  assert.deepEqual(group.rows.map((r) => r.subject), ['Aural', 'Piano', 'Theory'])
})

test('blank year/term falls into an "Unassigned term" bucket', () => {
  const [group] = groupAssessmentsByTerm([mk({ academic_year: '', term: '' })])
  assert.equal(group.label, 'Unassigned term')
})

test('formatMark prefers a numeric score, then grade, then status', () => {
  assert.equal(formatMark({ score: 72, max_score: 100, grade: 'B', status: 'recorded' }), '72/100 (B)')
  assert.equal(formatMark({ score: null, max_score: 100, grade: 'Distinction', status: 'recorded' }), 'Distinction')
  assert.equal(formatMark({ score: null, max_score: 100, grade: '', status: 'missed' }), 'missed')
  assert.equal(formatMark({ score: null, max_score: 100, grade: '', status: 'recorded' }), '—')
})
