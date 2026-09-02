import type { FieldSalesCustodyMovementRow } from '@ocg/db'
import { db, todayInEat } from './serverClient'
import { custodyDirectionFor, type CustodyMovementKind } from './fieldSalesModel'

export async function currentCustodyBalance(salespersonId: string | null, itemId: string): Promise<number> {
  let q = db().from('field_sales_custody_movements').select('direction,quantity')
    .eq('item_id', itemId)
  q = salespersonId ? q.eq('salesperson_id', salespersonId) : q.is('salesperson_id', null)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return ((data as Pick<FieldSalesCustodyMovementRow, 'direction' | 'quantity'>[] | null) ?? [])
    .reduce((balance, movement) => balance + (movement.direction === 'in' ? 1 : -1) * Number(movement.quantity ?? 0), 0)
}

/** Append one retry-safe event to the salesperson custody ledger. */
export async function recordCustodyMovement(input: {
  allocation_id?: string | null
  allocation_item_id?: string | null
  daily_return_id?: string | null
  daily_return_item_id?: string | null
  return_note_id?: string | null
  sales_invoice_id?: string | null
  sales_invoice_item_id?: string | null
  salesperson_id: string | null
  item_id: string
  brand_id: string | null
  movement_kind: CustodyMovementKind
  quantity: number
  batch_number?: string
  movement_date?: string
  reference?: string
  idempotency_key?: string
  recorded_by: string
  notes?: string
}): Promise<FieldSalesCustodyMovementRow> {
  const qty = Number(input.quantity)
  if (!(qty > 0)) throw new Error('Quantity must be greater than zero.')

  if (input.idempotency_key) {
    const { data: replay } = await db().from('field_sales_custody_movements').select('*')
      .eq('idempotency_key', input.idempotency_key).maybeSingle()
    if (replay) return replay as FieldSalesCustodyMovementRow
  }

  const direction = custodyDirectionFor(input.movement_kind)
  const current = await currentCustodyBalance(input.salesperson_id, input.item_id)
  const after = direction === 'in' ? current + qty : current - qty
  if (after < 0) throw new Error(`Only ${current} in custody for this item — cannot record ${qty}.`)

  const { data, error } = await db().from('field_sales_custody_movements').insert({
    allocation_id: input.allocation_id ?? null,
    allocation_item_id: input.allocation_item_id ?? null,
    daily_return_id: input.daily_return_id ?? null,
    daily_return_item_id: input.daily_return_item_id ?? null,
    return_note_id: input.return_note_id ?? null,
    sales_invoice_id: input.sales_invoice_id ?? null,
    sales_invoice_item_id: input.sales_invoice_item_id ?? null,
    salesperson_id: input.salesperson_id,
    item_id: input.item_id,
    brand_id: input.brand_id,
    batch_number: input.batch_number ?? '',
    movement_kind: input.movement_kind,
    direction,
    quantity: qty,
    balance_after: after,
    movement_date: input.movement_date ?? todayInEat(),
    invoice_ref: input.reference ?? '',
    idempotency_key: input.idempotency_key ?? '',
    recorded_by: input.recorded_by,
    notes: input.notes ?? '',
  }).select('*').single()
  if (error) throw new Error(error.message)
  return data as FieldSalesCustodyMovementRow
}
