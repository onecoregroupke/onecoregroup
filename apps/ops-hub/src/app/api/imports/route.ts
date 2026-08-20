import { NextResponse, type NextRequest } from 'next/server'
import { requireApiSection } from '@/lib/api-auth'
import { assertBrandInScope } from '@/lib/finance'
import { readWorkbook, listSheets } from '@/lib/xlsx'
import {
  createImport, parseAndStage, commitImport, rollbackImport, importReceipt,
  findPriorImportByHash, sha256,
} from '@/lib/imports/framework'
import { getAdapter } from '@/lib/imports/registry'
import { retainImportFile } from '@/lib/imports/storage'
import { importTypeAllowedForBrand, schoolForBrandSlug } from '@/lib/imports/brandScope'
import { resolveBrand } from '@/lib/brands'
import { db } from '@/lib/serverClient'
import type { DataImportRow } from '@ocg/db'
import type { HistoricalImportSourceRow } from '@ocg/db'

/**
 * Import framework API (Part 8). One route, three POST actions plus GET.
 *  - multipart POST (file present)  → upload + parse + stage; returns a preview.
 *  - JSON POST { action:'commit' }  → validate (dryRun) or commit staged rows.
 *  - JSON POST { action:'rollback'} → roll back a committed import where safe.
 *  - GET ?importId= → receipt; GET → recent imports (brand-scoped).
 * All imports are validated + committed server-side and brand-scope checked.
 */

function allowedFor(actor: Exclude<Awaited<ReturnType<typeof requireApiSection>>, NextResponse>): string[] | null {
  return actor.permissions === null || actor.isSuperAdmin ? null : (actor.allowedBrandIds('finance') ?? [])
}

export async function GET(req: NextRequest) {
  const gate = await requireApiSection(req, 'finance', 'view')
  if (gate instanceof NextResponse) return gate
  const url = new URL(req.url)
  const importId = url.searchParams.get('importId')
  if (importId) {
    const receipt = await importReceipt(importId)
    return NextResponse.json({ ok: true, ...receipt })
  }
  const brand = url.searchParams.get('brand')
  let q = db().from('data_imports').select('*').order('created_at', { ascending: false }).limit(100)
  if (brand) q = q.eq('brand_id', brand)
  const { data } = await q
  return NextResponse.json({ ok: true, imports: (data as DataImportRow[] | null) ?? [] })
}

