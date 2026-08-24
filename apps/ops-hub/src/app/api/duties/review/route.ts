import { NextResponse, type NextRequest } from 'next/server'
import { getApiActor } from '@/lib/api-auth'
import { memberForEmail, listTeam } from '@/lib/team'
import {
  reviewDutyOccurrence, pendingReviews, pendingReviewByLogId, DutyReviewStateError,
} from '@/lib/dutyOccurrences'
import { canReview, reviewScope, actionableReviews, validateReopenComment } from '@/lib/reviewAuthority'
import { dutyCan } from '@/lib/dutyModel'
import { auditEvent } from '@/lib/audit'

/**
 * The countersign endpoint (§§12–16).
 *
 * Both verbs run the SAME authorization predicate — canReview() — so an item can
 * never be listed as actionable and then refused, nor refused in the list and
 * accepted by a hand-rolled POST. §12's "bypass the restriction with a direct
 * API request" is closed here, not in the UI.
 */

/** Occurrences this caller may actually decide on. */
export async function GET(req: NextRequest) {
  const actor = await getApiActor(req)
  if (!actor) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const me = await memberForEmail(actor.email)

  const reviewer = {
    teamMemberId: me?.id ?? null,
    name: actor.name,
    permissions: actor.permissions,
    brandAccess: actor.brandAccess,
  }
  const dutyActor = { permissions: actor.permissions, brandAccess: actor.brandAccess, teamMemberId: me?.id ?? null }

  // A named reviewer needs no section grant to see the work reserved for them,
  // so this is NOT gated on dutyCan('review') — the per-item predicate decides.
  const scope = dutyCan(dutyActor, 'review') ? reviewScope(dutyActor) : { kind: 'all' as const }
  const candidates = await pendingReviews(scope)
  const mine = actionableReviews(reviewer, candidates)

  const team = await listTeam()
  const nameById = new Map(team.map((m) => [m.id, m.name]))

  return NextResponse.json({
    ok: true,
    rows: mine.map((r) => ({
      logId: r.log.id,
      dutyTitle: r.duty?.title ?? 'Duty',
      date: r.log.duty_date,
      assigneeName: r.submitterMemberId ? (nameById.get(r.submitterMemberId) ?? '') : '',
      completedBy: r.log.completed_by ?? '',
      completedAt: r.log.completed_at ?? null,
      note: r.log.note ?? '',
      checklistDone: r.log.checklist_done ?? 0,
      checklistTotal: r.log.checklist_total ?? 0,
      evidenceCount: r.log.attachment_count ?? 0,
      formSubmissionId: r.log.form_submission_id ?? null,
      onTime: r.log.completed_on_time ?? null,
      namedReviewer: r.reviewerId ? (nameById.get(r.reviewerId) ?? '') : '',
    })),
  })
}

/** Accept or reopen one occurrence. */
export async function POST(req: NextRequest) {
  const actor = await getApiActor(req)
  if (!actor) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    if (!body?.log_id) return NextResponse.json({ ok: false, error: 'log_id is required' }, { status: 400 })
    const decision = body.decision === 'reopen' ? 'reopen' : 'accept'
    const comment = String(body.comment ?? '')

    const subject = await pendingReviewByLogId(String(body.log_id))
    if (!subject) return NextResponse.json({ ok: false, error: 'Occurrence not found' }, { status: 404 })

    // §48: only work actually awaiting a decision can receive one. Checked here
    // for a clear message, and again inside the transaction under FOR UPDATE,
    // which is the check that is actually race-free.
    if (subject.log.review_state !== 'pending') {
      return NextResponse.json(
        { ok: false, error: `This occurrence is not awaiting review (${subject.log.review_state}).` },
        { status: 409 },
      )
    }

    const me = await memberForEmail(actor.email)
    const verdict = canReview(
      {
        teamMemberId: me?.id ?? null,
        name: actor.name,
        permissions: actor.permissions,
        brandAccess: actor.brandAccess,
      },
      {
        reviewerId: subject.reviewerId,
        submitterMemberId: subject.submitterMemberId,
        submitterName: subject.submitterName,
        brandId: subject.brandId,
      },
    )
    if (!verdict.allowed) {
      return NextResponse.json({ ok: false, error: verdict.message }, { status: 403 })
    }

    // §16: a reopen must tell the employee what to fix.
    if (decision === 'reopen') {
      const problem = validateReopenComment(comment)
      if (problem) return NextResponse.json({ ok: false, error: problem }, { status: 422 })
    }

    const before = subject.log as unknown as Record<string, unknown>
    const row = await reviewDutyOccurrence({
      log_id: String(body.log_id),
      decision,
      comment,
      quality_rating: body.quality_rating ?? null,
      reviewed_by: actor.name || actor.email || actor.userId,
      reviewed_by_id: me?.id ?? null,
    })

    await auditEvent({
      actor,
      action: `duty.review.${decision}`,
      entity_table: 'ocg_daily_duty_logs',
      entity_id: row.id,
      entity_label: `${decision} · ${row.duty_date}`,
      before_data: before,
      after_data: row as unknown as Record<string, unknown>,
    })

    return NextResponse.json({ ok: true, row })
  } catch (e) {
    // A state conflict is the caller's problem, not a server fault.
    if (e instanceof DutyReviewStateError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 409 })
    }
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}
