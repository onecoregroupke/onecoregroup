import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  canTransitionRepair,
  instrumentLabel,
  isInWorkshop,
  isTerminalRepairStatus,
  nextRepairStatuses,
  repairStatusLabel,
  validateRepairTransition,
} from './nptRepairModel'

test('a received instrument is not yet a confirmed repair job', () => {
  // It may only be assessed next — never scheduled or repaired straight away.
  assert.deepEqual(nextRepairStatuses('received').sort(), ['assessed', 'awaiting_assessment', 'cancelled'].sort())
  assert.equal(canTransitionRepair('received', 'in_repair'), false)
  assert.equal(canTransitionRepair('received', 'work_scheduled'), false)
})

test('work cannot start before customer approval when a quote is required', () => {
  assert.equal(canTransitionRepair('quotation_required', 'in_repair'), false)
  assert.equal(canTransitionRepair('quotation_required', 'awaiting_customer_approval'), true)
  assert.equal(canTransitionRepair('awaiting_customer_approval', 'approved'), true)
  assert.equal(canTransitionRepair('approved', 'in_repair'), true)
})

test('a repair can bounce between in_repair and awaiting_parts', () => {
  assert.equal(canTransitionRepair('in_repair', 'awaiting_parts'), true)
  assert.equal(canTransitionRepair('awaiting_parts', 'in_repair'), true)
})

test('failed quality inspection sends the case back to the bench', () => {
  assert.equal(canTransitionRepair('quality_inspection', 'in_repair'), true)
  assert.equal(canTransitionRepair('quality_inspection', 'ready_for_collection'), true)
})

test('handover routes to either collection or delivery, then closes', () => {
  assert.equal(canTransitionRepair('ready_for_collection', 'collected'), true)
  assert.equal(canTransitionRepair('ready_for_collection', 'delivered'), true)
  assert.equal(canTransitionRepair('collected', 'closed'), true)
  assert.equal(canTransitionRepair('delivered', 'closed'), true)
})

test('terminal cases cannot be moved again', () => {
  assert.equal(isTerminalRepairStatus('closed'), true)
  assert.equal(isTerminalRepairStatus('cancelled'), true)
  assert.deepEqual(nextRepairStatuses('closed'), [])
  assert.deepEqual(nextRepairStatuses('cancelled'), [])
  assert.match(validateRepairTransition('closed', 'in_repair').reason ?? '', /cannot be moved again/)
})

test('cancellation is available from any live status but never from a terminal one', () => {
  for (const s of ['received', 'assessed', 'in_repair', 'awaiting_parts', 'ready_for_collection']) {
    assert.ok(nextRepairStatuses(s).includes('cancelled'), `${s} should be cancellable`)
  }
  assert.equal(nextRepairStatuses('closed').includes('cancelled'), false)
})

test('validateRepairTransition rejects unknown statuses and no-ops', () => {
  assert.equal(validateRepairTransition('received', 'teleported').ok, false)
  assert.match(validateRepairTransition('in_repair', 'in_repair').reason ?? '', /already at that status/)
})

test('validateRepairTransition explains an illegal jump in plain language', () => {
  const result = validateRepairTransition('received', 'delivered')
  assert.equal(result.ok, false)
  assert.match(result.reason ?? '', /cannot move straight to/)
})

test('isInWorkshop covers everything before handover', () => {
  assert.equal(isInWorkshop('received'), true)
  assert.equal(isInWorkshop('in_repair'), true)
  assert.equal(isInWorkshop('awaiting_customer_approval'), true)
  assert.equal(isInWorkshop('ready_for_collection'), false)
  assert.equal(isInWorkshop('closed'), false)
})

test('status labels are human readable', () => {
  assert.equal(repairStatusLabel('awaiting_customer_approval'), 'Awaiting customer approval')
  assert.equal(repairStatusLabel('mystery'), 'mystery')
})

test('instrument label falls back to the typed name for "other"', () => {
  assert.equal(instrumentLabel('piano'), 'Piano')
  assert.equal(instrumentLabel('other', 'Accordion'), 'Accordion')
  assert.equal(instrumentLabel('other', '   '), 'Other instrument')
})
