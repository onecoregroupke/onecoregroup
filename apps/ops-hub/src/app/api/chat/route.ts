import { NextResponse, type NextRequest } from 'next/server'
import { getApiActor } from '@/lib/api-auth'
import { listConversationsFor, listMessages, sendMessage, startConversation } from '@/lib/chat'

/**
 * Internal chat. Available to every signed-in portal user; conversation
 * membership is enforced in lib/chat on every read/write. The sender identity
 * always comes from the verified token — never from the request body.
 *
 *   GET  /api/chat                      → my conversations
 *   GET  /api/chat?conversation=<id>    → messages (marks them read)
 *   POST { action: 'start', members: [{email,name}], name? }
 *   POST { action: 'send',  conversation_id, body }
 */
export async function GET(req: NextRequest) {
  const actor = await getApiActor(req)
  if (!actor || !actor.email) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  try {
    const conversationId = new URL(req.url).searchParams.get('conversation')
    if (conversationId) {
      const messages = await listMessages(conversationId, actor.email)
      return NextResponse.json({ ok: true, messages })
    }
    const conversations = await listConversationsFor(actor.email)
    return NextResponse.json({ ok: true, conversations })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 403 })
  }
}

export async function POST(req: NextRequest) {
  const actor = await getApiActor(req)
  if (!actor || !actor.email) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  try {
    const body = await req.json()
    const action = body?.action as string

    if (action === 'start') {
      const conversation = await startConversation({
        creator_email: actor.email,
        creator_name: actor.name,
        member_emails: Array.isArray(body?.members) ? body.members : [],
        name: body?.name,
      })
      return NextResponse.json({ ok: true, conversation }, { status: 201 })
    }

    if (action === 'send') {
      const message = await sendMessage({
        conversation_id: String(body?.conversation_id ?? ''),
        sender_email: actor.email,
        sender_name: actor.name,
        body: String(body?.body ?? ''),
      })
      return NextResponse.json({ ok: true, message }, { status: 201 })
    }

    return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}
