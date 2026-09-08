import { NextResponse, type NextRequest } from 'next/server'
import { requireApiSection } from '@/lib/api-auth'
import { assertBrandInScope } from '@/lib/finance'
import { listBrands } from '@/lib/brands'
import { listStores } from '@/lib/manufacturing'
import { filterInventoryByTaxonomy } from '@/lib/inventoryTaxonomy'
import { listStockCardRows, periodBalances } from '@/lib/stockCards'
import { createStockCardPdf } from '@/lib/stockCardPdf'
import { normalizeDisplayNomenclature } from '@/lib/inventoryPresentation'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const gate = await requireApiSection(req, 'inventory', 'view')
  if (gate instanceof NextResponse) return gate
  try {
    const body = await req.json()
    const value = (key: string) => String(body?.[key] ?? '').trim()
    const brandId = value('brand')
    const storeId = value('store')
    const itemId = value('item')
    const itemType = value('type')
    const category = value('category')
    const subcategory = value('subcategory')
    const family = value('family')
    const pack = value('pack')
    const from = value('from')
    const to = value('to')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw new Error('A valid from and to date are required.')
    if (from > to) throw new Error('The from date cannot be after the to date.')
    const allowed = gate.allowedBrandIds('inventory')
    if (brandId) assertBrandInScope(brandId, allowed, 'export stock cards')

    const filter = { allowed, brandId: brandId || undefined, storeId: storeId || undefined, itemId: itemId || undefined, itemType: itemType || undefined, from, to }
    const [allBrands, stores, balances] = await Promise.all([
      listBrands(),
      listStores(allowed, brandId || undefined),
      periodBalances(filter),
    ])
    const permittedBrands = allowed === null ? allBrands : allBrands.filter((brand) => allowed.includes(brand.id))
    const brand = brandId ? permittedBrands.find((entry) => entry.id === brandId) : null
    if (brandId && !brand) throw new Error('Brand not found in your inventory scope.')
    const store = storeId ? stores.find((entry) => entry.id === storeId) : null
    if (storeId && !store) throw new Error('Store not found in your inventory scope.')

    const filtered = filterInventoryByTaxonomy(balances, {
      category: category || undefined,
      subcategory: subcategory || undefined,
      family: family || undefined,
      pack: pack || undefined,
    })
    const selected = itemId ? filtered.find((row) => row.item_id === itemId) : null
    const visible = filtered.filter((row) => row.movements > 0 || row.opening !== 0 || row.closing !== 0)
    const ledger = selected ? await listStockCardRows({ ...filter, limit: 300 }) : []
    const generatedAt = new Date()
    const pdf = await createStockCardPdf({
      company: 'One Core Group',
      brand: brand?.name ?? (permittedBrands.length === 1 ? permittedBrands[0]!.name : 'All permitted brands'),
      store: store?.name ?? 'All stores',
      itemType,
      category,
      subcategory,
      family,
      pack,
      from,
      to,
      balances: visible,
      ledger,
      selectedItemName: selected ? normalizeDisplayNomenclature(selected.canonical_name || selected.item_name) : '',
      generatedBy: gate.name || gate.email || gate.userId,
      generatedAt,
    })
    const scope = brand?.slug ?? 'authorised-brands'
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${scope}-stock-card-${from}-to-${to}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 400 })
  }
}
