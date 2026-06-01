import Link from 'next/link'
import { db } from '@/lib/serverClient'
import type {
  OpsAgentJobRow,
  OpsAgentArtifactRow,
  OpsAgentArtifactDestinationRow,
} from '@ocg/db'

export const dynamic = 'force-dynamic'

const JOB_TONE: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600',
  running: 'bg-blue-50 text-blue-700',
  draft_ready: 'bg-amber-50 text-amber-700',
  done: 'bg-emerald-50 text-emerald-700',
  error: 'bg-red-50 text-red-700',
  skipped: 'bg-gray-100 text-gray-400',
}

async function getData() {
  try {
    const [jobs, artifacts, dests] = await Promise.all([
      db().from('ops_agent_jobs').select('*').order('created_at', { ascending: false }).limit(25),
      db().from('ops_agent_artifacts').select('*').order('created_at', { ascending: false }).limit(15),
      db().from('ops_agent_artifact_destinations').select('*').eq('active', true).order('agent_type'),
    ])
    return {
      jobs: (jobs.data as OpsAgentJobRow[] | null) ?? [],
      artifacts: (artifacts.data as OpsAgentArtifactRow[] | null) ?? [],
      dests: (dests.data as OpsAgentArtifactDestinationRow[] | null) ?? [],
    }
  } catch {
    return { jobs: [], artifacts: [], dests: [] }
  }
}

export default async function AgentsPage() {
  const { jobs, artifacts, dests } = await getData()
  const pending = jobs.filter((j) => j.runtime === 'hermes' && j.status === 'pending')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Agents</h1>
        <p className="text-sm text-gray-500">
          Specialist runs, drafts, and delivery routing. {pending.length} job
          {pending.length === 1 ? '' : 's'} queued for the Hermes runtime.
        </p>
      </div>

      <Card title="Recent specialist jobs">
        {jobs.length === 0 ? (
          <Empty>No runs yet. Open a task and use “Draft with AI”.</Empty>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400">
                <th className="px-3 py-2">Task</th>
                <th className="px-3 py-2">Specialist</th>
                <th className="px-3 py-2">Runtime</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {jobs.map((j) => (
                <tr key={j.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <Link href={`/tasks/${j.task_id}`} className="font-medium text-gray-800 hover:text-ocg-gold">
                      {j.task_name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-gray-600">{j.task_type}</td>
                  <td className="px-3 py-2 text-gray-500">{j.runtime}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${JOB_TONE[j.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {j.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-400">
                    {new Date(j.created_at).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Recent drafts">
        {artifacts.length === 0 ? (
          <Empty>No drafts produced yet.</Empty>
        ) : (
          <ul className="space-y-2">
            {artifacts.map((a) => {
              const link = (a.delivery as { web_view_link?: string } | null)?.web_view_link ?? a.url
              return (
                <li key={a.id} className="flex items-center justify-between rounded-lg border border-gray-100 p-3">
                  <div className="min-w-0">
                    <Link href={`/tasks/${a.task_id}`} className="block truncate text-sm font-medium text-gray-800 hover:text-ocg-gold">
                      {a.title}
                    </Link>
                    <p className="text-xs text-gray-400">{a.artifact_type} · {a.task_id}</p>
                  </div>
                  {link && (
                    <a href={link} target="_blank" rel="noreferrer" className="ml-3 flex-shrink-0 text-xs text-ocg-gold hover:underline">
                      Doc →
                    </a>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <Card title="Delivery routing">
        <p className="mb-3 text-xs text-gray-400">
          Where each specialist’s output is reviewed/delivered. Drafts never go out externally.
        </p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {dests.map((d) => (
            <li key={d.id} className="rounded-lg border border-gray-100 p-3 text-sm">
              <p className="font-medium text-gray-800">{d.agent_type}</p>
              <p className="text-xs text-gray-500">{d.destination_label} · {d.destination_type}</p>
              {d.instructions && <p className="mt-1 text-xs text-gray-400">{d.instructions}</p>}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ocg-gold">{title}</h2>
      {children}
    </section>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">{children}</p>
}
