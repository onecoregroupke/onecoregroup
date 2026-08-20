import { db, mintReference, nowIso } from './serverClient'
import {
  assertImportTransition, canApproveImport, canLockImport, importIdempotencyKey,
  type HistoricalImportState,
} from './governanceModel'
import type {
  DataImportRow, HistoricalImportSourceRow, HistoricalImportPeriodRow,
  HistoricalImportMappingRow, HistoricalImportExceptionRow,
  HistoricalImportReconciliationRow,
} from '@ocg/db'

export interface HistoricalImportDashboard {
  sources: HistoricalImportSourceRow[]
  batches: DataImportRow[]
  periods: HistoricalImportPeriodRow[]
  mappings: HistoricalImportMappingRow[]
}

export async function listHistoricalImports(allowedBrands: string[] | null): Promise<HistoricalImportDashboard> {
  const supabase = db()
  const sourceQuery = supabase.from('historical_import_sources').select('*').order('created_at', { ascending: false }).limit(300)
  const batchQuery = supabase.from('data_imports').select('*').not('source_id', 'is', null).order('created_at', { ascending: false }).limit(300)
  const periodQuery = supabase.from('historical_import_periods').select('*').order('period_start', { ascending: false }).limit(200)
  const mappingQuery = supabase.from('historical_import_mappings').select('*').order('created_at', { ascending: false }).limit(500)
  if (allowedBrands !== null) {
    sourceQuery.in('brand_id', allowedBrands)
    batchQuery.in('brand_id', allowedBrands)
    periodQuery.in('brand_id', allowedBrands)
    mappingQuery.in('brand_id', allowedBrands)
  }
  const [sources, batches, periods, mappings] = await Promise.all([sourceQuery, batchQuery, periodQuery, mappingQuery])
  return {
    sources: (sources.data as HistoricalImportSourceRow[] | null) ?? [],
    batches: (batches.data as DataImportRow[] | null) ?? [],
    periods: (periods.data as HistoricalImportPeriodRow[] | null) ?? [],
    mappings: (mappings.data as HistoricalImportMappingRow[] | null) ?? [],
  }
}

export async function registerHistoricalSource(input: {
  title: string
  filename?: string
  source_type: string
  evidence_class: number
  brand_id: string | null
  period_start?: string | null
  period_end?: string | null
  description?: string
  storage_bucket?: string
  storage_path?: string
  checksum_sha256?: string
  source_date?: string | null
  notes?: string
  actor: string
}): Promise<HistoricalImportSourceRow> {
  if (!input.title.trim()) throw new Error('Source title is required')
  if (!Number.isInteger(input.evidence_class) || input.evidence_class < 1 || input.evidence_class > 5) {
    throw new Error('Evidence class must be 1 to 5')
  }
  const sourceRef = await mintReference('historical_source', 'SRC-', 5)
  const { data, error } = await db().from('historical_import_sources').insert({
    source_ref: sourceRef, title: input.title.trim(), filename: input.filename ?? '',
    source_type: input.source_type, evidence_class: input.evidence_class,
    brand_id: input.brand_id, period_start: input.period_start ?? null, period_end: input.period_end ?? null,
    description: input.description ?? '', storage_bucket: input.storage_bucket ?? '', storage_path: input.storage_path ?? '',
    checksum_sha256: input.checksum_sha256 ?? '', source_date: input.source_date ?? null,
    notes: input.notes ?? '', registered_by: input.actor,
  }).select('*').single()
  if (error) throw new Error(error.message)
  return data as HistoricalImportSourceRow
}

