import { db, mintReference, nowIso } from './serverClient'
import { auditEvent } from './audit'
import { recordStockMovement } from './inventory'
import { toInventoryBaseQuantity } from './inventoryUnits'
import { postStoreProductionTransfer, productionStateForItem } from './productionCustody'
import {
  canApproveRequisition,
  canCreateIssueForRequisition,
  canPostToStock,
  deriveRequisitionStatus,
  isRequisitionEditable,
  requisitionRemaining,
  stockableReceiptQuantity,
  validateIssueLine,
  validateReceiptLine,
} from './procurementChainModel'
import type {
  InventoryItemRow,
  ProcurementGoodsIssueItemRow,
  ProcurementGoodsIssueRow,
  ProcurementGoodsReceiptItemRow,
  ProcurementGoodsReceiptRow,
  ProcurementRequisitionItemRow,
  ProcurementRequisitionRow,
  InventoryStoreRow,
  ProductionRunRow,
  ProductionRunMaterialRow,
} from '@ocg/db'

// =============================================================================
// The Iceland procurement chain: requisition → purchase → goods receipt →
// goods issue / transfer.
//
// Stock integrity is the whole point of this module:
//   • approving a requisition moves NO stock (only issuing does)
//   • only ACCEPTED receipt quantity is stocked; rejected/damaged never is
//   • a receipt or issue posts to the ledger EXACTLY ONCE — guarded here and
//     backed by partial unique indexes on inventory_movements (054)
//   • a requester can never approve their own requisition
// =============================================================================

export type ChainActor = { userId?: string; email: string; name: string; teamMemberId?: string | null }

function auditActor(actor: ChainActor) {
  return { userId: actor.userId ?? '', email: actor.email, name: actor.name }
}

// ─── Requisitions ───────────────────────────────────────────────────────────

export async function getRequisition(id: string): Promise<ProcurementRequisitionRow | null> {
  if (!id) return null
  const { data } = await db().from('procurement_requisitions').select('*').eq('id', id).maybeSingle()
  return (data as ProcurementRequisitionRow | null) ?? null
}

export async function getRequisitionItems(requisitionId: string): Promise<ProcurementRequisitionItemRow[]> {
  const { data } = await db()
    .from('procurement_requisition_items')
    .select('*')
    .eq('requisition_id', requisitionId)
    .order('sort_order', { ascending: true })
  return (data as ProcurementRequisitionItemRow[] | null) ?? []
}

export interface RequisitionIssueLine extends ProcurementRequisitionItemRow {
  issued_to_date: number
  remaining_to_issue: number
  inventory_item: InventoryItemRow | null
}

export interface RequisitionIssueDetail {
  requisition: ProcurementRequisitionRow
  items: RequisitionIssueLine[]
  issues: ProcurementGoodsIssueRow[]
  issueItems: ProcurementGoodsIssueItemRow[]
}

export async function getRequisitionIssueDetail(requisitionId: string): Promise<RequisitionIssueDetail | null> {
  const requisition = await getRequisition(requisitionId)
  if (!requisition) return null
  const [items, issues] = await Promise.all([
    getRequisitionItems(requisition.id),
    listGoodsIssues({ requisitionId: requisition.id, limit: 200 }),
  ])
  const issueIds = issues.map((issue) => issue.id)
  const issueItems = issueIds.length > 0
    ? await getGoodsIssueItemsForIssues(issueIds)
    : []
  const issuedByLine = issuedToDateByRequisitionLine(items, issues, issueItems)
  const itemIds = items.map((item) => item.inventory_item_id).filter(Boolean) as string[]
  const inventoryById = new Map<string, InventoryItemRow>()
  if (itemIds.length > 0) {
    const { data } = await db().from('inventory_items').select('*').in('id', itemIds)
    for (const row of (data as InventoryItemRow[] | null) ?? []) inventoryById.set(row.id, row)
  }
  return {
    requisition,
    issues,
    issueItems,
    items: items.map((item) => {
      const issued = issuedByLine.get(item.id) ?? 0
      return {
        ...item,
        quantity_requested: Number(item.quantity_requested),
        quantity_approved: Number(item.quantity_approved),
        quantity_issued: Number(item.quantity_issued),
        issued_to_date: issued,
        remaining_to_issue: requisitionRemaining({ approved: Number(item.quantity_approved), issued }),
        inventory_item: item.inventory_item_id ? inventoryById.get(item.inventory_item_id) ?? null : null,
      }
    }),
  }
}

export async function listRequisitions(
  opts: { brandIds?: string[] | null; status?: string; limit?: number } = {},
): Promise<ProcurementRequisitionRow[]> {
  let q = db()
    .from('procurement_requisitions')
    .select('*')
    .order('date_requested', { ascending: false })
    .limit(opts.limit ?? 200)
  if (opts.status) q = q.eq('status', opts.status)
  if (opts.brandIds && opts.brandIds.length > 0) q = q.in('brand_id', opts.brandIds)
  const { data } = await q
  return (data as ProcurementRequisitionRow[] | null) ?? []
}

export interface RequisitionItemInput {
  inventory_item_id?: string | null
  description?: string
  unit?: string
  quantity_requested?: number
  notes?: string
}

