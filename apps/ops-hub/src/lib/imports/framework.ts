import crypto from 'node:crypto'
import { db, nowIso } from '../serverClient'
import type { WorkbookData } from '../xlsx'
import type { Actor } from '../api-auth'
import type { DataImportRow, DataImportStagingRow, DataImportDupStatus } from '@ocg/db'
import { importIdempotencyKey } from '../governanceModel'

/**
 * Reusable import foundation (migration 046 / Part 8). One flow:
 *   upload → parse → stage rows → classify duplicates → validate (dry-run) →
 *   commit → receipt → rollback (where safe).
 * Source-specific parsing/commit lives in adapters implementing `ImportAdapter`.
 * Parsing runs server-side only. Commits are idempotent via the source-coordinate
 * unique indexes on the target tables.
 */

export interface ParsedRow {
  sheet_name: string
  source_row: number
  raw: Record<string, unknown>
  mapped: Record<string, unknown>
  /** charge | payment | petty-income | petty-expense | requirement | skip | subtotal | header */
  record_kind: string
  messages?: Array<{ level: 'warning' | 'error'; text: string }>
}

export interface CommitContext {
  importId: string
  brandId: string | null
  school: string
  actor: Pick<Actor, 'userId' | 'email' | 'name'>
  allowed: string[] | null
}

export interface ImportAdapter {
  type: string
  /** Parse a workbook into staged rows. Subtotal/total/header/blank rows are
   *  emitted with record_kind that the framework will skip (never committed). */
  parse(wb: WorkbookData, opts: { selectedSheets?: string[]; school?: string }): ParsedRow[]
  /** A stable signature used for duplicate detection (order-independent list). */
  signature(mapped: Record<string, unknown>): string[]
  /** Commit a single staging row to its target table. Return null to skip. */
  commit(row: DataImportStagingRow, ctx: CommitContext): Promise<{ target_table: string; target_id: string } | null>
  /** Delete a committed target row during rollback if still safe (returns true if removed). */
  rollbackRow?(row: DataImportStagingRow, ctx: CommitContext): Promise<boolean>
}

const SKIP_KINDS = new Set(['skip', 'subtotal', 'total', 'header', 'blank'])

