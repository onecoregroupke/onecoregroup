import Link from 'next/link'
import { ArrowLeft, FileSpreadsheet } from 'lucide-react'
import { requireActor } from '@/lib/server-auth'
import { redirect } from 'next/navigation'
import { listBrands } from '@/lib/brands'
import { listItems } from '@/lib/inventory'
import { listTeam } from '@/lib/team'
import { listStores } from '@/lib/manufacturing'
import { listVendors } from '@/lib/procurement'
import { listCustomers, suggestPadNumber } from '@/lib/sales'
import { getPrintIdentity, identityHeaderLines } from '@/lib/printIdentity'
import { scopeBrands } from '@/lib/finance'
import { GoodsReceivedNoteForm, type ItemOption } from '@/components/forms/GoodsReceivedNoteForm'
import { GoodsIssueNoteForm } from '@/components/forms/GoodsIssueNoteForm'
import { MaterialRequisitionForm } from '@/components/forms/MaterialRequisitionForm'
import { SalesInvoiceForm } from '@/components/forms/SalesInvoiceForm'
import { DeliveryNoteForm } from '@/components/forms/DeliveryNoteForm'

export const dynamic = 'force-dynamic'

const PADS = [
  { key: 'grn', label: 'Goods Received Note', hint: 'Goods in from a supplier', section: 'procurement' },
  { key: 'gin', label: 'Goods / Raw Material Issue Note', hint: 'Stock out to production', section: 'procurement' },
  { key: 'gtn', label: 'Goods Transfer Note', hint: 'Stock between stores', section: 'procurement' },
  { key: 'mrf', label: 'Material Requisition', hint: 'Request material', section: 'procurement' },
  { key: 'invoice', label: 'Invoice', hint: 'Sale to a customer', section: 'finance' },
  { key: 'delivery', label: 'Delivery Note', hint: 'Stock to a sales team', section: 'inventory' },
] as const

type PadKey = (typeof PADS)[number]['key']

/**
 * OPERATIONAL FORMS — the paper pads, digitised.
 *
 * Each form carries the same fields, in the same order, as the physical pad it
 * replaces, and each states plainly what it will do to stock BEFORE it is
 * submitted. Submitting a form posts the corresponding movement through the one
 * inventory ledger, so the stock card updates the moment the form is saved.
 */
