import { requireSection } from '@/lib/server-auth'

// Server-side gate for every /nuuranest page (Nuuranest Stays admin).
export default async function NuuranestLayout({ children }: { children: React.ReactNode }) {
  await requireSection('nuuranest_admin')
  return <>{children}</>
}
