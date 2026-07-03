import { db } from './serverClient'

export interface PortalNotification {
  id: string
  recipient_email: string
  recipient_name: string
  sender_email: string
  sender_name: string
  kind: string
  title: string
  body: string
  href: string
  metadata: Record<string, unknown>
  read_at: string | null
  created_at: string
}

function clean(email: string): string {
  return email.trim().toLowerCase()
}

export async function createNotification(input: {
  recipient_email: string
  recipient_name?: string
  sender_email?: string
  sender_name?: string
  kind?: string
  title: string
  body?: string
  href?: string
  metadata?: Record<string, unknown>
}): Promise<void> {
  if (!input.recipient_email.trim() || !input.title.trim()) return
  await db().from('ocg_notifications').insert({
    recipient_email: clean(input.recipient_email),
    recipient_name: input.recipient_name ?? '',
    sender_email: input.sender_email ? clean(input.sender_email) : '',
    sender_name: input.sender_name ?? '',
    kind: input.kind ?? 'info',
    title: input.title.trim(),
    body: input.body ?? '',
    href: input.href ?? '',
    metadata: input.metadata ?? {},
  })
}

export async function listNotifications(email: string, limit = 50): Promise<PortalNotification[]> {
  const { data } = await db()
    .from('ocg_notifications')
    .select('*')
    .eq('recipient_email', clean(email))
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data as PortalNotification[] | null) ?? []
}

export async function markNotificationsRead(email: string): Promise<void> {
  await db()
    .from('ocg_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient_email', clean(email))
    .is('read_at', null)
}
