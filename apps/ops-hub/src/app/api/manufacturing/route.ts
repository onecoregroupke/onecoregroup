import { NextResponse, type NextRequest } from 'next/server'
import { requireApiSection } from '@/lib/api-auth'
import {
  createStore, createRun, getRun, updateRunExecution, recordConsumption,
  setBomLine, deactivateBomLine,
} from '@/lib/manufacturing'
import { auditEvent } from '@/lib/audit'
import {
  approveQualityDisposition,
  createQualityIncident,
  disposeProductionCustody,
  recordRecoveredPackaging,
  stageProductionForRework,
} from '@/lib/productionCustody'
import { recordAccessAtLeast } from '@/lib/permissions'
import { db } from '@/lib/serverClient'

/**
 * Manufacturing actions (§§19–28). Gated on `inventory` edit, brand-scoped —
 * production moves stock, so it lives behind the same grant as the ledger.
 *
 * Manufacturing records execution and reconciliation only. MRF/GIN and GTN
 * are the authoritative stock-moving workflows.
 */
export async function POST(req: NextRequest) {
  const gate = await requireApiSection(req, 'inventory', 'edit')
  if (gate instanceof NextResponse) return gate
  const actor = gate
  const who = actor.name || actor.email || actor.userId
  const allowed = actor.allowedBrandIds('inventory')
  const canReviewQuality = actor.permissions === null
    || recordAccessAtLeast(actor.recordScope('inventory'), 'management')

  /** A brand-scoped user may only act within their own brands. */
  const assertBrand = (brandId: string | null) => {
    if (allowed === null) return
    if (!brandId || !allowed.includes(brandId)) {
      throw new Error('That brand is outside the brands you manage.')
    }
  }

  try {
    const body = await req.json()
    const action = String(body?.action ?? '')

    switch (action) {
      case 'create-store': {
        assertBrand(body.brand_id ?? null)
        const row = await createStore(body)
        await auditEvent({ actor, action: 'manufacturing.store.create', entity_table: 'inventory_stores', entity_id: row.id, entity_label: row.name, after_data: row as unknown as Record<string, unknown> })
        return NextResponse.json({ ok: true, row }, { status: 201 })
      }

      case 'set-bom-line': {
        const itemIds = [String(body?.product_item_id ?? ''), String(body?.component_item_id ?? '')].filter(Boolean)
        const { data: bomItems } = await db().from('inventory_items').select('id,brand_id').in('id', itemIds)
        if (!bomItems || bomItems.length !== 2) throw new Error('BOM product or component not found.')
        for (const item of bomItems) assertBrand(item.brand_id)
        if ((bomItems[0]?.brand_id ?? null) !== (bomItems[1]?.brand_id ?? null)) throw new Error('A BOM cannot combine items from different brands.')
        const row = await setBomLine(body)
        await auditEvent({ actor, action: 'manufacturing.bom.set', entity_table: 'production_bom_lines', entity_id: row.id, after_data: row as unknown as Record<string, unknown> })
        return NextResponse.json({ ok: true, row })
      }

      case 'remove-bom-line': {
        if (!body?.id) return NextResponse.json({ ok: false, error: 'id is required' }, { status: 400 })
        const { data: bomLine } = await db().from('production_bom_lines').select('product_item_id').eq('id', String(body.id)).maybeSingle()
        if (!bomLine) return NextResponse.json({ ok: false, error: 'BOM line not found.' }, { status: 404 })
        const { data: bomProduct } = await db().from('inventory_items').select('brand_id').eq('id', bomLine.product_item_id).maybeSingle()
        if (!bomProduct) return NextResponse.json({ ok: false, error: 'BOM product not found.' }, { status: 404 })
        assertBrand(bomProduct.brand_id)
        await deactivateBomLine(body.id)
        await auditEvent({ actor, action: 'manufacturing.bom.remove', entity_table: 'production_bom_lines', entity_id: body.id })
        return NextResponse.json({ ok: true })
      }

      case 'create-run': {
        assertBrand(body.brand_id ?? null)
        const row = await createRun({ ...body, created_by: who })
        await auditEvent({ actor, action: 'manufacturing.run.create', entity_table: 'production_runs', entity_id: row.id, entity_label: row.run_ref, after_data: row as unknown as Record<string, unknown> })
        return NextResponse.json({ ok: true, row }, { status: 201 })
      }

      case 'issue-materials': {
        return NextResponse.json({ ok: false, error: 'Direct material issue is disabled. Use an approved MRF and post its linked GIN.' }, { status: 409 })
      }

      case 'record-consumption': {
        const { data: material } = await db().from('production_run_materials').select('run_id').eq('id', String(body?.material_id ?? '')).maybeSingle()
        if (!material) return NextResponse.json({ ok: false, error: 'Production material line not found.' }, { status: 404 })
        const materialRun = await getRun(material.run_id)
        if (!materialRun) return NextResponse.json({ ok: false, error: 'Production run not found.' }, { status: 404 })
        assertBrand(materialRun.brand_id)
        const row = await recordConsumption({
          ...body,
          recorded_by: who,
          recorded_by_id: actor.teamMemberId,
        })
        await auditEvent({ actor, action: 'manufacturing.run.consumption', entity_table: 'production_run_materials', entity_id: row.id, after_data: row as unknown as Record<string, unknown> })
        return NextResponse.json({ ok: true, row })
      }

      case 'record-output': {
        const existing = await getRun(String(body?.run_id ?? ''))
        if (!existing) return NextResponse.json({ ok: false, error: 'Production run not found.' }, { status: 404 })
        assertBrand(existing.brand_id)
        if (String(body?.quality_approved_by ?? '').trim() && !canReviewQuality) {
          return NextResponse.json({ ok: false, error: 'Management quality approval is required.' }, { status: 403 })
        }
        const row = await updateRunExecution({
          ...body,
          quality_approved_by: String(body?.quality_approved_by ?? '').trim() ? who : undefined,
          recorded_by: who,
          recorded_by_id: actor.teamMemberId,
        })
        await auditEvent({ actor, action: 'manufacturing.run.output', entity_table: 'production_runs', entity_id: row.id, entity_label: row.run_ref, after_data: row as unknown as Record<string, unknown> })
        return NextResponse.json({ ok: true, row })
      }

      case 'create-fg-transfer':
      case 'post-fg-transfer':
        return NextResponse.json({ ok: false, error: 'Legacy finished-goods posting is disabled. Record output, then post a GTN linked to the run.' }, { status: 409 })

      case 'create-quality-incident': {
        assertBrand(body.brand_id ?? null)
        const row = await createQualityIncident({
          ...body,
          reported_by: who,
          reported_by_id: actor.teamMemberId,
        })
        await auditEvent({ actor, action: 'quality.incident.create', entity_table: 'inventory_quality_incidents', entity_id: row.id, entity_label: row.incident_ref, after_data: row as unknown as Record<string, unknown> })
        return NextResponse.json({ ok: true, row }, { status: 201 })
      }

      case 'approve-quality-disposition': {
        if (!canReviewQuality) return NextResponse.json({ ok: false, error: 'Management review authority is required.' }, { status: 403 })
        const { data: incident } = await db().from('inventory_quality_incidents').select('brand_id').eq('id', String(body?.incident_id ?? '')).maybeSingle()
        if (!incident) return NextResponse.json({ ok: false, error: 'Quality incident not found.' }, { status: 404 })
        assertBrand(incident.brand_id)
        const row = await approveQualityDisposition({
          incident_id: String(body.incident_id),
          disposition: body.disposition,
          disposition_note: String(body.disposition_note ?? ''),
          reviewer: who,
          reviewer_id: actor.teamMemberId,
        })
        await auditEvent({ actor, action: 'quality.incident.disposition.approve', entity_table: 'inventory_quality_incidents', entity_id: row.id, entity_label: row.incident_ref, after_data: row as unknown as Record<string, unknown> })
        return NextResponse.json({ ok: true, row })
      }

      case 'dispose-production-custody': {
        if (!canReviewQuality) return NextResponse.json({ ok: false, error: 'Management approval is required.' }, { status: 403 })
        const { data: disposalItem } = await db().from('inventory_items').select('brand_id').eq('id', String(body?.item_id ?? '')).maybeSingle()
        if (!disposalItem) return NextResponse.json({ ok: false, error: 'Inventory item not found.' }, { status: 404 })
        assertBrand(disposalItem.brand_id)
        const result = await disposeProductionCustody({
          ...body,
          recorded_by: who,
          recorded_by_id: actor.teamMemberId,
          approved_by: who,
          approved_by_id: actor.teamMemberId,
        })
        await auditEvent({ actor, action: 'quality.disposal.post', entity_table: 'inventory_quality_incidents', entity_id: String(body.quality_incident_id ?? ''), after_data: result })
        return NextResponse.json({ ok: true, result })
      }

      case 'record-recovered-packaging': {
        const [{ data: recoveryRun }, { data: component }] = await Promise.all([
          db().from('production_runs').select('brand_id').eq('id', String(body?.production_run_id ?? '')).maybeSingle(),
          db().from('inventory_items').select('brand_id,item_type').eq('id', String(body?.component_item_id ?? '')).maybeSingle(),
        ])
        if (!recoveryRun || !component) return NextResponse.json({ ok: false, error: 'Production run or packaging component not found.' }, { status: 404 })
        assertBrand(recoveryRun.brand_id)
        assertBrand(component.brand_id)
        if ((recoveryRun.brand_id ?? null) !== (component.brand_id ?? null)) throw new Error('Recovered packaging and production run must belong to the same brand.')
        if (component.item_type !== 'packaging') return NextResponse.json({ ok: false, error: 'Recovered component must be a packaging inventory item.' }, { status: 400 })
        const row = await recordRecoveredPackaging({
          ...body,
          recorded_by: who,
          recorded_by_id: actor.teamMemberId,
        })
        await auditEvent({ actor, action: 'manufacturing.packaging.recover', entity_table: 'production_recovered_packaging', entity_id: row.id, after_data: row as unknown as Record<string, unknown> })
        return NextResponse.json({ ok: true, row }, { status: 201 })
      }

      case 'stage-production-rework': {
        const [{ data: stageItem }, { data: stageRun }] = await Promise.all([
          db().from('inventory_items').select('brand_id').eq('id', String(body?.item_id ?? '')).maybeSingle(),
          db().from('production_runs').select('brand_id,run_type').eq('id', String(body?.production_run_id ?? '')).maybeSingle(),
        ])
        if (!stageItem || !stageRun) return NextResponse.json({ ok: false, error: 'Production item or rework run not found.' }, { status: 404 })
        assertBrand(stageItem.brand_id)
        assertBrand(stageRun.brand_id)
        if ((stageItem.brand_id ?? null) !== (stageRun.brand_id ?? null)) throw new Error('Production item and rework run must belong to the same brand.')
        if (!['rework', 'repackaging', 'quality_recovery'].includes(stageRun.run_type)) throw new Error('Choose a rework, repackaging or quality-recovery run.')
        const result = await stageProductionForRework({
          ...body,
          recorded_by: who,
          recorded_by_id: actor.teamMemberId,
        })
        await auditEvent({ actor, action: 'manufacturing.rework.stage_wip', entity_table: 'production_runs', entity_id: String(body.production_run_id), after_data: result })
        return NextResponse.json({ ok: true, result }, { status: 201 })
      }

      default:
        return NextResponse.json({ ok: false, error: `Unknown action "${action}"` }, { status: 400 })
    }
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}