export async function createRequisition(
  input: {
    brand_id: string
    scope?: string
    shared_brand_ids?: string[]
    department?: string
    required_by?: string | null
    purpose?: string
    linked_task_id?: string | null
    linked_repair_case_id?: string | null
    production_run_id?: string | null
    notes?: string
    items?: RequisitionItemInput[]
  },
  actor: ChainActor,
): Promise<ProcurementRequisitionRow> {
  if (!input.brand_id) throw new Error('Pick the brand this requisition belongs to.')
  const { data, error } = await db()
    .from('procurement_requisitions')
    .insert({
      brand_id: input.brand_id,
      scope: input.scope || 'brand',
      shared_brand_ids: input.shared_brand_ids ?? [],
      department: input.department ?? '',
      requested_by: actor.email.toLowerCase(),
      requested_by_name: actor.name,
      prepared_by: actor.name,
      required_by: input.required_by ?? null,
      purpose: input.purpose ?? '',
      linked_task_id: input.linked_task_id ?? null,
      linked_repair_case_id: input.linked_repair_case_id ?? null,
      production_run_id: input.production_run_id ?? null,
      notes: input.notes ?? '',
      status: 'draft',
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  const requisition = data as ProcurementRequisitionRow
  await replaceRequisitionItems(requisition.id, input.items ?? [])
  return requisition
}

async function replaceRequisitionItems(requisitionId: string, items: RequisitionItemInput[]): Promise<void> {
  const cleaned = items.filter((i) => (i.description ?? '').trim() !== '' || i.inventory_item_id)
  await db().from('procurement_requisition_items').delete().eq('requisition_id', requisitionId)
  if (cleaned.length === 0) return

  // Snapshot stock at request time so the approver sees what was on hand.
  const itemIds = cleaned.map((i) => i.inventory_item_id).filter(Boolean) as string[]
  const stockById = new Map<string, number>()
  if (itemIds.length > 0) {
    const { data } = await db().from('inventory_items').select('id,quantity').in('id', itemIds)
    for (const row of (data as { id: string; quantity: number }[] | null) ?? []) {
      stockById.set(row.id, Number(row.quantity ?? 0))
    }
  }

  const { error } = await db().from('procurement_requisition_items').insert(
    cleaned.map((i, index) => ({
      requisition_id: requisitionId,
      inventory_item_id: i.inventory_item_id ?? null,
      description: i.description ?? '',
      unit: i.unit || 'pcs',
      quantity_requested: Number(i.quantity_requested ?? 0),
      stock_at_request: i.inventory_item_id ? (stockById.get(i.inventory_item_id) ?? null) : null,
      notes: i.notes ?? '',
      sort_order: index,
    })),
  )
  if (error) throw new Error(error.message)
}

export async function updateRequisition(
  id: string,
  patch: Partial<{
    department: string
    required_by: string | null
    purpose: string
    production_run_id: string | null
    notes: string
    items: RequisitionItemInput[]
  }>,
): Promise<ProcurementRequisitionRow> {
  const existing = await getRequisition(id)
  if (!existing) throw new Error('Requisition not found')
  if (!isRequisitionEditable(existing.status)) {
    throw new Error('A submitted requisition can no longer be edited.')
  }
  const { items, ...header } = patch
  const { data, error } = await db()
    .from('procurement_requisitions')
    .update({ ...header, updated_at: nowIso() })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  if (items !== undefined) await replaceRequisitionItems(id, items)
  return data as ProcurementRequisitionRow
}

export async function submitRequisition(id: string, actor: ChainActor): Promise<ProcurementRequisitionRow> {
  const existing = await getRequisition(id)
  if (!existing) throw new Error('Requisition not found')
  if (existing.status !== 'draft') throw new Error('This requisition has already been submitted.')
  const items = await getRequisitionItems(id)
  if (items.length === 0) throw new Error('Add at least one item before submitting.')

  const reference = existing.reference ?? (await mintReference('requisition', 'MRF-'))
  const { data, error } = await db()
    .from('procurement_requisitions')
    .update({ status: 'submitted', reference, updated_at: nowIso() })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  void actor
  return data as ProcurementRequisitionRow
}

/**
 * Approve (or partially approve) a requisition. Sets approved quantities only —
 * this deliberately does NOT touch inventory. Stock moves when goods are
 * physically issued, never at approval.
 */
export async function approveRequisition(input: {
  requisition_id: string
  approvals: { item_id: string; quantity_approved: number }[]
  comment?: string
  actor: ChainActor
  allowSelfApproval?: boolean
}): Promise<ProcurementRequisitionRow> {
  const existing = await getRequisition(input.requisition_id)
  if (!existing) throw new Error('Requisition not found')

  const check = canApproveRequisition({
    requestedByEmail: existing.requested_by,
    approverEmail: input.actor.email,
    status: existing.status,
    allowSelfApproval: input.allowSelfApproval,
  })
  if (!check.ok) throw new Error(check.reason ?? 'You cannot approve this requisition.')

  const items = await getRequisitionItems(existing.id)
  const approvedById = new Map(input.approvals.map((a) => [a.item_id, Number(a.quantity_approved ?? 0)]))

  for (const item of items) {
    const approved = approvedById.get(item.id)
    if (approved === undefined) continue
    if (approved < 0) throw new Error('Approved quantity cannot be negative.')
    if (approved > Number(item.quantity_requested)) {
      throw new Error(`Cannot approve ${approved} of "${item.description}" — only ${item.quantity_requested} was requested.`)
    }
    await db().from('procurement_requisition_items').update({ quantity_approved: approved }).eq('id', item.id)
  }

  const refreshed = await getRequisitionItems(existing.id)
  const status = deriveRequisitionStatus(
    refreshed.map((i) => ({
      requested: Number(i.quantity_requested),
      approved: Number(i.quantity_approved),
      issued: Number(i.quantity_issued),
    })),
    'approval',
  )

  const now = nowIso()
  const { data, error } = await db()
    .from('procurement_requisitions')
    .update({
      status,
      approved_by: input.actor.email.toLowerCase(),
      approved_by_name: input.actor.name,
      approved_at: now,
      approval_comment: input.comment ?? '',
      updated_at: now,
    })
    .eq('id', existing.id)
    .select('*')
    .single()
  if (error) throw new Error(error.message)

  await auditEvent({
    actor: auditActor(input.actor),
    action: 'status',
    entity_table: 'procurement_requisitions',
    entity_id: existing.id,
    entity_label: existing.reference ?? existing.id,
    before_data: { status: existing.status },
    after_data: { status, note: 'approval does not move stock' },
  })
  return data as ProcurementRequisitionRow
}

// ─── Goods receipts ─────────────────────────────────────────────────────────

export async function getGoodsReceipt(id: string): Promise<ProcurementGoodsReceiptRow | null> {
  if (!id) return null
  const { data } = await db().from('procurement_goods_receipts').select('*').eq('id', id).maybeSingle()
  return (data as ProcurementGoodsReceiptRow | null) ?? null
}

export async function getGoodsReceiptItems(receiptId: string): Promise<ProcurementGoodsReceiptItemRow[]> {
  const { data } = await db()
    .from('procurement_goods_receipt_items')
    .select('*')
    .eq('receipt_id', receiptId)
    .order('sort_order', { ascending: true })
  return (data as ProcurementGoodsReceiptItemRow[] | null) ?? []
}

export async function listGoodsReceipts(
  opts: { brandIds?: string[] | null; status?: string; purchaseId?: string; limit?: number } = {},
): Promise<ProcurementGoodsReceiptRow[]> {
  let q = db()
    .from('procurement_goods_receipts')
    .select('*')
    .order('received_date', { ascending: false })
    .limit(opts.limit ?? 200)
  if (opts.status) q = q.eq('status', opts.status)
  if (opts.purchaseId) q = q.eq('purchase_id', opts.purchaseId)
  if (opts.brandIds && opts.brandIds.length > 0) q = q.in('brand_id', opts.brandIds)
  const { data } = await q
  return (data as ProcurementGoodsReceiptRow[] | null) ?? []
}

export interface ReceiptItemInput {
  purchase_item_id?: string | null
  inventory_item_id?: string | null
  description?: string
  unit?: string
  quantity_ordered?: number
  quantity_delivered?: number
  quantity_accepted?: number
  quantity_rejected?: number
  unit_cost_ksh?: number
  batch_number?: string
  expiry_date?: string | null
  condition?: string
  rejection_reason?: string
  remarks?: string
  disposition?: string
}

export async function createGoodsReceipt(
  input: Partial<ProcurementGoodsReceiptRow> & { brand_id: string; items?: ReceiptItemInput[] },
  actor: ChainActor,
): Promise<ProcurementGoodsReceiptRow> {
  if (!input.brand_id) throw new Error('Pick the brand receiving these goods.')
  const { items, ...header } = input
  const { data, error } = await db()
    .from('procurement_goods_receipts')
    .insert({
      ...header,
      received_by: header.received_by || actor.name,
      received_by_email: header.received_by_email || actor.email,
      entered_by: actor.name,
      status: 'draft',
      created_by: actor.email,
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  const receipt = data as ProcurementGoodsReceiptRow
  await replaceReceiptItems(receipt.id, items ?? [])
  return receipt
}

async function replaceReceiptItems(receiptId: string, items: ReceiptItemInput[]): Promise<void> {
  const cleaned = items.filter((i) => (i.description ?? '').trim() !== '' || i.inventory_item_id)
  for (const item of cleaned) {
    const check = validateReceiptLine({
      quantity_ordered: Number(item.quantity_ordered ?? 0),
      quantity_delivered: Number(item.quantity_delivered ?? 0),
      quantity_accepted: Number(item.quantity_accepted ?? 0),
      quantity_rejected: Number(item.quantity_rejected ?? 0),
    })
    if (!check.ok) throw new Error(`${item.description || 'Line'}: ${check.reason}`)
  }
  await db().from('procurement_goods_receipt_items').delete().eq('receipt_id', receiptId)
  if (cleaned.length === 0) return
  const { error } = await db().from('procurement_goods_receipt_items').insert(
    cleaned.map((i, index) => ({
      receipt_id: receiptId,
      purchase_item_id: i.purchase_item_id ?? null,
      inventory_item_id: i.inventory_item_id ?? null,
      description: i.description ?? '',
      unit: i.unit || 'pcs',
      quantity_ordered: Number(i.quantity_ordered ?? 0),
      quantity_delivered: Number(i.quantity_delivered ?? 0),
      quantity_accepted: Number(i.quantity_accepted ?? 0),
      quantity_rejected: Number(i.quantity_rejected ?? 0),
      unit_cost_ksh: Number(i.unit_cost_ksh ?? 0),
      batch_number: i.batch_number ?? '',
      expiry_date: i.expiry_date ?? null,
      condition: i.condition || 'good',
      rejection_reason: i.rejection_reason ?? '',
      remarks: i.remarks ?? '',
      disposition: i.disposition || 'stock',
      sort_order: index,
    })),
  )
  if (error) throw new Error(error.message)
}

export async function updateGoodsReceipt(
  id: string,
  patch: Partial<ProcurementGoodsReceiptRow> & { items?: ReceiptItemInput[] },
): Promise<ProcurementGoodsReceiptRow> {
  const existing = await getGoodsReceipt(id)
  if (!existing) throw new Error('Goods receipt not found')
  if (existing.status !== 'draft') {
    throw new Error('A posted goods receipt cannot be edited — raise a correcting document instead.')
  }
  const { items, ...header } = patch
  const { data, error } = await db()
    .from('procurement_goods_receipts')
    .update({ ...header, updated_at: nowIso() })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  if (items !== undefined) await replaceReceiptItems(id, items)
  return data as ProcurementGoodsReceiptRow
}

/**
 * Post a goods receipt to stock. Only ACCEPTED quantity on lines marked for
 * storage is stocked; rejected and consumed lines never reach inventory.
 * Refuses a second posting — and even if that check were bypassed, the partial
 * unique index on inventory_movements.receipt_item_id would reject the insert.
 */
export async function postGoodsReceipt(
  receiptId: string,
  actor: ChainActor,
): Promise<{ receipt: ProcurementGoodsReceiptRow; movementsCreated: number }> {
  const receipt = await getGoodsReceipt(receiptId)
  if (!receipt) throw new Error('Goods receipt not found')

  const guard = canPostToStock({ status: receipt.status, posted_at: receipt.posted_at })
  if (!guard.ok) throw new Error(guard.reason ?? 'This receipt cannot be posted.')

  const items = await getGoodsReceiptItems(receipt.id)
  if (items.length === 0) throw new Error('Add at least one line before posting this receipt.')

  const reference = receipt.reference ?? (await mintReference('goods_receipt', 'GRN-'))
  let movementsCreated = 0

  for (const line of items) {
    const quantity = stockableReceiptQuantity({
      quantity_delivered: Number(line.quantity_delivered),
      quantity_accepted: Number(line.quantity_accepted),
      quantity_rejected: Number(line.quantity_rejected),
      disposition: line.disposition,
    })
    if (quantity <= 0) continue

    const itemId = line.inventory_item_id ?? (await ensureInventoryItem(line, receipt))
    if (!line.inventory_item_id) {
      await db().from('procurement_goods_receipt_items').update({ inventory_item_id: itemId }).eq('id', line.id)
    }

    await recordStockMovement({
      item_id: itemId,
      direction: 'in',
      quantity,
      movement_unit: line.unit,
      unit_value_ksh: Number(line.unit_cost_ksh ?? 0) || undefined,
      reason: `Goods received on ${reference}`,
      reference,
      source: 'purchase',
      purchase_id: receipt.purchase_id ?? null,
      goods_receipt_id: receipt.id,
      receipt_item_id: line.id,
      recorded_by: actor.email,
    })
    movementsCreated += 1
  }

  const now = nowIso()
  const { data, error } = await db()
    .from('procurement_goods_receipts')
    .update({ status: 'posted', reference, posted_at: now, posted_by: actor.email, updated_at: now })
    .eq('id', receipt.id)
    .select('*')
    .single()
  if (error) throw new Error(error.message)

  await auditEvent({
    actor: auditActor(actor),
    action: 'status',
    entity_table: 'procurement_goods_receipts',
    entity_id: receipt.id,
    entity_label: reference,
    before_data: { status: receipt.status },
    after_data: { status: 'posted', stock_movements: movementsCreated },
  })

  return { receipt: data as ProcurementGoodsReceiptRow, movementsCreated }
}

async function ensureInventoryItem(
  line: ProcurementGoodsReceiptItemRow,
  receipt: ProcurementGoodsReceiptRow,
): Promise<string> {
  const { data, error } = await db()
    .from('inventory_items')
    .insert({
      brand_id: receipt.brand_id,
      name: line.description,
      unit: line.unit || 'pcs',
      quantity: 0,
      unit_value_ksh: Number(line.unit_cost_ksh ?? 0),
      category: 'Procured',
      location: receipt.receiving_location,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return (data as { id: string }).id
}

// ─── Goods issue / transfer notes ───────────────────────────────────────────

export async function getGoodsIssue(id: string): Promise<ProcurementGoodsIssueRow | null> {
  if (!id) return null
  const { data } = await db().from('procurement_goods_issues').select('*').eq('id', id).maybeSingle()
  return (data as ProcurementGoodsIssueRow | null) ?? null
}

export async function getGoodsIssueItems(issueId: string): Promise<ProcurementGoodsIssueItemRow[]> {
  const { data } = await db()
    .from('procurement_goods_issue_items')
    .select('*')
    .eq('issue_id', issueId)
    .order('sort_order', { ascending: true })
  return (data as ProcurementGoodsIssueItemRow[] | null) ?? []
}

export async function listGoodsIssues(
  opts: { brandIds?: string[] | null; kind?: string; status?: string; requisitionId?: string; limit?: number } = {},
): Promise<ProcurementGoodsIssueRow[]> {
  let q = db()
    .from('procurement_goods_issues')
    .select('*')
    .order('issue_date', { ascending: false })
    .limit(opts.limit ?? 200)
  if (opts.kind) q = q.eq('kind', opts.kind)
  if (opts.status) q = q.eq('status', opts.status)
  if (opts.requisitionId) q = q.eq('requisition_id', opts.requisitionId)
  if (opts.brandIds && opts.brandIds.length > 0) q = q.in('brand_id', opts.brandIds)
  const { data } = await q
  return (data as ProcurementGoodsIssueRow[] | null) ?? []
}

async function getGoodsIssueItemsForIssues(issueIds: string[]): Promise<ProcurementGoodsIssueItemRow[]> {
  if (issueIds.length === 0) return []
  const { data } = await db()
    .from('procurement_goods_issue_items')
    .select('*')
    .in('issue_id', issueIds)
    .order('sort_order', { ascending: true })
  return (data as ProcurementGoodsIssueItemRow[] | null) ?? []
}

export interface IssueItemInput {
  requisition_item_id?: string | null
  inventory_item_id?: string | null
  description?: string
  unit?: string
  quantity_approved?: number
  quantity_issued?: number
  batch_number?: string
  store_location?: string
  remarks?: string
}

export async function createGoodsIssue(
  input: Partial<ProcurementGoodsIssueRow> & { brand_id: string; items?: IssueItemInput[] },
  actor: ChainActor,
): Promise<ProcurementGoodsIssueRow> {
  if (!input.brand_id) throw new Error('Pick the brand issuing these goods.')
  const { items, ...header } = input
  const kind = header.kind === 'transfer' ? 'transfer' : 'issue'
  if (kind === 'issue' && header.production_run_id && !header.requisition_id) {
    throw new Error('A production GIN must originate from an approved Material Requisition linked to the run.')
  }
  if (kind === 'issue' && !header.requisition_id) {
    const required = [
      header.exception_reason, header.requested_by || header.requested_by_name,
      header.approved_by || header.approved_by_name, header.issued_to_label, header.purpose,
    ]
    if (header.issued_to_type !== 'other' || required.some((value) => !String(value ?? '').trim())) {
      throw new Error('An issue without an approved MRF is an exception: record the reason, requester, approver, destination and intended use.')
    }
  }
  const reference = header.reference ?? (await mintReference(kind === 'transfer' ? 'goods_transfer' : 'goods_issue', kind === 'transfer' ? 'GTN-' : 'GIN-'))
  const { data, error } = await db()
    .from('procurement_goods_issues')
    .insert({
      ...header,
      kind,
      reference,
      issued_by: header.issued_by || actor.name,
      issued_by_email: header.issued_by_email || actor.email,
      status: 'draft',
      created_by: actor.email,
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  const issue = data as ProcurementGoodsIssueRow
  await replaceIssueItems(issue.id, items ?? [])
  return issue
}

export async function createIssueFromRequisition(input: {
  requisition_id: string
  source_store_id?: string | null
  issue_date?: string
  actor: ChainActor
}): Promise<ProcurementGoodsIssueRow> {
  const detail = await getRequisitionIssueDetail(input.requisition_id)
  if (!detail) throw new Error('Requisition not found')

  const check = canCreateIssueForRequisition({
    status: detail.requisition.status,
    lines: detail.items.map((item) => ({
      requested: Number(item.quantity_requested),
      approved: Number(item.quantity_approved),
      issued: item.issued_to_date,
    })),
  })
  if (!check.ok) throw new Error(check.reason ?? 'This requisition cannot be issued.')

  const existingDraft = detail.issues.find((issue) => issue.kind === 'issue' && issue.status === 'draft')
  if (existingDraft) return existingDraft

  const remaining = detail.items.filter((item) => item.remaining_to_issue > 0)
  if (remaining.length === 0) throw new Error('This requisition has no remaining approved quantity to issue.')

  const sourceStoreId = input.source_store_id || commonStoreId(remaining.map((item) => item.inventory_item)) || null
  const store = sourceStoreId ? await getStore(sourceStoreId) : null
  if (sourceStoreId && !store) throw new Error('Source store not found.')
  if (store?.brand_id && store.brand_id !== detail.requisition.brand_id) {
    throw new Error('The selected source store does not belong to this requisition brand.')
  }

  return createGoodsIssue({
    kind: 'issue',
    brand_id: detail.requisition.brand_id,
    requisition_id: detail.requisition.id,
    production_run_id: detail.requisition.production_run_id,
    issue_date: input.issue_date,
    issued_to_type: detail.requisition.production_run_id ? 'production' : 'department',
    issued_to_label: detail.requisition.department || detail.requisition.requested_by_name,
    department: detail.requisition.department,
    purpose: detail.requisition.purpose,
    source_store_id: sourceStoreId,
    store_location: store?.name ?? '',
    issued_by: input.actor.name,
    issued_by_email: input.actor.email,
    created_by: input.actor.email,
    items: remaining.map((item) => ({
      requisition_item_id: item.id,
      inventory_item_id: item.inventory_item_id,
      description: item.description || item.inventory_item?.name || '',
      unit: item.unit,
      quantity_approved: item.remaining_to_issue,
      quantity_issued: 0,
      store_location: store?.name ?? item.inventory_item?.location ?? '',
    })),
  }, input.actor)
}

export async function updateGoodsIssue(
  id: string,
  patch: Partial<ProcurementGoodsIssueRow> & { items?: IssueItemInput[] },
): Promise<ProcurementGoodsIssueRow> {
  const existing = await getGoodsIssue(id)
  if (!existing) throw new Error('Issue note not found')
  if (existing.status !== 'draft') {
    throw new Error('A posted issue note cannot be edited — raise a correcting document instead.')
  }
  const { items, ...header } = patch
  if (items !== undefined) {
    await validateIssueItemsAgainstRequisition(existing, items)
  }
  const { data, error } = await db()
    .from('procurement_goods_issues')
    .update({ ...header, updated_at: nowIso() })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  if (items !== undefined) await replaceIssueItems(id, items)
  return data as ProcurementGoodsIssueRow
}

async function replaceIssueItems(issueId: string, items: IssueItemInput[]): Promise<void> {
  const cleaned = items.filter((i) => (i.description ?? '').trim() !== '' || i.inventory_item_id)
  await db().from('procurement_goods_issue_items').delete().eq('issue_id', issueId)
  if (cleaned.length === 0) return
  const { error } = await db().from('procurement_goods_issue_items').insert(
    cleaned.map((i, index) => ({
      issue_id: issueId,
      requisition_item_id: i.requisition_item_id ?? null,
      inventory_item_id: i.inventory_item_id ?? null,
      description: i.description ?? '',
      unit: i.unit || 'pcs',
      quantity_approved: Number(i.quantity_approved ?? i.quantity_issued ?? 0),
      quantity_issued: Number(i.quantity_issued ?? 0),
      batch_number: i.batch_number ?? '',
      store_location: i.store_location ?? '',
      remarks: i.remarks ?? '',
      sort_order: index,
    })),
  )
  if (error) throw new Error(error.message)
}

async function validateIssueItemsAgainstRequisition(issue: ProcurementGoodsIssueRow, items: IssueItemInput[]): Promise<void> {
  if (!issue.requisition_id) return
  const detail = await getRequisitionIssueDetail(issue.requisition_id)
  if (!detail) throw new Error('Originating requisition not found.')
  const remainingByLine = new Map(detail.items.map((item) => [item.id, item.remaining_to_issue]))
  for (const line of items) {
    if (!line.requisition_item_id) continue
    const quantity = Number(line.quantity_issued ?? 0)
    if (quantity < 0) throw new Error(`${line.description || 'Line'}: Issued quantity cannot be negative.`)
    const remaining = remainingByLine.get(line.requisition_item_id) ?? 0
    if (quantity > 0) {
      const check = validateIssueLine({
        quantity_approved: Number(line.quantity_approved ?? remaining),
        quantity_issued: quantity,
        remaining,
      })
      if (!check.ok) throw new Error(`${line.description || 'Line'}: ${check.reason}`)
    }
  }
}

/**
 * Finalise an issue note: this is the moment stock actually leaves. Validates
 * every line against what was approved and what is on hand, then posts exactly
 * once. Also rolls the issued quantity back onto the source requisition so its
 * status reflects reality.
 */
export async function postGoodsIssue(
  issueId: string,
  actor: ChainActor,
): Promise<{ issue: ProcurementGoodsIssueRow; movementsCreated: number }> {
  const issue = await getGoodsIssue(issueId)
  if (!issue) throw new Error('Issue note not found')

  const guard = canPostToStock({ status: issue.status, posted_at: issue.posted_at })
  if (!guard.ok) throw new Error(guard.reason ?? 'This issue note cannot be posted.')

  const items = await getGoodsIssueItems(issue.id)
  if (items.length === 0) throw new Error('Add at least one line before issuing.')
  if (!items.some((line) => Number(line.quantity_issued) > 0)) {
    throw new Error('Enter at least one issued quantity greater than zero.')
  }
  if (!issue.document_number.trim()) {
    throw new Error(`Enter the physical ${issue.kind === 'transfer' ? 'GTN' : 'GIN'} number before posting.`)
  }

  const storeIds = [issue.source_store_id, issue.destination_store_id].filter(Boolean) as string[]
  const { data: storeData, error: storeError } = storeIds.length > 0
    ? await db().from('inventory_stores').select('*').in('id', storeIds)
    : { data: [] as InventoryStoreRow[], error: null }
  if (storeError) throw new Error(storeError.message)
  const storeById = new Map(((storeData as InventoryStoreRow[] | null) ?? []).map((store) => [store.id, store]))
  const sourceStore = issue.source_store_id ? storeById.get(issue.source_store_id) : null
  const destinationStore = issue.destination_store_id ? storeById.get(issue.destination_store_id) : null
  if (issue.source_store_id && !sourceStore) throw new Error('Source store not found.')

  if (issue.kind === 'transfer') {
    if (!issue.source_store_id || !issue.destination_store_id) {
      throw new Error('A transfer requires explicit source and destination stores.')
    }
    if (issue.source_store_id === issue.destination_store_id) {
      throw new Error('Source and destination stores must be different.')
    }
    const rows = [...storeById.values()]
    if (rows.length !== 2 || rows.some((store) => store.brand_id && store.brand_id !== issue.brand_id)) {
      throw new Error('Both transfer stores must belong to the document brand.')
    }
    if (sourceStore?.store_type === 'production' && destinationStore?.store_type === 'production') {
      throw new Error('Use a Production custody state event, not a GTN between two Production stores.')
    }
  }

  if (issue.kind === 'issue' && !issue.requisition_id) {
    const required = [issue.exception_reason, issue.requested_by || issue.requested_by_name,
      issue.approved_by || issue.approved_by_name, issue.issued_to_label, issue.purpose]
    if (issue.issued_to_type !== 'other' || required.some((value) => !String(value ?? '').trim())) {
      throw new Error('This non-MRF issue is missing its exception reason, requester, approver, destination or intended use.')
    }
  }

  const productionRun = issue.production_run_id
    ? await db().from('production_runs').select('*').eq('id', issue.production_run_id).maybeSingle()
    : { data: null }
  if (issue.production_run_id && !productionRun.data) throw new Error('Linked production run not found.')
  if (productionRun.data && (productionRun.data.brand_id ?? null) !== (issue.brand_id ?? null)) {
    throw new Error('The linked production run belongs to a different brand.')
  }
  if (productionRun.data && issue.kind === 'issue') {
    if (!issue.requisition_id) {
      throw new Error('A production GIN must originate from its approved Material Requisition.')
    }
    const { data: requisition } = await db().from('procurement_requisitions')
      .select('id,production_run_id,status').eq('id', issue.requisition_id).maybeSingle()
    if (!requisition || requisition.production_run_id !== productionRun.data.id) {
      throw new Error('The GIN source MRF must be linked to this same production run.')
    }
    if (!['approved', 'partially_approved', 'partially_issued'].includes(requisition.status)) {
      throw new Error('The linked production MRF must be approved before its GIN can post.')
    }
  }
  const isProductionGin = issue.kind === 'issue' && issue.issued_to_type === 'production' && Boolean(productionRun.data)
  const sourceIsProduction = issue.kind === 'transfer' && sourceStore?.store_type === 'production'
  const destinationIsProduction = issue.kind === 'transfer' && destinationStore?.store_type === 'production'
  const isProductionOutputGtn = sourceIsProduction && destinationStore?.store_type === 'finished_goods'
  const isProductionMaterialReturn = sourceIsProduction && ['raw', 'packaging'].includes(destinationStore?.store_type ?? '')
  const isProductionBoundary = isProductionGin || sourceIsProduction || destinationIsProduction
  if ((sourceIsProduction || destinationIsProduction) && !productionRun.data) {
    throw new Error('A GTN crossing the Production boundary must be linked to its Production run.')
  }
  if (destinationIsProduction && productionRun.data
      && !['rework', 'repackaging', 'quality_recovery'].includes(String(productionRun.data.run_type ?? ''))) {
    throw new Error('A Finished Goods Store → Production GTN requires a rework, repackaging or quality-recovery run.')
  }
  if (isProductionGin && ['production', 'finished_goods', 'field_sales'].includes(sourceStore?.store_type ?? '')) {
    throw new Error('A production GIN must issue raw material or packaging from its authorised Store, never from Production, Finished Goods or Field Sales.')
  }
  if (destinationIsProduction && sourceStore?.store_type !== 'finished_goods') {
    throw new Error('Use a production GIN for raw material or packaging. A Store → Production GTN is reserved for Finished Goods rework/repackaging.')
  }
  if (sourceIsProduction && !isProductionOutputGtn && !isProductionMaterialReturn) {
    throw new Error('A Production GTN may transfer accepted output to Finished Goods or return unused material to its Raw/Packaging Store.')
  }

  // Validate everything BEFORE moving any stock — a bad line must not leave a
  // half-posted note behind.
  const itemIds = items.map((i) => i.inventory_item_id).filter(Boolean) as string[]
  const stockById = new Map<string, InventoryItemRow>()
  if (itemIds.length > 0) {
    const { data } = await db().from('inventory_items').select('*').in('id', itemIds)
    for (const row of (data as InventoryItemRow[] | null) ?? []) stockById.set(row.id, row)
  }
  const { data: runMaterialData, error: runMaterialError } = isProductionMaterialReturn && productionRun.data
    ? await db().from('production_run_materials').select('*').eq('run_id', productionRun.data.id)
    : { data: [] as ProductionRunMaterialRow[], error: null }
  if (runMaterialError) throw new Error(runMaterialError.message)
  const runMaterialsByItem = new Map<string, ProductionRunMaterialRow[]>()
  for (const row of (runMaterialData as ProductionRunMaterialRow[] | null) ?? []) {
    runMaterialsByItem.set(row.item_id, [...(runMaterialsByItem.get(row.item_id) ?? []), row])
  }
  const remainingByLine = issue.requisition_id ? await remainingByRequisitionLine(issue.requisition_id) : new Map<string, number>()
  for (const line of items) {
    if (Number(line.quantity_issued) <= 0) continue
    if (!line.inventory_item_id) {
      throw new Error(`"${line.description}" is not linked to an inventory item, so it cannot be issued.`)
    }
    const check = validateIssueLine({
      quantity_approved: Number(line.quantity_approved),
      quantity_issued: Number(line.quantity_issued),
      remaining: line.requisition_item_id ? (remainingByLine.get(line.requisition_item_id) ?? 0) : undefined,
    })
    if (!check.ok) throw new Error(`${line.description}: ${check.reason}`)
    const stock = stockById.get(line.inventory_item_id)
    const baseQuantity = toInventoryBaseQuantity(
      Number(line.quantity_issued),
      line.unit,
      stock?.base_unit || stock?.unit || '',
    )
    if (productionRun.data && isProductionOutputGtn && line.inventory_item_id !== productionRun.data.product_item_id) {
      throw new Error(`${line.description}: This Production → Store GTN may only transfer the output SKU of the linked run.`)
    }
    if (productionRun.data && isProductionMaterialReturn) {
      const materials = runMaterialsByItem.get(line.inventory_item_id) ?? []
      if (materials.length === 0) throw new Error(`${line.description}: This item was not issued to the linked run, so it cannot be returned from that run.`)
      if (destinationStore?.store_type === 'packaging' && stock?.item_type !== 'packaging') {
        throw new Error(`${line.description}: Only packaging may return to the Packaging Store.`)
      }
      if (destinationStore?.store_type === 'raw' && stock?.item_type === 'packaging') {
        throw new Error(`${line.description}: Packaging must return to the Packaging Store.`)
      }
      const availableToReturn = materials.reduce((sum, material) => sum + Number(material.issued_quantity) - Number(material.consumed_quantity) - Number(material.waste_quantity) - Number(material.returned_quantity), 0)
      if (baseQuantity > availableToReturn + 0.0001) {
        throw new Error(`${line.description}: Only ${availableToReturn} ${stock?.base_unit || stock?.unit} remains available to return from this run.`)
      }
    }
    if (productionRun.data && destinationIsProduction
        && line.inventory_item_id !== productionRun.data.source_product_item_id) {
      throw new Error(`${line.description}: This Store → Production GTN must match the source rework SKU on the linked run.`)
    }
    if (!sourceIsProduction && baseQuantity > Number(stock?.quantity ?? 0)) {
      throw new Error(`${line.description}: Cannot issue ${line.quantity_issued} ${line.unit} — only ${Number(stock?.quantity ?? 0)} ${stock?.base_unit || stock?.unit} in stock.`)
    }
  }

  if (isProductionOutputGtn && productionRun.data) {
    if (!productionRun.data.quality_approved_at || !String(productionRun.data.quality_approved_by ?? '').trim()) {
      throw new Error('Quality approval is required before Production output can transfer to Finished Goods Store.')
    }
    const { data: existingEvents, error: eventError } = await db().from('production_custody_events')
      .select('base_quantity').eq('production_run_id', productionRun.data.id)
      .eq('direction', 'out').eq('event_kind', 'gtn_transfer')
    if (eventError) throw new Error(eventError.message)
    const alreadyTransferred = ((existingEvents as Array<{ base_quantity: number }> | null) ?? [])
      .reduce((sum, event) => sum + Number(event.base_quantity ?? 0), 0)
    const postingNow = items.reduce((sum, line) => {
      const item = line.inventory_item_id ? stockById.get(line.inventory_item_id) : null
      return sum + toInventoryBaseQuantity(Number(line.quantity_issued ?? 0), line.unit || '', item?.base_unit || item?.unit || '')
    }, 0)
    if (alreadyTransferred + postingNow > Number(productionRun.data.accepted_quantity ?? 0) + 0.0001) {
      throw new Error(`This GTN would transfer ${alreadyTransferred + postingNow}, above the run's accepted output of ${Number(productionRun.data.accepted_quantity ?? 0)}.`)
    }
  }

  const prefix = issue.kind === 'transfer' ? 'GTN-' : 'GIN-'
  const seq = issue.kind === 'transfer' ? 'goods_transfer' : 'goods_issue'
  const reference = issue.reference ?? (await mintReference(seq, prefix))
  const documentReference = issue.document_number || reference
  let movementsCreated = 0

  for (const line of items) {
    const quantity = Number(line.quantity_issued)
    if (quantity <= 0 || !line.inventory_item_id) continue
    const stock = stockById.get(line.inventory_item_id)
    if (!stock) throw new Error(`${line.description}: Inventory item not found.`)
    if (isProductionBoundary) {
      const storeId = sourceIsProduction ? issue.destination_store_id : issue.source_store_id
      if (!storeId) throw new Error('The store side of this Production transfer is required.')
      const inboundToProduction = !sourceIsProduction
      await postStoreProductionTransfer({
        item: stock,
        store_id: storeId,
        store_direction: inboundToProduction ? 'out' : 'in',
        quantity,
        movement_unit: line.unit,
        reason: `${inboundToProduction ? 'Issued to' : 'Received from'} Production on ${documentReference}`,
        reference: documentReference,
        source: issue.kind === 'issue' ? 'goods_issue' : 'goods_transfer',
        goods_issue_id: issue.id,
        issue_item_id: line.id,
        production_run_id: issue.production_run_id,
        batch_number: line.batch_number,
        production_store_id: sourceIsProduction ? issue.source_store_id : destinationIsProduction ? issue.destination_store_id : null,
        production_state: isProductionGin
          ? productionStateForItem(stock)
          : destinationIsProduction
            ? 'rework'
            : isProductionMaterialReturn
              ? productionStateForItem(stock)
              : ((productionRun.data as ProductionRunRow | null)?.output_state || 'packaged_output'),
        production_event_kind: isProductionGin ? 'gin_receipt' : destinationIsProduction ? 'gtn_receipt' : isProductionMaterialReturn ? 'return_to_store' : 'gtn_transfer',
        source_custody: inboundToProduction ? (sourceStore?.store_type || 'store') : 'production',
        destination_custody: inboundToProduction ? 'production' : (destinationStore?.store_type || 'store'),
        quality_incident_id: (productionRun.data as ProductionRunRow | null)?.quality_incident_id ?? null,
        recorded_by: actor.email,
        recorded_by_id: actor.teamMemberId ?? null,
        idempotency_key: `${issue.kind}:${line.id}`,
      })
      movementsCreated += 2
    } else {
      await recordStockMovement({
        item_id: line.inventory_item_id,
        direction: 'out',
        quantity,
        movement_unit: line.unit,
        reason: `${issue.kind === 'transfer' ? 'Transferred' : 'Issued'} on ${documentReference}`,
        reference: documentReference,
        source: issue.kind === 'transfer' ? 'goods_transfer' : 'goods_issue',
        goods_issue_id: issue.id,
        issue_item_id: line.id,
        production_run_id: issue.production_run_id,
        idempotency_key: `goods-issue-source:${line.id}`,
        store_id: issue.source_store_id,
        recorded_by: actor.email,
      })
      movementsCreated += 1
      if (issue.kind === 'transfer') {
        await recordStockMovement({
          item_id: line.inventory_item_id,
          direction: 'in',
          quantity,
          movement_unit: line.unit,
          reason: `Received from transfer ${documentReference}`,
          reference: documentReference,
          source: 'goods_transfer',
          goods_issue_id: issue.id,
          production_run_id: issue.production_run_id,
          store_id: issue.destination_store_id,
          source_table: 'procurement_goods_issue_items',
          source_record_id: line.id,
          idempotency_key: `goods-transfer-destination:${line.id}`,
          recorded_by: actor.email,
        })
        movementsCreated += 1
      }
    }

  }

  const now = nowIso()
  const { data, error } = await db()
    .from('procurement_goods_issues')
    .update({ status: 'posted', reference, posted_at: now, posted_by: actor.email, updated_at: now })
    .eq('id', issue.id)
    .select('*')
    .single()
  if (error) throw new Error(error.message)

  if (issue.requisition_id) await refreshRequisitionIssueStatus(issue.requisition_id)
  if (issue.production_run_id) {
    if (issue.kind === 'issue') {
      await db().from('production_runs').update({
        status: 'materials_issued', started_at: productionRun.data?.started_at ?? now, updated_at: now,
      }).eq('id', issue.production_run_id)
    } else if (isProductionOutputGtn) {
      const { data: postedEvents } = await db().from('production_custody_events').select('base_quantity')
        .eq('production_run_id', issue.production_run_id).eq('event_kind', 'gtn_transfer').eq('direction', 'out')
      const transferred = ((postedEvents as Array<{ base_quantity: number }> | null) ?? [])
        .reduce((sum, event) => sum + Number(event.base_quantity ?? 0), 0)
      const accepted = Number(productionRun.data?.accepted_quantity ?? 0)
      await db().from('production_runs').update({
        status: accepted > 0 && transferred >= accepted ? 'completed' : 'partially_completed',
        completed_at: accepted > 0 && transferred >= accepted ? now : null,
        updated_at: now,
      }).eq('id', issue.production_run_id)
    }
  }

  await auditEvent({
    actor: auditActor(actor),
    action: 'status',
    entity_table: 'procurement_goods_issues',
    entity_id: issue.id,
    entity_label: reference,
    before_data: { status: issue.status },
    after_data: { status: 'posted', stock_movements: movementsCreated },
  })

  return { issue: data as ProcurementGoodsIssueRow, movementsCreated }
}

async function refreshRequisitionIssueStatus(requisitionId: string): Promise<void> {
  await syncRequisitionIssuedQuantities(requisitionId)
  const items = await getRequisitionItems(requisitionId)
  const status = deriveRequisitionStatus(
    items.map((i) => ({
      requested: Number(i.quantity_requested),
      approved: Number(i.quantity_approved),
      issued: Number(i.quantity_issued),
    })),
    'issue',
  )
  await db()
    .from('procurement_requisitions')
    .update({ status, updated_at: nowIso() })
    .eq('id', requisitionId)
}

async function syncRequisitionIssuedQuantities(requisitionId: string): Promise<void> {
  const items = await getRequisitionItems(requisitionId)
  const issued = await issuedToDateForRequisition(requisitionId)
  await Promise.all(items.map((item) => db()
    .from('procurement_requisition_items')
    .update({ quantity_issued: issued.get(item.id) ?? 0 })
    .eq('id', item.id)))
}

async function remainingByRequisitionLine(requisitionId: string): Promise<Map<string, number>> {
  const detail = await getRequisitionIssueDetail(requisitionId)
  if (!detail) return new Map()
  return new Map(detail.items.map((item) => [item.id, item.remaining_to_issue]))
}

async function issuedToDateForRequisition(requisitionId: string): Promise<Map<string, number>> {
  const issues = await listGoodsIssues({ requisitionId, limit: 500 })
  const issueItems = issues.length > 0 ? await getGoodsIssueItemsForIssues(issues.map((issue) => issue.id)) : []
  const requisitionItems = await getRequisitionItems(requisitionId)
  return issuedToDateByRequisitionLine(requisitionItems, issues, issueItems)
}

function issuedToDateByRequisitionLine(
  requisitionItems: ProcurementRequisitionItemRow[],
  issues: ProcurementGoodsIssueRow[],
  issueItems: ProcurementGoodsIssueItemRow[],
): Map<string, number> {
  const posted = new Set(issues.filter((issue) => issue.status === 'posted').map((issue) => issue.id))
  const ids = new Set(requisitionItems.map((item) => item.id))
  const out = new Map<string, number>()
  for (const line of issueItems) {
    if (!line.requisition_item_id || !ids.has(line.requisition_item_id) || !posted.has(line.issue_id)) continue
    out.set(line.requisition_item_id, Number(((out.get(line.requisition_item_id) ?? 0) + Number(line.quantity_issued ?? 0)).toFixed(2)))
  }
  return out
}

async function getStore(id: string): Promise<InventoryStoreRow | null> {
  const { data } = await db().from('inventory_stores').select('*').eq('id', id).maybeSingle()
  return (data as InventoryStoreRow | null) ?? null
}

function commonStoreId(items: Array<InventoryItemRow | null>): string | null {
  const ids = [...new Set(items.map((item) => item?.store_id).filter(Boolean) as string[])]
  return ids.length === 1 ? ids[0]! : null
}
