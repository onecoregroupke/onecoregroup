import { requireActor } from '@/lib/server-auth'

export const dynamic = 'force-dynamic'

const ENV_KEYS: { key: string; what: string }[] = [
  { key: 'NEXT_PUBLIC_SUPABASE_URL', what: 'Supabase project URL' },
  { key: 'SUPABASE_SERVICE_ROLE_KEY', what: 'Server data access' },
  { key: 'OPS_AGENT_API_KEY', what: 'Agent callback API + oc-ops CLI' },
  { key: 'OPS_TASK_TOKEN_SECRET', what: 'No-login completion links' },
  { key: 'RESEND_API_KEY', what: 'Assignment + report email' },
  { key: 'GROQ_API_KEY', what: 'AI specialists (internal runtime)' },
  { key: 'GOOGLE_SERVICE_ACCOUNT_JSON_BASE64', what: 'Drive delivery' },
  { key: 'GOOGLE_DRIVE_ROOT_FOLDER_ID', what: 'Drive delivery root' },
]

export default async function SettingsPage() {
  const actor = await requireActor()
  if (actor.permissions !== null) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-500">Account and portal preferences.</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-gray-900">{actor.name}</p>
          <p className="mt-1 text-sm text-gray-500">{actor.email}</p>
          <p className="mt-4 text-xs text-gray-400">
            Deployment environment checks are visible only to the main administrator.
          </p>
        </div>
      </div>
    )
  }
  const rows = ENV_KEYS.map((e) => ({ ...e, set: Boolean(process.env[e.key]) }))

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500">Environment readiness for this deployment.</p>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400">
              <th className="px-4 py-3">Variable</th>
              <th className="px-4 py-3">Used for</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="px-4 py-3 font-mono text-xs text-gray-700">{r.key}</td>
                <td className="px-4 py-3 text-gray-600">{r.what}</td>
                <td className="px-4 py-3">
                  <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${r.set ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                    {r.set ? 'set' : 'missing'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400">
        Run the migrations <code>017_ops_core.sql</code> and <code>018_ops_agents.sql</code> in the
        Supabase SQL editor before first use. Team members and their emails live in
        <code> ops_team_members</code>; per-user access is set on the shared <code>user_permissions</code>
        table via the <code>ops</code> and <code>ops_agents</code> section keys.
      </p>
    </div>
  )
}
