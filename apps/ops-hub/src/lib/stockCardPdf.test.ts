import assert from 'node:assert/strict'
import test from 'node:test'
import { PDFParse } from 'pdf-parse'
import type { PeriodBalance, StockCardRow } from './stockCards'
import { createStockCardPdf } from './stockCardPdf'

const balance: PeriodBalance = {
  id: 'soap', name: 'Liquid Soap 500ml', item_id: 'soap', item_name: 'Liquid Soap 500ml',
  sku: 'FG-SOAP-500', unit: 'pcs', item_type: 'finished_good', brand_id: 'brand', store_id: 'store',
  canonical_name: 'Liquid Soap 500ml', category: 'Finished Goods', product_family: 'Liquid Soap',
  size_label: '500ml', package_config: '12 x 500ml', pack_size: 12, base_unit: 'pcs', packaging_role: '',
  opening: 120, quantity_in: 24, quantity_out: 12, closing: 132, current: 132, drift: 0,
  movements: 2, last_movement: '2026-09-02', unit_value_ksh: 80, value_ksh: 10560,
}

const ledger = [{
  movement_id: 'move-1', item_id: 'soap', item_name: 'Liquid Soap 500ml', sku: 'FG-SOAP-500', unit: 'pcs',
  item_type: 'finished_good', brand_id: 'brand', store_id: 'store', batch_number: 'B-001', movement_date: '2026-09-02',
  created_at: '2026-09-02T08:00:00Z', direction: 'out', quantity_in: 0, quantity_out: 12,
  recorded_balance: 132, running_balance: 132, reason: 'Issued', reference: 'GTN-100', source: 'transfer',
  source_document_type: 'GTN', source_document_id: 'gtn', production_run_id: null, actioned_by: 'Store Manager', notes: '',
}] as StockCardRow[]

test('stock-card PDF preserves the current date window, filters, balances, and selected-item ledger', async () => {
  const pdf = await createStockCardPdf({
    company: 'One Core Group', brand: "Glitz N' Glim", store: 'Finished Goods Store', itemType: 'finished_good',
    category: 'finished-goods', subcategory: '', family: 'Liquid Soap', pack: '12 x 500ml', from: '2026-09-01', to: '2026-09-02',
    balances: [balance], ledger, selectedItemName: 'Liquid Soap 500ml', generatedBy: 'Acceptance Test',
    generatedAt: new Date('2026-09-02T08:00:00Z'),
  })
  assert.equal(pdf.subarray(0, 5).toString('latin1'), '%PDF-')
  const parser = new PDFParse({ data: pdf })
  const parsed = await parser.getText()
  await parser.destroy()
  assert.match(parsed.text, /2026-09-01 to 2026-09-02/)
  assert.match(parsed.text, /Liquid Soap 500ml/)
  assert.match(parsed.text, /GTN-100/)
  assert.match(parsed.text, /Opening \+ In - Out = Closing/)
})