export default async function OperationalFormsPage({
  searchParams,
}: {
  searchParams: Promise<{ pad?: string; brand?: string }>
}) {
  const actor = await requireActor()
  const sp = await searchParams
  const pad = (sp.pad ?? 'grn') as PadKey

  // Each pad sits behind the permission for the ledger it touches.
  const padDef = PADS.find((p) => p.key === pad) ?? PADS[0]
  if (!actor.can(padDef.section as 'procurement' | 'finance' | 'inventory', 'edit')) {
    redirect('/forms')
  }

  const allowed =
    actor.allowedBrandIds(padDef.section as 'procurement' | 'finance' | 'inventory')
  const [allBrands, team] = await Promise.all([listBrands(), listTeam()])
  const brands = scopeBrands(allBrands, allowed)
  const brandId = sp.brand || brands[0]?.id || ''

  const [items, vendors, customers, stores, identityRow] = await Promise.all([
    listItems(allowed, sp.brand),
    listVendors(),
    padDef.key === 'invoice' ? listCustomers(allowed, sp.brand) : Promise.resolve([]),
    listStores(allowed, sp.brand),
    brandId ? getPrintIdentity(brandId, 'default') : Promise.resolve(null),
  ])

  const identity = identityRow
    ? { name: identityRow.legal_name, lines: identityHeaderLines(identityRow) }
    : null

  const toOption = (i: (typeof items)[number]): ItemOption => ({
    id: i.id,
    label: `${i.name}${i.sku ? ` (${i.sku})` : ''}`,
    unit: i.unit,
    onHand: Number(i.quantity ?? 0),
  })
  const allItems = items.map(toOption)
  const finishedGoods = items.filter((i) => i.item_type === 'finished_good').map(toOption)
  const brandOptions = brands.map((b) => ({ id: b.id, label: b.name }))

  const suggestedInvoiceNo = padDef.key === 'invoice' ? await suggestPadNumber('invoice', brandId || null) : ''
  const suggestedDeliveryNo = padDef.key === 'delivery' ? await suggestPadNumber('delivery_note', brandId || null) : ''

  const visiblePads = PADS.filter((p) =>
    actor.can(p.section as 'procurement' | 'finance' | 'inventory', 'edit'))

  return (
    <div className="space-y-5">
      <div>
        <Link href="/forms" className="mb-2 inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700">
          <ArrowLeft size={13} /> Forms
        </Link>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ocg-gold">Operations · Forms</p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-gray-900">
          <FileSpreadsheet size={22} className="text-gray-400" /> Operational forms
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-gray-500">
          The paper pads, with the same fields in the same order. Submitting a form posts its
          movement through the stock ledger, so the stock card updates immediately — no separate
          data-entry step, and no chance of the two disagreeing.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {visiblePads.map((p) => (
          <Link
            key={p.key}
            href={`/forms/operations?pad=${p.key}${sp.brand ? `&brand=${sp.brand}` : ''}`}
            className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
              pad === p.key
                ? 'border-ocg-navy bg-ocg-navy text-white'
                : 'border-gray-200 bg-white text-gray-600 hover:border-ocg-gold/40'
            }`}
          >
            <span className="block">{p.label}</span>
            <span className={`block text-[10px] font-normal ${pad === p.key ? 'text-white/60' : 'text-gray-400'}`}>
              {p.hint}
            </span>
          </Link>
        ))}
      </div>

      {brands.length === 0 ? (
        <p className="rounded-xl border border-gray-100 bg-white p-6 text-sm text-gray-500 shadow-sm">
          You have no brands assigned for this module, so there is nothing to raise a form against.
        </p>
      ) : (
        <>
          {pad === 'grn' && (
            <GoodsReceivedNoteForm
              brands={brandOptions} items={allItems} identity={identity} defaultBrandId={brandId}
              vendors={vendors.map((v) => ({ id: v.id, label: v.name }))}
            />
          )}
          {pad === 'gin' && (
            <GoodsIssueNoteForm kind="issue" brands={brandOptions} items={allItems}
              stores={stores.map((s) => ({ id: s.id, label: s.name }))}
              identity={identity} defaultBrandId={brandId} />
          )}
          {pad === 'gtn' && (
            <GoodsIssueNoteForm kind="transfer" brands={brandOptions} items={allItems}
              stores={stores.map((s) => ({ id: s.id, label: s.name }))}
              identity={identity} defaultBrandId={brandId} />
          )}
          {pad === 'mrf' && (
            <MaterialRequisitionForm brands={brandOptions} items={allItems}
              identity={identity} defaultBrandId={brandId} />
          )}
          {pad === 'invoice' && (
            <SalesInvoiceForm
              brands={brandOptions}
              items={finishedGoods.length > 0 ? finishedGoods : allItems}
              identity={identity}
              defaultBrandId={brandId}
              suggestedNumber={suggestedInvoiceNo}
              customers={customers.map((c) => ({
                id: c.id,
                label: c.business_name,
                creditApproved: c.credit_approved,
                termsDays: c.payment_terms_days,
              }))}
            />
          )}
          {pad === 'delivery' && (
            <DeliveryNoteForm
              brands={brandOptions}
              items={finishedGoods.length > 0 ? finishedGoods : allItems}
              identity={identity}
              defaultBrandId={brandId}
              suggestedNumber={suggestedDeliveryNo}
              salespeople={team.map((m) => ({ id: m.id, label: m.name }))}
              stores={stores.map((s) => ({ id: s.id, label: s.name }))}
            />
          )}
        </>
      )}

      <p className="rounded-xl border border-gray-100 bg-white p-4 text-xs leading-relaxed text-gray-500 shadow-sm">
        <strong className="text-gray-700">How these reach the stock card.</strong> Every posted form
        writes one row per line into <code className="rounded bg-gray-100 px-1">inventory_movements</code>,
        carrying the id of the document that caused it. The stock card is a view over that ledger, so
        Opening · In · Out · Closing recalculates the instant a form is posted — there is no batch job
        and no second copy of the numbers to fall out of step.{' '}
        <Link href="/inventory/stock-cards" className="text-ocg-gold underline">Open the stock card</Link>.
      </p>
    </div>
  )
}
