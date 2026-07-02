import { NextResponse, type NextRequest } from 'next/server'
import { requireApiSection } from '@/lib/api-auth'
import { assertBrandInScope } from '@/lib/finance'
import { createVendor, createPurchase, receivePurchase, type PurchaseLineInput } from '@/lib/procurement'
import { db } from '@/lib/serverClient'

/**
 * Procurement endpoint (requires `procurement` edit; brand compartments apply):
 *   POST { action: 'vendor',   values: { name, … } }
 *   POST { action: 'purchase', values: { brand_id, vendor_id, items: […], … } }
 *   POST { action: 'receive',  id }   → pushes line items into inventory
 */
export async function POST(req: NextRequest) {
  const gate = await requireApiSection(req, 'procurement', 'edit')
  if (gate instanceof NextResponse) return gate
  const actor = gate

  try {
    const body = await req.json()
    const action = body?.action as string
    const values = (body?.values ?? {}) as Record<string, unknown>
    const allowed = actor.allowedBrandIds('procurement')
    const recordedBy = actor.name || actor.email || 'unknown'

    if (action === 'vendor') {
      const vendor = await createVendor({
        name: String(values.name ?? ''),
        contact_person: (values.contact_person as string) ?? '',
        phone: (values.phone as string) ?? '',
        email: (values.email as string) ?? '',
        brand_id: (values.brand_id as string) || null,
        payment_terms: (values.payment_terms as string) ?? '',
        notes: (values.notes as string) ?? '',
      })
      return NextResponse.json({ ok: true, vendor }, { status: 201 })
    }

    if (action === 'purchase') {
      assertBrandInScope(values.brand_id as string, allowed, 'record purchases')
      const purchase = await createPurchase({
        brand_id: String(values.brand_id ?? ''),
        vendor_id: (values.vendor_id as string) || null,
        purchase_date: (values.purchase_date as string) || undefined,
        reference: (values.reference as string) ?? '',
        receipt_url: (values.receipt_url as string) ?? '',
        payment_status: (values.payment_status as string) || 'unpaid',
        notes: (values.notes as string) ?? '',
        recorded_by: recordedBy,
        items: Array.isArray(values.items) ? (values.items as PurchaseLineInput[]) : [],
      })
      return NextResponse.json({ ok: true, purchase }, { status: 201 })
    }

    if (action === 'receive') {
      const id = String(body?.id ?? '')
      const { data: purchaseRow } = await db()
        .from('procurement_purchases')
        .select('brand_id')
        .eq('id', id)
        .maybeSingle()
      if (!purchaseRow) return NextResponse.json({ ok: false, error: 'Purchase not found' }, { status: 404 })
      assertBrandInScope((purchaseRow as { brand_id: string }).brand_id, allowed, 'receive purchases')
      const purchase = await receivePurchase(id, recordedBy)
      return NextResponse.json({ ok: true, purchase })
    }

    return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}
