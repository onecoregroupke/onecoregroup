import { NextResponse, type NextRequest } from 'next/server'
import { requireApiSection } from '@/lib/api-auth'
import { assertBrandInScope } from '@/lib/finance'
import {
  createItem,
  inventoryItem,
  listPriceHistory,
  recordInventoryPrice,
  updateInventorySettings,
} from '@/lib/inventory'
import { auditEvent } from '@/lib/audit'

export async function GET(req: NextRequest) {
  const gate = await requireApiSection(req, 'inventory', 'view')
  if (gate instanceof NextResponse) return gate
  try {
    const itemId = new URL(req.url).searchParams.get('item') ?? ''
    const item = await inventoryItem(itemId)
    if (!item) return NextResponse.json({ ok: false, error: 'Inventory item not found.' }, { status: 404 })
    assertBrandInScope(item.brand_id, gate.allowedBrandIds('inventory'), 'view inventory price history')
    return NextResponse.json({ ok: true, item, history: await listPriceHistory(item.id) })
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 400 })
  }
}

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

    if (action === 'item-settings') {
      const before = await inventoryItem(String(values.item_id ?? ''))
      if (!before) return NextResponse.json({ ok: false, error: 'Inventory item not found.' }, { status: 404 })
      assertBrandInScope(before.brand_id, allowed, 'change inventory settings')
      const item = await updateInventorySettings(before.id, {
        reorder_level: Number(values.reorder_level ?? 0),
        minimum_stock: Number(values.minimum_stock ?? 0),
        production_threshold: Number(values.production_threshold ?? 0),
        maximum_stock: values.maximum_stock === '' || values.maximum_stock == null ? null : Number(values.maximum_stock),
        display_name: String(values.display_name ?? ''),
        product_family: String(values.product_family ?? ''),
        size_ml: values.size_ml === '' || values.size_ml == null ? null : Number(values.size_ml),
        packaging_component: String(values.packaging_component ?? ''),
        sort_order: Number(values.sort_order ?? 0),
      })
      await auditEvent({
        actor, action: 'inventory.item_settings.update', entity_table: 'inventory_items',
        entity_id: item.id, entity_label: item.name,
        before_data: before as unknown as Record<string, unknown>,
        after_data: item as unknown as Record<string, unknown>,
      })
      return NextResponse.json({ ok: true, item })
    }

    if (action === 'price') {
      const item = await inventoryItem(String(values.item_id ?? ''))
      if (!item) return NextResponse.json({ ok: false, error: 'Inventory item not found.' }, { status: 404 })
      assertBrandInScope(item.brand_id, allowed, 'record inventory price')
      const price = await recordInventoryPrice({
        item_id: item.id,
        price_type: String(values.price_type ?? '') as 'supplier_reference_cost' | 'retail_selling_price' | 'wholesale_selling_price',
        amount_ksh: Number(values.amount_ksh),
        effective_date: String(values.effective_date ?? ''),
        supplier_name: String(values.supplier_name ?? ''),
        source_description: String(values.source_description ?? ''),
        source_reference: String(values.source_reference ?? ''),
        notes: String(values.notes ?? ''),
        created_by: recordedBy,
        idempotency_key: String(values.idempotency_key ?? ''),
      })
      await auditEvent({
        actor, action: 'inventory.price.record', entity_table: 'inventory_price_history',
        entity_id: (price as { id?: string } | null)?.id ?? item.id, entity_label: item.name,
        after_data: price as unknown as Record<string, unknown>,
      })
      return NextResponse.json({ ok: true, price }, { status: 201 })
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
