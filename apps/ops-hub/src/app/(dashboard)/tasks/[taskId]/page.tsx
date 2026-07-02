import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTask, listTaskComments, isTaskAssignee } from '@/lib/tasks'
import { getProjectContext } from '@/lib/projects'
import { resolveBrand } from '@/lib/brands'
import { db } from '@/lib/serverClient'
import { statusTone, priorityTone } from '@/lib/taskStatuses'
import { requireSection } from '@/lib/server-auth'
import { TaskControls } from '@/components/tasks/TaskControls'
import type { OpsAgentArtifactRow, OpsCompletionRecordRow } from '@ocg/db'

export const dynamic = 'force-dynamic'

export default async function TaskDetail({
  params,
}: {
  params: Promise<{ taskId: string }>
}) {
  const actor = await requireSection('ops')
  const { taskId } = await params
  const task = await getTask(taskId)
  if (!task) notFound()
  // A user may only open a task they're assigned to, unless they can see all tasks.
  if (!actor.isSuperAdmin && !isTaskAssignee(task, actor.name)) notFound()

  const [context, brand, artifactsRes, completionRes, comments] = await Promise.all([
    getProjectContext(task.project_id),
    task.brand_id ? resolveBrand(task.brand_id) : Promise.resolve(null),
    db().from('ops_agent_artifacts').select('*').eq('task_id', taskId).order('created_at', { ascending: false }),
    db().from('ops_completion_records').select('*').eq('task_id', taskId).order('submitted_at', { ascending: false }),
    listTaskComments(taskId),
  ])
  const artifacts = (artifactsRes.data as OpsAgentArtifactRow[] | null) ?? []
  const completions = (completionRes.data as OpsCompletionRecordRow[] | null) ?? []

  return (
    <div className="space-y-6">
      <div>
        <Link href="/tasks" className="text-xs text-gray-400 hover:text-ocg-gold">← Tasks</Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-gray-900">{task.task_name}</h1>
          <span className={`rounded px-2 py-0.5 text-xs font-medium ${statusTone(task.current_status)}`}>
            {task.current_status}
          </span>
          <span className={`rounded px-2 py-0.5 text-xs font-medium ${priorityTone(task.priority)}`}>
            {task.priority}
          </span>
        </div>
        <p className="mt-1 text-sm text-gray-500">
          {task.task_id} · {brand ? `${brand.name} · ` : ''}{task.project_name}
          {task.assigned_to ? ` · ${task.assigned_to}` : ''}
          {task.target_date ? ` · due ${task.target_date}` : ''}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <Card title="Description">
            <p className="whitespace-pre-wrap text-sm text-gray-700">
              {task.task_description || 'No description.'}
            </p>
            {task.latest_work_comment && (
              <p className="mt-3 rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
                <span className="font-medium">Latest:</span> {task.latest_work_comment}
              </p>
            )}
          </Card>

          <Card title="Progress updates">
            {comments.length === 0 ? (
              <p className="text-sm text-gray-500">No progress updates yet. Team members can log progress from their portal without changing the status.</p>
            ) : (
              <ul className="space-y-3">
                {comments.map((c) => (
                  <li key={c.id} className="rounded-lg border border-gray-100 p-3 text-sm">
                    <p className="whitespace-pre-wrap text-gray-700">{c.body}</p>
                    <p className="mt-1 text-xs text-gray-400">
                      {c.author || 'team'} · {new Date(c.created_at).toLocaleString()}
                      {c.kind === 'status' && c.status_at ? ` · marked ${c.status_at}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="AI drafts & artifacts">
            {artifacts.length === 0 ? (
              <p className="text-sm text-gray-500">No drafts yet. Run a specialist to generate one.</p>
            ) : (
              <ul className="space-y-3">
                {artifacts.map((a) => {
                  const link = (a.delivery as { web_view_link?: string } | null)?.web_view_link ?? a.url
                  return (
                    <li key={a.id} className="rounded-lg border border-gray-100 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-gray-800">{a.title}</span>
                        <span className="text-[10px] uppercase tracking-wider text-gray-400">{a.artifact_type}</span>
                      </div>
                      {link && (
                        <a href={link} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-ocg-gold hover:underline">
                          Open delivered doc →
                        </a>
                      )}
                      {a.content && !link && (
                        <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-xs text-gray-600">{a.content}</p>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>

          {completions.length > 0 && (
            <Card title="Completion records">
              <ul className="space-y-3">
                {completions.map((c) => (
                  <li key={c.id} className="rounded-lg border border-gray-100 p-3 text-sm">
                    <p className="font-medium text-gray-800">{c.status} · {c.completion_date}</p>
                    {c.summary && <p className="mt-1 text-gray-600">{c.summary}</p>}
                    <p className="mt-1 text-xs text-gray-400">by {c.submitted_by || 'unknown'}</p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card title="Controls">
            <TaskControls
              taskId={task.task_id}
              status={task.current_status}
              agentEligible={task.agent_eligible === 'Yes'}
            />
          </Card>

          <Card title="Project context">
            <p className="whitespace-pre-wrap text-xs text-gray-600">
              {context || 'No project context captured yet. Use the oc-ops CLI set-project-context to add the ideal end state, definition of done, and code refs.'}
            </p>
          </Card>
        </div>
      </div>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ocg-gold">{title}</h2>
      {children}
    </section>
  )
}
