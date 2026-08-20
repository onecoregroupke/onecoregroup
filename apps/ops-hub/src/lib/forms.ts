import { db, mintReference, nowIso } from './serverClient'
import type {
  OcgFormTemplateRow,
  OcgFormTemplateState,
  OcgFormTemplateVersionRow,
  OcgFormSubmissionRow,
  OcgFormSubmissionStatus,
  OcgFormFieldDef,
} from '@ocg/db'
import { snapshotVersion } from './recordVersions'

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

/**
 * Freeze a template's current field set as an immutable version snapshot, so a
 * submission filled today still renders against today's questions after the
 * form is edited next month. Idempotent per (template, version).
 */
export async function snapshotTemplateVersion(template: OcgFormTemplateRow, publishedBy = ''): Promise<void> {
  await db()
    .from('ocg_form_template_versions')
    .upsert(
      {
        template_id: template.id,
        version: template.version,
        name: template.name,
        description: template.description,
        fields: template.fields,
        published_by: publishedBy,
      },
      { onConflict: 'template_id,version' },
    )
}

export async function getTemplateVersion(
  templateId: string,
  version: number,
): Promise<OcgFormTemplateVersionRow | null> {
  const { data } = await db()
    .from('ocg_form_template_versions')
    .select('*')
    .eq('template_id', templateId)
    .eq('version', version)
    .maybeSingle()
  return (data as OcgFormTemplateVersionRow | null) ?? null
}

export async function createFormTemplate(input: {
  name: string
  brand_id?: string | null
  module?: string
  description?: string
  frequency?: string
  fields: unknown
  created_by: string
  state?: OcgFormTemplateState
  category?: string
  reference_prefix?: string
  requires_approval?: boolean
  allow_self_correction?: boolean
  requires_signature?: boolean
}): Promise<OcgFormTemplateRow> {
  if (!input.name?.trim()) throw new Error('Form name is required')
  const fields = sanitizeFields(input.fields)
  if (fields.length === 0) throw new Error('Add at least one field')
  const state: OcgFormTemplateState = input.state ?? 'published'
  const now = nowIso()
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
      state,
      version: 1,
      category: input.category ?? '',
      reference_prefix: input.reference_prefix ?? '',
      requires_approval: input.requires_approval ?? false,
      allow_self_correction: input.allow_self_correction ?? false,
      requires_signature: input.requires_signature ?? false,
      published_at: state === 'published' ? now : null,
      published_by: state === 'published' ? input.created_by : '',
      updated_by: input.created_by,
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  const template = data as OcgFormTemplateRow
  await snapshotTemplateVersion(template, input.created_by)
  return template
}

