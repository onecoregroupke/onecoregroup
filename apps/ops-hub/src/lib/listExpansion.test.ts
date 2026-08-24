import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  needsExpansion, needsSearch, matchesQuery, visibleItems, expansionLabel,
  INITIAL_VISIBLE, SEARCH_THRESHOLD,
} from './listExpansion'

const items = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ name: `Item ${i + 1}`, sku: `SKU-${i + 1}` }))

// ─── When an expansion control exists (§46) ─────────────────────────────────

test('12 or fewer items need no expansion action', () => {
  assert.equal(needsExpansion(0), false)
  assert.equal(needsExpansion(1), false)
  assert.equal(needsExpansion(12), false)
  assert.equal(expansionLabel(12, false), null)
})

test('more than 12 items produce an expansion action', () => {
  assert.equal(needsExpansion(13), true)
  assert.equal(needsExpansion(72), true)
})

test('the collapsed control names the real total, not a "+N more" dead end', () => {
  assert.equal(expansionLabel(72, false), 'Show all 72 items')
})

test('the expanded control offers the way back', () => {
  assert.equal(expansionLabel(72, true), 'Show fewer')
})

// ─── Expand / collapse ──────────────────────────────────────────────────────

test('collapsed shows the first 12', () => {
  const shown = visibleItems(items(72), { expanded: false })
  assert.equal(shown.length, INITIAL_VISIBLE)
  assert.equal(shown[0]!.name, 'Item 1')
  assert.equal(shown[11]!.name, 'Item 12')
})

test('expanded shows every item in the same panel', () => {
  assert.equal(visibleItems(items(72), { expanded: true }).length, 72)
})

test('collapsing again returns to the first 12', () => {
  const all = items(72)
  assert.equal(visibleItems(all, { expanded: true }).length, 72)
  assert.equal(visibleItems(all, { expanded: false }).length, 12)
})

test('a short list is unaffected by the expanded flag', () => {
  assert.equal(visibleItems(items(5), { expanded: false }).length, 5)
  assert.equal(visibleItems(items(5), { expanded: true }).length, 5)
})

// ─── Search (§29) ───────────────────────────────────────────────────────────

test('a search box appears only for a substantial list', () => {
  assert.equal(needsSearch(12), false)
  assert.equal(needsSearch(SEARCH_THRESHOLD), false)
  assert.equal(needsSearch(SEARCH_THRESHOLD + 1), true)
  assert.equal(needsSearch(72), true)
})

test('search matches on item name, case-insensitively', () => {
  assert.equal(matchesQuery({ name: 'Vanilla Essence', sku: 'RM-014' }, 'vanilla'), true)
  assert.equal(matchesQuery({ name: 'Vanilla Essence', sku: 'RM-014' }, 'VANILLA'), true)
  assert.equal(matchesQuery({ name: 'Vanilla Essence', sku: 'RM-014' }, 'sugar'), false)
})

test('search matches on SKU', () => {
  assert.equal(matchesQuery({ name: 'Vanilla Essence', sku: 'RM-014' }, 'rm-014'), true)
  assert.equal(matchesQuery({ name: 'Vanilla Essence', sku: 'RM-014' }, 'RM-0'), true)
})

test('an empty query matches everything', () => {
  assert.equal(matchesQuery({ name: 'Anything', sku: '' }, ''), true)
  assert.equal(matchesQuery({ name: 'Anything', sku: '' }, '   '), true)
})

test('search reaches past the first 12 even while collapsed', () => {
  // The whole point: item 60 is invisible until you search for it.
  const shown = visibleItems(items(72), { expanded: false, query: 'Item 60' })
  assert.equal(shown.length, 1)
  assert.equal(shown[0]!.name, 'Item 60')
})

test('search narrows an expanded list too', () => {
  const shown = visibleItems(items(72), { expanded: true, query: 'Item 7' })
  // Item 7, 70..72 — every match, not just the first page.
  assert.deepEqual(shown.map((i) => i.name), ['Item 7', 'Item 70', 'Item 71', 'Item 72'])
})

test('a search matching nothing yields an empty list rather than the first 12', () => {
  assert.equal(visibleItems(items(72), { expanded: false, query: 'zzz' }).length, 0)
})

// ─── Stock figures are untouched ────────────────────────────────────────────

test('expansion never reorders or alters the items it shows', () => {
  const all = items(20)
  const shown = visibleItems(all, { expanded: true })
  assert.deepEqual(shown, all)
})
