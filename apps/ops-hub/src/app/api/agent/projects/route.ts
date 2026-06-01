import { NextResponse, type NextRequest } from 'next/server'
import { verifyAgentKey } from '@/lib/api-auth'
import { createProject } from '@/lib/projects'

export async function POST(req: NextRequest) {
  if (!verifyAgentKey(req)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  try {
    const body = await req.json()
    if (!body?.project_name) return NextResponse.json({ ok: false, error: 'project_name is required' }, { status: 400 })
    const project = await createProject(body)
    return NextResponse.json({ ok: true, project_id: project.project_id, project }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
