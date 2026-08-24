// Who may countersign whose work (§§12–17). Pure rules — no I/O — so the API
// route, the review queue and the tests all reach the same verdict.
//
// Two review surfaces exist and they must not disagree:
//   • duty occurrences  — ocg_daily_duty_logs, template reviewer = ocg_daily_duties.reviewer_id
//   • task completions  — ops_tasks,           task reviewer     = ops_tasks.reviewer_id
//
// Both carry the same semantics, expressed once here:
//
//   reviewer_id IS NOT NULL → ONLY that team member countersigns. Not the
//     employee's line manager, not another brand manager, not the founding
//     admin. A named countersignature that anyone senior could give is not a
//     countersignature; it is a rubber stamp with a name printed on it.
//
//   reviewer_id IS NULL     → any manager holding the review capability, within
//     the brand scope of the work.
//
// And, in both cases, never the person who did the work.

import type { PermissionsMap, BrandAccessMap } from '@ocg/db'
import { allowedBrands } from './permissions'
import { dutyCan, type DutyActor, type DutyScope } from './dutyModel'

/** Why a review was refused. `null` reason means it was allowed. */
export type ReviewRefusal =
  | 'not_a_reviewer'      // no review capability at all
  | 'named_reviewer'      // someone else is the named countersignatory
  | 'self_review'         // you did this work
  | 'out_of_scope'        // the work belongs to a brand you do not manage
  | 'no_identity'         // the account is not linked to a team-member record

export interface ReviewVerdict {
  allowed: boolean
  refusal: ReviewRefusal | null
  /** Safe to surface to the caller — never leaks who the named reviewer is. */
  message: string
}

const ALLOW: ReviewVerdict = { allowed: true, refusal: null, message: '' }

const REFUSALS: Record<ReviewRefusal, string> = {
  not_a_reviewer: 'You do not have permission to review submitted work.',
  named_reviewer: 'This submission is reserved for its named reviewer.',
  self_review: 'You cannot review your own work.',
  out_of_scope: 'This work belongs to a brand you do not manage.',
  no_identity: 'Your sign-in is not linked to a team-member record, so you cannot review work.',
}

function refuse(refusal: ReviewRefusal): ReviewVerdict {
  return { allowed: false, refusal, message: REFUSALS[refusal] }
}

/** The person attempting the review. `teamMemberId` is the stable identity —
 *  display names are never the primary key of an authorization decision (§13). */
export interface Reviewer {
  teamMemberId: string | null
  /** Display name, used ONLY as a secondary self-review guard for legacy rows
   *  whose assignee_id was never populated. Never used to grant. */
  name?: string
  permissions: PermissionsMap | null
  brandAccess: BrandAccessMap | null
}

/** The submission being reviewed. */
export interface ReviewSubject {
  /** ocg_daily_duties.reviewer_id / ops_tasks.reviewer_id. null = any eligible manager. */
  reviewerId: string | null
  /** Who the work belongs to. */
  submitterMemberId: string | null
  /** Legacy fallback for rows recorded before assignee ids were stored. */
  submitterName?: string
  /** Brand the work sits under. null = group-level. */
  brandId: string | null
}

function isSelf(reviewer: Reviewer, subject: ReviewSubject): boolean {
  if (reviewer.teamMemberId && subject.submitterMemberId) {
    return reviewer.teamMemberId === subject.submitterMemberId
  }
  // Only reached when the occurrence predates stable assignee ids. A name match
  // can produce a false positive (two people, one name) — refusing to let
  // someone sign off work that MIGHT be theirs is the correct way to be wrong.
  const a = (reviewer.name ?? '').trim().toLowerCase()
  const b = (subject.submitterName ?? '').trim().toLowerCase()
  return !!a && a === b
}

/**
 * Whether `reviewer` may accept or reopen `subject`.
 *
 * Order matters: identity first, then the named-reviewer reservation, then
 * self-review, then scope. A named reviewer reviewing their own work is still
 * refused — §13 admits no exception, elevated or otherwise.
 */
export function canReview(reviewer: Reviewer, subject: ReviewSubject): ReviewVerdict {
  const actor: DutyActor = {
    permissions: reviewer.permissions,
    brandAccess: reviewer.brandAccess,
    teamMemberId: reviewer.teamMemberId,
  }

  if (subject.reviewerId) {
    // A named countersignatory must be identifiable. An account with no
    // team-member row can never BE the named reviewer.
    if (!reviewer.teamMemberId) return refuse('no_identity')
    if (reviewer.teamMemberId !== subject.reviewerId) return refuse('named_reviewer')
    // The named reviewer still cannot sign their own work.
    if (isSelf(reviewer, subject)) return refuse('self_review')
    return ALLOW
  }

  if (!dutyCan(actor, 'review')) return refuse('not_a_reviewer')
  if (isSelf(reviewer, subject)) return refuse('self_review')

  const scope = reviewScope(actor)
  if (scope.kind === 'own') return refuse('not_a_reviewer')
  if (scope.kind === 'brands') {
    // A brand-scoped manager reviews their brands' work only, and never
    // group-level (brand-less) work — that needs unrestricted oversight.
    if (!subject.brandId || !scope.brandIds.includes(subject.brandId)) return refuse('out_of_scope')
  }
  return ALLOW
}

