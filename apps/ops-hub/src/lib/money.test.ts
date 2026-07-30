import test from 'node:test'
import assert from 'node:assert/strict'
import { toCents, fromCents, sumMoney, addMoney, subMoney, parseMoney, moneyEquals } from './money'

test('money: decimal-safe addition avoids float drift', () => {
  // 0.1 + 0.2 === 0.30000000000000004 in float; must be 0.30 here.
  assert.equal(addMoney(0.1, 0.2), 0.3)
  assert.equal(sumMoney([0.1, 0.2, 0.3]), 0.6)
  assert.equal(subMoney(4890, 34), 4856)
})

test('money: cents round-trip half-up', () => {
  assert.equal(toCents('1,234.56'), 123456)
  assert.equal(fromCents(123456), 1234.56)
  assert.equal(toCents(461.5), 46150)
})

test('money: sums a long ledger without drift', () => {
  const amounts = Array.from({ length: 1000 }, () => 0.01)
  assert.equal(sumMoney(amounts), 10) // 1000 × 0.01 exactly
})

test('parseMoney: strips commas, currency, /=, handles parentheses as negative', () => {
  assert.equal(parseMoney('KSh 6,078'), 6078)
  assert.equal(parseMoney('300/='), 300)
  assert.equal(parseMoney('(1,000)'), -1000)
  assert.equal(parseMoney(''), 0)
  assert.equal(parseMoney('NO RCT'), 0)
  assert.equal(parseMoney(4.5), 4.5)
})

test('petty cash: ZIIDI total is exact', () => {
  // expense 450 + charge 7 + ziidi 4.5 = 461.5
  assert.ok(moneyEquals(sumMoney([450, 7, 4.5]), 461.5))
})
