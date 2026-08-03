import { db, nowIso } from './serverClient'
import type { OcgFormTemplateRow, OcgFormSubmissionRow, OcgFormFieldDef } from '@ocg/db'

// =============================================================================
// Custom forms — the report-book engine. Templates define a form (fields as
// JSONB) per brand/module with a fill rhythm (daily / weekly / termly /
// per-event); staff submit entries from the Forms page. Templates are data:
// the seeded Ar-Rayyan books (occurrence, incident, permission, attendance…)
// are fully editable in the hub.
// =============================================================================

const FIELD_TYPES = new Set(['text', 'textarea', 'number', 'date', 'time', 'select', 'checkbox'])

export function sanitizeFields(raw: unknown): OcgFormFieldDef[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: OcgFormFieldDef[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const f = item as Record<string, unknown>
    const label = String(f.label ?? '').trim()
    if (!label) continue
    let key = String(f.key ?? '').trim() || label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    if (!key) continue
    while (seen.has(key)) key = `${key}_2`
    seen.add(key)
    const type = FIELD_TYPES.has(String(f.type)) ? (String(f.type) as OcgFormFieldDef['type']) : 'text'
    const field: OcgFormFieldDef = { key, label, type, required: f.required === true || f.required === 'true' }
    if (type === 'select') {
      field.options = Array.isArray(f.options)
        ? f.options.map(String).map((s) => s.trim()).filter(Boolean)
        : String(f.options ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    }
    if (f.placeholder) field.placeholder = String(f.placeholder)
    out.push(field)
  }
  return out
}

/**
 * Is a template within a viewer's brand scope? `brandIds === null` means
 * unrestricted; a group-wide form (no brand_id) is visible to every scope.
 * Pure — unit-tested in forms.test.ts and reused for read + write enforcement.
 */
export function templateInScope(brandId: string | null, brandIds: string[] | null): boolean {
  if (brandIds === null) return true
  if (!brandId) return true
  return brandIds.includes(brandId)
}

export async function getFormTemplate(id: string): Promise<OcgFormTemplateRow | null> {
  if (!id) return null
  const { data } = await db().from('ocg_form_templates').select('*').eq('id', id).maybeSingle()
  return (data as OcgFormTemplateRow | null) ?? null
}

export async function listFormTemplates(
  opts: { includeInactive?: boolean; brandIds?: string[] | null } = {},
): Promise<OcgFormTemplateRow[]> {
  let q = db().from('ocg_form_templates').select('*').order('sort_order', { ascending: true }).order('name', { ascending: true })
  if (!opts.includeInactive) q = q.eq('is_active', true)
  const { data } = await q
  const templates = (data as OcgFormTemplateRow[] | null) ?? []
  const brandIds = opts.brandIds ?? null
  // Brand compartment: a scoped user only sees their brands' forms + group-wide.
  return templates.filter((t) => templateInScope(t.brand_id, brandIds))
}

export async function createFormTemplate(input: {
  name: string
  brand_id?: string | null
  module?: string
  description?: string
  frequency?: string
  fields: unknown
  created_by: string
}): Promise<OcgFormTemplateRow> {
  if (!input.name?.trim()) throw new Error('Form name is required')
  const fields = sanitizeFields(input.fields)
  if (fields.length === 0) throw new Error('Add at least one field')
  const { data, error } = await db()
    .from('ocg_form_templates')
    .insert({
      name: input.name.trim(),
      brand_id: input.brand_id || null,
      module: input.module || 'general',
      description: input.description ?? '',
      frequency: input.frequency || 'daily',
      fields,
      created_by: input.created_by,
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as OcgFormTemplateRow
}

export async function updateFormTemplate(
  id: string,
  patch: {
    name?: string
    brand_id?: string | null
    module?: string
    description?: string
    frequency?: string
    fields?: unknown
    is_active?: boolean
    sort_order?: number
  },
): Promise<OcgFormTemplateRow> {
  if (!id) throw new Error('id is required')
  const update: Record<string, unknown> = { updated_at: nowIso() }
  if (patch.name !== undefined) update.name = String(patch.name).trim()
  if (patch.brand_id !== undefined) update.brand_id = patch.brand_id || null
  if (patch.module !== undefined) update.module = patch.module
  if (patch.description !== undefined) update.description = patch.description
  if (patch.frequency !== undefined) update.frequency = patch.frequency
  if (patch.is_active !== undefined) update.is_active = patch.is_active
  if (patch.sort_order !== undefined) update.sort_order = Number(patch.sort_order)
  if (patch.fields !== undefined) {
    const fields = sanitizeFields(patch.fields)
    if (fields.length === 0) throw new Error('A form needs at least one field')
    update.fields = fields
  }
  const { data, error } = await db()
    .from('ocg_form_templates')
    .update(update)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as OcgFormTemplateRow
}

export async function submitForm(input: {
  template_id: string
  values: Record<string, unknown>
  submitted_by: string
  submitted_by_name: string
  submission_date?: string
  notes?: string
}): Promise<OcgFormSubmissionRow> {
  const { data: templateRow } = await db()
    .from('ocg_form_templates')
    .select('*')
    .eq('id', input.template_id)
    .maybeSingle()
  if (!templateRow) throw new Error('Form not found')
  const template = templateRow as OcgFormTemplateRow

  // Keep only known field keys; enforce required fields.
  const values: Record<string, unknown> = {}
  for (const field of template.fields) {
    const raw = input.values?.[field.key]
    if (field.type === 'checkbox') {
      values[field.key] = raw === true || raw === 'true' || raw === 'on'
      continue
    }
    const str = raw == null ? '' : String(raw)
    if (field.required && !str.trim()) throw new Error(`${field.label} is required`)
    values[field.key] = field.type === 'number' && str !== '' ? Number(str) : str
  }

  const { data, error } = await db()
    .from('ocg_form_submissions')
    .insert({
      template_id: template.id,
      brand_id: template.brand_id,
      submitted_by: input.submitted_by.toLowerCase(),
      submitted_by_name: input.submitted_by_name,
      submission_date: input.submission_date || nowIso().slice(0, 10),
      values,
      notes: input.notes ?? '',
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as OcgFormSubmissionRow
}

/** Submissions visible to the caller: everyone sees their own; reviewers
 *  (management view) see everything. */
export async function listSubmissions(opts: {
  viewerEmail: string
  canReviewAll: boolean
  templateId?: string
  limit?: number
}): Promise<OcgFormSubmissionRow[]> {
  let q = db()
    .from('ocg_form_submissions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 300)
  if (opts.templateId) q = q.eq('template_id', opts.templateId)
  if (!opts.canReviewAll) q = q.eq('submitted_by', opts.viewerEmail.toLowerCase())
  const { data } = await q
  return (data as OcgFormSubmissionRow[] | null) ?? []
}
