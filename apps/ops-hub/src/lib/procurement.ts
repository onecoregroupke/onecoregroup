import { db, nowIso } from './serverClient'
import { recordStockMovement } from './inventory'
import type {
  ProcurementVendorRow,
  ProcurementPurchaseRow,
  ProcurementPurchaseItemRow,
} from '@ocg/db'

// =============================================================================
// Procurement — vendor register and purchase records (LPO → received). When a
// purchase is received, its line items flow straight into the brand's
// inventory: linked items get an "in" movement; unlinked lines auto-create a
// new inventory item so purchasing continuously enriches the stock register.
// =============================================================================

export interface PurchaseWithItems extends ProcurementPurchaseRow {
  items: ProcurementPurchaseItemRow[]
}

export async function listVendors(): Promise<ProcurementVendorRow[]> {
  const { data } = await db()
    .from('procurement_vendors')
    .select('*')
    .eq('is_active', true)
    .order('name', { ascending: true })
  return (data as ProcurementVendorRow[] | null) ?? []
}

export async function createVendor(input: {
  name: string
  contact_person?: string
  phone?: string
  email?: string
  brand_id?: string | null
  payment_terms?: string
  notes?: string
}): Promise<ProcurementVendorRow> {
  if (!input.name?.trim()) throw new Error('Vendor name is required')
  const { data, error } = await db()
    .from('procurement_vendors')
    .insert({
      name: input.name.trim(),
      contact_person: input.contact_person ?? '',
      phone: input.phone ?? '',
      email: input.email ?? '',
      brand_id: input.brand_id || null,
      payment_terms: input.payment_terms ?? '',
      notes: input.notes ?? '',
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as ProcurementVendorRow
}

export async function listPurchases(
  allowed: string[] | null,
  limit = 200,
): Promise<PurchaseWithItems[]> {
  let q = db()
    .from('procurement_purchases')
    .select('*')
    .order('purchase_date', { ascending: false })
    .limit(limit)
  if (allowed !== null) q = q.in('brand_id', allowed)
  const { data: purchaseRows } = await q
  const purchases = (purchaseRows as ProcurementPurchaseRow[] | null) ?? []
  if (purchases.length === 0) return []
  const { data: itemRows } = await db()
    .from('procurement_purchase_items')
    .select('*')
    .in('purchase_id', purchases.map((p) => p.id))
  const items = (itemRows as ProcurementPurchaseItemRow[] | null) ?? []
  return purchases.map((p) => ({ ...p, items: items.filter((i) => i.purchase_id === p.id) }))
}

export interface PurchaseLineInput {
  description: string
  quantity: number
  unit?: string
  unit_cost_ksh?: number
  inventory_item_id?: string | null
}

export async function createPurchase(input: {
  brand_id: string
  vendor_id?: string | null
  purchase_date?: string
  reference?: string
  receipt_url?: string
  payment_status?: string
  notes?: string
  recorded_by: string
  items: PurchaseLineInput[]
}): Promise<PurchaseWithItems> {
  if (!input.brand_id) throw new Error('brand_id is required')
  const lines = (input.items ?? []).filter((l) => l.description?.trim())
  if (lines.length === 0) throw new Error('Add at least one line item')

  const total = lines.reduce(
    (sum, l) => sum + Number(l.quantity ?? 0) * Number(l.unit_cost_ksh ?? 0), 0,
  )
  const supabase = db()
  const { data: purchaseRow, error } = await supabase
    .from('procurement_purchases')
    .insert({
      brand_id: input.brand_id,
      vendor_id: input.vendor_id || null,
      purchase_date: input.purchase_date || nowIso().slice(0, 10),
      reference: input.reference ?? '',
      receipt_url: input.receipt_url ?? '',
      payment_status: input.payment_status || 'unpaid',
      total_cost_ksh: total,
      recorded_by: input.recorded_by,
      notes: input.notes ?? '',
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  const purchase = purchaseRow as ProcurementPurchaseRow

  const { data: itemRows, error: itemsError } = await supabase
    .from('procurement_purchase_items')
    .insert(
      lines.map((l) => ({
        purchase_id: purchase.id,
        inventory_item_id: l.inventory_item_id || null,
        description: l.description.trim(),
        quantity: Number(l.quantity ?? 1),
        unit: l.unit || 'pcs',
        unit_cost_ksh: Number(l.unit_cost_ksh ?? 0),
      })),
    )
    .select('*')
  if (itemsError) throw new Error(itemsError.message)

  return { ...purchase, items: (itemRows as ProcurementPurchaseItemRow[] | null) ?? [] }
}

/**
 * Mark a purchase received and push every line into inventory:
 *  - lines linked to an inventory item → stock-in movement at the line cost
 *  - unlinked lines → a NEW inventory item is created (then stocked in), so
 *    goods bought for the first time enter the register automatically.
 */
export async function receivePurchase(
  purchaseId: string,
  recordedBy: string,
): Promise<ProcurementPurchaseRow> {
  const supabase = db()
  const { data: purchaseRow } = await supabase
    .from('procurement_purchases')
    .select('*')
    .eq('id', purchaseId)
    .maybeSingle()
  if (!purchaseRow) throw new Error('Purchase not found')
  const purchase = purchaseRow as ProcurementPurchaseRow
  if (purchase.status === 'received') throw new Error('This purchase was already received.')
  if (purchase.status === 'cancelled') throw new Error('This purchase was cancelled.')

  const { data: lineRows } = await supabase
    .from('procurement_purchase_items')
    .select('*')
    .eq('purchase_id', purchaseId)
  const lines = (lineRows as ProcurementPurchaseItemRow[] | null) ?? []

  for (const line of lines) {
    let itemId = line.inventory_item_id
    if (!itemId) {
      const { data: newItem, error: itemError } = await supabase
        .from('inventory_items')
        .insert({
          brand_id: purchase.brand_id,
          name: line.description,
          unit: line.unit || 'pcs',
          quantity: 0,
          unit_value_ksh: Number(line.unit_cost_ksh ?? 0),
          category: 'Procured',
        })
        .select('*')
        .single()
      if (itemError) throw new Error(itemError.message)
      itemId = (newItem as { id: string }).id
      await supabase
        .from('procurement_purchase_items')
        .update({ inventory_item_id: itemId })
        .eq('id', line.id)
    }
    await recordStockMovement({
      item_id: itemId,
      direction: 'in',
      quantity: Number(line.quantity ?? 0),
      unit_value_ksh: Number(line.unit_cost_ksh ?? 0) || undefined,
      reason: `Received purchase ${purchase.reference || purchase.id.slice(0, 8)}`,
      reference: purchase.reference,
      source: 'purchase',
      purchase_id: purchase.id,
      recorded_by: recordedBy,
    })
  }

  const { data: updated, error } = await supabase
    .from('procurement_purchases')
    .update({ status: 'received', received_at: nowIso(), updated_at: nowIso() })
    .eq('id', purchaseId)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return updated as ProcurementPurchaseRow
}
