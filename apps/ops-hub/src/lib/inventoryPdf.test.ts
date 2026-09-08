import assert from 'node:assert/strict'
import test from 'node:test'
import { PDFParse } from 'pdf-parse'
import type { InventoryItemRow } from '@ocg/db'
import { createInventoryPdf } from './inventoryPdf'
import { filterInventoryByTaxonomy } from './inventoryTaxonomy'

function item(id: string, name: string, category: string): InventoryItemRow {
  return {
    id,
    name,
    display_name: name,
    canonical_name: name,
    sku: id.toUpperCase(),
    category,
    item_type: category === 'Perfumes' ? 'perfume' : category === 'Colours' ? 'colour' : 'raw_material',
    product_family: '',
    size_label: '',
    packaging_role: '',
    packaging_component: '',
    package_config: '',
    pack_size: 1,
    unit: 'kg',
    base_unit: 'kg',
    quantity: 2,
    unit_value_ksh: 500,
  } as InventoryItemRow
}

test('inventory PDF contains exactly the Perfumes + Colours current view', async () => {
  const all = [
    item('perfume', 'Apple Perfume', 'Perfumes'),
    item('colour', 'Blue Colour', 'Colours'),
    item('chemical', 'LABSA Raw Chemical', 'Raw Materials'),
  ]
  const selected = filterInventoryByTaxonomy(all, { categories: ['perfumes', 'colours'] })
  const pdf = await createInventoryPdf({
    company: 'One Core Group',
    brand: "Glitz N' Glim",
    items: selected,
    classifications: ['perfumes', 'colours'],
    family: '',
    generatedBy: 'Acceptance Test',
    generatedAt: new Date('2026-09-02T07:00:00Z'),
  })
  assert.equal(pdf.subarray(0, 5).toString('latin1'), '%PDF-')
  const parser = new PDFParse({ data: pdf })
  const parsed = await parser.getText()
  await parser.destroy()
  assert.match(parsed.text, /Apple Perfume/)
  assert.match(parsed.text, /Blue Colour/)
  assert.doesNotMatch(parsed.text, /LABSA Raw Chemical/)
  assert.match(parsed.text, /Classifications: perfumes, colours/)
})
