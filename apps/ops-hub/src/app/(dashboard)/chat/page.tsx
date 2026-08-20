import { requireActor } from '@/lib/server-auth'
import { listTeam } from '@/lib/team'
import { ChatWorkspace } from '@/components/chat/ChatWorkspace'

export const dynamic = 'force-dynamic'

// Chat is available to EVERY signed-in portal user (like My Tasks) — the
// point is that anyone can reach management and colleagues without email.
export default async function ChatPage() {
  const actor = await requireActor()
  const team = await listTeam()
  const contacts = team
    .filter((m) => m.email && m.email.toLowerCase() !== (actor.email ?? '').toLowerCase())
    .map((m) => ({ email: m.email!, name: m.name }))
  return <ChatWorkspace meEmail={actor.email ?? ''} contacts={contacts} />
}
