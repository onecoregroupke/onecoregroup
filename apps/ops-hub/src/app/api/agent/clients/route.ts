import { NextResponse, type NextRequest } from 'next/server'
import { verifyAgentKey } from '@/lib/api-auth'
import { createClient } from '@/lib/clients'

export async function POST(req: NextRequest) {
  if (!verifyAgentKey(req)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  try {
    const body = await req.json()
    if (!body?.client_name) return NextResponse.json({ ok: false, error: 'client_name is required' }, { status: 400 })
    const { client, reused } = await createClient(body)
    return NextResponse.json(
      { ok: true, client_id: client.client_id, client, reused },
      { status: reused ? 200 : 201 },
    )
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
