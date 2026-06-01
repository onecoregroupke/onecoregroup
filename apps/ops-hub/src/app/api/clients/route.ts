import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { listClients, createClient } from '@/lib/clients'

export async function GET(req: NextRequest) {
  if (!(await requireUser(req))) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const clients = await listClients()
  return NextResponse.json({ ok: true, clients })
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  try {
    const body = await req.json()
    if (!body?.client_name) {
      return NextResponse.json({ ok: false, error: 'client_name is required' }, { status: 400 })
    }
    const { client, reused } = await createClient(body)
    return NextResponse.json({ ok: true, client, reused }, { status: reused ? 200 : 201 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
