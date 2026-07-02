import { NextResponse, type NextRequest } from 'next/server'
import { requireApiSection } from '@/lib/api-auth'
import { listProjects, createProject } from '@/lib/projects'
import { brandIdFromParam } from '@/lib/tasks'

export async function GET(req: NextRequest) {
  const gate = await requireApiSection(req, 'ops', 'view')
  if (gate instanceof NextResponse) return gate
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
  const gate = await requireApiSection(req, 'ops', 'edit')
  if (gate instanceof NextResponse) return gate
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
