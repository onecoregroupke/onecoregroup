import Link from 'next/link'
import { ArrowLeft, FileSpreadsheet, Building2 } from 'lucide-react'
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
type PadSection = 'procurement' | 'finance' | 'inventory'

/**
 * OPERATIONAL FORMS — the paper pads, digitised.
 *
 * §30, BRAND CONTEXT. A printed document has a legal identity on it, and that
 * identity has to be the identity of the stock it is moving. The previous form
 * of this page fell back to `brands[0]` for the print identity while loading
 * items and stores UNSCOPED, so an unrestricted admin who arrived without a
 * ?brand got NPT's letterhead over every brand's inventory — an invoice that
 * says one company and moves another company's goods.
 *
 * The fix is to make brand context explicit rather than guessed:
 *   • no ?brand and more than one available → ask, render nothing else;
 *   • ?brand present → it is validated against the user's scope, and print
 *     identity, items, stores, customers and numbering ALL resolve from that one
 *     brand id (never from the raw query value);
 *   • exactly one brand available → that is not a guess, so it is used directly.
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
  const section = padDef.section as PadSection
  if (!actor.can(section, 'edit')) redirect('/forms')

  const allowed = actor.allowedBrandIds(section)
  const [allBrands, team] = await Promise.all([listBrands(), listTeam()])
  const brands = scopeBrands(allBrands, allowed)

  // The requested brand, only if the user may actually use it. An unknown or
  // out-of-scope ?brand resolves to nothing — never to "all brands", and never
  // to the first brand in the list.
  const requested = sp.brand
    ? brands.find((b) => b.id === sp.brand || b.slug === sp.brand) ?? null
    : null
  // One available brand is a fact, not a guess, so it needs no confirmation.
  const brand = requested ?? (brands.length === 1 ? brands[0]! : null)

  const visiblePads = PADS.filter((p) => actor.can(p.section as PadSection, 'edit'))
  const header = (
    <Header pad={pad} visiblePads={visiblePads} brandParam={brand?.slug ?? ''} brandName={brand?.name ?? ''} />
  )

  if (brands.length === 0) {
    return (
      <div className="space-y-5">
        {header}
        <p className="rounded-xl border border-gray-100 bg-white p-6 text-sm text-gray-500 shadow-sm">
          You have no brands assigned for this module, so there is nothing to raise a form against.
        </p>
      </div>
    )
  }

  if (!brand) {
    return (
      <div className="space-y-5">
        {header}
        <BrandChooser pad={pad} brands={brands.map((b) => ({ slug: b.slug, name: b.name, color: b.color_hex }))} />
      </div>
    )
  }

  // From here on, ONE brand id feeds every lookup on the page.
  const brandId = brand.id
  const [items, vendors, customers, stores, identityRow] = await Promise.all([
    listItems(allowed, brandId),
    listVendors(),
    padDef.key === 'invoice' ? listCustomers(allowed, brandId) : Promise.resolve([]),
    listStores(allowed, brandId),
    getPrintIdentity(brandId, 'default'),
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
  // The brand is fixed for this document, so the picker offers only it — a
  // second brand in the dropdown is how identity and stock drift apart.
  const brandOptions = [{ id: brandId, label: brand.name }]

  const suggestedInvoiceNo = padDef.key === 'invoice' ? await suggestPadNumber('invoice', brandId) : ''
  const suggestedDeliveryNo = padDef.key === 'delivery' ? await suggestPadNumber('delivery_note', brandId) : ''

  return (
    <div className="space-y-5">
      {header}

      {!identity && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>{brand.name}</strong> has no print identity configured, so this document would print
          without a letterhead. Set its legal name and address under Settings before issuing it —
          documents are never given another brand&rsquo;s identity as a fallback.
        </p>
      )}

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

      <p className="rounded-xl border border-gray-100 bg-white p-4 text-xs leading-relaxed text-gray-500 shadow-sm">
        <strong className="text-gray-700">How these reach the stock card.</strong> Every posted form
        writes one row per line into <code className="rounded bg-gray-100 px-1">inventory_movements</code>,
        carrying the id of the document that caused it. The stock card is a view over that ledger, so
        Opening · In · Out · Closing recalculates the instant a form is posted — there is no batch job
        and no second copy of the numbers to fall out of step.{' '}
        {/* Stock cards filter on the brand UUID, not the slug. */}
        <Link href={`/inventory/stock-cards?brand=${brandId}`} className="text-ocg-gold underline">
          Open the stock card
        </Link>.
      </p>
    </div>
  )
}

function Header({
  pad, visiblePads, brandParam, brandName,
}: {
  pad: PadKey
  visiblePads: readonly (typeof PADS)[number][]
  brandParam: string
  brandName: string
}) {
  return (
    <>
      <div>
        <Link href="/forms" className="mb-2 inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700">
          <ArrowLeft size={13} /> Forms
        </Link>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ocg-gold">Operations · Forms</p>
        <h1 className="mt-1 flex flex-wrap items-center gap-2 text-2xl font-semibold text-gray-900">
          <FileSpreadsheet size={22} className="text-gray-400" /> Operational forms
          {brandName && (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-ocg-navy/5 px-2.5 py-1 text-sm font-medium text-ocg-navy">
              <Building2 size={14} /> {brandName}
            </span>
          )}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-gray-500">
          The paper pads, with the same fields in the same order. Submitting a form posts its
          movement through the stock ledger, so the stock card updates immediately — no separate
          data-entry step, and no chance of the two disagreeing.
        </p>
        {brandName && (
          <p className="mt-1 text-xs text-gray-400">
            Letterhead, stores and items on this page all belong to {brandName}.{' '}
            <Link href={`/forms/operations?pad=${pad}`} className="font-medium text-ocg-gold hover:underline">
              Switch entity
            </Link>
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {visiblePads.map((p) => (
          <Link
            key={p.key}
            href={`/forms/operations?pad=${p.key}${brandParam ? `&brand=${brandParam}` : ''}`}
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
    </>
  )
}

/**
 * §30: an unrestricted admin without a brand context must NOT silently inherit
 * the first brand. They are asked, once, and the answer travels in the URL so
 * every subsequent lookup on the page resolves from the same entity.
 */
function BrandChooser({
  pad, brands,
}: {
  pad: PadKey
  brands: { slug: string; name: string; color: string }[]
}) {
  return (
    <section className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-gray-900">Which entity is this document for?</h2>
      <p className="mt-1 max-w-2xl text-sm text-gray-500">
        These documents carry a legal identity — a letterhead, a PIN, a company name — and move that
        entity&rsquo;s stock. Choose the entity so the letterhead and the goods on the page belong to
        the same company.
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {brands.map((b) => (
          <Link
            key={b.slug}
            href={`/forms/operations?pad=${pad}&brand=${b.slug}`}
            className="flex items-center gap-3 rounded-xl border border-gray-100 p-4 transition-colors hover:border-ocg-gold/40"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
              style={{ backgroundColor: `${b.color}18` }}>
              <Building2 size={17} style={{ color: b.color }} />
            </span>
            <span className="min-w-0 text-sm font-medium text-gray-800">{b.name}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}
