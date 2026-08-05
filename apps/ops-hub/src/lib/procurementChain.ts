import { db, mintReference, nowIso } from './serverClient'
import { auditEvent } from './audit'
import { recordStockMovement } from './inventory'
import {
  canApproveRequisition,
  canPostToStock,
  deriveRequisitionStatus,
  isRequisitionEditable,
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

export type ChainActor = { userId?: string; email: string; name: string }

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
  opts: { brandIds?: string[] | null; kind?: string; status?: string; limit?: number } = {},
): Promise<ProcurementGoodsIssueRow[]> {
  let q = db()
    .from('procurement_goods_issues')
    .select('*')
    .order('issue_date', { ascending: false })
    .limit(opts.limit ?? 200)
  if (opts.kind) q = q.eq('kind', opts.kind)
  if (opts.status) q = q.eq('status', opts.status)
  if (opts.brandIds && opts.brandIds.length > 0) q = q.in('brand_id', opts.brandIds)
  const { data } = await q
  return (data as ProcurementGoodsIssueRow[] | null) ?? []
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
  const { data, error } = await db()
    .from('procurement_goods_issues')
    .insert({
      ...header,
      kind: header.kind === 'transfer' ? 'transfer' : 'issue',
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
      quantity_approved: Number(i.quantity_approved ?? 0),
      quantity_issued: Number(i.quantity_issued ?? 0),
      batch_number: i.batch_number ?? '',
      store_location: i.store_location ?? '',
      remarks: i.remarks ?? '',
      sort_order: index,
    })),
  )
  if (error) throw new Error(error.message)
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

  // Validate everything BEFORE moving any stock — a bad line must not leave a
  // half-posted note behind.
  const itemIds = items.map((i) => i.inventory_item_id).filter(Boolean) as string[]
  const stockById = new Map<string, InventoryItemRow>()
  if (itemIds.length > 0) {
    const { data } = await db().from('inventory_items').select('*').in('id', itemIds)
    for (const row of (data as InventoryItemRow[] | null) ?? []) stockById.set(row.id, row)
  }
  for (const line of items) {
    if (Number(line.quantity_issued) <= 0) continue
    if (!line.inventory_item_id) {
      throw new Error(`"${line.description}" is not linked to an inventory item, so it cannot be issued.`)
    }
    const check = validateIssueLine({
      quantity_approved: Number(line.quantity_approved),
      quantity_issued: Number(line.quantity_issued),
      available: Number(stockById.get(line.inventory_item_id)?.quantity ?? 0),
    })
    if (!check.ok) throw new Error(`${line.description}: ${check.reason}`)
  }

  const prefix = issue.kind === 'transfer' ? 'GTN-' : 'GIN-'
  const seq = issue.kind === 'transfer' ? 'goods_transfer' : 'goods_issue'
  const reference = issue.reference ?? (await mintReference(seq, prefix))
  let movementsCreated = 0

  for (const line of items) {
    const quantity = Number(line.quantity_issued)
    if (quantity <= 0 || !line.inventory_item_id) continue
    await recordStockMovement({
      item_id: line.inventory_item_id,
      direction: 'out',
      quantity,
      reason: `${issue.kind === 'transfer' ? 'Transferred' : 'Issued'} on ${reference}`,
      reference,
      source: 'manual',
      goods_issue_id: issue.id,
      issue_item_id: line.id,
      recorded_by: actor.email,
    })
    movementsCreated += 1

    if (line.requisition_item_id) {
      const { data: reqItem } = await db()
        .from('procurement_requisition_items')
        .select('*')
        .eq('id', line.requisition_item_id)
        .maybeSingle()
      const current = Number((reqItem as ProcurementRequisitionItemRow | null)?.quantity_issued ?? 0)
      await db()
        .from('procurement_requisition_items')
        .update({ quantity_issued: current + quantity })
        .eq('id', line.requisition_item_id)
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
