import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { listProjects, createProject } from '@/lib/projects'
import { brandIdFromParam } from '@/lib/tasks'

export async function GET(req: NextRequest) {
  if (!(await requireUser(req))) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const brandId = await brandIdFromParam(url.searchParams.get('brand'))
  const projects = await listProjects({
    brandId,
    clientId: url.searchParams.get('client') ?? undefined,
    status: url.searchParams.get('status') ?? undefined,
  })
  return NextResponse.json({ ok: true, projects })
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  try {
    const body = await req.json()
    if (!body?.project_name) {
      return NextResponse.json({ ok: false, error: 'project_name is required' }, { status: 400 })
    }
    const project = await createProject(body)
    return NextResponse.json({ ok: true, project }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
