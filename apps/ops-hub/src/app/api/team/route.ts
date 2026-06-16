import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { createTeamMember, listTeam } from '@/lib/team'

export async function GET(req: NextRequest) {
  if (!(await requireUser(req))) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const team = await listTeam()
  return NextResponse.json({ ok: true, team })
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  try {
    const body = await req.json()
    const row = await createTeamMember({
      name: body?.name ?? '',
      email: body?.email,
      role: body?.role,
      brand_ids: Array.isArray(body?.brand_ids) ? body.brand_ids : [],
      active: body?.active ?? true,
    })
    return NextResponse.json({ ok: true, row }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}
