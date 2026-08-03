import { NextResponse, type NextRequest } from 'next/server'
import { getApiActor } from '@/lib/api-auth'
import { getMembership, listConversationsFor, listMessages, sendMessage, startConversation } from '@/lib/chat'
import { uploadChatAttachment, signChatAttachment } from '@/lib/chatStorage'
import { validateAttachment, looksExecutable } from '@/lib/chatAttachments'

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

  // ── Attachment upload (multipart) ─────────────────────────────────────────
  if ((req.headers.get('content-type') ?? '').includes('multipart/form-data')) {
    try {
      const form = await req.formData()
      const file = form.get('file')
      if (!(file instanceof File)) return NextResponse.json({ ok: false, error: 'No file uploaded' }, { status: 400 })
      const conversationId = String(form.get('conversation_id') ?? '')
      const text = String(form.get('body') ?? '')
      // Membership is verified BEFORE anything is stored.
      const membership = await getMembership(conversationId, actor.email)
      if (!membership) return NextResponse.json({ ok: false, error: 'You are not a member of this conversation.' }, { status: 403 })
      const check = validateAttachment(file.name, file.type, file.size)
      if (!check.ok) return NextResponse.json({ ok: false, error: check.error }, { status: 400 })
      const buffer = Buffer.from(await file.arrayBuffer())
      if (looksExecutable(buffer.subarray(0, 8))) {
        return NextResponse.json({ ok: false, error: 'Executable content is not allowed.' }, { status: 400 })
      }
      const stored = await uploadChatAttachment(conversationId, buffer, file.name, file.type)
      if (!stored) return NextResponse.json({ ok: false, error: 'Attachments are not available (storage not configured).' }, { status: 400 })
      const message = await sendMessage({
        conversation_id: conversationId, sender_email: actor.email, sender_name: actor.name, body: text,
        attachment: { path: stored.path, name: file.name, type: file.type, size: file.size },
      })
      const attachment_url = await signChatAttachment(stored.path)
      return NextResponse.json({ ok: true, message: { ...message, attachment_url } }, { status: 201 })
    } catch (e) {
      return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
    }
  }

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