/** True when two field sets differ in a way that changes what a respondent sees. */
export function fieldsChanged(a: OcgFormFieldDef[], b: OcgFormFieldDef[]): boolean {
  return JSON.stringify(a) !== JSON.stringify(b)
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
    state?: OcgFormTemplateState
    category?: string
    reference_prefix?: string
    requires_approval?: boolean
    allow_self_correction?: boolean
    requires_signature?: boolean
  },
  actorEmail = '',
): Promise<OcgFormTemplateRow> {
  if (!id) throw new Error('id is required')
  const existing = await getFormTemplate(id)
  if (!existing) throw new Error('Form not found')

  const now = nowIso()
  const update: Record<string, unknown> = { updated_at: now, updated_by: actorEmail }
  if (patch.name !== undefined) update.name = String(patch.name).trim()
  if (patch.brand_id !== undefined) update.brand_id = patch.brand_id || null
  if (patch.module !== undefined) update.module = patch.module
  if (patch.description !== undefined) update.description = patch.description
  if (patch.frequency !== undefined) update.frequency = patch.frequency
  if (patch.is_active !== undefined) update.is_active = patch.is_active
  if (patch.sort_order !== undefined) update.sort_order = Number(patch.sort_order)
  if (patch.category !== undefined) update.category = patch.category
  if (patch.reference_prefix !== undefined) update.reference_prefix = patch.reference_prefix
  if (patch.requires_approval !== undefined) update.requires_approval = patch.requires_approval
  if (patch.allow_self_correction !== undefined) update.allow_self_correction = patch.allow_self_correction
  if (patch.requires_signature !== undefined) update.requires_signature = patch.requires_signature

  if (patch.state !== undefined && patch.state !== existing.state) {
    update.state = patch.state
    if (patch.state === 'published') {
      update.published_at = now
      update.published_by = actorEmail
    }
  }

  // Editing the structure of a form people have already filled must not rewrite
  // history: bump the version so past submissions stay pinned to the field set
  // they were answered against.
  let bumpedVersion: number | null = null
  if (patch.fields !== undefined) {
    const fields = sanitizeFields(patch.fields)
    if (fields.length === 0) throw new Error('A form needs at least one field')
    update.fields = fields
    if (existing.state === 'published' && fieldsChanged(existing.fields, fields)) {
      bumpedVersion = existing.version + 1
      update.version = bumpedVersion
    }
  }

  const { data, error } = await db()
    .from('ocg_form_templates')
    .update(update)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  const template = data as OcgFormTemplateRow
  if (bumpedVersion !== null || patch.state === 'published') {
    await snapshotTemplateVersion(template, actorEmail)
  }
  return template
}

/**
 * Coerce a raw answer payload down to the template's known field keys.
 * `requireAll` is false while a draft is being autosaved — a half-finished draft
 * must be storable — and true at the moment of submission.
 * Pure apart from the throw; unit-tested in forms.test.ts.
 */
export function coerceValues(
  fields: OcgFormFieldDef[],
  raw: Record<string, unknown> | undefined,
  opts: { requireAll: boolean },
): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  for (const field of fields) {
    const value = raw?.[field.key]
    if (field.type === 'checkbox') {
      values[field.key] = value === true || value === 'true' || value === 'on'
      continue
    }
    const str = value == null ? '' : String(value)
    if (opts.requireAll && field.required && !str.trim()) throw new Error(`${field.label} is required`)
    values[field.key] = field.type === 'number' && str !== '' ? Number(str) : str
  }
  return values
}

/** A submission's reference, minted once at submission time (never on draft). */
async function mintSubmissionReference(template: OcgFormTemplateRow): Promise<string | null> {
  const prefix = (template.reference_prefix || '').trim()
  if (!prefix) return null
  return mintReference(`form:${template.id}`, prefix.endsWith('-') ? prefix : `${prefix}-`)
}

async function snapshotSubmission(
  row: OcgFormSubmissionRow,
  input: { before?: OcgFormSubmissionRow | null; changedBy: string; reason: string },
) {
  await snapshotVersion({
    record_type: 'ocg_form_submissions', record_id: row.id,
    action: input.before ? 'update' : 'create',
    snapshot: row as unknown as Record<string, unknown>,
    previous_snapshot: input.before as unknown as Record<string, unknown> | null | undefined,
    brand_id: row.brand_id, changed_by: input.changedBy, reason: input.reason,
  })
}

