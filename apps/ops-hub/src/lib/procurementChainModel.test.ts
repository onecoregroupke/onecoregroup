import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  canApproveRequisition,
  canPostToStock,
  deriveRequisitionStatus,
  isRequisitionEditable,
  receiptLineVariance,
  stockableReceiptQuantity,
  validateIssueLine,
  validateReceiptLine,
} from './procurementChainModel'

// ─── Self-approval ──────────────────────────────────────────────────────────

test('a requester cannot approve their own requisition', () => {
  const result = canApproveRequisition({
    requestedByEmail: 'shamim@onecoregroup.co.ke',
    approverEmail: 'Shamim@OneCoreGroup.co.ke', // case must not defeat the check
    status: 'submitted',
  })
  assert.equal(result.ok, false)
  assert.match(result.reason ?? '', /cannot approve your own/)
})

test('someone else may approve it', () => {
  assert.equal(
    canApproveRequisition({
      requestedByEmail: 'shamim@onecoregroup.co.ke',
      approverEmail: 'manager@onecoregroup.co.ke',
      status: 'submitted',
    }).ok,
    true,
  )
})

test('self-approval requires an explicit policy grant, never a default', () => {
  assert.equal(
    canApproveRequisition({
      requestedByEmail: 'a@x.com',
      approverEmail: 'a@x.com',
      status: 'submitted',
      allowSelfApproval: true,
    }).ok,
    true,
  )
})

test('only submitted or under-review requisitions can be approved', () => {
  for (const status of ['draft', 'approved', 'fully_issued', 'cancelled']) {
    assert.equal(
      canApproveRequisition({ requestedByEmail: 'a@x.com', approverEmail: 'b@x.com', status }).ok,
      false,
      `${status} should not be approvable`,
    )
  }
})

test('only a draft requisition is editable', () => {
  assert.equal(isRequisitionEditable('draft'), true)
  assert.equal(isRequisitionEditable('submitted'), false)
  assert.equal(isRequisitionEditable('approved'), false)
})

// ─── Approval does not move stock; status derivation ────────────────────────

test('full approval yields approved; partial yields partially_approved', () => {
  assert.equal(
    deriveRequisitionStatus([{ requested: 10, approved: 10, issued: 0 }], 'approval'),
    'approved',
  )
  assert.equal(
    deriveRequisitionStatus([{ requested: 10, approved: 4, issued: 0 }], 'approval'),
    'partially_approved',
  )
  assert.equal(
    deriveRequisitionStatus([{ requested: 10, approved: 0, issued: 0 }], 'approval'),
    'rejected',
  )
})

test('an approved-but-unissued requisition is ready_for_issue, not issued', () => {
  // This is the guarantee that approval alone never reduces inventory.
  assert.equal(
    deriveRequisitionStatus([{ requested: 10, approved: 10, issued: 0 }], 'issue'),
    'ready_for_issue',
  )
})

test('issuing part then all moves through partially_issued to fully_issued', () => {
  assert.equal(
    deriveRequisitionStatus([{ requested: 10, approved: 10, issued: 6 }], 'issue'),
    'partially_issued',
  )
  assert.equal(
    deriveRequisitionStatus([{ requested: 10, approved: 10, issued: 10 }], 'issue'),
    'fully_issued',
  )
})

// ─── Receipt quantities ─────────────────────────────────────────────────────

test('delivered must equal accepted plus rejected', () => {
  assert.equal(
    validateReceiptLine({ quantity_delivered: 100, quantity_accepted: 90, quantity_rejected: 10 }).ok,
    true,
  )
  const bad = validateReceiptLine({ quantity_delivered: 100, quantity_accepted: 90, quantity_rejected: 5 })
  assert.equal(bad.ok, false)
  assert.match(bad.reason ?? '', /must equal delivered/)
})

test('negative quantities are refused', () => {
  assert.equal(
    validateReceiptLine({ quantity_delivered: -1, quantity_accepted: 0, quantity_rejected: 0 }).ok,
    false,
  )
})

test('only accepted quantity is stockable — rejected goods never reach inventory', () => {
  const line = {
    quantity_ordered: 100,
    quantity_delivered: 100,
    quantity_accepted: 90,
    quantity_rejected: 10,
    disposition: 'stock',
  }
  assert.equal(stockableReceiptQuantity(line), 90)
})

test('an immediately-consumed line stocks nothing even when accepted', () => {
  assert.equal(
    stockableReceiptQuantity({
      quantity_delivered: 50,
      quantity_accepted: 50,
      quantity_rejected: 0,
      disposition: 'consume',
    }),
    0,
  )
})

test('partial delivery is a variance, not an error', () => {
  const line = { quantity_ordered: 100, quantity_delivered: 60, quantity_accepted: 60, quantity_rejected: 0 }
  assert.equal(validateReceiptLine(line).ok, true)
  assert.equal(receiptLineVariance(line), -40)
})

test('over-delivery is allowed and surfaced as a positive variance', () => {
  const line = { quantity_ordered: 100, quantity_delivered: 120, quantity_accepted: 120, quantity_rejected: 0 }
  assert.equal(validateReceiptLine(line).ok, true)
  assert.equal(receiptLineVariance(line), 20)
})

// ─── Issue quantities ───────────────────────────────────────────────────────

test('cannot issue more than was approved', () => {
  const result = validateIssueLine({ quantity_approved: 10, quantity_issued: 12 })
  assert.equal(result.ok, false)
  assert.match(result.reason ?? '', /only 10 was approved/)
})

test('cannot issue more than is physically in stock', () => {
  const result = validateIssueLine({ quantity_approved: 10, quantity_issued: 8, available: 5 })
  assert.equal(result.ok, false)
  assert.match(result.reason ?? '', /only 5 in stock/)
})

test('issuing exactly what was approved and available is fine', () => {
  assert.equal(validateIssueLine({ quantity_approved: 10, quantity_issued: 10, available: 10 }).ok, true)
})

// ─── Once-only posting ──────────────────────────────────────────────────────

test('a draft document may post to stock once', () => {
  assert.equal(canPostToStock({ status: 'draft', posted_at: null }).ok, true)
})

test('a posted document cannot post again — resubmission cannot double stock', () => {
  const byStatus = canPostToStock({ status: 'posted', posted_at: null })
  assert.equal(byStatus.ok, false)
  assert.match(byStatus.reason ?? '', /already been posted/)

  // Belt and braces: a stale status with a posting timestamp is also refused.
  assert.equal(canPostToStock({ status: 'draft', posted_at: '2026-08-05T09:00:00Z' }).ok, false)
})

test('a cancelled document cannot post to stock', () => {
  assert.equal(canPostToStock({ status: 'cancelled', posted_at: null }).ok, false)
})
