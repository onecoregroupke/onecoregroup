import { NextResponse, type NextRequest } from 'next/server'
import { getApiActor } from '@/lib/api-auth'
import {
  createFormTemplate,
  listFormTemplates,
  listSubmissions,
  submitForm,
  updateFormTemplate,
} from '@/lib/forms'
import { listBrands } from '@/lib/brands'

/**
 * Custom forms API.
 *   GET  ?template=<id>            → templates + brands + visible submissions
 *   POST { action: 'submit', template_id, values, submission_date?, notes? }
 *   POST { action: 'create-template', values: { name, brand_id, fields… } }
 *   PATCH { id, values: { …template fields, is_active } }
 *
 * Filling a form is open to every signed-in user (like My Tasks). Managing
 * templates and reading everyone's submissions requires `management` access
 * (founding admins pass everything).
 */
export async function GET(req: NextRequest) {
  const actor = await getApiActor(req)
  if (!actor?.email) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const canReviewAll = actor.can('management', 'view')
  const canManage = actor.can('management', 'edit')
  const [templates, brands, submissions] = await Promise.all([
    listFormTemplates({ includeInactive: canManage }),
    listBrands(),
    listSubmissions({
      viewerEmail: actor.email,
      canReviewAll,
      templateId: url.searchParams.get('template') ?? undefined,
    }),
  ])
  return NextResponse.json({
    ok: true,
    templates,
    submissions,
    brands: brands.map((b) => ({ id: b.id, label: b.short_name || b.name, slug: b.slug })),
    canManage,
    canReviewAll,
  })
}

export async function POST(req: NextRequest) {
  const actor = await getApiActor(req)
  if (!actor?.email) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  try {
    const body = await req.json()
    const action = body?.action as string

    if (action === 'submit') {
      const submission = await submitForm({
        template_id: String(body?.template_id ?? ''),
        values: body?.values ?? {},
        submitted_by: actor.email,
        submitted_by_name: actor.name,
        submission_date: (body?.submission_date as string) || undefined,
        notes: (body?.notes as string) ?? '',
      })
      return NextResponse.json({ ok: true, submission }, { status: 201 })
    }

    if (action === 'create-template') {
      if (!actor.can('management', 'edit')) {
        return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
      }
      const v = body?.values ?? {}
      const template = await createFormTemplate({
        name: String(v.name ?? ''),
        brand_id: (v.brand_id as string) || null,
        module: (v.module as string) || 'general',
        description: (v.description as string) ?? '',
        frequency: (v.frequency as string) || 'daily',
        fields: v.fields,
        created_by: actor.email,
      })
      return NextResponse.json({ ok: true, template }, { status: 201 })
    }

    return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}

export async function PATCH(req: NextRequest) {
  const actor = await getApiActor(req)
  if (!actor?.email) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  if (!actor.can('management', 'edit')) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }
  try {
    const body = await req.json()
    const template = await updateFormTemplate(String(body?.id ?? ''), body?.values ?? {})
    return NextResponse.json({ ok: true, template })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}
