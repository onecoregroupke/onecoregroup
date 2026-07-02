import { NextResponse, type NextRequest } from 'next/server'
import { requireApiSection } from '@/lib/api-auth'
import { assertBrandInScope } from '@/lib/finance'
import { createItem, recordStockMovement } from '@/lib/inventory'
import { db } from '@/lib/serverClient'

/**
 * Inventory endpoint (requires `inventory` edit — an explicit grant; brand
 * compartments apply exactly like finance):
 *   POST { action: 'item',     values: { brand_id, name, … } }
 *   POST { action: 'movement', values: { item_id, direction, quantity, … } }
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
        quantity: Number(values.quantity ?? 0),
        unit_value_ksh: Number(values.unit_value_ksh ?? 0),
        reorder_level: Number(values.reorder_level ?? 0),
        location: (values.location as string) ?? '',
        notes: (values.notes as string) ?? '',
        recorded_by: recordedBy,
      })
      return NextResponse.json({ ok: true, item }, { status: 201 })
    }

    if (action === 'movement') {
      // Resolve the item's brand server-side and check it against the scope —
      // never trust a brand id from the client for authorization.
      const { data: itemRow } = await db()
        .from('inventory_items')
        .select('brand_id')
        .eq('id', String(values.item_id ?? ''))
        .maybeSingle()
      if (!itemRow) return NextResponse.json({ ok: false, error: 'Item not found' }, { status: 404 })
      assertBrandInScope((itemRow as { brand_id: string }).brand_id, allowed, 'move stock')

      const result = await recordStockMovement({
        item_id: String(values.item_id ?? ''),
        direction: values.direction === 'out' ? 'out' : 'in',
        quantity: Number(values.quantity ?? 0),
        unit_value_ksh: values.unit_value_ksh === '' || values.unit_value_ksh == null ? undefined : Number(values.unit_value_ksh),
        movement_date: (values.movement_date as string) || undefined,
        reason: (values.reason as string) ?? '',
        reference: (values.reference as string) ?? '',
        notes: (values.notes as string) ?? '',
        recorded_by: recordedBy,
      })
      return NextResponse.json({ ok: true, ...result }, { status: 201 })
    }

    return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}