export async function createHistoricalBatch(input: {
  source: HistoricalImportSourceRow
  target_domain: string
  import_type: string
  period_start: string
  period_end: string
  actor: string
}): Promise<DataImportRow> {
  if (input.source.evidence_class === 5) {
    throw new Error('Knowledge/reference sources must use the Knowledge review workflow, not a transactional import batch.')
  }
  if (!input.source.brand_id) throw new Error('A transactional historical batch requires an entity')
  const supabase = db()
  const { data: periodData, error: periodError } = await supabase.from('historical_import_periods').upsert({
    brand_id: input.source.brand_id, target_domain: input.target_domain,
    period_start: input.period_start, period_end: input.period_end,
    status: 'staging', created_by: input.actor, updated_at: nowIso(),
  }, { onConflict: 'brand_id,target_domain,period_start,period_end' }).select('*').single()
  if (periodError) throw new Error(periodError.message)
  const period = periodData as HistoricalImportPeriodRow
  const key = importIdempotencyKey({
    brandId: input.source.brand_id, importType: input.import_type,
    fileHash: input.source.checksum_sha256 || input.source.id,
    periodStart: input.period_start, periodEnd: input.period_end,
  })
  const { data: existing } = await supabase.from('data_imports').select('*').eq('idempotency_key', key).maybeSingle()
  if (existing) return existing as DataImportRow
  const { data, error } = await supabase.from('data_imports').insert({
    import_type: input.import_type, brand_id: input.source.brand_id,
    source_filename: input.source.filename, file_hash: input.source.checksum_sha256,
    storage_bucket: input.source.storage_bucket, storage_path: input.source.storage_path,
    status: 'uploaded', source_id: input.source.id, period_id: period.id,
    evidence_class: input.source.evidence_class, target_domain: input.target_domain,
    period_start: input.period_start, period_end: input.period_end,
    idempotency_key: key, uploaded_by: input.actor,
  }).select('*').single()
  if (error) throw new Error(error.message)
  await supabase.from('historical_import_source_links').insert({ import_id: (data as DataImportRow).id, source_id: input.source.id })
  return data as DataImportRow
}

export async function createHistoricalMapping(input: {
  brand_id: string | null
  target_domain: string
  source_field: string
  original_value: string
  normalized_value?: string
  target_type: string
  target_id?: string | null
  source_id?: string | null
  actor: string
}): Promise<HistoricalImportMappingRow> {
  if (!input.original_value.trim()) throw new Error('Original source value is required')
  const { actor, ...rest } = input
  const { data, error } = await db().from('historical_import_mappings').insert({
    ...rest, original_value: input.original_value, normalized_value: input.normalized_value ?? '',
    target_id: input.target_id ?? null, source_id: input.source_id ?? null,
    status: 'proposed', created_by: actor,
  }).select('*').single()
  if (error) throw new Error(error.message)
  return data as HistoricalImportMappingRow
}

export async function importValidationSummary(importId: string) {
  const supabase = db()
  const [{ data: rows }, { data: exceptions }, { data: reconciliations }] = await Promise.all([
    supabase.from('data_import_rows').select('row_state,dup_status,exception_status').eq('import_id', importId),
    supabase.from('historical_import_exceptions').select('*').eq('import_id', importId),
    supabase.from('historical_import_reconciliations').select('*').eq('import_id', importId),
  ])
  const staged = (rows as Array<{ row_state: string; dup_status: string; exception_status: string }> | null) ?? []
  const issues = (exceptions as HistoricalImportExceptionRow[] | null) ?? []
  const controls = (reconciliations as HistoricalImportReconciliationRow[] | null) ?? []
  return {
    total: staged.length,
    valid: staged.filter((row) => row.row_state === 'valid' || row.row_state === 'warning').length,
    committed: staged.filter((row) => row.row_state === 'committed').length,
    warnings: staged.filter((row) => row.row_state === 'warning').length,
    errors: staged.filter((row) => row.row_state === 'error').length,
    duplicates: staged.filter((row) => row.dup_status !== 'new').length,
    needsMapping: staged.filter((row) => row.exception_status === 'needs_mapping').length,
    fatalExceptions: issues.filter((issue) => issue.status === 'open' && issue.severity === 'fatal').length,
    openErrors: issues.filter((issue) => issue.status === 'open' && issue.severity === 'error').length,
    failedReconciliations: controls.filter((control) => control.result === 'failed').length,
    pendingReconciliations: controls.filter((control) => control.result === 'pending').length,
  }
}