/**
 * The brand horizon within which an unnamed review may be performed.
 *
 * The CAPABILITY decides whether this person reviews at all; the BRAND ACCESS
 * decides where. Deliberately not derived from dutyScope(), which additionally
 * demands `duties_all` — a reviewer granted `duties_review` alone would
 * otherwise scope to nothing and the grant would be inert.
 *
 * 'own' here means "no reviewing", not "review my own work".
 */
export function reviewScope(actor: DutyActor): DutyScope {
  if (actor.permissions === null) return { kind: 'all' }
  if (!dutyCan(actor, 'review')) return { kind: 'own' }
  const scoped =
    allowedBrands(actor.brandAccess, 'duties_review') ??
    allowedBrands(actor.brandAccess, 'duties_all') ??
    allowedBrands(actor.brandAccess, 'duties')
  return scoped === null ? { kind: 'all' } : { kind: 'brands', brandIds: scoped }
}

/**
 * §16: "A named reviewer should see the pending items assigned to them. Another
 * manager should not see those as actionable items simply because they have
 * generic management access."
 *
 * The queue is filtered with the SAME predicate that gates the write, so an item
 * can never be listed as actionable and then refused on click.
 */
export function actionableReviews<T extends ReviewSubject>(
  reviewer: Reviewer,
  submissions: T[],
): T[] {
  return submissions.filter((s) => canReview(reviewer, s).allowed)
}

/**
 * What the employee is told about their own submission (§15). Deliberately
 * separate from the authorization rules: this is presentation, and it names the
 * reviewer, which the refusal messages must not.
 */
export interface ReviewStatusView {
  label: string
  detail: string
  tone: 'pending' | 'accepted' | 'reopened' | 'none'
}

export function describeReviewState(input: {
  reviewState: string
  reviewerName?: string | null
  reviewedBy?: string | null
  reviewedAt?: string | null
  reviewComment?: string | null
}): ReviewStatusView {
  const when = input.reviewedAt ? formatReviewDate(input.reviewedAt) : ''
  switch (input.reviewState) {
    case 'pending':
      return {
        label: 'Pending review',
        detail: input.reviewerName ? `Awaiting review by ${input.reviewerName}` : 'Awaiting manager review',
        tone: 'pending',
      }
    case 'accepted':
      return {
        label: 'Countersigned',
        detail: [input.reviewedBy ? `Reviewed by ${input.reviewedBy}` : 'Reviewed', when].filter(Boolean).join(' · '),
        tone: 'accepted',
      }
    case 'reopened':
      return {
        label: 'Reopened',
        detail: input.reviewComment
          ? `${input.reviewedBy || 'The reviewer'} requested a correction: ${input.reviewComment}`
          : `${input.reviewedBy || 'The reviewer'} asked for this to be redone.`,
        tone: 'reopened',
      }
    default:
      return { label: '', detail: '', tone: 'none' }
  }
}

/** "24 Aug 2026 · 10:15" in Kenyan time — the countersign stamp (§14). */
export function formatReviewDate(iso: string): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const d = new Date(t)
  const date = d.toLocaleDateString('en-KE', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Nairobi',
  })
  const time = d.toLocaleTimeString('en-KE', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Africa/Nairobi',
  })
  return `${date} · ${time}`
}

/** A reopen must say why (§16 "Reopen should require a useful comment/reason"). */
export function validateReopenComment(comment: string): string | null {
  const text = (comment ?? '').trim()
  if (text.length < 3) return 'Say what needs correcting so the employee knows what to do next.'
  return null
}

// ─── Task status transitions (§17) ──────────────────────────────────────────
//
// ops_tasks carries the same reviewer_id as a duty, and migration 057 added the
// Submitted → Under Review → (Completed | Reopened) track for tasks that set
// requires_approval. Reviewer semantics must therefore match the duty rules
// rather than contradict them — but nothing wider than the schema already
// intends is added here.

const REVIEW_PENDING = new Set(['Submitted', 'Under Review'])
const SIGNED_OFF = new Set(['Completed', 'Approved'])

/**
 * Whether moving a task from `from` to `to` is a countersign decision rather
 * than ordinary progress.
 *
 * Two cases, both of which the assignee must not perform unaided:
 *   • signing off work that is sitting in the review queue;
 *   • closing a task whose template requires approval (the assignee may reach
 *     'Submitted', never 'Completed' — statusAfterSubmission() already says so);
 *   • reopening — only a reviewer sends work back.
 */
export function isReviewDecision(
  from: string,
  to: string,
  requiresApproval: boolean,
): boolean {
  if (to === 'Reopened') return true
  if (SIGNED_OFF.has(to) && REVIEW_PENDING.has(from)) return true
  if (SIGNED_OFF.has(to) && requiresApproval) return true
  return false
}
