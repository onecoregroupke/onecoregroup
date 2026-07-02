import { requireSection } from '@/lib/server-auth'

// Server-side gate for every /rayyan page (Ar-Rayyan school admin — student data).
export default async function RayyanLayout({ children }: { children: React.ReactNode }) {
  await requireSection('rayyan_admin')
  return <>{children}</>
}
