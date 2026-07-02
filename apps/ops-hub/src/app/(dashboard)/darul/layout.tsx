import { requireSection } from '@/lib/server-auth'

// Server-side gate for every /darul page (Darul Swafa madrassa admin — student data).
export default async function DarulLayout({ children }: { children: React.ReactNode }) {
  await requireSection('darul_admin')
  return <>{children}</>
}
