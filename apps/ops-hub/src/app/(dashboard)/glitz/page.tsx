import Link from 'next/link'
import { ArrowUpRight, Sparkles, Star, PackageX } from 'lucide-react'
import { db } from '@/lib/serverClient'
import { requireSection } from '@/lib/server-auth'
import type { Product, ProductSize } from '@ocg/db'

export const dynamic = 'force-dynamic'

// Glitz N' Glim admin overview. A read-only cockpit of the retail catalogue;
// full product editing + CSV import/export live in the Marketing Hub (Glitz).
export default async function GlitzPage() {
  await requireSection('glitz_admin')
  const { data } = await db()
    .from('products')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  const products = (data as Product[]) ?? []
  const active = products.filter((p) => p.is_active)
  const outOfStock = active.filter((p) => !p.is_in_stock)
  const featured = products.filter((p) => p.is_featured)
  const categories = new Set(active.map((p) => p.category_display_name || p.category).filter(Boolean))

  const priceOf = (p: Product): number => {
    const sizes = (p.sizes as ProductSize[] | null) ?? []
    const prices = sizes.map((s) => Number(s.price_ksh ?? 0)).filter((n) => n > 0)
    return prices.length ? Math.min(...prices) : 0
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ocg-gold">Glitz N&apos; Glim</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-gray-900">
            <Sparkles size={22} className="text-[#b07a00]" /> Glitz admin
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            The retail catalogue at a glance. Full product editing, images, and CSV import/export are in the Marketing Hub.
          </p>
        </div>
        <Link href="/mhub/glitz" className="inline-flex w-fit items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:border-ocg-gold/50 hover:text-ocg-gold">
          Manage catalogue <ArrowUpRight size={14} />
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Products" value={products.length} />
        <Stat label="Active" value={active.length} tone="text-emerald-600" />
        <Stat label="Categories" value={categories.size} />
        <Stat label="Out of stock" value={outOfStock.length} tone={outOfStock.length ? 'text-red-600' : 'text-gray-900'} />
      </div>

      <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-ocg-gold">Catalogue{featured.length ? ` · ${featured.length} featured` : ''}</h2>
        {products.length === 0 ? (
          <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">No products yet. Add them from the Marketing Hub → Glitz N&apos; Glim.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {products.map((p) => {
              const from = priceOf(p)
              return (
                <div key={p.id} className="rounded-xl border border-gray-100 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-gray-900">{p.name}</p>
                      <p className="truncate text-xs text-gray-400">{p.category_display_name || p.category || 'Uncategorised'}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {p.is_featured && <Star size={14} className="text-amber-500" />}
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${p.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-400'}`}>
                        {p.is_active ? 'Active' : 'Hidden'}
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                    {from > 0 && <span className="font-medium text-gray-700">from KSh {from.toLocaleString()}</span>}
                    <span>{((p.sizes as ProductSize[] | null) ?? []).length} sizes</span>
                    {!p.is_in_stock && <span className="inline-flex items-center gap-1 text-red-600"><PackageX size={13} /> out of stock</span>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function Stat({ label, value, tone = 'text-gray-900' }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <p className={`text-3xl font-light ${tone}`}>{value}</p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
    </div>
  )
}
