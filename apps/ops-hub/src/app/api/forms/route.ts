import { NextResponse, type NextRequest } from 'next/server'
import { getApiActor } from '@/lib/api-auth'
import {
  createFormTemplate,
  getFormTemplate,
  listFormTemplates,
  listSubmissions,
  submitForm,
  templateInScope,
  updateFormTemplate,
} from '@/lib/forms'
import { listBrands } from '@/lib/brands'
import type { OcgFormSubmissionRow, OcgFormTemplateRow } from '@ocg/db'

/**
 * Custom forms API — permission-scoped.
 *   GET                          → templates + brands + visible submissions
 *   GET ?export=csv&template=<id>→ CSV of a form's submissions (forms_responses edit)
 *   POST { action: 'submit' | 'create-template' }
 *   PATCH { id, values }
 *
 * Access model (server-enforced, brand-scoped):
 *   forms.view  → open Forms + fill (their brands' forms + group-wide)
 *   forms.edit  → build / edit / archive templates (within brand scope)
 *   forms_responses.view → see everyone's submissions (not just their own)
 *   forms_responses.edit → export submissions
 */
export async function GET(req: NextRequest) {
  const actor = await getApiActor(req)
  if (!actor?.email) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  if (!actor.can('forms', 'view')) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })

  const url = new URL(req.url)
  const brandIds = actor.allowedBrandIds('forms')
  const canManage = actor.can('forms', 'edit')
  const canReviewAll = actor.can('forms_responses', 'view')
  const canExport = actor.can('forms_responses', 'edit')
  const templateId = url.searchParams.get('template') ?? undefined

  // CSV export of one form's submissions — gated on forms_responses.edit.
  if (url.searchParams.get('export') === 'csv') {
    if (!canExport) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    if (!templateId) return NextResponse.json({ ok: false, error: 'template is required' }, { status: 400 })
    const template = await getFormTemplate(templateId)
    if (!template || !templateInScope(template.brand_id, brandIds)) {
      return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
    }
    const submissions = await listSubmissions({ viewerEmail: actor.email, canReviewAll: true, templateId, limit: 5000 })
    return csvResponse(template, submissions)
  }

  const [templates, brands, submissions] = await Promise.all([
    listFormTemplates({ includeInactive: canManage, brandIds }),
    listBrands(),
    listSubmissions({ viewerEmail: actor.email, canReviewAll, templateId }),
  ])
  return NextResponse.json({
    ok: true,
    templates,
    submissions,
    brands: brands.map((b) => ({ id: b.id, label: b.short_name || b.name, slug: b.slug })),
    canManage,
    canReviewAll,
    canExport,
  })
}

export async function POST(req: NextRequest) {
  const actor = await getApiActor(req)
  if (!actor?.email) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const brandIds = actor.allowedBrandIds('forms')
  try {
    const body = await req.json()
    const action = body?.action as string

    if (action === 'submit') {
      if (!actor.can('forms', 'view')) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
      const template = await getFormTemplate(String(body?.template_id ?? ''))
      if (!template) return NextResponse.json({ ok: false, error: 'Form not found' }, { status: 404 })
      if (!templateInScope(template.brand_id, brandIds)) {
        return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
      }
      const submission = await submitForm({
        template_id: template.id,
        values: body?.values ?? {},
        submitted_by: actor.email,
        submitted_by_name: actor.name,
        submission_date: (body?.submission_date as string) || undefined,
        notes: (body?.notes as string) ?? '',
      })
      return NextResponse.json({ ok: true, submission }, { status: 201 })
    }

    if (action === 'create-template') {
      if (!actor.can('forms', 'edit')) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
      const v = body?.values ?? {}
      const brandId = (v.brand_id as string) || null
      // A brand-scoped forms editor must target a brand within their scope and
      // cannot create group-wide (all-brand) forms.
      if (brandIds !== null && (!brandId || !brandIds.includes(brandId))) {
        return NextResponse.json({ ok: false, error: 'Pick a brand within your scope for this form.' }, { status: 403 })
      }
      const template = await createFormTemplate({
        name: String(v.name ?? ''),
        brand_id: brandId,
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
  if (!actor.can('forms', 'edit')) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  const brandIds = actor.allowedBrandIds('forms')
  try {
    const body = await req.json()
    const existing = await getFormTemplate(String(body?.id ?? ''))
    if (!existing) return NextResponse.json({ ok: false, error: 'Form not found' }, { status: 404 })
    // Must already be within scope, and cannot be moved to a brand out of scope.
    if (!templateInScope(existing.brand_id, brandIds)) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }
    const values = body?.values ?? {}
    if (values.brand_id !== undefined && brandIds !== null) {
      const target = (values.brand_id as string) || null
      if (!target || !brandIds.includes(target)) {
        return NextResponse.json({ ok: false, error: 'That brand is outside your scope.' }, { status: 403 })
      }
    }
    const template = await updateFormTemplate(existing.id, values)
    return NextResponse.json({ ok: true, template })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}

function csvResponse(template: OcgFormTemplateRow, submissions: OcgFormSubmissionRow[]): NextResponse {
  const headers = ['Date', 'Submitted by', ...template.fields.map((f) => f.label)]
  const esc = (v: unknown) => {
    const s = v == null ? '' : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const rows = submissions.map((s) =>
    [s.submission_date, s.submitted_by_name || s.submitted_by, ...template.fields.map((f) => esc(s.values[f.key]))]
      .map(esc)
      .join(','),
  )
  const csv = [headers.map(esc).join(','), ...rows].join('\n')
  const filename = `${(template.name || 'form').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 60)}-responses.csv`
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
