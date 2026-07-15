import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import {
  listFlows,
  getFlowById,
  createFlow,
  updateFlow,
  transitionFlow,
} from '@/lib/marketing/whatsappFlows'

export async function GET(req: NextRequest) {
  if (!(await requireUser(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const params = req.nextUrl.searchParams
  const id = params.get('id')
  if (id) {
    const flow = await getFlowById(id)
    if (!flow) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ flow })
  }
  const flows = await listFlows({
    brandId: params.get('brand') || undefined,
    includeArchived: params.get('includeArchived') === 'true',
  })
  return NextResponse.json({ flows })
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  const result = await createFlow({ ...body, createdByEmail: user.email ?? 'unknown' })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ flow: result.flow })
}

export async function PATCH(req: NextRequest) {
  if (!(await requireUser(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = (await req.json().catch(() => null)) as
    | ({ id?: string; action?: string } & Record<string, unknown>)
    | null
  if (!body?.id) return NextResponse.json({ error: 'Flow id is required.' }, { status: 400 })
  const { id, action, ...rest } = body
  if (action === 'transition') {
    const result = await transitionFlow(id, rest.toStatus as string)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
    return NextResponse.json({ flow: result.flow })
  }
  const result = await updateFlow(id, rest)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ flow: result.flow })
}
