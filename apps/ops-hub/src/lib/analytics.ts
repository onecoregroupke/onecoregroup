import { listBrands } from './brands'
import { listLedger } from './finance'
import { listTasks } from './tasks'
import { schoolFeeTotals, schoolFeeByMonth } from './schoolFinanceSummary'
import { schoolForBrandSlug } from './imports/brandScope'
import { addMoney } from './money'
import { todayInEat } from './serverClient'
import type { Brand, School } from '@ocg/db'

// Management analytics: consolidates finance movements + the canonical school-fee
// ledger (fees are part of the totals + the weekly/monthly trend) + task health,
// group-wide or for one brand. Aggregation stays cheap: finance rows are few and
// fee rollups run in Postgres (migration 050 RPCs).

export interface BrandFinance { brandId: string; brandName: string; income: number; expense: number; feesPaid: number; feesOutstanding: number; net: number }
export interface MonthPoint { ym: string; income: number; expense: number; feesPaid: number }
export interface SchoolFinance { school: string; brandName: string; charged: number; paid: number; outstanding: number; students: number; collectionRate: number }
export interface Analytics {
  scopeLabel: string
  totals: { income: number; expense: number; feesPaid: number; feesOutstanding: number; net: number; collectionRate: number }
  byBrand: BrandFinance[]
  byMonth: MonthPoint[]
  schools: SchoolFinance[]
  tasks: { total: number; completed: number; overdue: number; open: number }
}

const isIn = (dir: string) => dir === 'inflow' || dir === 'transfer_in'
const rate = (paid: number, charged: number) => (charged > 0 ? Math.round((paid / charged) * 100) : 0)

export async function getManagementAnalytics(
  allowed: string[] | null,
  opts: { brandSlug?: string; from?: string; to?: string } = {},
): Promise<Analytics> {
  const allBrands = await listBrands()
  const brands = allBrands.filter((b) =>
    (allowed === null || allowed.includes(b.id)) && (!opts.brandSlug || b.slug === opts.brandSlug),
  )
  const brandIds = new Set(brands.map((b) => b.id))
  const brandById = new Map<string, Brand>(brands.map((b) => [b.id, b]))
  const scope = allowed === null ? null : [...brandIds]

  const [ledger, tasks] = await Promise.all([
    listLedger(scope, { limit: 20000 }),
    listTasks({ brandIds: scope ?? undefined, limit: 5000 }),
  ])

  const from = opts.from ?? ''
  const to = opts.to ?? ''
  const inWindow = (d: string) => (!from || d >= from) && (!to || d <= to)

  // ── Finance by brand + month ──
  const byBrandMap = new Map<string, BrandFinance>()
  const byMonth = new Map<string, MonthPoint>()
  for (const t of ledger) {
    if (!t.brand_id || !brandIds.has(t.brand_id) || !inWindow(t.transaction_date)) continue
    const bf = byBrandMap.get(t.brand_id) ?? { brandId: t.brand_id, brandName: brandById.get(t.brand_id)?.short_name || '', income: 0, expense: 0, feesPaid: 0, feesOutstanding: 0, net: 0 }
    const amt = Number(t.amount_ksh ?? 0)
    if (isIn(t.direction)) bf.income = addMoney(bf.income, amt); else bf.expense = addMoney(bf.expense, amt)
    byBrandMap.set(t.brand_id, bf)
    const ym = t.transaction_date.slice(0, 7)
    const mp = byMonth.get(ym) ?? { ym, income: 0, expense: 0, feesPaid: 0 }
    if (isIn(t.direction)) mp.income = addMoney(mp.income, amt); else mp.expense = addMoney(mp.expense, amt)
    byMonth.set(ym, mp)
  }

  // ── School fees (canonical ledger) folded into brand totals + the trend ──
  const schools: SchoolFinance[] = []
  for (const b of brands) {
    const school = schoolForBrandSlug(b.slug)
    if (!school) continue
    const [totals, months] = await Promise.all([schoolFeeTotals(school as School), schoolFeeByMonth(school as School)])
    schools.push({ school, brandName: b.short_name || b.name, charged: totals.charged, paid: totals.paid, outstanding: totals.outstanding, students: totals.students, collectionRate: rate(totals.paid, totals.charged) })
    const bf = byBrandMap.get(b.id) ?? { brandId: b.id, brandName: b.short_name || '', income: 0, expense: 0, feesPaid: 0, feesOutstanding: 0, net: 0 }
    bf.feesPaid = addMoney(bf.feesPaid, totals.paid)
    bf.feesOutstanding = addMoney(bf.feesOutstanding, totals.outstanding)
    byBrandMap.set(b.id, bf)
    for (const m of months) {
      if (!inWindow(`${m.ym}-01`)) continue
      const mp = byMonth.get(m.ym) ?? { ym: m.ym, income: 0, expense: 0, feesPaid: 0 }
      mp.feesPaid = addMoney(mp.feesPaid, m.paid)
      byMonth.set(m.ym, mp)
    }
  }

  const byBrand = [...byBrandMap.values()].map((b) => ({ ...b, net: b.income + b.feesPaid - b.expense }))
  const totals = byBrand.reduce(
    (a, b) => ({
      income: addMoney(a.income, b.income), expense: addMoney(a.expense, b.expense),
      feesPaid: addMoney(a.feesPaid, b.feesPaid), feesOutstanding: addMoney(a.feesOutstanding, b.feesOutstanding),
      net: 0, collectionRate: 0,
    }),
    { income: 0, expense: 0, feesPaid: 0, feesOutstanding: 0, net: 0, collectionRate: 0 },
  )
  totals.net = totals.income + totals.feesPaid - totals.expense
  const schoolCharged = schools.reduce((s, x) => addMoney(s, x.charged), 0)
  totals.collectionRate = rate(schools.reduce((s, x) => addMoney(s, x.paid), 0), schoolCharged)

  // ── Task health ──
  const today = todayInEat()
  const taskStats = { total: tasks.length, completed: 0, overdue: 0, open: 0 }
  for (const t of tasks) {
    if (t.current_status === 'Completed') taskStats.completed++
    else {
      taskStats.open++
      if (t.active === 'Yes' && t.target_date && t.target_date !== '' && t.target_date < today) taskStats.overdue++
    }
  }

  return {
    scopeLabel: opts.brandSlug ? (brands[0]?.name ?? opts.brandSlug) : 'All brands',
    totals,
    byBrand: byBrand.sort((a, b) => b.net - a.net),
    byMonth: [...byMonth.values()].sort((a, b) => a.ym.localeCompare(b.ym)),
    schools,
    tasks: taskStats,
  }
}
