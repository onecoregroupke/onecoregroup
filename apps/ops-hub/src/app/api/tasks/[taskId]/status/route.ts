import { NextResponse, type NextRequest } from 'next/server'
import { getApiActor } from '@/lib/api-auth'
import { getTask, setTaskStatus, isTaskAssignee } from '@/lib/tasks'
import { TASK_STATUSES } from '@/lib/taskStatuses'
import { canReview, isReviewDecision, validateReopenComment } from '@/lib/reviewAuthority'
import { memberForEmail, listTeam } from '@/lib/team'
import { notifyMarketingOnApproval } from '@/lib/marketingSync'
import { auditEvent } from '@/lib/audit'
import { db, nowIso } from '@/lib/serverClient'

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

    const task = await setTaskStatus(taskId, status, {
      note: body?.note,
      by: actor.email ?? 'admin',
    })

    // The append-only countersign event, in the same table duty reviews use.
    if (reviewing) {
      try {
        await db().from('ops_task_reviews').insert({
          task_id: taskId,
          decision: status === 'Reopened' ? 'reopened' : 'accepted',
          comment: String(body?.note ?? ''),
          reopen_reason: status === 'Reopened' ? String(body?.note ?? '') : '',
          reviewed_by: actor.name || actor.email || actor.userId,
          reviewed_by_id: reviewerMemberId,
        })
      } catch {
        // Best-effort: the decision above is already recorded on the task.
      }
      if (status === 'Reopened') {
        await db().from('ops_tasks')
          .update({ reopened_count: (task0.reopened_count ?? 0) + 1, updated_at: nowIso() })
          .eq('task_id', taskId)
      }
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
