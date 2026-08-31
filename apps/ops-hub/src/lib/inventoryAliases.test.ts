import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveInventoryAlias } from './inventoryAliases'

const items = [
  { id: 'caustic', name: 'CAUSTIC SODA (NaOH)', canonical_name: 'CAUSTIC SODA (NaOH)', is_active: true },
  { id: 'labsa', name: 'SULPHONIC ACID LABSA', canonical_name: 'SULPHONIC ACID LABSA', is_active: true },
  { id: 'sles', name: 'SLES', canonical_name: 'SLES', is_active: true },
  { id: 'apple-green', name: 'APPLE GREEN', canonical_name: 'APPLE GREEN', is_active: true },
  { id: 'fine-salt', name: 'FINE SALT', canonical_name: 'FINE SALT', is_active: true },
  { id: 'rough-salt', name: 'ROUGH SALT', canonical_name: 'ROUGH SALT', is_active: true },
]

const aliases = [
  { item_id: 'caustic', alias: 'NAOH', active: true },
  { item_id: 'caustic', alias: 'Caustic', active: true },
  { item_id: 'labsa', alias: 'Ufacid', active: true },
  { item_id: 'sles', alias: 'Ungerol', active: true },
  { item_id: 'apple-green', alias: 'APPLE GREEN h/w', active: true },
]

test('confirmed historical names resolve to their canonical inventory identities', () => {
  assert.equal(resolveInventoryAlias('NAOH', items, aliases), 'caustic')
  assert.equal(resolveInventoryAlias('Caustic', items, aliases), 'caustic')
  assert.equal(resolveInventoryAlias('Ufacid', items, aliases), 'labsa')
  assert.equal(resolveInventoryAlias('Ungerol', items, aliases), 'sles')
  assert.equal(resolveInventoryAlias('APPLE GREEN h/w', items, aliases), 'apple-green')
})

test('generic Salt remains unresolved instead of guessing Fine or Rough Salt', () => {
  assert.equal(resolveInventoryAlias('Salt', items, aliases), null)
})

test('conflicting aliases fail closed as ambiguous', () => {
  assert.equal(resolveInventoryAlias('Shared name', items, [
    { item_id: 'fine-salt', alias: 'Shared name' },
    { item_id: 'rough-salt', alias: 'Shared name' },
  ]), null)
})
