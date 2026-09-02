import { requireSection } from '@/lib/server-auth'
import { listItems } from '@/lib/inventory'
import { listAllocations, getAllocation, custodyBalances, listDailyReturns, listReturnNotes } from '@/lib/fieldSales'
import { MyFieldSalesPortal } from '@/components/field-sales/MyFieldSalesPortal'

export const dynamic = 'force-dynamic'

export default async function MyFieldSalesPage() {
  const actor = await requireSection('field_sales')
  if (!actor.teamMemberId) {
    return <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">Your login is not linked to an Ops Hub team-member record. Ask an administrator to match your account email before recording field activity.</div>
  }
  const explicit = actor.brandAccess?.field_sales
  const allowed = Array.isArray(explicit) && explicit.length > 0 ? explicit : actor.allowedBrandIds('field_sales')
  const [allocations, custody, activities, returnNotes, items] = await Promise.all([
    listAllocations(allowed, { salespersonId: actor.teamMemberId, limit: 50 }),
    custodyBalances(allowed, actor.teamMemberId),
    listDailyReturns(allowed, { salespersonId: actor.teamMemberId, limit: 30 }),
    listReturnNotes(allowed, { salespersonId: actor.teamMemberId, limit: 30 }),
    listItems(allowed),
  ])
  const itemById = new Map(items.map((item) => [item.id, item]))
  const active = allocations.filter((allocation) => ['issued', 'active', 'partially_reconciled', 'awaiting_returns'].includes(allocation.status))
  const details = (await Promise.all(active.map((allocation) => getAllocation(allocation.id))))
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
  const latestAllocationByItem = new Map<string, {
    deliveryNote: string; receivedDate: string; sellingPriceKsh: number
  }>()
  for (const detail of details) {
    for (const line of detail.items) {
      if (!latestAllocationByItem.has(line.item_id)) {
        latestAllocationByItem.set(line.item_id, {
          deliveryNote: detail.allocation.delivery_note_no || detail.allocation.allocation_ref,
          receivedDate: detail.allocation.week_start,
          sellingPriceKsh: Number(line.selling_price_ksh),
        })
      }
    }
  }

  return <MyFieldSalesPortal
    salespersonName={actor.name}
    stock={custody.filter((row) => row.balance > 0).map((row) => ({
      itemId: row.itemId, itemName: itemById.get(row.itemId)?.name ?? 'Item',
      unit: itemById.get(row.itemId)?.unit ?? 'pcs', balance: row.balance,
      issued: row.issued, sold: row.sold, returned: row.returned, damaged: row.damaged,
      sellingPriceKsh: latestAllocationByItem.get(row.itemId)?.sellingPriceKsh ?? Number(itemById.get(row.itemId)?.selling_price_ksh ?? 0),
      deliveryNote: latestAllocationByItem.get(row.itemId)?.deliveryNote ?? '',
      receivedDate: latestAllocationByItem.get(row.itemId)?.receivedDate ?? '',
    }))}
    allocations={details.map(({ allocation, items: allocationLines }) => ({
      id: allocation.id,
      label: allocation.delivery_note_no || allocation.allocation_ref,
      weekStart: allocation.week_start,
      weekEnd: allocation.week_end,
      lines: allocationLines.map((line) => ({
        itemId: line.item_id, itemName: itemById.get(line.item_id)?.name ?? 'Item',
        unit: line.unit, batchNumber: line.batch_number,
        sellingPriceKsh: Number(line.selling_price_ksh), quantityIssued: Number(line.quantity_issued),
      })),
    }))}
    activities={activities.map((activity) => ({
      id: activity.id, ref: activity.return_ref, date: activity.return_date,
      cash: Number(activity.cash_received_ksh), mobile: Number(activity.mobile_money_ksh),
      bank: Number(activity.bank_ksh), credit: Number(activity.credit_sales_ksh), status: activity.status,
    }))}
    returns={returnNotes.map((note) => ({ id: note.id, ref: note.note_ref, date: note.return_date, status: note.status }))}
  />
}
