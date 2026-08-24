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
  /** own | department | entity | group (migration 067). */
  authority_scope?: string | null
}

/** How far an authority reaches, weakest first (§35). */
export type AuthorityScope = 'own' | 'department' | 'entity' | 'group'

const AUTHORITY_SCOPE_RANK: Record<AuthorityScope, number> = {
  own: 0, department: 1, entity: 2, group: 3,
}

function scopeRank(value: string | null | undefined): number {
  return AUTHORITY_SCOPE_RANK[(value ?? 'own') as AuthorityScope] ?? 0
}

/**
 * Whether an actor holds `action` authority.
 *
 * Capability is deliberately absent from this signature: skill never grants
 * approval/posting authority.
 *
 * §35: `authority_scope` is stored on every grant and must not be persisted and
 * then ignored. Pass `requiredScope` when the decision has an organisational
 * reach — a group-level document needs group-level authority, and a grant
 * scoped to one entity does not reach it.
 *
 * §36: a grant with `brand_id = NULL` is unrestricted and reaches any brand. A
 * grant naming a brand reaches THAT brand only. Crucially, a brand-specific
 * grant no longer satisfies a request with no brand: the old form asked
 * `!opts.brandId || grant.brand_id === opts.brandId`, so a group-level entry
 * (brand_id NULL) was approvable by every brand approver in the company.
 */
export function hasAuthority(
  grants: AuthorityGrant[],
  action: string,
  opts: {
    brandId?: string | null
    operationalArea?: string
    onDate?: string
    /** The organisational reach this decision needs. Omitted → not checked. */
    requiredScope?: AuthorityScope
  } = {},
): boolean {
  const date = opts.onDate ?? new Date().toISOString().slice(0, 10)
  // `undefined` = the caller does not care about brand. `null` = the subject is
  // explicitly group-level, which only an unrestricted grant reaches.
  const brandChecked = opts.brandId !== undefined

  return grants.some((grant) => {
    if (!grant.active) return false
    if (grant.authority_action !== action) return false
    if (grant.effective_from > date) return false
    if (grant.effective_until && grant.effective_until < date) return false
    if (grant.operational_area && opts.operationalArea && grant.operational_area !== opts.operationalArea) return false

    if (brandChecked && grant.brand_id) {
      // A brand-scoped grant reaches only its own brand — and never group level.
      if (grant.brand_id !== opts.brandId) return false
    }

    if (opts.requiredScope && scopeRank(grant.authority_scope) < scopeRank(opts.requiredScope)) {
      return false
    }
    return true
  })
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

