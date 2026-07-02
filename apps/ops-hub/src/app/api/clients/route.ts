import { NextResponse, type NextRequest } from 'next/server'
import { requireApiSection } from '@/lib/api-auth'
import { listClients, createClient } from '@/lib/clients'

export async function GET(req: NextRequest) {
  const gate = await requireApiSection(req, 'ops', 'view')
  if (gate instanceof NextResponse) return gate
  const clients = await listClients()
  return NextResponse.json({ ok: true, clients })
}

export async function POST(req: NextRequest) {
  const gate = await requireApiSection(req, 'ops', 'edit')
  if (gate instanceof NextResponse) return gate
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
