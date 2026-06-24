import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { insertManagedRow, updateManagedRow, type MutationType } from '@/lib/managementMutations'

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  try {
    const body = await req.json()
    const type = body?.type as MutationType
    const values = {
      ...(body?.values ?? {}),
      ...(type === 'approval' ? { requested_by: body?.values?.requested_by || user.email || user.id } : {}),
      ...(type === 'meeting' ? { created_by: body?.values?.created_by || user.email || user.id } : {}),
    }
    const row = await insertManagedRow(type, values)
    return NextResponse.json({ ok: true, row }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}

export async function PATCH(req: NextRequest) {
  if (!(await requireUser(req))) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  try {
    const body = await req.json()
    const row = await updateManagedRow(body?.type as MutationType, body?.id, body?.values ?? {})
    return NextResponse.json({ ok: true, row })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}
