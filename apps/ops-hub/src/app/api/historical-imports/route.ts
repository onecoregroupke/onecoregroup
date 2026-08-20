import { NextResponse, type NextRequest } from 'next/server'
import { getApiActor } from '@/lib/api-auth'
import { listBrands } from '@/lib/brands'
import { memberForEmail } from '@/lib/team'
import { hasAuthority, type HistoricalImportState } from '@/lib/governanceModel'
import {
  addReconciliation, createHistoricalBatch, createHistoricalMapping,
  importValidationSummary, listHistoricalImports, registerHistoricalSource,
  transitionHistoricalBatch,
} from '@/lib/historicalImports'
import { commitImport } from '@/lib/imports/framework'
import { getAdapter } from '@/lib/imports/registry'
import { auditEvent } from '@/lib/audit'
import { db } from '@/lib/serverClient'
import type { DataImportRow, EmployeeAuthorityRow, HistoricalImportSourceRow } from '@ocg/db'

async function ctx(req: NextRequest) {
  const actor = await getApiActor(req)
  if (!actor) return { error: NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 }) }
  if (!actor.can('historical_imports', 'view')) return { error: NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 }) }
  const member = await memberForEmail(actor.email)
  return { actor, member }
}

function brandAllowed(brandId: string | null, allowed: string[] | null): boolean {
  return allowed === null || (!!brandId && allowed.includes(brandId))
}

async function authorised(actorCtx: Exclude<Awaited<ReturnType<typeof ctx>>, { error: NextResponse }>, action: string, brandId: string | null) {
  if (actorCtx.actor.permissions === null) return true
  if (!actorCtx.member) return false
  const { data } = await db().from('employee_authorities').select('*')
    .eq('member_id', actorCtx.member.id).eq('active', true)
  return hasAuthority((data as EmployeeAuthorityRow[] | null) ?? [], action, {
    brandId, operationalArea: 'historical_imports',
  })
}

export async function GET(req: NextRequest) {
  const context = await ctx(req)
  if ('error' in context) return context.error
  const [dashboard, brands] = await Promise.all([
    listHistoricalImports(context.actor.allowedBrandIds('historical_imports')),
    listBrands(),
  ])
  return NextResponse.json({
    ok: true, ...dashboard,
    brands: brands.map((brand) => ({ id: brand.id, name: brand.short_name || brand.name })),
    canEdit: context.actor.can('historical_imports', 'edit') && ['management', 'group'].includes(context.actor.recordScope('historical_imports')),
  })
}

