import { NextResponse, type NextRequest } from 'next/server'
import { requireApiSection } from '@/lib/api-auth'
import { assertBrandInScope } from '@/lib/finance'
import { listItems } from '@/lib/inventory'
import { filterInventoryByTaxonomy, parseInventoryClassifications } from '@/lib/inventoryTaxonomy'
import { resolveBrand } from '@/lib/brands'
import { createInventoryPdf } from '@/lib/inventoryPdf'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const gate = await requireApiSection(req, 'inventory', 'view')
  if (gate instanceof NextResponse) return gate
  try {
    const body = await req.json()
    const brandId = String(body.brand_id ?? '')
    assertBrandInScope(brandId, gate.allowedBrandIds('inventory'), 'export inventory')
    const brand = await resolveBrand(brandId)
    if (!brand) return NextResponse.json({ ok: false, error: 'Brand not found.' }, { status: 404 })

    const classifications = parseInventoryClassifications(body.classifications)
    const family = String(body.family ?? '').trim()
    const allItems = await listItems(gate.allowedBrandIds('inventory'), brandId)
    const items = filterInventoryByTaxonomy(allItems, {
      categories: classifications,
      family: family || undefined,
    })
    const generatedAt = new Date()
    const pdf = await createInventoryPdf({
      company: 'One Core Group',
      brand: brand.name,
      items,
      classifications,
      family,
      generatedBy: gate.name || gate.email || gate.userId,
      generatedAt,
    })
    const filename = `${brand.slug}-inventory-${generatedAt.toISOString().slice(0, 10)}.pdf`
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 400 })
  }
}
