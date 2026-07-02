import { requireSection } from '@/lib/server-auth'

// Server-side gate for every /procurement page. Explicit grant, brand-scopable.
export default async function ProcurementLayout({ children }: { children: React.ReactNode }) {
  await requireSection('procurement')
  return <>{children}</>
}
