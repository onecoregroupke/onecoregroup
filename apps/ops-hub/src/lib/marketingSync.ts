import { db } from './serverClient'
import { getTask } from './tasks'
import type { OpsAgentArtifactRow } from '@ocg/db'

/**
 * When a task that originated from a marketing content row is approved, push the
 * deliverable back to the Marketing Hub so the post can auto-schedule. Fire-and-
 * forget; never throws. Gated by MARKETING_WEBHOOK_URL + MARKETING_WEBHOOK_SECRET.
 */
export async function notifyMarketingOnApproval(taskId: string): Promise<void> {
  const url = process.env['MARKETING_WEBHOOK_URL']
  const secret = process.env['MARKETING_WEBHOOK_SECRET']
  if (!url || !secret) return

  const task = await getTask(taskId)
  if (!task || task.source_kind !== 'marketing_content' || !task.source_ref) return

  const { data } = await db()
    .from('ops_agent_artifacts')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const artifact = data as OpsAgentArtifactRow | null

  const docLink =
    (artifact?.delivery as { web_view_link?: string } | null)?.web_view_link ??
    artifact?.url ??
    null
  const deliverable = artifact
    ? {
        artifact_id: artifact.id,
        title: artifact.title,
        doc_link: docLink,
        summary: (artifact.metadata as { summary?: string } | null)?.summary ?? '',
      }
    : null

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret,
        content_id: task.source_ref,
        task_id: taskId,
        deliverable,
      }),
    })
  } catch {
    // best-effort; the artifact is still visible in Ops if delivery notification fails
  }
}