export async function POST(req: NextRequest) {
  const context = await ctx(req)
  if ('error' in context) return context.error
  if (!context.actor.can('historical_imports', 'edit') || !['management', 'group'].includes(context.actor.recordScope('historical_imports'))) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }
  try {
    const body = await req.json()
    const action = String(body?.action ?? '')
    const values = body?.values ?? {}
    const actorName = context.actor.name || context.actor.email || context.actor.userId
    const allowed = context.actor.allowedBrandIds('historical_imports')
    let row: Record<string, unknown>
    let table: string
    if (action === 'register-source') {
      const brandId = values.brand_id || null
      if (!brandAllowed(brandId, allowed)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
      row = await registerHistoricalSource({
        title: String(values.title ?? ''), filename: String(values.filename ?? ''),
        source_type: String(values.source_type ?? ''), evidence_class: Number(values.evidence_class),
        brand_id: brandId, period_start: values.period_start || null, period_end: values.period_end || null,
        description: String(values.description ?? ''), storage_path: String(values.storage_path ?? ''),
        checksum_sha256: String(values.checksum_sha256 ?? ''), source_date: values.source_date || null,
        notes: String(values.notes ?? ''), actor: actorName,
      }) as unknown as Record<string, unknown>
      table = 'historical_import_sources'
    } else if (action === 'create-batch') {
      const { data: sourceData } = await db().from('historical_import_sources').select('*').eq('id', String(values.source_id ?? '')).maybeSingle()
      const source = sourceData as HistoricalImportSourceRow | null
      if (!source || !brandAllowed(source.brand_id, allowed)) return NextResponse.json({ ok: false, error: 'Source not found' }, { status: 404 })
      row = await createHistoricalBatch({
        source, target_domain: String(values.target_domain ?? ''), import_type: String(values.import_type ?? ''),
        period_start: String(values.period_start ?? source.period_start ?? ''), period_end: String(values.period_end ?? source.period_end ?? ''),
        actor: actorName,
      }) as unknown as Record<string, unknown>
      table = 'data_imports'
    } else if (action === 'add-mapping') {
      const brandId = values.brand_id || null
      if (!brandAllowed(brandId, allowed)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
      row = await createHistoricalMapping({
        brand_id: brandId, target_domain: String(values.target_domain ?? ''),
        source_field: String(values.source_field ?? ''), original_value: String(values.original_value ?? ''),
        normalized_value: String(values.normalized_value ?? ''), target_type: String(values.target_type ?? ''),
        target_id: values.target_id || null, source_id: values.source_id || null, actor: actorName,
      }) as unknown as Record<string, unknown>
      table = 'historical_import_mappings'
    } else {
      const { data: batchData } = await db().from('data_imports').select('*').eq('id', String(values.import_id ?? '')).maybeSingle()
      const batch = batchData as DataImportRow | null
      if (!batch || !brandAllowed(batch.brand_id, allowed)) return NextResponse.json({ ok: false, error: 'Batch not found' }, { status: 404 })
      if (action === 'dry-run') {
        const adapter = getAdapter(batch.import_type, batch.school)
        const result = await commitImport(batch, adapter, {
          brandId: batch.brand_id, school: batch.school, actor: context.actor, allowed,
        }, { dryRun: true, includeDuplicates: false })
        const summary = await importValidationSummary(batch.id)
        return NextResponse.json({ ok: true, result, summary })
      }
      if (action === 'reconcile') {
        if (!await authorised(context, 'review', batch.brand_id)) return NextResponse.json({ ok: false, error: 'Explicit review authority is required.' }, { status: 403 })
        row = await addReconciliation({
          import_id: batch.id, reconciliation_type: String(values.reconciliation_type ?? 'control_total'),
          control_name: String(values.control_name ?? ''),
          source_total: values.source_total === '' ? null : Number(values.source_total),
          posted_total: values.posted_total === '' ? null : Number(values.posted_total),
          result: values.result ?? 'pending', notes: String(values.notes ?? ''), actor: actorName,
        }) as unknown as Record<string, unknown>
        table = 'historical_import_reconciliations'
      } else {
        const to = action === 'review' ? 'ready_for_review' : action
        const authorityAction = to === 'approved' ? 'approve' : to === 'posted' ? 'post' : to === 'locked' ? 'authorise' : 'review'
        if (!await authorised(context, authorityAction, batch.brand_id)) {
          return NextResponse.json({ ok: false, error: `Explicit ${authorityAction} authority is required.` }, { status: 403 })
        }
        if (to === 'posted') {
          if (batch.status !== 'approved') throw new Error('Only an approved batch can be posted')
          const adapter = getAdapter(batch.import_type, batch.school)
          await commitImport(batch, adapter, {
            brandId: batch.brand_id, school: batch.school, actor: context.actor, allowed,
          }, { dryRun: false, includeDuplicates: false })
        }
        row = await transitionHistoricalBatch({ batch, to: to as HistoricalImportState, actor: actorName, note: String(values.note ?? '') }) as unknown as Record<string, unknown>
        table = 'data_imports'
      }
    }
    await auditEvent({
      actor: context.actor, action: `historical_import.${action}`, entity_table: table,
      entity_id: String(row.id ?? ''), entity_label: String(row.title ?? row.source_filename ?? action),
      after_data: row,
    })
    return NextResponse.json({ ok: true, row }, { status: action.startsWith('create') || action.startsWith('register') ? 201 : 200 })
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 400 })
  }
}
