import { requireSection } from '@/lib/server-auth'

// Server-side gate for every /rhythms page (Rhythms College admin — student data).
export default async function RhythmsLayout({ children }: { children: React.ReactNode }) {
  await requireSection('rhythms_admin')
  return <>{children}</>
}
