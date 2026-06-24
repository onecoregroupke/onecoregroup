import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { db, nowIso } from '@/lib/serverClient'
import type { OcgPersonalTaskRow } from '@ocg/db'

const FIELDS = ['title', 'notes', 'category', 'priority', 'status', 'due_date'] as const

// Private home/personal tasks — always scoped to the signed-in user's own rows.
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user?.email) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const { data } = await db()
    .from('ocg_personal_tasks')
    .select('*')
    .eq('owner_email', user.email)
    .order('created_at', { ascending: false })
  return NextResponse.json({ ok: true, tasks: (data as OcgPersonalTaskRow[] | null) ?? [] })
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user?.email) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const body = await req.json()
  if (!body?.title?.trim()) return NextResponse.json({ ok: false, error: 'Title is required' }, { status: 400 })
  const extra: Record<string, unknown> = {}
  for (const f of FIELDS) if (f !== 'title' && body[f] !== undefined) extra[f] = body[f] === '' && f === 'due_date' ? null : body[f]
  const { data, error } = await db()
    .from('ocg_personal_tasks')
    .insert({ owner_email: user.email, title: body.title.trim(), ...extra })
    .select('*')
    .single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, task: data }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const user = await requireUser(req)
  if (!user?.email) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const body = await req.json()
  if (!body?.id) return NextResponse.json({ ok: false, error: 'id is required' }, { status: 400 })
  const patch: Record<string, unknown> = { updated_at: nowIso() }
  for (const f of FIELDS) if (body[f] !== undefined) patch[f] = body[f] === '' && f === 'due_date' ? null : body[f]
  const { data, error } = await db()
    .from('ocg_personal_tasks')
    .update(patch)
    .eq('id', body.id)
    .eq('owner_email', user.email) // never touch another user's rows
    .select('*')
    .single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, task: data })
}

export async function DELETE(req: NextRequest) {
  const user = await requireUser(req)
  if (!user?.email) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ ok: false, error: 'id is required' }, { status: 400 })
  const { error } = await db().from('ocg_personal_tasks').delete().eq('id', id).eq('owner_email', user.email)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