export async function POST(req: NextRequest) {
  const gate = await requireApiSection(req, 'finance', 'edit')
  if (gate instanceof NextResponse) return gate
  const actor = gate
  const allowed = allowedFor(actor)
  const contentType = req.headers.get('content-type') ?? ''

  try {
    // ── Upload + parse (multipart) ──────────────────────────────────────────
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData()
      const file = form.get('file')
      if (!(file instanceof File)) return NextResponse.json({ ok: false, error: 'No file uploaded' }, { status: 400 })
      const importType = String(form.get('import_type') ?? 'petty-cash')
      const brandId = (form.get('brand_id') as string) || null
      const school = String(form.get('school') ?? '')
      const selected = String(form.get('sheets') ?? '')
      const selectedSheets = selected ? selected.split(',').map((s) => s.trim()).filter(Boolean) : undefined
      const sourceId = String(form.get('historical_source_id') ?? '') || null
      const periodId = String(form.get('historical_period_id') ?? '') || null
      const targetDomain = String(form.get('target_domain') ?? '')
      const periodStart = String(form.get('period_start') ?? '') || null
      const periodEnd = String(form.get('period_end') ?? '') || null

      assertBrandInScope(brandId, allowed, 'import data')

      // Brand-scoped import matrix: reject a type not allowed for this brand
      // (e.g. student / school-fee imports for NPT) and DERIVE the school from
      // the brand for school-ledger so client + brand can never mismatch.
      const brandRow = brandId ? await resolveBrand(brandId) : null
      const brandSlug = brandRow?.slug
      if (!importTypeAllowedForBrand(brandSlug, importType)) {
        return NextResponse.json({ ok: false, error: `The "${importType}" import is not available for this brand.` }, { status: 400 })
      }
      const effSchool = importType === 'school-ledger' ? (schoolForBrandSlug(brandSlug) ?? school) : school
      let historicalSource: HistoricalImportSourceRow | null = null
      if (sourceId) {
        const { data } = await db().from('historical_import_sources').select('*').eq('id', sourceId).maybeSingle()
        historicalSource = data as HistoricalImportSourceRow | null
        if (!historicalSource || historicalSource.brand_id !== brandId) {
          return NextResponse.json({ ok: false, error: 'Historical source does not belong to the selected entity.' }, { status: 400 })
        }
        if (historicalSource.evidence_class === 5) {
          return NextResponse.json({ ok: false, error: 'Knowledge/reference sources must use the Knowledge workflow.' }, { status: 400 })
        }
      }

      const buffer = Buffer.from(await file.arrayBuffer())
      const hash = sha256(buffer)
      const prior = await findPriorImportByHash(hash)
      const sheetsMeta = await listSheets(buffer)
      const retained = await retainImportFile(buffer, file.name, effSchool || brandId || 'imports')

      const importRecord = await createImport({
        import_type: importType,
        brand_id: brandId,
        school: effSchool,
        source_filename: file.name,
        file_hash: hash,
        storage_bucket: retained.bucket,
        storage_path: retained.path,
        sheets_available: sheetsMeta,
        uploaded_by: actor.name || actor.email || 'unknown',
        source_id: sourceId,
        period_id: periodId,
        evidence_class: historicalSource?.evidence_class ?? null,
        target_domain: targetDomain,
        period_start: periodStart,
        period_end: periodEnd,
      })
      if (sourceId) {
        await db().from('historical_import_source_links').upsert({ import_id: importRecord.id, source_id: sourceId }, { onConflict: 'import_id,source_id' })
      }

      const wb = await readWorkbook(buffer, { maxRowsPerSheet: 40000 })
      const adapter = getAdapter(importType, effSchool)
      const staged = await parseAndStage(importRecord, adapter, wb, { selectedSheets })
      const receipt = await importReceipt(importRecord.id)
      return NextResponse.json({
        ok: true,
        import: receipt.import,
        rows: receipt.rows.slice(0, 500),
        totalRows: receipt.rows.length,
        staged,
        priorImports: prior.map((p) => ({ id: p.id, created_at: p.created_at, source_filename: p.source_filename })),
      }, { status: 201 })
    }

    // ── Commit / rollback (JSON) ────────────────────────────────────────────
    const body = await req.json()
    const action = String(body?.action ?? '')
    const importId = String(body?.importId ?? '')
    const { data: impRow } = await db().from('data_imports').select('*').eq('id', importId).maybeSingle()
    const importRecord = impRow as DataImportRow | null
    if (!importRecord) return NextResponse.json({ ok: false, error: 'Import not found' }, { status: 404 })
    assertBrandInScope(importRecord.brand_id, allowed, 'commit import')
    const adapter = getAdapter(importRecord.import_type, importRecord.school)
    const ctx = { brandId: importRecord.brand_id, school: importRecord.school, actor, allowed }

    if (action === 'commit') {
      const dryRun = Boolean(body?.dryRun)
      if (importRecord.source_id && !dryRun && importRecord.status !== 'approved') {
        return NextResponse.json({ ok: false, error: 'Controlled historical imports must be approved before posting.' }, { status: 409 })
      }
      const result = await commitImport(importRecord, adapter, ctx, {
        dryRun,
        includeDuplicates: Boolean(body?.includeDuplicates),
      })
      if (importRecord.source_id && !dryRun && result.failed === 0) {
        await db().from('data_imports').update({
          status: 'posted', posted_by: actor.name || actor.email || actor.userId,
          posted_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }).eq('id', importRecord.id)
      }
      return NextResponse.json({ ok: true, result })
    }
    if (action === 'rollback') {
      const result = await rollbackImport(importRecord, adapter, ctx)
      return NextResponse.json({ ok: true, result })
    }
    return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}
