import { requireSection } from '@/lib/server-auth'

// Server-side gate for every /npt page (NPT field service).
export default async function NptLayout({ children }: { children: React.ReactNode }) {
  await requireSection('npt_service')
  return <>{children}</>
}