export async function submitForm(input: {
  template_id: string
  values: Record<string, unknown>
  submitted_by: string
  submitted_by_name: string
  submission_date?: string
  notes?: string
}): Promise<OcgFormSubmissionRow> {
  const template = await getFormTemplate(input.template_id)
  if (!template) throw new Error('Form not found')
  if (template.state === 'archived') throw new Error('This form has been archived and can no longer be filled.')
  if (template.state === 'draft') throw new Error('This form is still a draft and cannot be filled yet.')

  const values = coerceValues(template.fields, input.values, { requireAll: true })
  const now = nowIso()

  const { data, error } = await db()
    .from('ocg_form_submissions')
    .insert({
      template_id: template.id,
      brand_id: template.brand_id,
      submitted_by: input.submitted_by.toLowerCase(),
      submitted_by_name: input.submitted_by_name,
      submission_date: input.submission_date || now.slice(0, 10),
      values,
      notes: input.notes ?? '',
      status: template.requires_approval ? 'under_review' : 'submitted',
      template_version: template.version,
      reference: await mintSubmissionReference(template),
      submitted_at: now,
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  const row = data as OcgFormSubmissionRow
  await snapshotSubmission(row, { changedBy: input.submitted_by, reason: 'Form submitted' })
  return row
}

// ─── Draft lifecycle ────────────────────────────────────────────────────────
// A draft belongs to exactly one person and is the only state a respondent may
// freely edit. Autosave writes here; it never finalises anything.

export async function getSubmission(id: string): Promise<OcgFormSubmissionRow | null> {
  if (!id) return null
  const { data } = await db().from('ocg_form_submissions').select('*').eq('id', id).maybeSingle()
  return (data as OcgFormSubmissionRow | null) ?? null
}

/** Create or update the caller's draft. Returns the stored draft. */
export async function saveDraft(input: {
  template_id: string
  submission_id?: string
  values: Record<string, unknown>
  submitted_by: string
  submitted_by_name: string
  submission_date?: string
  notes?: string
}): Promise<OcgFormSubmissionRow> {
  const template = await getFormTemplate(input.template_id)
  if (!template) throw new Error('Form not found')
  if (template.state !== 'published') throw new Error('This form is not open for entries.')

  const email = input.submitted_by.toLowerCase()
  const values = coerceValues(template.fields, input.values, { requireAll: false })
  const now = nowIso()

  if (input.submission_id) {
    const existing = await getSubmission(input.submission_id)
    if (!existing) throw new Error('Draft not found')
    assertOwnEditable(existing, email, template)
    const { data, error } = await db()
      .from('ocg_form_submissions')
      .update({
        values,
        notes: input.notes ?? existing.notes,
        submission_date: input.submission_date || existing.submission_date,
        autosaved_at: now,
        updated_at: now,
      })
      .eq('id', existing.id)
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    const row = data as OcgFormSubmissionRow
    await snapshotSubmission(row, { before: existing, changedBy: email, reason: existing.status === 'correction_requested' ? 'Correction saved' : 'Draft autosaved' })
    return row
  }

  const { data, error } = await db()
    .from('ocg_form_submissions')
    .insert({
      template_id: template.id,
      brand_id: template.brand_id,
      submitted_by: email,
      submitted_by_name: input.submitted_by_name,
      submission_date: input.submission_date || now.slice(0, 10),
      values,
      notes: input.notes ?? '',
      status: 'draft',
      template_version: template.version,
      autosaved_at: now,
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  const row = data as OcgFormSubmissionRow
  await snapshotSubmission(row, { changedBy: email, reason: 'Draft created' })
  return row
}

/**
 * Which submissions the original submitter may still edit:
 *  - their own draft, always
 *  - their own submitted entry, only while the template allows self-correction
 *    and it has not yet been approved
 *  - their own entry that a reviewer explicitly sent back
 * Anything else is closed to the respondent — including approved entries.
 */
export function assertOwnEditable(
  submission: OcgFormSubmissionRow,
  email: string,
  template: OcgFormTemplateRow,
): void {
  if (submission.submitted_by.toLowerCase() !== email.toLowerCase()) {
    throw new Error('You can only edit your own entries.')
  }
  if (submission.status === 'draft' || submission.status === 'correction_requested') return
  if (submission.status === 'submitted' && template.allow_self_correction) return
  throw new Error(`A ${submission.status.replace(/_/g, ' ')} entry can no longer be edited.`)
}

/** Promote the caller's draft (or corrected entry) to a real submission. */
export async function submitDraft(input: {
  submission_id: string
  actor_email: string
  values?: Record<string, unknown>
  notes?: string
  signature_name?: string
}): Promise<OcgFormSubmissionRow> {
  const existing = await getSubmission(input.submission_id)
  if (!existing) throw new Error('Entry not found')
  const template = await getFormTemplate(existing.template_id)
  if (!template) throw new Error('Form not found')
  assertOwnEditable(existing, input.actor_email, template)

  const merged = input.values ? { ...existing.values, ...input.values } : existing.values
  const values = coerceValues(template.fields, merged, { requireAll: true })
  if (template.requires_signature && !(input.signature_name ?? existing.signature_name).trim()) {
    throw new Error('This form must be signed before it can be submitted.')
  }
  const now = nowIso()

  const { data, error } = await db()
    .from('ocg_form_submissions')
    .update({
      values,
      notes: input.notes ?? existing.notes,
      status: template.requires_approval ? 'under_review' : 'submitted',
      // A reference is minted once, on first submission, and never reissued.
      reference: existing.reference ?? (await mintSubmissionReference(template)),
      submitted_at: existing.submitted_at ?? now,
      signature_name: input.signature_name ?? existing.signature_name,
      signed_at: input.signature_name ? now : existing.signed_at,
      correction_note: '',
      updated_at: now,
    })
    .eq('id', existing.id)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  const row = data as OcgFormSubmissionRow
  await snapshotSubmission(row, { before: existing, changedBy: input.actor_email, reason: existing.status === 'correction_requested' ? 'Correction resubmitted' : 'Draft submitted' })
  return row
}

/** Reviewer decision. The reviewer may never be the submitter. */
export async function reviewSubmission(input: {
  submission_id: string
  actor_email: string
  actor_name: string
  decision: 'approve' | 'reject' | 'request_correction'
  comment?: string
}): Promise<OcgFormSubmissionRow> {
  const existing = await getSubmission(input.submission_id)
  if (!existing) throw new Error('Entry not found')
  if (existing.status === 'draft') throw new Error('That entry has not been submitted yet.')
  if (existing.submitted_by.toLowerCase() === input.actor_email.toLowerCase()) {
    throw new Error('You cannot review your own submission.')
  }
  const status =
    input.decision === 'approve' ? 'approved' : input.decision === 'reject' ? 'rejected' : 'correction_requested'
  const now = nowIso()

  const { data, error } = await db()
    .from('ocg_form_submissions')
    .update({
      status,
      reviewed_by: input.actor_email.toLowerCase(),
      reviewed_at: now,
      review_comment: input.comment ?? '',
      correction_note: input.decision === 'request_correction' ? (input.comment ?? '') : '',
      updated_at: now,
    })
    .eq('id', existing.id)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  const row = data as OcgFormSubmissionRow
  await snapshotSubmission(row, { before: existing, changedBy: input.actor_email, reason: `Review: ${input.decision}${input.comment ? ` — ${input.comment}` : ''}` })
  return row
}

/**
 * Submissions visible to the caller: everyone sees their own; reviewers
 * (management view) see everyone's — but never anyone else's unsubmitted draft.
 * A draft is private working state until its author submits it.
 */
export async function listSubmissions(opts: {
  viewerEmail: string
  canReviewAll: boolean
  templateId?: string
  status?: OcgFormSubmissionStatus
  limit?: number
}): Promise<OcgFormSubmissionRow[]> {
  const viewer = opts.viewerEmail.toLowerCase()
  let q = db()
    .from('ocg_form_submissions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 300)
  if (opts.templateId) q = q.eq('template_id', opts.templateId)
  if (opts.status) q = q.eq('status', opts.status)
  if (!opts.canReviewAll) q = q.eq('submitted_by', viewer)
  const { data } = await q
  const rows = (data as OcgFormSubmissionRow[] | null) ?? []
  return rows.filter((r) => r.status !== 'draft' || r.submitted_by.toLowerCase() === viewer)
}
