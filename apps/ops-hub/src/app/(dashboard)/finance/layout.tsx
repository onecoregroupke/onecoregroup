import { requireSection } from '@/lib/server-auth'

// Server-side gate for every /finance page. Renders nothing for users without
// `finance` access (redirected to /my-tasks) — applies to all nested routes.
export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  await requireSection('finance')
  return <>{children}</>
}