export function sha256(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

/** Create the import record (metadata + retained file reference). */
export async function createImport(input: {
  import_type: string
  brand_id: string | null
  school?: string
  source_filename: string
  file_hash: string
  storage_bucket?: string
  storage_path?: string
  sheets_available: Array<{ name: string; rowCount: number; colCount: number }>
  field_mappings?: Record<string, unknown>
  uploaded_by: string
  source_id?: string | null
  period_id?: string | null
  evidence_class?: number | null
  target_domain?: string
  period_start?: string | null
  period_end?: string | null
}): Promise<DataImportRow> {
  const key = importIdempotencyKey({
    brandId: input.brand_id,
    importType: input.import_type,
    fileHash: input.file_hash,
    periodStart: input.period_start,
    periodEnd: input.period_end,
  })
  const supabase = db()
  const { data: existing } = await supabase
    .from('data_imports')
    .select('*')
    .eq('idempotency_key', key)
    .maybeSingle()
  if (existing) return existing as DataImportRow

  const { data, error } = await supabase
    .from('data_imports')
    .insert({
      import_type: input.import_type,
      brand_id: input.brand_id,
      school: input.school ?? '',
      source_filename: input.source_filename,
      file_hash: input.file_hash,
      storage_bucket: input.storage_bucket ?? '',
      storage_path: input.storage_path ?? '',
      sheets_available: input.sheets_available,
      field_mappings: input.field_mappings ?? {},
      uploaded_by: input.uploaded_by,
      idempotency_key: key,
      source_id: input.source_id ?? null,
      period_id: input.period_id ?? null,
      evidence_class: input.evidence_class ?? null,
      target_domain: input.target_domain ?? '',
      period_start: input.period_start ?? null,
      period_end: input.period_end ?? null,
      status: 'uploaded',
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as DataImportRow
}

/** Warn if the same file (by hash) was imported before. */
export async function findPriorImportByHash(hash: string, excludeId?: string): Promise<DataImportRow[]> {
  let q = db().from('data_imports').select('*').eq('file_hash', hash)
  if (excludeId) q = q.neq('id', excludeId)
  const { data } = await q
  return (data as DataImportRow[] | null) ?? []
}

/**
 * Parse + stage. Classifies each row's duplicate status against already-committed
 * rows of the same import type (by signature) and against prior source coords.
 */
export async function parseAndStage(
  importRecord: DataImportRow,
  adapter: ImportAdapter,
  wb: WorkbookData,
  opts: { selectedSheets?: string[] } = {},
): Promise<{ staged: number; skipped: number; duplicates: number }> {
  const supabase = db()
  const parsed = adapter.parse(wb, { selectedSheets: opts.selectedSheets, school: importRecord.school })

  // Signatures already present in previously committed staging rows (dup across imports).
  const seen = new Map<string, string>() // signature -> existing staging id
  const { data: priorRows } = await supabase
    .from('data_import_rows')
    .select('id, mapped_payload, row_state')
    .in('row_state', ['committed'])
    .limit(20000)
  for (const r of ((priorRows as Array<{ id: string; mapped_payload: Record<string, unknown> }> | null) ?? [])) {
    for (const s of adapter.signature(r.mapped_payload)) seen.set(s, r.id)
  }

  let staged = 0
  let skipped = 0
  let duplicates = 0
  const within = new Set<string>() // dup within THIS file
  const toInsert: Array<Record<string, unknown>> = []

  for (const p of parsed) {
    const isSkip = SKIP_KINDS.has(p.record_kind)
    let dup: DataImportDupStatus = 'new'
    let dupTarget: string | null = null
    if (!isSkip) {
      const sigs = adapter.signature(p.mapped)
      for (const s of sigs) {
        if (within.has(s)) { dup = 'probable_duplicate'; break }
        if (seen.has(s)) { dup = 'exact_duplicate'; dupTarget = seen.get(s) ?? null; break }
      }
      if (dup === 'new') sigs.forEach((s) => within.add(s))
      if (dup !== 'new') duplicates++
      staged++
    } else {
      skipped++
    }
    const hasError = (p.messages ?? []).some((m) => m.level === 'error')
    toInsert.push({
      import_id: importRecord.id,
      sheet_name: p.sheet_name,
      source_row: p.source_row,
      raw_payload: p.raw,
      mapped_payload: p.mapped,
      record_kind: p.record_kind,
      dup_status: dup,
      dup_target_id: dupTarget,
      row_state: isSkip ? 'skipped' : hasError ? 'error' : dup === 'exact_duplicate' ? 'skipped' : 'valid',
      messages: p.messages ?? [],
    })
  }

  // Batch insert staging rows.
  for (let i = 0; i < toInsert.length; i += 500) {
    const chunk = toInsert.slice(i, i + 500)
    const { error } = await supabase.from('data_import_rows').upsert(chunk as never, {
      onConflict: 'import_id,sheet_name,source_row,record_kind',
      ignoreDuplicates: true,
    })
    if (error) throw new Error(error.message)
  }

  await supabase
    .from('data_imports')
    .update({
      status: 'parsed',
      sheets_processed: opts.selectedSheets ?? wb.sheets.map((s) => s.name),
      rows_scanned: parsed.length,
      records_skipped: skipped,
      duplicates_found: duplicates,
      updated_at: nowIso(),
    })
    .eq('id', importRecord.id)

  return { staged, skipped, duplicates }
}

export interface CommitResult {
  created: number
  updated: number
  skipped: number
  failed: number
}

/**
 * Commit staged rows. `dryRun` validates without writing. Rows flagged
 * exact_duplicate/error/skipped are not committed. `includeDuplicates` lets the
 * reviewer force probable/possible duplicates through.
 */
export async function commitImport(
  importRecord: DataImportRow,
  adapter: ImportAdapter,
  ctx: Omit<CommitContext, 'importId'>,
  opts: { dryRun?: boolean; includeDuplicates?: boolean } = {},
): Promise<CommitResult> {
  const supabase = db()
  const { data: rows } = await supabase
    .from('data_import_rows')
    .select('*')
    .eq('import_id', importRecord.id)
    .in('row_state', ['valid', 'warning'])
    .order('source_row', { ascending: true })
  const staging = (rows as DataImportStagingRow[] | null) ?? []

  const result: CommitResult = { created: 0, updated: 0, skipped: 0, failed: 0 }
  const commitCtx: CommitContext = { ...ctx, importId: importRecord.id }

  for (const row of staging) {
    if (!opts.includeDuplicates && (row.dup_status === 'exact_duplicate' || row.dup_status === 'probable_duplicate')) {
      result.skipped++
      continue
    }
    if (opts.dryRun) { result.created++; continue }
    try {
      const target = await adapter.commit(row, commitCtx)
      if (!target) { result.skipped++; continue }
      await supabase
        .from('data_import_rows')
        .update({ row_state: 'committed', target_table: target.target_table, target_id: target.target_id, updated_at: nowIso() })
        .eq('id', row.id)
      result.created++
    } catch (e) {
      result.failed++
      await supabase
        .from('data_import_rows')
        .update({
          row_state: 'error',
          messages: [...(row.messages as unknown[] ?? []), { level: 'error', text: (e as Error).message }],
          updated_at: nowIso(),
        })
        .eq('id', row.id)
    }
  }

  if (!opts.dryRun) {
    const status = result.failed === 0 ? 'committed' : result.created > 0 ? 'partially_committed' : 'failed'
    await supabase
      .from('data_imports')
      .update({
        status,
        records_created: result.created,
        records_skipped: result.skipped,
        failed_count: result.failed,
        committed_by: ctx.actor.name || ctx.actor.email || '',
        committed_at: nowIso(),
        updated_at: nowIso(),
      })
      .eq('id', importRecord.id)
  }
  return result
}

/**
 * Roll back a committed import. Only removes target rows the adapter deems safe
 * (e.g. still draft / unreconciled). Posted-and-reconciled records are left in
 * place and reported as blocked.
 */
export async function rollbackImport(
  importRecord: DataImportRow,
  adapter: ImportAdapter,
  ctx: Omit<CommitContext, 'importId'>,
): Promise<{ removed: number; blocked: number }> {
  const supabase = db()
  const commitCtx: CommitContext = { ...ctx, importId: importRecord.id }
  const { data: rows } = await supabase
    .from('data_import_rows')
    .select('*')
    .eq('import_id', importRecord.id)
    .eq('row_state', 'committed')
  const staging = (rows as DataImportStagingRow[] | null) ?? []
  let removed = 0
  let blocked = 0
  for (const row of staging) {
    const ok = adapter.rollbackRow ? await adapter.rollbackRow(row, commitCtx) : false
    if (ok) {
      await supabase.from('data_import_rows').update({ row_state: 'rolled_back', updated_at: nowIso() }).eq('id', row.id)
      removed++
    } else {
      blocked++
    }
  }
  await supabase
    .from('data_imports')
    .update({
      rollback_status: blocked === 0 ? 'complete' : removed > 0 ? 'partial' : 'blocked',
      status: 'rolled_back',
      updated_at: nowIso(),
    })
    .eq('id', importRecord.id)
  return { removed, blocked }
}

/** Full import receipt for the UI. */
export async function importReceipt(importId: string): Promise<{ import: DataImportRow | null; rows: DataImportStagingRow[] }> {
  const { data: imp } = await db().from('data_imports').select('*').eq('id', importId).maybeSingle()
  const { data: rows } = await db().from('data_import_rows').select('*').eq('import_id', importId).order('source_row', { ascending: true })
  return { import: (imp as DataImportRow | null) ?? null, rows: (rows as DataImportStagingRow[] | null) ?? [] }
}
