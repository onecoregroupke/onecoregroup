import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { FieldSalesAccessContext } from './fieldSalesAccess'
import { canAccessSalesperson, canManageFieldSales, fieldSalesAllowedBrands } from './fieldSalesAccess'

function actor(over: Partial<FieldSalesAccessContext> = {}): FieldSalesAccessContext {
  const permissions = { field_sales: 'edit' as const }
  return {
    permissions,
    brandAccess: {},
    teamMemberId: 'salesperson-a',
    can: (section, level = 'view') => section === 'field_sales' && (level === 'view' || permissions.field_sales === 'edit'),
    recordScope: () => 'own',
    allowedBrandIds: () => null,
    ...over,
  }
}

test('I: a salesperson can access their own allocation and activity', () => {
  assert.equal(canAccessSalesperson(actor(), 'salesperson-a'), true)
})

test('I: a salesperson cannot submit or reconcile another salesperson record', () => {
  assert.equal(canAccessSalesperson(actor(), 'salesperson-b'), false)
  assert.equal(canManageFieldSales(actor()), false)
})

test('a management-scope field-sales editor can receive returns for the team', () => {
  const manager = actor({ recordScope: () => 'management' })
  assert.equal(canAccessSalesperson(manager, 'salesperson-b'), true)
  assert.equal(canManageFieldSales(manager), true)
})

test('explicit field-sales brand scope takes precedence over inherited inventory scope', () => {
  const scoped = actor({
    brandAccess: { field_sales: ['brand-a'], inventory: ['brand-b'] },
    can: (section) => section === 'field_sales' || section === 'inventory',
    allowedBrandIds: (section) => section === 'inventory' ? ['brand-b'] : ['brand-a'],
  })
  assert.deepEqual(fieldSalesAllowedBrands(scoped), ['brand-a'])
})
