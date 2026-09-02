import { NextResponse, type NextRequest } from 'next/server'
import { getApiActor, type Actor } from '@/lib/api-auth'
import {
  listAllocations, getAllocation, createAllocation, issueAllocation,
  listDailyReturns, submitDailyReturn, createReturnRequest, postReturnNote,
  listReturnNotes, getReturnNote, custodyBalances, reconcileAllocation,
  approveAllocationReconciliation,
} from '@/lib/fieldSales'
import { isFieldSalesManager, canManageFieldSales, fieldSalesAllowedBrands, canAccessSalesperson } from '@/lib/fieldSalesAccess'
import { auditEvent } from '@/lib/audit'

function assertBrand(allowed: string[] | null, brandId: string | null) {
  if (allowed !== null && (!brandId || !allowed.includes(brandId))) {
    throw new Error('That brand is outside the brands you manage.')
  }
}

function assertOwnSalesperson(actor: Actor, salespersonId: string | null) {
  if (!actor.teamMemberId && !isFieldSalesManager(actor)) throw new Error('Your account is not linked to a salesperson profile.')
  if (!canAccessSalesperson(actor, salespersonId)) throw new Error('You may only access your own field-sales records.')
}

export async function GET(req: NextRequest) {
  const actor = await getApiActor(req)
  if (!actor) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  if (!actor.can('field_sales', 'view')) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }

  const url = new URL(req.url)
  const view = url.searchParams.get('view') ?? 'allocations'
  const manager = isFieldSalesManager(actor)
  const salespersonId = manager
    ? (url.searchParams.get('salesperson') ?? undefined)
    : (actor.teamMemberId ?? undefined)
  const allowed = fieldSalesAllowedBrands(actor)

  if (!manager && !salespersonId) {
    return NextResponse.json({ ok: false, error: 'Your account is not linked to a salesperson profile.' }, { status: 403 })
  }

  try {
    switch (view) {
      case 'allocations':
        return NextResponse.json({ ok: true, allocations: await listAllocations(allowed, {
          brandId: url.searchParams.get('brand') ?? undefined, salespersonId,
        }) })
      case 'allocation': {
        const loaded = await getAllocation(url.searchParams.get('id') ?? '')
        if (!loaded) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })
        assertBrand(allowed, loaded.allocation.brand_id)
        assertOwnSalesperson(actor, loaded.allocation.salesperson_id)
        return NextResponse.json({ ok: true, ...loaded })
      }
      case 'custody':
        return NextResponse.json({ ok: true, balances: await custodyBalances(allowed, salespersonId) })
      case 'daily-returns':
        return NextResponse.json({ ok: true, returns: await listDailyReturns(allowed, {
          allocationId: url.searchParams.get('allocation') ?? undefined, salespersonId,
        }) })
      case 'return-notes':
        return NextResponse.json({ ok: true, notes: await listReturnNotes(allowed, {
          salespersonId, status: url.searchParams.get('status') ?? undefined,
        }) })
      case 'return-note': {
        const loaded = await getReturnNote(url.searchParams.get('id') ?? '')
        if (!loaded) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })
        assertBrand(allowed, loaded.note.brand_id)
        assertOwnSalesperson(actor, loaded.note.salesperson_id)
        return NextResponse.json({ ok: true, ...loaded })
      }
      case 'reconciliation': {
        const id = url.searchParams.get('id') ?? ''
        const loaded = id ? await getAllocation(id) : null
        if (!loaded) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })
        assertBrand(allowed, loaded.allocation.brand_id)
        assertOwnSalesperson(actor, loaded.allocation.salesperson_id)
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
  const actor = await getApiActor(req)
  if (!actor) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  if (!actor.can('field_sales', 'edit')) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }

  const who = actor.name || actor.email || actor.userId
  const allowed = fieldSalesAllowedBrands(actor)

  try {
    const body = await req.json()
    const action = String(body?.action ?? '')

    switch (action) {
      case 'create-allocation': {
        if (!canManageFieldSales(actor)) return NextResponse.json({ ok: false, error: 'Manager access required.' }, { status: 403 })
        assertBrand(allowed, body.brand_id ?? null)
        const row = await createAllocation({ ...body, created_by: who })
        await auditEvent({ actor, action: 'field_sales.allocation.create', entity_table: 'field_sales_allocations', entity_id: row.id, entity_label: row.delivery_note_no || row.allocation_ref, after_data: row as unknown as Record<string, unknown> })
        return NextResponse.json({ ok: true, row }, { status: 201 })
      }
      case 'issue-allocation': {
        if (!canManageFieldSales(actor)) return NextResponse.json({ ok: false, error: 'Manager access required.' }, { status: 403 })
        const loaded = await getAllocation(String(body?.id ?? ''))
        if (!loaded) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })
        assertBrand(allowed, loaded.allocation.brand_id)
        const row = await issueAllocation(loaded.allocation.id, who)
        await auditEvent({ actor, action: 'field_sales.allocation.issue', entity_table: 'field_sales_allocations', entity_id: row.id, entity_label: row.delivery_note_no || row.allocation_ref, after_data: row as unknown as Record<string, unknown> })
        return NextResponse.json({ ok: true, row })
      }
      case 'submit-daily-return': {
        const loaded = await getAllocation(String(body?.allocation_id ?? ''))
        if (!loaded) throw new Error('Choose one of your issued delivery notes.')
        assertBrand(allowed, loaded.allocation.brand_id)
        assertOwnSalesperson(actor, loaded.allocation.salesperson_id)
        const row = await submitDailyReturn({ ...body,
          allocation_id: loaded.allocation.id, brand_id: loaded.allocation.brand_id,
          salesperson_id: loaded.allocation.salesperson_id, sales_team: loaded.allocation.sales_team,
          submitted_by: who,
        })
        await auditEvent({ actor, action: 'field_sales.daily_activity.submit', entity_table: 'field_sales_daily_returns', entity_id: row.id, entity_label: row.return_ref, after_data: row as unknown as Record<string, unknown> })
        return NextResponse.json({ ok: true, row }, { status: 201 })
      }
      case 'create-return-request': {
        const loaded = await getAllocation(String(body?.allocation_id ?? ''))
        if (!loaded) throw new Error('Choose one of your issued delivery notes.')
        assertBrand(allowed, loaded.allocation.brand_id)
        assertOwnSalesperson(actor, loaded.allocation.salesperson_id)
        const row = await createReturnRequest({ ...body,
          allocation_id: loaded.allocation.id, brand_id: loaded.allocation.brand_id,
          salesperson_id: loaded.allocation.salesperson_id, requested_by: who,
        })
        await auditEvent({ actor, action: 'field_sales.return_request.create', entity_table: 'field_sales_return_notes', entity_id: row.id, entity_label: row.note_ref, after_data: row as unknown as Record<string, unknown> })
        return NextResponse.json({ ok: true, row }, { status: 201 })
      }
      case 'post-return-note': {
        if (!canManageFieldSales(actor)) return NextResponse.json({ ok: false, error: 'Manager access required.' }, { status: 403 })
        const loaded = await getReturnNote(String(body?.id ?? ''))
        if (!loaded) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })
        assertBrand(allowed, loaded.note.brand_id)
        const row = await postReturnNote({
          id: loaded.note.id, destination_store_id: body.destination_store_id ?? loaded.note.destination_store_id,
          lines: Array.isArray(body.lines) ? body.lines : [], received_by: who,
        })
        await auditEvent({ actor, action: 'field_sales.return_note.post', entity_table: 'field_sales_return_notes', entity_id: row.id, entity_label: row.note_ref, after_data: row as unknown as Record<string, unknown> })
        return NextResponse.json({ ok: true, row })
      }
      case 'approve-reconciliation': {
        if (!canManageFieldSales(actor)) return NextResponse.json({ ok: false, error: 'Manager access required.' }, { status: 403 })
        const loaded = await getAllocation(String(body?.id ?? ''))
        if (!loaded) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })
        assertBrand(allowed, loaded.allocation.brand_id)
        const row = await approveAllocationReconciliation({
          allocationId: loaded.allocation.id,
          approvedBy: who,
          reason: String(body?.reason ?? ''),
        })
        await auditEvent({ actor, action: 'field_sales.reconciliation.approve', entity_table: 'field_sales_allocations', entity_id: row.id, entity_label: row.delivery_note_no || row.allocation_ref, after_data: row as unknown as Record<string, unknown> })
        return NextResponse.json({ ok: true, row })
      }
      default:
        return NextResponse.json({ ok: false, error: `Unknown action "${action}"` }, { status: 400 })
    }
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}
