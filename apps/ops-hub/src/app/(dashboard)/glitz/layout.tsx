import { requireSection } from '@/lib/server-auth'

// Server-side gate for every /glitz page (Glitz N' Glim admin).
export default async function GlitzLayout({ children }: { children: React.ReactNode }) {
  await requireSection('glitz_admin')
  return <>{children}</>
}
