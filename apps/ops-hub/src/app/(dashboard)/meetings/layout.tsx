import { requireActor } from '@/lib/server-auth'

// Every signed-in portal user can see their own invited meetings. The pages
// themselves scope rows to attendee/creator access unless the user has the
// broader meetings permission.
export default async function MeetingsLayout({ children }: { children: React.ReactNode }) {
  await requireActor()
  return <>{children}</>
}