export async function transitionHistoricalBatch(input: {
  batch: DataImportRow
  to: HistoricalImportState
  actor: string
  note?: string
}): Promise<DataImportRow> {
  const from = input.batch.status as HistoricalImportState
  assertImportTransition(from, input.to)
  const summary = await importValidationSummary(input.batch.id)
  if (input.to === 'ready_for_review' && (summary.valid === 0 || summary.fatalExceptions > 0 || summary.openErrors > 0)) {
    throw new Error('Resolve fatal validation issues and stage at least one valid row before review.')
  }
  if (input.to === 'approved' && !canApproveImport({ fatalExceptions: summary.fatalExceptions, openErrors: summary.openErrors, validRows: summary.valid })) {
    throw new Error('This batch is not ready for approval.')
  }
  if (input.to === 'locked' && !canLockImport({ status: from, failedReconciliations: summary.failedReconciliations, pendingReconciliations: summary.pendingReconciliations })) {
    throw new Error('Only a fully reconciled batch can be locked.')
  }
  if (input.to === 'reconciled' && (summary.failedReconciliations > 0 || summary.pendingReconciliations > 0)) {
    throw new Error('All reconciliation controls must be matched or explained.')
  }
  const patch: Record<string, unknown> = { status: input.to, validation_summary: summary, updated_at: nowIso() }
  if (input.to === 'ready_for_review') Object.assign(patch, { reviewed_by: input.actor, reviewed_at: nowIso() })
  if (input.to === 'approved') Object.assign(patch, { approved_by: input.actor, approved_at: nowIso() })
  if (input.to === 'reconciled') Object.assign(patch, { reconciled_by: input.actor, reconciled_at: nowIso() })
  if (input.to === 'locked') Object.assign(patch, { locked_by: input.actor, locked_at: nowIso() })
  const { data, error } = await db().from('data_imports').update(patch).eq('id', input.batch.id).select('*').single()
  if (error) throw new Error(error.message)
  await db().from('historical_import_events').insert({
    import_id: input.batch.id, event_type: input.to, from_status: from, to_status: input.to,
    summary: input.note || `Batch moved from ${from} to ${input.to}`, actor_name: input.actor,
  })
  if (input.to === 'reconciled' || input.to === 'locked') {
    const periodPatch = input.to === 'reconciled'
      ? { status: 'reconciled' as const, reconciled_by: input.actor, reconciled_at: nowIso(), updated_at: nowIso() }
      : { status: 'locked' as const, locked_by: input.actor, locked_at: nowIso(), updated_at: nowIso() }
    await db().from('historical_import_periods').update(periodPatch).eq('id', input.batch.period_id ?? '')
  }
  return data as DataImportRow
}

export async function addReconciliation(input: {
  import_id: string
  reconciliation_type: string
  control_name: string
  source_total: number | null
  posted_total: number | null
  result: HistoricalImportReconciliationRow['result']
  notes: string
  actor: string
}): Promise<HistoricalImportReconciliationRow> {
  const variance = input.source_total == null || input.posted_total == null ? null : input.posted_total - input.source_total
  const { data, error } = await db().from('historical_import_reconciliations').insert({
    import_id: input.import_id, reconciliation_type: input.reconciliation_type,
    control_name: input.control_name, source_total: input.source_total, posted_total: input.posted_total,
    variance, result: input.result, notes: input.notes,
    reconciled_by: input.actor, reconciled_at: input.result === 'pending' ? null : nowIso(),
  }).select('*').single()
  if (error) throw new Error(error.message)
  return data as HistoricalImportReconciliationRow
}
