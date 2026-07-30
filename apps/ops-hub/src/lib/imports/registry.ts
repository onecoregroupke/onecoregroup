import type { ImportAdapter } from './framework'
import { pettyCashAdapter } from './pettyCashAdapter'
import { makeSchoolLedgerAdapter } from './schoolLedgerAdapter'
import type { School } from '@ocg/db'

export const IMPORT_TYPES = [
  { value: 'petty-cash', label: 'Petty cash (income + expenses)' },
  { value: 'school-ledger', label: 'Student fee ledger (Rayyan / Rhythms)' },
] as const

export function getAdapter(type: string, school?: string): ImportAdapter {
  switch (type) {
    case 'petty-cash':
      return pettyCashAdapter
    case 'school-ledger':
      if (!school) throw new Error('school is required for a school-ledger import')
      return makeSchoolLedgerAdapter(school as School)
    default:
      throw new Error(`Unknown import type: ${type}`)
  }
}
