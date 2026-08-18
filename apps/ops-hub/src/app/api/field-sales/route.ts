import { NextResponse, type NextRequest } from 'next/server'
import { requireApiSection, getApiActor } from '@/lib/api-auth'
import {
  listAllocations, getAllocation, createAllocation, issueAllocation,
  listDailyReturns, submitDailyReturn, postReturnNote,
  custodyBalances, reconcileAllocation,
} from '@/lib/fieldSales'
import { auditEvent } from '@/lib/audit'

/**
 * Field-sales custody — the weekly delivery note, daily returns and the unsold
 * stock coming back.
 *
 * Gated on `inventory`, because every action here moves stock or custody.
 * The two-ledger rule (main store reduced once at allocation; custody reduced
 * daily) lives in the service, so it holds for any caller.
 */
export async function GET(req: NextRequest) {
  const actor = await getApiActor(req)
  if (!actor) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  if (!actor.can('inventory', 'view')) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }

  const url = new URL(req.url)
  const view = url.searchParams.get('view') ?? 'allocations'
  const allowed = actor.allowedBrandIds('inventory')

  try {
    switch (view) {
      case 'allocations':
        return NextResponse.json({
          ok: true,
          allocations: await listAllocations(allowed, {
            brandId: url.searchParams.get('brand') ?? undefined,
            salespersonId: url.searchParams.get('salesperson') ?? undefined,
          }),
        })
      case 'allocation': {
        const id = url.searchParams.get('id') ?? ''
        const loaded = id ? await getAllocation(id) : null
        if (!loaded) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })
        return NextResponse.json({ ok: true, ...loaded })
      }
      case 'custody':
        return NextResponse.json({
          ok: true,
          balances: await custodyBalances(allowed, url.searchParams.get('salesperson') ?? undefined),
        })
      case 'daily-returns':
        return NextResponse.json({
          ok: true,
          returns: await listDailyReturns(allowed, {
            allocationId: url.searchParams.get('allocation') ?? undefined,
          }),
        })
      case 'reconciliation': {
        const id = url.searchParams.get('id') ?? ''
        if (!id) return NextResponse.json({ ok: false, error: 'id is required' }, { status: 400 })
        return NextResponse.json({ ok: true, reconciliation: await reconcileAllocation(id) })
      }
      default:
        return NextResponse.json({ ok: false, error: `Unknown view "${view}"` }, { status: 400 })
    }
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireApiSection(req, 'inventory', 'edit')
  if (gate instanceof NextResponse) return gate
  const actor = gate
  const who = actor.name || actor.email || actor.userId
  const allowed = actor.allowedBrandIds('inventory')

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
      case 'create-allocation': {
        assertBrand(body.brand_id ?? null)
        const row = await createAllocation({ ...body, created_by: who })
        await auditEvent({ actor, action: 'field_sales.allocation.create', entity_table: 'field_sales_allocations', entity_id: row.id, entity_label: row.delivery_note_no || row.allocation_ref, after_data: row as unknown as Record<string, unknown> })
        return NextResponse.json({ ok: true, row }, { status: 201 })
      }

      case 'issue-allocation': {
        if (!body?.id) return NextResponse.json({ ok: false, error: 'id is required' }, { status: 400 })
        // Deducts the MAIN STORE once and opens custody. Both effects are keyed
        // to the allocation line, so issuing twice is impossible.
        const row = await issueAllocation(body.id, who)
        await auditEvent({ actor, action: 'field_sales.allocation.issue', entity_table: 'field_sales_allocations', entity_id: row.id, entity_label: row.delivery_note_no || row.allocation_ref, after_data: row as unknown as Record<string, unknown> })
        return NextResponse.json({ ok: true, row })
      }

      case 'submit-daily-return': {
        assertBrand(body.brand_id ?? null)
        // Reduces CUSTODY ONLY — the main store was already reduced at issue.
        const row = await submitDailyReturn({ ...body, submitted_by: who })
        await auditEvent({ actor, action: 'field_sales.daily_return.submit', entity_table: 'field_sales_daily_returns', entity_id: row.id, entity_label: row.return_ref, after_data: row as unknown as Record<string, unknown> })
        return NextResponse.json({ ok: true, row }, { status: 201 })
      }

      case 'post-return-note': {
        assertBrand(body.brand_id ?? null)
        // Accepted units re-enter sellable stock; rejected units do NOT.
        const row = await postReturnNote({ ...body, received_by: who })
        await auditEvent({ actor, action: 'field_sales.return_note.post', entity_table: 'field_sales_return_notes', entity_id: row.id, entity_label: row.note_ref, after_data: row as unknown as Record<string, unknown> })
        return NextResponse.json({ ok: true, row }, { status: 201 })
      }

      default:
        return NextResponse.json({ ok: false, error: `Unknown action "${action}"` }, { status: 400 })
    }
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}
