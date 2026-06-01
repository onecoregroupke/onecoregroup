import { NextResponse, type NextRequest } from 'next/server'
import { verifyAgentKey } from '@/lib/api-auth'
import { getProject, getProjectContext, setProjectContext } from '@/lib/projects'

const HEADINGS: Record<string, string> = {
  ideal: 'Ideal end state',
  done: 'Definition of done',
  satisfaction: 'What makes this client happy',
  code_refs: 'Code references',
}

/** Replace a single "## Heading" section's body, preserving the rest. */
function setSection(doc: string, heading: string, body: string): string {
  const block = `## ${heading}\n${body.trim()}\n`
  const re = new RegExp(`## ${heading}\\n[\\s\\S]*?(?=\\n## |$)`, 'i')
  if (re.test(doc)) return doc.replace(re, block).trim() + '\n'
  return `${doc.trim()}\n\n${block}`.trim() + '\n'
}

function appendNote(doc: string, note: string): string {
  const stamp = new Date().toISOString().slice(0, 10)
  const line = `- [${stamp}] ${note.trim()}`
  const re = /## Notes\n([\s\S]*?)(?=\n## |$)/i
  if (re.test(doc)) return doc.replace(re, (m) => `${m.trimEnd()}\n${line}\n`)
  return `${doc.trim()}\n\n## Notes\n${line}\n`
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  if (!verifyAgentKey(req)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  const { projectId } = await params
  const content = await getProjectContext(projectId)
  return NextResponse.json({ ok: true, project_id: projectId, content })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  if (!verifyAgentKey(req)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  const { projectId } = await params
  try {
    const project = await getProject(projectId)
    if (!project) return NextResponse.json({ ok: false, error: 'project_not_found' }, { status: 404 })
    const body = await req.json()

    let doc: string
    if (body?.mode === 'replace' && typeof body?.content === 'string') {
      doc = body.content
    } else {
      doc = await getProjectContext(projectId)
      for (const [flag, heading] of Object.entries(HEADINGS)) {
        if (typeof body?.[flag] === 'string' && body[flag].length > 0) {
          doc = setSection(doc, heading, body[flag])
        }
      }
      if (typeof body?.append === 'string' && body.append.length > 0) {
        doc = appendNote(doc, body.append)
      }
    }

    await setProjectContext(projectId, doc, body?.by ?? 'agent')
    return NextResponse.json({ ok: true, project_id: projectId, content: doc })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
