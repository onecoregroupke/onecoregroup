import { NextResponse, type NextRequest } from 'next/server'
import { requireApiSection } from '@/lib/api-auth'
import { assertBrandInScope } from '@/lib/finance'
import { createItem } from '@/lib/inventory'

/**
 * Inventory endpoint (requires `inventory` edit — an explicit grant; brand
 * compartments apply exactly like finance):
 *   POST { action: 'item',     values: { brand_id, name, … } }
 * Direct stock movement is deliberately not exposed here. Posted operational
 * documents and approved stock-take adjustments are the stock authorities.
 */
export async function POST(req: NextRequest) {
  const gate = await requireApiSection(req, 'inventory', 'edit')
  if (gate instanceof NextResponse) return gate
  const actor = gate

  try {
    const body = await req.json()
    const action = body?.action as string
    const values = (body?.values ?? {}) as Record<string, unknown>
    const allowed = actor.allowedBrandIds('inventory')
    const recordedBy = actor.name || actor.email || 'unknown'

    if (action === 'item') {
      assertBrandInScope(values.brand_id as string, allowed, 'manage inventory')
      const item = await createItem({
        brand_id: String(values.brand_id ?? ''),
        name: String(values.name ?? ''),
        sku: (values.sku as string) ?? '',
        category: (values.category as string) ?? '',
        unit: (values.unit as string) ?? 'pcs',
        // Registering a master item never creates stock. Opening balances belong
        // to the controlled opening-stock/stock-take workflow.
        quantity: 0,
        unit_value_ksh: Number(values.unit_value_ksh ?? 0),
        selling_price_ksh: Number(values.selling_price_ksh ?? 0),
        wholesale_price_ksh: Number(values.wholesale_price_ksh ?? 0),
        reorder_level: Number(values.reorder_level ?? 0),
        location: (values.location as string) ?? '',
        notes: (values.notes as string) ?? '',
        recorded_by: recordedBy,
        item_type: (values.item_type as string) ?? undefined,
        store_id: (values.store_id as string) || null,
      })
      return NextResponse.json({ ok: true, item }, { status: 201 })
    }

    if (action === 'movement') {
      return NextResponse.json({
        ok: false,
        error: 'Direct stock in/out is disabled. Use a posted GRN, GIN, GTN, Field Sales Delivery/Return Note, or an approved Stock Take adjustment.',
      }, { status: 409 })
    }

    return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}
