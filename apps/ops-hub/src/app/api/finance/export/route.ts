import { NextResponse, type NextRequest } from 'next/server'
import { getActor } from '@/lib/server-auth'
import { resolveBrand } from '@/lib/brands'
import { listLedger } from '@/lib/finance'
import { listPettyCashTransactions } from '@/lib/pettyCash'
import { studentLedger, SCHOOL_STUDENT_TABLE } from '@/lib/schoolFinance'
import { signedAmount } from '@/lib/schoolBalance'
import { buildWorkbook, type ExportSheet } from '@/lib/xlsx'
import { sumMoney, addMoney } from '@/lib/money'
import { db } from '@/lib/serverClient'
import type { School } from '@ocg/db'

/**
 * Finance Excel export (Part 9). Reached via a browser link (cookie session, not
 * Bearer). Exports are brand-scoped to the caller's finance access and never
 * include another brand's rows. Produces a styled, accountant-friendly workbook.
 */
export async function GET(req: NextRequest) {
  const actor = await getActor()
  if (!actor) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  if (!actor.can('finance', 'view')) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })

  const url = new URL(req.url)
  const brandId = url.searchParams.get('brand') ?? ''
  const type = url.searchParams.get('type') ?? 'transactions'
  const brand = brandId ? await resolveBrand(brandId) : null
  const allowed = actor.permissions === null || actor.isSuperAdmin ? null : (actor.allowedBrandIds('finance') ?? [])
  if (brand && allowed !== null && !allowed.includes(brand.id)) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }
  const scope = allowed
  const label = brand?.short_name || brand?.name || 'All brands'

  let sheets: ExportSheet[] = []
  let filename = 'finance-export.xlsx'

  if (type === 'student-statement') {
    const school = (url.searchParams.get('school') ?? '') as School
    const studentId = url.searchParams.get('studentId') ?? ''
    if (!school || !studentId) return NextResponse.json({ ok: false, error: 'school and studentId required' }, { status: 400 })
    // Resolve student identity (dynamic table).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: student } = await (db() as any).from(SCHOOL_STUDENT_TABLE[school]).select('full_name, admission_number').eq('id', studentId).maybeSingle()
    const entries = await studentLedger(school, studentId)
    let running = 0
    const rows = entries.map((e) => {
      const s = signedAmount(e)
      running = addMoney(running, s)
      const isCharge = s > 0
      return {
        date: e.entry_date, desc: e.description || e.category_label, cat: e.category_label,
        rct: e.receipt_no, mpesa: e.mpesa_code,
        debit: isCharge ? Math.abs(s) : '', credit: !isCharge ? Math.abs(s) : '', balance: running,
      }
    })
    const name = (student as { full_name?: string } | null)?.full_name ?? 'Student'
    const adm = (student as { admission_number?: string } | null)?.admission_number ?? ''
    sheets = [{
      name: 'Statement',
      title: `${label} — Statement · ${name}${adm ? ` (${adm})` : ''}`,
      columns: [
        { header: 'Date', key: 'date', width: 12 },
        { header: 'Description', key: 'desc', width: 30 },
        { header: 'Category', key: 'cat', width: 18 },
        { header: 'Receipt', key: 'rct', width: 14 },
        { header: 'M-Pesa', key: 'mpesa', width: 14 },
        { header: 'Debit', key: 'debit', width: 14, format: 'money' },
        { header: 'Credit', key: 'credit', width: 14, format: 'money' },
        { header: 'Balance', key: 'balance', width: 14, format: 'money' },
      ],
      rows,
      totalRow: {
        desc: 'CLOSING BALANCE',
        debit: sumMoney(entries.filter((e) => signedAmount(e) > 0).map((e) => Math.abs(signedAmount(e)))),
        credit: sumMoney(entries.filter((e) => signedAmount(e) < 0).map((e) => Math.abs(signedAmount(e)))),
        balance: running,
      },
    }]
    filename = `${slug(label)}-statement-${adm || studentId.slice(0, 8)}.xlsx`
  } else if (type === 'petty-cash') {
    const rows = await listPettyCashTransactions(scope, { brandId: brand?.id })
    sheets = [{
      name: 'Petty Cash',
      title: `${label} — Petty Cash`,
      columns: [
        { header: 'Date', key: 'date', width: 12 },
        { header: 'Kind', key: 'kind', width: 10 },
        { header: 'Payee / Source', key: 'who', width: 26 },
        { header: 'Category', key: 'cat', width: 18 },
        { header: 'In', key: 'in', width: 14, format: 'money' },
        { header: 'Out', key: 'out', width: 14, format: 'money' },
        { header: 'Txn charge', key: 'charge', width: 12, format: 'money' },
        { header: 'ZIIDI', key: 'ziidi', width: 10, format: 'money' },
        { header: 'Total out', key: 'total', width: 14, format: 'money' },
        { header: 'Balance', key: 'balance', width: 14, format: 'money' },
        { header: 'State', key: 'state', width: 12 },
      ],
      rows: rows.map((t) => ({
        date: t.transaction_date, kind: t.entry_kind, who: t.payee || t.source_of_funds,
        cat: t.expense_category, in: t.cash_received_ksh || '', out: t.expense_amount_ksh || '',
        charge: t.transaction_charge_ksh || '', ziidi: t.secondary_charge_ksh || '',
        total: t.total_cash_out_ksh || '', balance: t.running_balance_ksh ?? '', state: t.state,
      })),
      totalRow: {
        who: 'TOTAL', in: sumMoney(rows.map((t) => t.cash_received_ksh)),
        out: sumMoney(rows.map((t) => t.expense_amount_ksh)),
        charge: sumMoney(rows.map((t) => t.transaction_charge_ksh)),
        ziidi: sumMoney(rows.map((t) => t.secondary_charge_ksh)),
        total: sumMoney(rows.map((t) => t.total_cash_out_ksh)),
      },
    }]
    filename = `${slug(label)}-petty-cash.xlsx`
  } else {
    const rows = await listLedger(scope, { brandId: brand?.id, limit: 5000 })
    sheets = [{
      name: 'Transactions',
      title: `${label} — Transactions`,
      columns: [
        { header: 'Date', key: 'date', width: 12 },
        { header: 'Description', key: 'desc', width: 34 },
        { header: 'Category', key: 'cat', width: 18 },
        { header: 'Reference', key: 'ref', width: 16 },
        { header: 'Counterparty', key: 'cp', width: 20 },
        { header: 'Debit (In)', key: 'in', width: 14, format: 'money' },
        { header: 'Credit (Out)', key: 'out', width: 14, format: 'money' },
        { header: 'Balance after', key: 'bal', width: 14, format: 'money' },
      ],
      rows: rows.map((t) => {
        const isIn = t.direction === 'inflow' || t.direction === 'transfer_in'
        return {
          date: t.transaction_date, desc: t.description, cat: t.category, ref: t.reference,
          cp: t.counterparty_name, in: isIn ? t.amount_ksh : '', out: isIn ? '' : t.amount_ksh,
          bal: t.balance_after_ksh ?? '',
        }
      }),
      totalRow: {
        desc: 'TOTAL',
        in: sumMoney(rows.filter((t) => t.direction === 'inflow' || t.direction === 'transfer_in').map((t) => t.amount_ksh)),
        out: sumMoney(rows.filter((t) => !(t.direction === 'inflow' || t.direction === 'transfer_in')).map((t) => t.amount_ksh)),
      },
    }]
    filename = `${slug(label)}-transactions.xlsx`
  }

  const buffer = await buildWorkbook(sheets)
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'finance'
}
