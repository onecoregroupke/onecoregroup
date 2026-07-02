import { requireSection } from '@/lib/server-auth'

// Server-side gate for every /agents page (AI specialist run/config surface).
export default async function AgentsLayout({ children }: { children: React.ReactNode }) {
  await requireSection('ops_agents')
  return <>{children}</>
}
