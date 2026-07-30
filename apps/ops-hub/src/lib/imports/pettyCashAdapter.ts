import { db } from '../serverClient'
import { recordPettyCashTransaction } from '../pettyCash'
import { parsePettyCash } from './parse/pettyCash'
import type { ImportAdapter, CommitContext } from './framework'
import type { DataImportStagingRow, PettyCashAccountRow } from '@ocg/db'

/**
 * Petty-cash adapter (Wallace-style). Pure parsing lives in ./parse/pettyCash
 * (unit tested); this module handles the IO side: float resolution and
 * committing / rolling back rows.
 */

async function ensureAccount(ctx: CommitContext, operatingUnit: string, custodian: string): Promise<string> {
  const supabase = db()
  const name = operatingUnit || custodian || 'Imported petty cash'
  let lookup = supabase.from('petty_cash_accounts').select('*').eq('name', name)
  lookup = ctx.brandId ? lookup.eq('brand_id', ctx.brandId) : lookup.is('brand_id', null)
  const { data: existing } = await lookup.maybeSingle()
  if (existing) return (existing as PettyCashAccountRow).id
  const { data, error } = await supabase
    .from('petty_cash_accounts')
    .insert({ brand_id: ctx.brandId, operating_unit: operatingUnit, custodian, name })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return (data as { id: string }).id
}

export const pettyCashAdapter: ImportAdapter = {
  type: 'petty-cash',
  parse: (wb, opts) => parsePettyCash(wb, opts.selectedSheets),
  signature: (m) => {
    const date = String(m['transaction_date'] ?? '')
    const kind = String(m['entry_kind'] ?? '')
    const amt = String(m['expense_amount_ksh'] ?? m['cash_received_ksh'] ?? '')
    const who = String(m['payee'] ?? m['source_of_funds'] ?? '')
    return [`petty|${date}|${kind}|${amt}|${who}`]
  },
  async commit(row: DataImportStagingRow, ctx: CommitContext) {
    if (row.record_kind !== 'petty-expense' && row.record_kind !== 'petty-income') return null
    const m = row.mapped_payload
    const mappings = (m['_mappings'] as Record<string, string> | undefined) ?? {}
    const operatingUnit = String(mappings['operating_unit'] ?? m['operating_unit'] ?? '')
    const custodian = String(mappings['custodian'] ?? m['custodian'] ?? '')
    const accountId = await ensureAccount(ctx, operatingUnit, custodian)
    const tx = await recordPettyCashTransaction(
      {
        account_id: accountId,
        brand_id: ctx.brandId,
        custodian,
        entry_kind: m['entry_kind'] as 'income' | 'expense',
        transaction_date: String(m['transaction_date'] || '') || undefined,
        cash_received_ksh: Number(m['cash_received_ksh'] ?? 0),
        source_of_funds: String(m['source_of_funds'] ?? ''),
        expense_amount_ksh: Number(m['expense_amount_ksh'] ?? 0),
        payee: String(m['payee'] ?? ''),
        description: String(m['description'] ?? ''),
        transaction_charge_ksh: Number(m['transaction_charge_ksh'] ?? 0),
        secondary_charge_ksh: Number(m['secondary_charge_ksh'] ?? 0),
        secondary_charge_label: String(m['secondary_charge_label'] ?? ''),
        source_workbook: ctx.school || row.sheet_name,
        source_sheet: row.sheet_name,
        source_row: Math.floor(row.source_row ?? 0) || null,
        import_id: ctx.importId,
        state: 'submitted',
      },
      ctx.allowed,
      ctx.actor,
    )
    return { target_table: 'petty_cash_transactions', target_id: tx.id }
  },
  async rollbackRow(row: DataImportStagingRow) {
    if (!row.target_id) return false
    const supabase = db()
    const { data } = await supabase.from('petty_cash_transactions').select('state').eq('id', row.target_id).maybeSingle()
    if (!data) return false
    if ((data as { state: string }).state === 'reconciled' || (data as { state: string }).state === 'closed') return false
    await supabase.from('petty_cash_transactions').delete().eq('id', row.target_id).eq('import_id', row.import_id)
    return true
  },
}
