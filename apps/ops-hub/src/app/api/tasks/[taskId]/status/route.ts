import { NextResponse, type NextRequest } from 'next/server'
import { getApiActor } from '@/lib/api-auth'
import { getTask, setTaskStatus, isTaskAssignee } from '@/lib/tasks'
import { TASK_STATUSES } from '@/lib/taskStatuses'
import { canReview, isReviewDecision, validateReopenComment } from '@/lib/reviewAuthority'
import { memberForEmail, listTeam } from '@/lib/team'
import { notifyMarketingOnApproval } from '@/lib/marketingSync'
import { auditEvent } from '@/lib/audit'
import { db } from '@/lib/serverClient'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const actor = await getApiActor(req)
  if (!actor) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const { taskId } = await params
  try {
    const body = await req.json()
    const status = body?.status as string
    if (!status || !(TASK_STATUSES as readonly string[]).includes(status)) {
      return NextResponse.json(
        { ok: false, error: `status must be one of: ${TASK_STATUSES.join(', ')}` },
        { status: 400 },
      )
    }
    // Editors/super-admins may update any task; everyone else only their own.
    const task0 = await getTask(taskId)
    if (!task0) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
    if (!actor.isSuperAdmin && !actor.can('ops', 'edit') && !isTaskAssignee(task0, actor.name)) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }

    // §17: closing or reopening a task under review is a COUNTERSIGN, not
    // ordinary progress, and obeys the same reviewer rules as a duty. Without
    // this, an assignee on an approval-gated task could sign off their own work
    // simply by choosing 'Completed' in the status dropdown.
    const requiresApproval = task0.requires_approval === true
    const reviewing = isReviewDecision(task0.current_status, status, requiresApproval)
    let reviewerMemberId: string | null = null

    if (reviewing) {
      const [me, team] = await Promise.all([memberForEmail(actor.email), listTeam()])
      reviewerMemberId = me?.id ?? null
      const assignee = task0.assigned_to
        ? team.find((m) => m.name.trim().toLowerCase() === task0.assigned_to.trim().toLowerCase())
        : undefined

      const verdict = canReview(
        {
          teamMemberId: me?.id ?? null,
          name: actor.name,
          permissions: actor.permissions,
          brandAccess: actor.brandAccess,
        },
        {
          reviewerId: task0.reviewer_id ?? null,
          submitterMemberId: assignee?.id ?? null,
          submitterName: task0.assigned_to ?? '',
          brandId: task0.brand_id ?? null,
        },
      )
      if (!verdict.allowed) {
        return NextResponse.json({ ok: false, error: verdict.message }, { status: 403 })
      }
      if (status === 'Reopened') {
        const problem = validateReopenComment(String(body?.note ?? ''))
        if (problem) return NextResponse.json({ ok: false, error: problem }, { status: 422 })
      }
    }

    let task
    if (reviewing) {
      // §47: a task countersignature and its immutable event commit together.
      // The RPC also guards on the status we authorised against, so a task that
      // moved while this reviewer was deciding is refused rather than
      // overwritten.
      const { data, error } = await db().rpc('review_task_completion', {
        p_task_id: taskId,
        p_status: status,
        p_note: String(body?.note ?? ''),
        p_reviewed_by: actor.name || actor.email || actor.userId,
        p_reviewed_by_id: reviewerMemberId,
        p_expected_status: task0.current_status,
      })
      if (error) {
        const conflict = /has moved on since/i.test(error.message)
        return NextResponse.json({ ok: false, error: error.message }, { status: conflict ? 409 : 500 })
      }
      task = data as typeof task0
    } else {
      task = await setTaskStatus(taskId, status, {
        note: body?.note,
        by: actor.email ?? 'admin',
      })
    }

    await auditEvent({
      actor,
      action: reviewing ? `task.review.${status === 'Reopened' ? 'reopen' : 'accept'}` : 'status',
      entity_table: 'ops_tasks',
      entity_id: taskId,
      entity_label: task.task_name,
      before_data: task0 as unknown as Record<string, unknown>,
      after_data: task as unknown as Record<string, unknown>,
    })
    if (status === 'Approved') await notifyMarketingOnApproval(taskId)
    return NextResponse.json({ ok: true, task })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
