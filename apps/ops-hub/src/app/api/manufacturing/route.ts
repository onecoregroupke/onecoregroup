import { NextResponse, type NextRequest } from 'next/server'
import { requireApiSection } from '@/lib/api-auth'
import {
  createStore, createRun, getRun, updateRunExecution, recordConsumption,
  setBomLine, deactivateBomLine,
} from '@/lib/manufacturing'
import { auditEvent } from '@/lib/audit'

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
        const row = await setBomLine(body)
        await auditEvent({ actor, action: 'manufacturing.bom.set', entity_table: 'production_bom_lines', entity_id: row.id, after_data: row as unknown as Record<string, unknown> })
        return NextResponse.json({ ok: true, row })
      }

      case 'remove-bom-line': {
        if (!body?.id) return NextResponse.json({ ok: false, error: 'id is required' }, { status: 400 })
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
        const row = await recordConsumption(body)
        await auditEvent({ actor, action: 'manufacturing.run.consumption', entity_table: 'production_run_materials', entity_id: row.id, after_data: row as unknown as Record<string, unknown> })
        return NextResponse.json({ ok: true, row })
      }

      case 'record-output': {
        const existing = await getRun(String(body?.run_id ?? ''))
        if (!existing) return NextResponse.json({ ok: false, error: 'Production run not found.' }, { status: 404 })
        assertBrand(existing.brand_id)
        const row = await updateRunExecution(body)
        await auditEvent({ actor, action: 'manufacturing.run.output', entity_table: 'production_runs', entity_id: row.id, entity_label: row.run_ref, after_data: row as unknown as Record<string, unknown> })
        return NextResponse.json({ ok: true, row })
      }

      case 'create-fg-transfer':
      case 'post-fg-transfer':
        return NextResponse.json({ ok: false, error: 'Legacy finished-goods posting is disabled. Record output, then post a GTN linked to the run.' }, { status: 409 })

      default:
        return NextResponse.json({ ok: false, error: `Unknown action "${action}"` }, { status: 400 })
    }
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}
