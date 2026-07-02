import { NextResponse, type NextRequest } from 'next/server'
import { getApiActor } from '@/lib/api-auth'
import { addForumReply, createForumPost } from '@/lib/chat'

/**
 * Public (company-wide) forum. Every signed-in portal user can post and reply;
 * author identity always comes from the verified token.
 *   POST { action: 'post',  title, body, category? }
 *   POST { action: 'reply', post_id, body }
 */
export async function POST(req: NextRequest) {
  const actor = await getApiActor(req)
  if (!actor || !actor.email) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  try {
    const body = await req.json()
    const action = body?.action as string

    if (action === 'post') {
      const post = await createForumPost({
        author_email: actor.email,
        author_name: actor.name,
        title: String(body?.title ?? ''),
        body: String(body?.body ?? ''),
        category: body?.category,
      })
      return NextResponse.json({ ok: true, post }, { status: 201 })
    }

    if (action === 'reply') {
      const reply = await addForumReply({
        post_id: String(body?.post_id ?? ''),
        author_email: actor.email,
        author_name: actor.name,
        body: String(body?.body ?? ''),
      })
      return NextResponse.json({ ok: true, reply }, { status: 201 })
    }

    return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}
