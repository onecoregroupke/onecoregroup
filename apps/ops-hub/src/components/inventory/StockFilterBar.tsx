'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'
import { Filter, RotateCcw } from 'lucide-react'
import { ITEM_TYPES } from '@/lib/manufacturingModel'

export interface FilterOption { value: string; label: string }

/**
 * Shared filter bar for the stock views. Filters live in the URL, so a
 * filtered view is linkable, survives a refresh, and is rendered on the server
 * against the caller's own brand scope — a filter can narrow what they see but
 * never widen it.
 */
export function StockFilterBar({
  brands,
  stores,
  items,
  categories = [],
  subcategories = [],
  families = [],
  packs = [],
  showItem = true,
  showPeriod = true,
}: {
  brands: FilterOption[]
  stores: FilterOption[]
  items?: FilterOption[]
  categories?: FilterOption[]
  subcategories?: FilterOption[]
  families?: FilterOption[]
  packs?: FilterOption[]
  showItem?: boolean
  showPeriod?: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const set = useCallback(
    (key: string, value: string, clear: string[] = []) => {
      const next = new URLSearchParams(params.toString())
      clear.forEach((name) => next.delete(name))
      if (value) next.set(key, value)
      else next.delete(key)
      router.push(`${pathname}?${next.toString()}`)
    },
    [params, pathname, router],
  )

  const get = (key: string) => params.get(key) ?? ''
  const active = ['brand', 'store', 'item', 'type', 'category', 'subcategory', 'family', 'pack', 'from', 'to'].filter((k) => params.get(k))

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
          <Filter size={12} /> Filters
        </span>
        {active.length > 0 && (
          <button onClick={() => router.push(pathname)}
            className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700">
            <RotateCcw size={11} /> Clear {active.length}
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {brands.length > 1 && (
          <Field label="Brand">
            <select className="input" value={get('brand')} onChange={(e) => set('brand', e.target.value, ['store', 'category', 'subcategory', 'family', 'pack', 'item'])}>
              <option value="">All brands</option>
              {brands.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
          </Field>
        )}

        <Field label="Item type">
          <select className="input" value={get('type')} onChange={(e) => set('type', e.target.value, ['category', 'subcategory', 'family', 'pack', 'item'])}>
            <option value="">All types</option>
            {ITEM_TYPES.map((t) => (
              <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </Field>

        {stores.length > 0 && (
          <Field label="Store">
            <select className="input" value={get('store')} onChange={(e) => set('store', e.target.value, ['category', 'subcategory', 'family', 'pack', 'item'])}>
              <option value="">All stores</option>
              {stores.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>
        )}

        {categories.length > 1 && (
          <Field label="Category">
            <select className="input" value={get('category')} onChange={(e) => set('category', e.target.value, ['subcategory', 'family', 'pack', 'item'])}>
              <option value="">All categories</option>
              {categories.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </Field>
        )}

        {subcategories.length > 1 && (
          <Field label="Subcategory">
            <select className="input" value={get('subcategory')} onChange={(e) => set('subcategory', e.target.value, ['family', 'pack', 'item'])}>
              <option value="">All subcategories</option>
              {subcategories.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </Field>
        )}

        {families.length > 1 && (
          <Field label="Product family">
            <select className="input" value={get('family')} onChange={(e) => set('family', e.target.value, ['pack', 'item'])}>
              <option value="">All product families</option>
              {families.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </Field>
        )}

        {packs.length > 1 && (
          <Field label="Pack / size">
            <select className="input" value={get('pack')} onChange={(e) => set('pack', e.target.value, ['item'])}>
              <option value="">All packs / sizes</option>
              {packs.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </Field>
        )}

        {showItem && items && items.length > 0 && (
          <Field label="Item">
            <select className="input" value={get('item')} onChange={(e) => set('item', e.target.value)}>
              <option value="">All items</option>
              {items.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
            </select>
          </Field>
        )}

        {showPeriod && (
          <>
            <Field label="From">
              <input type="date" className="input" value={get('from')} onChange={(e) => set('from', e.target.value)} />
            </Field>
            <Field label="To">
              <input type="date" className="input" value={get('to')} onChange={(e) => set('to', e.target.value)} />
            </Field>
          </>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>
      {children}
    </label>
  )
}
