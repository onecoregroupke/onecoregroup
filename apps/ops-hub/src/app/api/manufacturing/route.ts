import { NextResponse, type NextRequest } from 'next/server'
import { requireApiSection } from '@/lib/api-auth'
import {
  createStore, createRun, issueMaterials, recordConsumption,
  createFgTransfer, postFgTransfer, setBomLine, deactivateBomLine,
} from '@/lib/manufacturing'
import { auditEvent } from '@/lib/audit'

/**
 * Manufacturing actions (§§19–28). Gated on `inventory` edit, brand-scoped —
 * production moves stock, so it lives behind the same grant as the ledger.
 *
 * Every stock effect runs through the manufacturing service, which posts via
 * recordStockMovement(); nothing here writes inventory_movements directly.
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
        // Deducts raw material / packaging from stock. An over-issue is refused
        // by the ledger before any material row is written.
        const rows = await issueMaterials({
          run_id: body.run_id,
          lines: Array.isArray(body.lines) ? body.lines : [],
          issued_by: who,
          movement_date: body.movement_date,
        })
        await auditEvent({ actor, action: 'manufacturing.run.issue', entity_table: 'production_runs', entity_id: body.run_id, entity_label: `${rows.length} material line(s)` })
        return NextResponse.json({ ok: true, rows })
      }

      case 'record-consumption': {
        const row = await recordConsumption(body)
        await auditEvent({ actor, action: 'manufacturing.run.consumption', entity_table: 'production_run_materials', entity_id: row.id, after_data: row as unknown as Record<string, unknown> })
        return NextResponse.json({ ok: true, row })
      }

      case 'create-fg-transfer': {
        assertBrand(body.brand_id ?? null)
        const row = await createFgTransfer(body)
        await auditEvent({ actor, action: 'manufacturing.fg.create', entity_table: 'production_fg_transfers', entity_id: row.id, entity_label: row.transfer_ref, after_data: row as unknown as Record<string, unknown> })
        return NextResponse.json({ ok: true, row }, { status: 201 })
      }

      case 'post-fg-transfer': {
        // Only ACCEPTED units reach stock, and the partial unique index on
        // inventory_movements.fg_transfer_id makes a second post impossible.
        if (!body?.id) return NextResponse.json({ ok: false, error: 'id is required' }, { status: 400 })
        const row = await postFgTransfer(body.id, who)
        await auditEvent({ actor, action: 'manufacturing.fg.post', entity_table: 'production_fg_transfers', entity_id: row.id, entity_label: row.transfer_ref, after_data: row as unknown as Record<string, unknown> })
        return NextResponse.json({ ok: true, row })
      }

      default:
        return NextResponse.json({ ok: false, error: `Unknown action "${action}"` }, { status: 400 })
    }
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}
