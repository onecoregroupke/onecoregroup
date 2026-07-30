import Link from 'next/link'
import { ArrowUpRight, Banknote, BookOpenCheck, Building2, CheckCircle2, CircleAlert, Landmark, ListChecks, ListTodo, ReceiptText, Repeat2 } from 'lucide-react'
import { FinanceActionPanel } from '@/components/finance/FinanceActionPanel'
import { FinanceAccountEditButton } from '@/components/finance/FinanceAccountEditButton'
import { FinanceStatementImportPanel } from '@/components/finance/FinanceStatementImportPanel'
import { MoneyForms } from '@/components/finance/MoneyForms'
import { getFinanceData, isOverdue } from '@/lib/management'
import { listVoteheads, scopeBrands, scopeByBrand } from '@/lib/finance'
import { requireSection } from '@/lib/server-auth'

export const dynamic = 'force-dynamic'

type MoneyRow = {
  label: string
  href: string
  manualExpected: number
  manualPaid: number
  manualBalance: number
  schoolpayExpected?: number
  schoolpayPaid?: number
  schoolpayBalance?: number
  invoiceCount: number
  paymentCount: number
  unmatchedCount?: number
}

export default async function FinancePage() {
  // The layout already gates on `finance` view; we re-resolve the actor here
  // to apply their per-brand compartment to every dataset on the page.
  const actor = await requireSection('finance')
  const allowed = actor.permissions === null || actor.isSuperAdmin ? null : (actor.allowedBrandIds('finance') ?? [])
  const canEdit = actor.can('finance', 'edit')

  const [data, voteheads] = await Promise.all([getFinanceData(), listVoteheads(allowed)])

  // ── Brand compartment: scoped users only ever see their brands' records ──
  const brands = scopeBrands(data.brands, allowed)
  const brandIds = new Set(brands.map((b) => b.id))
  const slugAllowed = (slug: string) => allowed === null || brands.some((b) => b.slug === slug)
  const accounts = allowed === null
    ? data.finance.accounts
    : data.finance.accounts.filter((a) => a.brand_id !== null && brandIds.has(a.brand_id))
  const transactions = scopeByBrand(data.finance.transactions, allowed)
  const transfers = allowed === null
    ? data.finance.transfers
    : data.finance.transfers.filter(
        (t) => (t.from_brand_id && brandIds.has(t.from_brand_id)) || (t.to_brand_id && brandIds.has(t.to_brand_id)),
      )
  const exceptions = scopeByBrand(data.finance.exceptions, allowed)
  const batches = scopeByBrand(data.finance.batches, allowed)
  const financeTasks = allowed === null
    ? data.tasks
    : data.tasks.filter((t) => t.brand_id !== null && brandIds.has(t.brand_id))

  const brandById = new Map(data.brands.map((brand) => [brand.id, brand]))
  const accountById = new Map(accounts.map((account) => [account.id, account]))
  const voteheadById = new Map(voteheads.map((v) => [v.id, v]))

  const rows: MoneyRow[] = [
    ...(slugAllowed('darul-swafa') ? [schoolRow('Darul Swafa', '/darul/fees', data.darul.invoices, data.darul.payments)] : []),
    ...(slugAllowed('ar-rayyan-playhouse') ? [schoolRow('Ar-Rayyan Playhouse', '/rayyan/schoolpay', data.rayyan.invoices, data.rayyan.payments, data.rayyan.snapshots)] : []),
    ...(slugAllowed('rhythms-college') ? [schoolRow('Rhythms College', '/rhythms/schoolpay', data.rhythms.invoices, data.rhythms.payments, data.rhythms.snapshots)] : []),
  ]
  const totals = rows.reduce((acc, row) => ({
    expected: acc.expected + row.manualExpected,
    paid: acc.paid + row.manualPaid,
    balance: acc.balance + row.manualBalance,
    schoolpayBalance: acc.schoolpayBalance + Number(row.schoolpayBalance ?? 0),
  }), { expected: 0, paid: 0, balance: 0, schoolpayBalance: 0 })
  const showNpt = slugAllowed('nairobi-piano-technicians')
  const nptInvoiceTotal = showNpt ? data.npt.invoices.reduce((sum, invoice) => sum + Number(invoice.invoice_amount_ksh ?? 0), 0) : 0
  const nptOpen = showNpt ? data.npt.invoices.filter((invoice) => invoice.record_type === 'invoice' && invoice.payment_status !== 'paid') : []
  const inflow = transactions.filter((tx) => tx.direction === 'inflow').reduce((sum, tx) => sum + Number(tx.amount_ksh ?? 0), 0)
  const outflow = transactions.filter((tx) => tx.direction === 'outflow').reduce((sum, tx) => sum + Number(tx.amount_ksh ?? 0), 0)
  const pendingTransfers = transfers.filter((transfer) => !['reconciled', 'cleared', 'closed'].includes(transfer.status.toLowerCase()))
  const openExceptions = exceptions.filter((item) => !['resolved', 'closed'].includes(item.status.toLowerCase()))
  const openBatches = batches.filter((batch) => !['closed', 'reconciled'].includes(batch.status.toLowerCase()))
  const brandSummaries = brands.map((brand) => {
    const tx = transactions.filter((item) => item.brand_id === brand.id)
    const brandIn = tx.filter((item) => item.direction === 'inflow' || item.direction === 'transfer_in').reduce((sum, item) => sum + Number(item.amount_ksh ?? 0), 0)
    const brandOut = tx.filter((item) => item.direction === 'outflow' || item.direction === 'transfer_out').reduce((sum, item) => sum + Number(item.amount_ksh ?? 0), 0)
    const transfersOut = transfers.filter((item) => item.from_brand_id === brand.id).reduce((sum, item) => sum + Number(item.amount_ksh ?? 0), 0)
    const transfersIn = transfers.filter((item) => item.to_brand_id === brand.id).reduce((sum, item) => sum + Number(item.amount_ksh ?? 0), 0)
    return { brand, inflow: brandIn, outflow: brandOut, transfersIn, transfersOut, net: brandIn + transfersIn - brandOut - transfersOut }
  })

  const brandOptions = brands.map((brand) => ({ id: brand.id, label: brand.short_name || brand.name }))
  const accountOptions = accounts.map((account) => ({
    id: account.id,
    brandId: account.brand_id,
    label: `${account.account_name}${account.owner_person ? ` · ${account.owner_person}` : ''}`,
  }))
  const transactionOptions = transactions.slice(0, 200).map((tx) => ({
    id: tx.id,
    label: `${tx.transaction_date} · KSh ${Number(tx.amount_ksh ?? 0).toLocaleString()} · ${tx.description || tx.reference}`,
  }))
  const teamOptions = data.team.map((member) => ({ id: member.id, label: member.name }))
  const voteheadOptions = voteheads.map((v) => ({ id: v.id, brand_id: v.brand_id, name: v.name, kind: v.kind }))

  // Ledger: newest first, with running balance where an account was involved.
  const ledger = [...transactions]
    .sort((a, b) => (b.transaction_date + b.created_at).localeCompare(a.transaction_date + a.created_at))
    .slice(0, 25)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ocg-gold">Finance Operations</p>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900">Finance cockpit</h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-500">
            {allowed === null
              ? 'Track brand income, expenses, personal-owner business accounts, inter-brand transfers, and reconciliation exceptions across OCG.'
              : `You are viewing the finance records for ${brands.map((b) => b.short_name || b.name).join(', ') || 'no assigned brands'} only.`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {slugAllowed('ar-rayyan-playhouse') && <QuickLink href="/rayyan/schoolpay" label="Rayyan fees" />}
          {slugAllowed('rhythms-college') && <QuickLink href="/rhythms/schoolpay" label="Rhythms fees" />}
          <QuickLink href="/tasks" label="Finance tasks" />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Stat label="Recorded income" value={inflow} money tone="text-emerald-600" />
        <Stat label="Recorded expense" value={outflow} money tone="text-red-600" />
        <Stat label="Net movement" value={inflow - outflow} money tone={inflow - outflow >= 0 ? 'text-gray-900' : 'text-red-600'} />
        <Stat label="School outstanding" value={totals.schoolpayBalance || totals.balance} money tone="text-amber-600" />
        <Stat label="Pending transfers" value={pendingTransfers.length} tone={pendingTransfers.length ? 'text-amber-600' : 'text-gray-900'} />
        <Stat label="Open exceptions" value={openExceptions.length} tone={openExceptions.length ? 'text-red-600' : 'text-gray-900'} />
      </div>

      <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <SectionTitle icon={Building2} title="Brand finance" description="Open a brand to work inside its own scoped finance workspace — transactions, petty cash, imports, and export." />
        {brandSummaries.length === 0 ? (
          <Empty text="No brands in your finance scope yet." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {brandSummaries.map(({ brand, net }) => (
              <Link key={brand.id} href={`/finance/${brand.slug}`} className="group rounded-xl border border-gray-100 p-4 transition hover:border-ocg-gold/60 hover:shadow-sm">
                <div className="flex items-center gap-2.5">
                  <span className="inline-block h-6 w-6 rounded-md" style={{ backgroundColor: brand.color_hex }} />
                  <p className="font-semibold text-gray-900 group-hover:text-ocg-navy">{brand.short_name || brand.name}</p>
                  <ArrowUpRight size={15} className="ml-auto text-gray-300 group-hover:text-ocg-gold" />
                </div>
                <p className={`mt-3 text-lg font-light ${net >= 0 ? 'text-gray-900' : 'text-red-600'}`}>KSh {net.toLocaleString()}</p>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Net movement</p>
              </Link>
            ))}
          </div>
        )}
      </section>

      <MoneyForms brands={brandOptions} accounts={accountOptions} voteheads={voteheadOptions} canEdit={canEdit} />

      <FinanceStatementImportPanel brands={brandOptions} accounts={accountOptions} canEdit={canEdit} />

      <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <SectionTitle icon={BookOpenCheck} title="Transaction ledger" description="Latest recorded movements — money in, money out, votehead, and the balance after each entry." />
        {ledger.length === 0 ? (
          <Empty text="No transactions recorded yet. Use the Record money panel above." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-100">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400">
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Brand</th>
                  <th className="px-3 py-2 text-right">In</th>
                  <th className="px-3 py-2 text-right">Out</th>
                  <th className="px-3 py-2">Votehead</th>
                  <th className="px-3 py-2">Reference</th>
                  <th className="px-3 py-2">Reason</th>
                  <th className="px-3 py-2 text-right">Balance after</th>
                  <th className="px-3 py-2">By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {ledger.map((tx) => {
                  const isIn = tx.direction === 'inflow' || tx.direction === 'transfer_in'
                  return (
                    <tr key={tx.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2.5 whitespace-nowrap text-gray-600">{tx.transaction_date}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: brandById.get(tx.brand_id ?? '')?.color_hex ?? '#ccc' }} />
                        <span className="text-gray-700">{brandById.get(tx.brand_id ?? '')?.short_name ?? '—'}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-medium text-emerald-700">{isIn ? `KSh ${Number(tx.amount_ksh ?? 0).toLocaleString()}` : ''}</td>
                      <td className="px-3 py-2.5 text-right font-medium text-red-700">{!isIn ? `KSh ${Number(tx.amount_ksh ?? 0).toLocaleString()}` : ''}</td>
                      <td className="px-3 py-2.5 text-gray-600">{voteheadById.get(tx.votehead_id ?? '')?.name ?? tx.category ?? '—'}</td>
                      <td className="px-3 py-2.5 text-gray-500">{tx.reference || '—'}</td>
                      <td className="px-3 py-2.5 max-w-[220px] truncate text-gray-600" title={tx.description}>{tx.description || '—'}</td>
                      <td className="px-3 py-2.5 text-right text-gray-700">{tx.balance_after_ksh != null ? `KSh ${Number(tx.balance_after_ksh).toLocaleString()}` : '—'}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-gray-500">{tx.recorded_by || tx.owner_person || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {canEdit && (
        <FinanceActionPanel brands={brandOptions} accounts={accountOptions} transactions={transactionOptions} team={teamOptions} />
      )}

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <SectionTitle icon={Building2} title="Brand cash visibility" description="Recorded inflows, outflows, and inter-brand movements by brand." />
          <div className="overflow-hidden rounded-lg border border-gray-100">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400">
                  <th className="px-3 py-2">Brand</th>
                  <th className="px-3 py-2 text-right">Income</th>
                  <th className="px-3 py-2 text-right">Expense</th>
                  <th className="px-3 py-2 text-right">Transfers in</th>
                  <th className="px-3 py-2 text-right">Transfers out</th>
                  <th className="px-3 py-2 text-right">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {brandSummaries.map(({ brand, inflow: brandIn, outflow: brandOut, transfersIn, transfersOut, net }) => (
                  <tr key={brand.id} className="hover:bg-gray-50">
                    <td className="px-3 py-3">
                      <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: brand.color_hex }} />
                      <span className="font-medium text-gray-800">{brand.short_name || brand.name}</span>
                    </td>
                    <td className="px-3 py-3 text-right text-emerald-700">KSh {brandIn.toLocaleString()}</td>
                    <td className="px-3 py-3 text-right text-red-700">KSh {brandOut.toLocaleString()}</td>
                    <td className="px-3 py-3 text-right text-gray-700">KSh {transfersIn.toLocaleString()}</td>
                    <td className="px-3 py-3 text-right text-gray-700">KSh {transfersOut.toLocaleString()}</td>
                    <td className={`px-3 py-3 text-right font-medium ${net >= 0 ? 'text-gray-900' : 'text-red-600'}`}>KSh {net.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <SectionTitle icon={Landmark} title="Payment accounts" description="Business and personally registered channels used for operations." />
          {accounts.length === 0 ? (
            <Empty text="No finance accounts registered yet." />
          ) : (
            <div className="space-y-3">
              {accounts.slice(0, 10).map((account) => (
                <div key={account.id} className="rounded-lg border border-gray-100 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-gray-900">{account.account_name}</p>
                      <p className="text-xs text-gray-400">
                        {brandById.get(account.brand_id ?? '')?.short_name ?? 'Shared'} · {account.account_type} · {account.provider || 'provider unknown'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-800">KSh {Number(account.current_balance_ksh ?? 0).toLocaleString()}</p>
                      {canEdit && <FinanceAccountEditButton account={account} brands={brandOptions} canUseShared={allowed === null} />}
                    </div>
                  </div>
                  {(account.legal_owner === 'personal' || account.owner_person) && (
                    <p className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-700">
                      {account.legal_owner} owner: {account.owner_person || 'not specified'}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <SectionTitle icon={Repeat2} title="Inter-brand transfers" description="Money moved between brands or shared accounts." />
          {pendingTransfers.length === 0 ? <Empty text="No pending transfers." /> : (
            <div className="space-y-3">
              {pendingTransfers.slice(0, 8).map((transfer) => (
                <div key={transfer.id} className="rounded-lg border border-gray-100 p-3">
                  <p className="font-medium text-gray-900">KSh {Number(transfer.amount_ksh ?? 0).toLocaleString()}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    {brandById.get(transfer.from_brand_id ?? '')?.short_name ?? 'Unknown'} to {brandById.get(transfer.to_brand_id ?? '')?.short_name ?? 'Unknown'} · {transfer.status}
                  </p>
                  <p className="mt-2 text-xs text-gray-400">{transfer.transfer_date} · {transfer.purpose || transfer.reference || 'No purpose recorded'}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <SectionTitle icon={ListChecks} title="Reconciliation" description="Open statement-review batches and match progress." />
          {openBatches.length === 0 ? <Empty text="No open reconciliation batches." /> : (
            <div className="space-y-3">
              {openBatches.slice(0, 8).map((batch) => (
                <div key={batch.id} className="rounded-lg border border-gray-100 p-3">
                  <p className="font-medium text-gray-900">{accountById.get(batch.account_id ?? '')?.account_name ?? 'Unassigned account'}</p>
                  <p className="mt-1 text-xs text-gray-500">{batch.period_start || 'start?'} to {batch.period_end || 'end?'} · {batch.status}</p>
                  <p className="mt-2 text-xs text-gray-400">{batch.matched_count}/{batch.imported_count} matched · {batch.exception_count} exceptions</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <SectionTitle icon={CircleAlert} title="Exceptions" description="Unmatched, unclear, or risky finance items." />
          {openExceptions.length === 0 ? <Empty text="No open exceptions." /> : (
            <div className="space-y-3">
              {openExceptions.slice(0, 8).map((item) => (
                <div key={item.id} className="rounded-lg border border-gray-100 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-gray-900">{item.title}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] ${item.severity === 'High' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700'}`}>{item.severity}</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{brandById.get(item.brand_id ?? '')?.short_name ?? 'Group'} · {item.status} · due {item.due_date || 'unscheduled'}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {(rows.length > 0 || showNpt) && (
        <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
          {rows.length > 0 && (
            <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
              <SectionTitle icon={ReceiptText} title="School fee ledgers" description="Manual records against imported SchoolPay snapshots." />
              <div className="overflow-hidden rounded-lg border border-gray-100">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400">
                      <th className="px-3 py-2">Brand</th>
                      <th className="px-3 py-2 text-right">Manual due</th>
                      <th className="px-3 py-2 text-right">SchoolPay due</th>
                      <th className="px-3 py-2 text-right">Unmatched</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {rows.map((row) => (
                      <tr key={row.label} className="hover:bg-gray-50">
                        <td className="px-3 py-3">
                          <p className="font-medium text-gray-800">{row.label}</p>
                          <p className="text-xs text-gray-400">{row.invoiceCount} invoices · {row.paymentCount} payments</p>
                        </td>
                        <td className="px-3 py-3 text-right text-gray-700">KSh {row.manualBalance.toLocaleString()}</td>
                        <td className="px-3 py-3 text-right text-gray-700">{row.schoolpayBalance == null ? '—' : `KSh ${row.schoolpayBalance.toLocaleString()}`}</td>
                        <td className="px-3 py-3 text-right text-gray-700">{row.unmatchedCount ?? '—'}</td>
                        <td className="px-3 py-3 text-right"><Link href={row.href} className="inline-flex items-center gap-1 text-xs font-semibold text-ocg-gold hover:text-ocg-navy">Open <ArrowUpRight size={13} /></Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {showNpt && (
            <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
              <SectionTitle icon={Banknote} title="NPT invoices" description="Piano-service quote and invoice exposure." />
              <Stat label="Invoice value" value={nptInvoiceTotal} money />
              <div className="mt-4 space-y-3">
                {nptOpen.length === 0 ? (
                  <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">No open NPT invoices found.</p>
                ) : nptOpen.slice(0, 6).map((invoice) => (
                  <div key={invoice.id} className="rounded-lg border border-gray-100 p-3">
                    <p className="text-sm font-medium text-gray-800">KSh {Number(invoice.invoice_amount_ksh ?? 0).toLocaleString()}</p>
                    <p className="text-xs text-gray-400">{invoice.status} · {invoice.payment_status}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <SectionTitle icon={ListTodo} title="Finance tasks" description="Ops tasks tagged by finance, invoice, payment, fee, receipt, SchoolPay, or reconciliation language." />
        {financeTasks.length === 0 ? (
          <p className="text-sm text-gray-500">No finance-related tasks found yet.</p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {financeTasks.slice(0, 12).map((task) => {
              const overdue = task.active === 'Yes' && isOverdue(task.target_date)
              return (
                <Link key={task.task_id} href={`/tasks/${task.task_id}`} className="rounded-lg border border-gray-100 p-4 hover:border-ocg-gold/50">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{task.task_name}</p>
                      <p className="mt-1 text-xs text-gray-400">{task.task_id} · {task.project_name || 'No project'} · {task.assigned_to || 'Unassigned'}</p>
                    </div>
                    {overdue ? <CircleAlert size={17} className="text-red-500" /> : <CheckCircle2 size={17} className="text-emerald-500" />}
                  </div>
                  <p className="mt-3 text-xs text-gray-500">{task.current_status} · due {task.target_date || 'unscheduled'}</p>
                </Link>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function schoolRow(
  label: string,
  href: string,
  invoices: { id: string; amount_expected_ksh: number; amount_paid_ksh: number; balance_ksh: number | null; schoolpay_snapshot_id?: string | null }[],
  payments: { id: string }[],
  snapshots: { id: string; amount_expected_ksh: number | null; amount_paid_ksh: number | null; balance_ksh: number | null }[] = [],
): MoneyRow {
  const linkedSnapshotIds = new Set(invoices.map((invoice) => invoice.schoolpay_snapshot_id).filter(Boolean))
  return {
    label,
    href,
    manualExpected: invoices.reduce((sum, invoice) => sum + Number(invoice.amount_expected_ksh ?? 0), 0),
    manualPaid: invoices.reduce((sum, invoice) => sum + Number(invoice.amount_paid_ksh ?? 0), 0),
    manualBalance: invoices.reduce((sum, invoice) => sum + Number(invoice.balance_ksh ?? 0), 0),
    schoolpayExpected: snapshots.reduce((sum, snapshot) => sum + Number(snapshot.amount_expected_ksh ?? 0), 0),
    schoolpayPaid: snapshots.reduce((sum, snapshot) => sum + Number(snapshot.amount_paid_ksh ?? 0), 0),
    schoolpayBalance: snapshots.length ? snapshots.reduce((sum, snapshot) => sum + Number(snapshot.balance_ksh ?? 0), 0) : undefined,
    invoiceCount: invoices.length,
    paymentCount: payments.length,
    unmatchedCount: snapshots.length ? snapshots.filter((snapshot) => !linkedSnapshotIds.has(snapshot.id)).length : undefined,
  }
}

function SectionTitle({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ocg-gold">{title}</h2>
        <p className="mt-1 text-sm text-gray-500">{description}</p>
      </div>
      <Icon size={18} className="text-gray-400" />
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500">{text}</p>
}

function Stat({ label, value, money = false, tone = 'text-gray-900' }: { label: string; value: number; money?: boolean; tone?: string }) {
  return <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm"><p className={`text-3xl font-light ${tone}`}>{money ? `KSh ${value.toLocaleString()}` : value}</p><p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</p></div>
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return <Link href={href} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:border-ocg-gold/50 hover:text-ocg-gold">{label}<ArrowUpRight size={14} /></Link>
}
