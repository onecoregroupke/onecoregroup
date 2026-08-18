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
  showItem = true,
  showPeriod = true,
}: {
  brands: FilterOption[]
  stores: FilterOption[]
  items?: FilterOption[]
  showItem?: boolean
  showPeriod?: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const set = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params.toString())
      if (value) next.set(key, value)
      else next.delete(key)
      router.push(`${pathname}?${next.toString()}`)
    },
    [params, pathname, router],
  )

  const get = (key: string) => params.get(key) ?? ''
  const active = ['brand', 'store', 'item', 'type', 'from', 'to'].filter((k) => params.get(k))

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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {brands.length > 1 && (
          <Field label="Brand">
            <select className="input" value={get('brand')} onChange={(e) => set('brand', e.target.value)}>
              <option value="">All brands</option>
              {brands.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
          </Field>
        )}

        <Field label="Item type">
          <select className="input" value={get('type')} onChange={(e) => set('type', e.target.value)}>
            <option value="">All types</option>
            {ITEM_TYPES.map((t) => (
              <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </Field>

        {stores.length > 0 && (
          <Field label="Store">
            <select className="input" value={get('store')} onChange={(e) => set('store', e.target.value)}>
              <option value="">All stores</option>
              {stores.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
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
