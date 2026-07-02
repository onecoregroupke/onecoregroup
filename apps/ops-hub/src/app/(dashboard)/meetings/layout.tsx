import { requireSection } from '@/lib/server-auth'

// Server-side gate for every /meetings page. `meetings` inherits from
// `management` / `ops` grants for existing users.
export default async function MeetingsLayout({ children }: { children: React.ReactNode }) {
  await requireSection('meetings')
  return <>{children}</>
}
