'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Search } from 'lucide-react'
import { visibleItems, expansionLabel, needsSearch } from '@/lib/listExpansion'

export interface StoreItem {
  id: string
  name: string
  sku: string
  unit: string
  quantity: number
  minimumStock: number
  reorderLevel: number
  /** Period movement for the item, when the stock card has it. */
  opening: number | null
  quantityIn: number | null
  quantityOut: number | null
}

const num = (n: number) => Number(n).toLocaleString(undefined, { maximumFractionDigits: 3 })

const STORE_TONE: Record<string, string> = {
  raw: 'text-amber-700 bg-amber-50',
  packaging: 'text-blue-700 bg-blue-50',
  finished_goods: 'text-emerald-700 bg-emerald-50',
  production: 'text-purple-700 bg-purple-50',
  quarantine: 'text-red-700 bg-red-50',
  field_sales: 'text-slate-700 bg-slate-100',
  general: 'text-gray-600 bg-gray-100',
}

/**
 * One manufacturing store, with its stock (§29).
 *
 * The page has already fetched every item, so "+60 more" was dead text over
 * data that was right there. Expansion is therefore purely client-side: the
 * same panel grows, and a long store gains a name/SKU filter. Server pagination
 * would add a round-trip to hide rows already in memory.
 *
 * Nothing here touches the stock figures — opening, in, out and on-hand are
 * rendered exactly as computed upstream from the ledger.
 */
export function StorePanel({
  title, tone, items,
}: {
  title: string
  tone: string
  items: StoreItem[]
}) {
  const [expanded, setExpanded] = useState(false)
  const [query, setQuery] = useState('')

  const shown = useMemo(
    () => visibleItems(items, { expanded, query }),
    [items, expanded, query],
  )
  const label = expansionLabel(items.length, expanded)
  const showSearch = expanded && needsSearch(items.length)
  const filtering = query.trim().length > 0

  return (
    <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ocg-gold">{title}</h2>
        <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${STORE_TONE[tone] ?? STORE_TONE['general']}`}>
          {items.length} item{items.length === 1 ? '' : 's'}
        </span>
      </div>

      {showSearch && (
        <label className="mb-2 flex items-center gap-2 rounded-lg border border-gray-200 px-2.5 py-1.5">
          <Search size={13} className="shrink-0 text-gray-400" />
          <input
            className="w-full border-0 p-0 text-sm outline-none placeholder:text-gray-400 focus:ring-0"
            placeholder="Filter by name or SKU"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={`Filter ${title}`}
          />
        </label>
      )}

      {items.length === 0 ? (
        <p className="rounded-lg bg-gray-50 p-3 text-xs text-gray-500">
          Nothing classified into this store yet.
        </p>
      ) : shown.length === 0 ? (
        <p className="rounded-lg bg-gray-50 p-3 text-xs text-gray-500">
          No item matches &ldquo;{query.trim()}&rdquo;.
        </p>
      ) : (
        <div className="space-y-1.5">
          {shown.map((i) => {
            const threshold = Number(i.minimumStock || i.reorderLevel || 0)
            const low = threshold > 0 && Number(i.quantity) <= threshold
            const hasBalance = i.opening != null
            return (
              <div key={i.id} className="flex items-center justify-between gap-2 rounded-lg border border-gray-50 px-2.5 py-1.5 text-sm">
                <span className="min-w-0">
                  <span className="block truncate text-gray-800">{i.name}</span>
                  {hasBalance && (
                    <span className="block text-[11px] tabular-nums text-gray-400">
                      open {num(i.opening ?? 0)} · <span className="text-emerald-600">+{num(i.quantityIn ?? 0)}</span>
                      {' · '}<span className="text-red-600">−{num(i.quantityOut ?? 0)}</span>
                    </span>
                  )}
                </span>
                <span className={`shrink-0 text-sm font-semibold tabular-nums ${low ? 'text-amber-600' : 'text-gray-900'}`}>
                  {num(Number(i.quantity))} <span className="text-[10px] font-normal text-gray-400">{i.unit}</span>
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* While filtering, the collapse control would be misleading — the list is
          already narrowed by the query rather than by the first-12 cut. */}
      {label && !filtering && (
        <button
          type="button"
          onClick={() => { setExpanded((v) => !v); if (expanded) setQuery('') }}
          className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:border-ocg-gold/40 hover:text-ocg-gold"
          aria-expanded={expanded}
        >
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />} {label}
        </button>
      )}

      {filtering && (
        <p className="mt-2 text-center text-[11px] text-gray-400">
          {shown.length} of {items.length} shown ·{' '}
          <button type="button" onClick={() => setQuery('')} className="font-medium text-ocg-gold hover:underline">
            clear filter
          </button>
        </p>
      )}
    </section>
  )
}
