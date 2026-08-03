import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, Banknote, Download, GraduationCap, Wallet } from 'lucide-react'
import { requireSection } from '@/lib/server-auth'
import { resolveBrand } from '@/lib/brands'
import { schoolForBrandSlug } from '@/lib/imports/brandScope'
import { schoolFeeTotals, schoolFeeByCategory, schoolFeeTopDebtors } from '@/lib/schoolFinanceSummary'
import { listLedger, listVoteheads } from '@/lib/finance'
import { listPettyCashAccounts, listPettyCashTransactions, summarisePettyCash } from '@/lib/pettyCash'
import { formatKsh, sumMoney } from '@/lib/money'
import { db } from '@/lib/serverClient'
import { MoneyForms } from '@/components/finance/MoneyForms'
import { PettyCashPanel } from '@/components/finance/PettyCashPanel'
import { ImportWizard } from '@/components/finance/ImportWizard'
import type { FinanceAccountRow, DataImportRow } from '@ocg/db'

export const dynamic = 'force-dynamic'

export default async function BrandFinancePage({ params }: { params: Promise<{ brand: string }> }) {
  const { brand: slug } = await params
  const actor = await requireSection('finance')
  const brand = await resolveBrand(slug)
  if (!brand) notFound()

  const allowed = actor.permissions === null || actor.isSuperAdmin ? null : (actor.allowedBrandIds('finance') ?? [])
  if (allowed !== null && !allowed.includes(brand.id)) redirect('/finance')
  const canEdit = actor.can('finance', 'edit')
  const scope = allowed === null ? null : [brand.id]

  const [ledger, voteheads, pettyAccounts, pettyTx, accountsRes, importsRes] = await Promise.all([
    listLedger(scope, { brandId: brand.id, limit: 500 }),
    listVoteheads(scope),
    listPettyCashAccounts(scope),
    listPettyCashTransactions(scope, { brandId: brand.id }),
    db().from('finance_accounts').select('*').eq('brand_id', brand.id),
    db().from('data_imports').select('*').eq('brand_id', brand.id).order('created_at', { ascending: false }).limit(10),
  ])
  const accounts = (accountsRes.data as FinanceAccountRow[] | null) ?? []
  const imports = (importsRes.data as DataImportRow[] | null) ?? []

  // School brands surface their canonical fee ledger inside finance, and fees
  // roll into the brand's income + analytics.
  const school = schoolForBrandSlug(brand.slug)
  const feeTotals = school ? await schoolFeeTotals(school) : null
  const feeCategories = school ? await schoolFeeByCategory(school) : []
  const feeDebtors = school ? await schoolFeeTopDebtors(school, 12) : []

  const inflow = sumMoney(ledger.filter((t) => t.direction === 'inflow' || t.direction === 'transfer_in').map((t) => t.amount_ksh))
  const outflow = sumMoney(ledger.filter((t) => t.direction === 'outflow' || t.direction === 'transfer_out').map((t) => t.amount_ksh))
  const pettySummary = summarisePettyCash(pettyTx)

  const brandOptions = [{ id: brand.id, label: brand.short_name || brand.name }]
  const accountOptions = accounts.map((a) => ({ id: a.id, brandId: a.brand_id, label: `${a.account_name}${a.owner_person ? ` · ${a.owner_person}` : ''}` }))
  const voteheadOptions = voteheads.map((v) => ({ id: v.id, brand_id: v.brand_id, name: v.name, kind: v.kind }))
  const pettyAccountOptions = pettyAccounts.map((a) => ({ id: a.id, name: a.name, brand_id: a.brand_id, custodian: a.custodian, current_balance_ksh: a.current_balance_ksh }))

  return (
    <div className="space-y-6">
      <div>
        <Link href="/finance" className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-ocg-gold"><ArrowLeft size={13} /> All brands</Link>
        <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-center gap-3">
            <span className="inline-block h-8 w-8 rounded-lg" style={{ backgroundColor: brand.color_hex }} />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ocg-gold">Brand finance</p>
              <h1 className="text-2xl font-semibold text-gray-900">{brand.name}</h1>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/api/finance/export?brand=${brand.id}&type=transactions`} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:border-ocg-gold/50"><Download size={14} /> Transactions</Link>
            <Link href={`/api/finance/export?brand=${brand.id}&type=petty-cash`} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:border-ocg-gold/50"><Download size={14} /> Petty cash</Link>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label={school ? 'Income (incl. fees)' : 'Income'} value={inflow + (feeTotals?.paid ?? 0)} tone="text-emerald-600" />
        <Stat label="Expense" value={outflow} tone="text-red-600" />
        <Stat label="Net" value={inflow + (feeTotals?.paid ?? 0) - outflow} tone={inflow + (feeTotals?.paid ?? 0) - outflow >= 0 ? 'text-gray-900' : 'text-red-600'} />
        <Stat label="Petty cash on hand" value={pettySummary.expectedClosing} tone="text-gray-900" icon={Wallet} />
        {school
          ? <Stat label="Fees outstanding" value={feeTotals?.outstanding ?? 0} tone="text-amber-600" />
          : <Stat label="Recorded movements" plain value={ledger.length} />}
      </div>

      {school && feeTotals && (
        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ocg-gold"><GraduationCap size={15} /> Student fees</h2>
            <p className="text-xs text-gray-400">{feeTotals.students} students · charged {formatKsh(feeTotals.charged)} · paid {formatKsh(feeTotals.paid)} · outstanding {formatKsh(feeTotals.outstanding)}</p>
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">By fee category (from the workbook)</p>
              <div className="max-h-72 overflow-auto rounded-lg border border-gray-100">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white"><tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400"><th className="px-3 py-2">Category</th><th className="px-3 py-2 text-right">Charged</th><th className="px-3 py-2 text-right">Paid</th><th className="px-3 py-2 text-right">Balance</th></tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    {feeCategories.map((c) => (
                      <tr key={c.category_label}><td className="px-3 py-2 text-gray-700">{c.category_label}</td><td className="px-3 py-2 text-right text-gray-600">{formatKsh(c.charged)}</td><td className="px-3 py-2 text-right text-emerald-700">{formatKsh(c.paid)}</td><td className={`px-3 py-2 text-right font-medium ${c.balance > 0 ? 'text-amber-700' : 'text-gray-600'}`}>{formatKsh(c.balance)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">Top outstanding balances</p>
              <div className="max-h-72 overflow-auto rounded-lg border border-gray-100">
                {feeDebtors.length === 0 ? <p className="p-3 text-sm text-gray-500">No outstanding balances.</p> : (
                  <ul className="divide-y divide-gray-50">
                    {feeDebtors.map((d) => {
                      const href = studentHref(school, d.student_id)
                      return (
                        <li key={d.student_id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                          {href ? <Link href={href} className="text-gray-700 hover:text-ocg-gold hover:underline">{d.admission_no || d.student_id.slice(0, 8)}</Link> : <span className="text-gray-700">{d.admission_no || d.student_id.slice(0, 8)}</span>}
                          <span className="font-medium text-amber-700">{formatKsh(d.outstanding)}</span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
          <p className="mt-3 text-xs text-gray-400">Fees are the canonical imported ledger; each student&apos;s full statement is on their profile. These figures are included in this brand&apos;s income and analytics.</p>
        </section>
      )}

      <MoneyForms brands={brandOptions} accounts={accountOptions} voteheads={voteheadOptions} canEdit={canEdit} />

      <PettyCashPanel brandId={brand.id} brands={brandOptions} accounts={pettyAccountOptions} transactions={pettyTx} canEdit={canEdit} />

      <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="mb-4"><h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ocg-gold"><Banknote size={15} /> Transaction ledger</h2></div>
        {ledger.length === 0 ? (
          <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500">No transactions recorded for {brand.short_name || brand.name} yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-100">
            <table className="w-full min-w-[720px] text-sm">
              <thead><tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400">
                <th className="px-3 py-2">Date</th><th className="px-3 py-2 text-right">In</th><th className="px-3 py-2 text-right">Out</th><th className="px-3 py-2">Category</th><th className="px-3 py-2">Reference</th><th className="px-3 py-2">Reason</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {ledger.slice(0, 40).map((t) => {
                  const isIn = t.direction === 'inflow' || t.direction === 'transfer_in'
                  return (
                    <tr key={t.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2.5 whitespace-nowrap text-gray-600">{t.transaction_date}</td>
                      <td className="px-3 py-2.5 text-right text-emerald-700">{isIn ? formatKsh(t.amount_ksh) : ''}</td>
                      <td className="px-3 py-2.5 text-right text-red-700">{!isIn ? formatKsh(t.amount_ksh) : ''}</td>
                      <td className="px-3 py-2.5 text-gray-600">{t.category || '—'}</td>
                      <td className="px-3 py-2.5 text-gray-500">{t.reference || '—'}</td>
                      <td className="px-3 py-2.5 max-w-[240px] truncate text-gray-600" title={t.description}>{t.description || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ImportWizard brandId={brand.id} brandSlug={brand.slug} brands={brandOptions} canEdit={canEdit} />

      {imports.length > 0 && (
        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ocg-gold">Recent imports</h2>
          <div className="space-y-2">
            {imports.map((imp) => (
              <div key={imp.id} className="flex items-center justify-between rounded-lg border border-gray-100 p-3 text-sm">
                <div><p className="font-medium text-gray-800">{imp.source_filename || 'workbook'}</p><p className="text-xs text-gray-400">{imp.import_type} · {imp.rows_scanned} rows · {imp.records_created} created</p></div>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">{imp.status}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function Stat({ label, value, tone = 'text-gray-900', plain = false, icon: Icon }: { label: string; value: number; tone?: string; plain?: boolean; icon?: React.ElementType }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <p className={`flex items-center gap-1.5 text-2xl font-light ${tone}`}>{Icon && <Icon size={16} className="text-gray-300" />}{plain ? value : formatKsh(value)}</p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
    </div>
  )
}

function studentHref(school: string | null, studentId: string): string | null {
  if (school === 'rayyan') return `/rayyan/students/${studentId}`
  if (school === 'rhythms') return `/rhythms/students/${studentId}`
  return null // Darul has no student profile page yet
}
