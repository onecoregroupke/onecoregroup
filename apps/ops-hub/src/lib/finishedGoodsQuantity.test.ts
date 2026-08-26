import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  finishedGoodsQuantity,
  formatPackageConfiguration,
  packSizeFromConfiguration,
} from './finishedGoodsQuantity'

test('finished goods expose canonical pieces and derived cartons', () => {
  const value = finishedGoodsQuantity(67, 12)
  assert.deepEqual(
    { cartons: value.cartons, loose: value.loosePieces, total: value.totalLabel, carton: value.cartonLabel },
    { cartons: 5, loose: 7, total: '67 pieces total', carton: '5 cartons + 7 pieces' },
  )
})

test('exact cartons omit a misleading zero loose-piece suffix', () => {
  assert.equal(finishedGoodsQuantity(60, 12).cartonLabel, '5 cartons')
})

test('a balance smaller than a carton is clearly loose stock', () => {
  assert.equal(finishedGoodsQuantity(7, 12).cartonLabel, '7 loose pieces')
})

test('six- and forty-eight-unit packs decompose correctly', () => {
  assert.equal(finishedGoodsQuantity(38, 6).cartonLabel, '6 cartons + 2 pieces')
  assert.equal(finishedGoodsQuantity(107, 48).cartonLabel, '2 cartons + 11 pieces')
})

test('pack size one never creates a carton interpretation', () => {
  const value = finishedGoodsQuantity(4, 1)
  assert.equal(value.hasCartonView, false)
  assert.equal(value.totalLabel, '4 pieces total')
  assert.equal(value.cartonLabel, null)
})

test('zero and decimal quantities have sensible defensive presentation', () => {
  assert.equal(finishedGoodsQuantity(0, 12).cartonLabel, '0 loose pieces')
  assert.equal(finishedGoodsQuantity(12.5, 12).cartonLabel, '1 carton + 0.5 pieces')
})

test('pack metadata derives only from a valid leading pack count', () => {
  assert.equal(packSizeFromConfiguration('12x1ltr'), 12)
  assert.equal(packSizeFromConfiguration('12x500ml'), 12)
  assert.equal(packSizeFromConfiguration('6x2ltrs'), 6)
  assert.equal(packSizeFromConfiguration('48x70ml'), 48)
  assert.equal(packSizeFromConfiguration('1x5ltrs'), 1)
  assert.equal(packSizeFromConfiguration('1x20ltrs'), 1)
  assert.equal(packSizeFromConfiguration(''), null)
  assert.equal(packSizeFromConfiguration('5 litres'), null)
})

test('package configuration has a compact warehouse label', () => {
  assert.equal(formatPackageConfiguration('12x1ltr'), '12 × 1L')
  assert.equal(formatPackageConfiguration('6x2ltrs'), '6 × 2L')
  assert.equal(formatPackageConfiguration('1x20lrs'), '1 × 20L')
})
