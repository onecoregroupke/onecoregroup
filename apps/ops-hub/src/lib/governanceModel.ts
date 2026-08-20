import crypto from 'node:crypto'
import type { RecordAccessLevel } from '@ocg/db'

export interface EmployeeScopeActor {
  memberId: string | null
  department: string
  brandIds: string[] | null
  scope: RecordAccessLevel
}

export interface EmployeeScopeTarget {
  memberId: string
  department: string
  brandIds: string[]
}

/** Server routes use this after the module permission check. */
export function canAccessEmployee(actor: EmployeeScopeActor, target: EmployeeScopeTarget): boolean {
  if (actor.scope === 'group') return true
  if (actor.scope === 'own') return actor.memberId !== null && actor.memberId === target.memberId
  const brandOverlap = actor.brandIds === null || target.brandIds.some((brandId) => actor.brandIds?.includes(brandId))
  if (!brandOverlap) return false
  if (actor.scope === 'management') return true
  return Boolean(actor.department) && actor.department.toLowerCase() === target.department.toLowerCase()
}

export interface AuthorityGrant {
  authority_action: string
  brand_id: string | null
  operational_area: string
  active: boolean
  effective_from: string
  effective_until: string | null
}

/** Capability is deliberately absent from this signature: skill never grants
 * approval/posting authority. */
export function hasAuthority(
  grants: AuthorityGrant[],
  action: string,
  opts: { brandId?: string | null; operationalArea?: string; onDate?: string } = {},
): boolean {
  const date = opts.onDate ?? new Date().toISOString().slice(0, 10)
  return grants.some((grant) =>
    grant.active &&
    grant.authority_action === action &&
    (!grant.brand_id || !opts.brandId || grant.brand_id === opts.brandId) &&
    (!grant.operational_area || !opts.operationalArea || grant.operational_area === opts.operationalArea) &&
    grant.effective_from <= date &&
    (!grant.effective_until || grant.effective_until >= date),
  )
}

export type KnowledgeSourceClass = 'live' | 'historical' | 'legacy' | 'reference'

/** Historical/reference material can never become active policy on ingestion. */
export function initialKnowledgeStatus(sourceClass: KnowledgeSourceClass): 'draft' | 'legacy' {
  return sourceClass === 'live' ? 'draft' : 'legacy'
}

export type HistoricalImportState =
  | 'uploaded' | 'parsed' | 'mapping_required' | 'validation_failed'
  | 'ready_for_review' | 'approved' | 'posted' | 'reconciled' | 'locked' | 'cancelled'

const IMPORT_TRANSITIONS: Record<HistoricalImportState, HistoricalImportState[]> = {
  uploaded: ['parsed', 'cancelled'],
  parsed: ['mapping_required', 'validation_failed', 'ready_for_review', 'cancelled'],
  mapping_required: ['parsed', 'ready_for_review', 'cancelled'],
  validation_failed: ['parsed', 'mapping_required', 'cancelled'],
  ready_for_review: ['approved', 'mapping_required', 'validation_failed', 'cancelled'],
  approved: ['posted', 'ready_for_review', 'cancelled'],
  posted: ['reconciled'],
  reconciled: ['locked'],
  locked: [],
  cancelled: [],
}

export function assertImportTransition(from: HistoricalImportState, to: HistoricalImportState): void {
  if (!IMPORT_TRANSITIONS[from].includes(to)) throw new Error(`Historical import cannot move from ${from} to ${to}`)
}

export function canApproveImport(input: { fatalExceptions: number; openErrors: number; validRows: number }): boolean {
  return input.fatalExceptions === 0 && input.openErrors === 0 && input.validRows > 0
}

export function canLockImport(input: { status: string; failedReconciliations: number; pendingReconciliations: number }): boolean {
  return input.status === 'reconciled' && input.failedReconciliations === 0 && input.pendingReconciliations === 0
}

export function importIdempotencyKey(input: {
  brandId: string | null
  importType: string
  fileHash: string
  periodStart?: string | null
  periodEnd?: string | null
}): string {
  const source = [input.brandId ?? 'group', input.importType, input.fileHash, input.periodStart ?? '', input.periodEnd ?? ''].join('|')
  return crypto.createHash('sha256').update(source).digest('hex')
}

