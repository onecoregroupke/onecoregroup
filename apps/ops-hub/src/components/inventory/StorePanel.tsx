'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Search, TriangleAlert } from 'lucide-react'
import { visibleItems, expansionLabel, needsSearch } from '@/lib/listExpansion'
import { filterInventoryByTaxonomy, inventoryTaxonomy, inventoryTaxonomyOptions } from '@/lib/inventoryTaxonomy'
import { finishedGoodsQuantity, formatInventoryNumber, formatPackageConfiguration } from '@/lib/finishedGoodsQuantity'
import { FinishedGoodsQuantity } from './FinishedGoodsQuantity'

export interface PackagingRequirementSummary {
  id: string
  componentName: string
  role: string
  selectionMode: 'all_required' | 'one_of'
  requirementGroup: string
  onHand: number
  unit: string
  quantityPerUnit: number
}

export interface StoreItem {
  id: string
  name: string
  canonical_name: string
  sku: string
  unit: string
  base_unit: string
  item_type: string
  category: string
  product_family: string
  size_label: string
  package_config: string
  pack_size: number
  packaging_role: string
  store_id: string | null
  quantity: number
  minimumStock: number
  reorderLevel: number
  opening: number | null
  quantityIn: number | null
  quantityOut: number | null
  usedBy?: string[]
  requirements?: PackagingRequirementSummary[]
}

const STORE_TONE: Record<string, string> = {
  raw: 'text-amber-700 bg-amber-50', packaging: 'text-blue-700 bg-blue-50',
  finished_goods: 'text-emerald-700 bg-emerald-50', production: 'text-purple-700 bg-purple-50',
  quarantine: 'text-red-700 bg-red-50', field_sales: 'text-slate-700 bg-slate-100',
  general: 'text-gray-600 bg-gray-100',
}

function compatibleTotal(items: StoreItem[]): { quantity: number; unit: string } | null {
  const units = new Set(items.map((item) => item.base_unit || item.unit).filter(Boolean))
  if (units.size !== 1) return null
  return { quantity: items.reduce((sum, item) => sum + Number(item.quantity), 0), unit: [...units][0]! }
}

function inlineFinishedQuantity(value: number, packSize: number): string {
  const view = finishedGoodsQuantity(value, packSize)
  return view.cartonLabel ? `${view.totalLabel} · ${view.cartonLabel}` : view.totalLabel
}

/** One store rendered from the shared inventory taxonomy and canonical ledger. */
export function StorePanel({ title, tone, items }: { title: string; tone: string; items: StoreItem[] }) {
  const [expanded, setExpanded] = useState(false)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [subcategory, setSubcategory] = useState('')
  const [family, setFamily] = useState('')
  const [pack, setPack] = useState('')

  const taxonomyOptions = useMemo(
    () => inventoryTaxonomyOptions(items, { category, subcategory, family, pack }),
    [items, category, subcategory, family, pack],
  )
  const taxonomyFiltered = useMemo(
    () => filterInventoryByTaxonomy(items, { category, subcategory, family, pack }),
    [items, category, subcategory, family, pack],
  )
  const search = query.trim().toLowerCase()
  const scoped = useMemo(
    () => search ? items.filter((item) => inventoryTaxonomy(item).searchText.includes(search)) : taxonomyFiltered,
    [items, search, taxonomyFiltered],
  )
  const hasTaxonomyFilter = Boolean(category || subcategory || family || pack)
  const fullyVisible = expanded || Boolean(search) || hasTaxonomyFilter
  const shown = useMemo(() => visibleItems(scoped, { expanded: fullyVisible, query: '' }), [scoped, fullyVisible])
  const label = expansionLabel(scoped.length, expanded)
  const showSearch = needsSearch(items.length)

  function chooseCategory(value: string) {
    setCategory(value); setSubcategory(''); setFamily(''); setPack('')
  }

  function chooseSubcategory(value: string) {
    setSubcategory(value); setFamily(''); setPack('')
  }

  return (
    <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ocg-gold">{title}</h2>
        <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${STORE_TONE[tone] ?? STORE_TONE.general}`}>
          {items.length} SKU{items.length === 1 ? '' : 's'}
        </span>
      </div>

      {taxonomyOptions.categories.length > 1 && (
        <div className="mb-3 grid gap-2 sm:grid-cols-2">
          {taxonomyOptions.categories.map((option) => {
            const categoryItems = items.filter((item) => inventoryTaxonomy(item).categoryKey === option.value)
            const total = compatibleTotal(categoryItems)
            return (
              <button key={option.value} type="button" onClick={() => chooseCategory(category === option.value ? '' : option.value)}
                className={`rounded-lg border px-3 py-2 text-left transition-colors ${category === option.value ? 'border-ocg-gold bg-amber-50/40' : 'border-gray-100 hover:border-ocg-gold/40'}`}>
                <span className="block text-xs font-semibold text-gray-700">{option.label}</span>
                <span className="block text-[11px] text-gray-400">
                  {option.count} SKU{option.count === 1 ? '' : 's'}
                  {total ? ` · ${formatInventoryNumber(total.quantity)} ${total.unit}` : ''}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {showSearch && (
        <label className="mb-2 flex items-center gap-2 rounded-lg border border-gray-200 px-2.5 py-1.5">
          <Search size={13} className="shrink-0 text-gray-400" />
          <input className="w-full border-0 p-0 text-sm outline-none placeholder:text-gray-400 focus:ring-0"
            placeholder={`Search all ${title.toLowerCase()} items`}
            value={query} onChange={(event) => setQuery(event.target.value)} aria-label={`Search ${title}`} />
        </label>
      )}

      {!search && category && taxonomyOptions.subcategories.length > 1 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          <button type="button" onClick={() => chooseSubcategory('')}
            className={`rounded-full border px-2.5 py-1 text-[11px] ${!subcategory ? 'border-ocg-navy bg-ocg-navy text-white' : 'border-gray-200 text-gray-500'}`}>All</button>
          {taxonomyOptions.subcategories.map((option) => (
            <button key={option.value} type="button" onClick={() => chooseSubcategory(option.value)}
              className={`rounded-full border px-2.5 py-1 text-[11px] ${subcategory === option.value ? 'border-ocg-navy bg-ocg-navy text-white' : 'border-gray-200 text-gray-500'}`}>
              {option.label} · {option.count}
            </button>
          ))}
        </div>
      )}

      {!search && (tone === 'finished_goods' || category === 'stickers')
        && (taxonomyOptions.families.length > 1 || taxonomyOptions.packs.length > 1) && (
        <div className="mb-3 grid gap-2 sm:grid-cols-2">
          {taxonomyOptions.families.length > 1 && (
            <select className="input py-1.5 text-xs" value={family} onChange={(event) => { setFamily(event.target.value); setPack('') }} aria-label={`${title} product family`}>
              <option value="">All product families</option>
              {taxonomyOptions.families.map((option) => <option key={option.value} value={option.value}>{option.label} ({option.count})</option>)}
            </select>
          )}
          {(family || subcategory) && taxonomyOptions.packs.length > 1 && (
            <select className="input py-1.5 text-xs" value={pack} onChange={(event) => setPack(event.target.value)} aria-label={`${title} pack or size`}>
              <option value="">All packs / sizes</option>
              {taxonomyOptions.packs.map((option) => <option key={option.value} value={option.value}>{option.label} ({option.count})</option>)}
            </select>
          )}
        </div>
      )}

      {items.some((item) => inventoryTaxonomy(item).categoryKey === 'unclassified') && (
        <p className="mb-2 flex items-start gap-1.5 rounded-lg bg-amber-50 p-2 text-[11px] text-amber-700">
          <TriangleAlert size={12} className="mt-0.5 shrink-0" /> Unclassified inventory remains visible and needs master-data review.
        </p>
      )}

      {items.length === 0 ? (
        <p className="rounded-lg bg-gray-50 p-3 text-xs text-gray-500">Nothing classified into this store yet.</p>
      ) : shown.length === 0 ? (
        <p className="rounded-lg bg-gray-50 p-3 text-xs text-gray-500">No item matches the current filters.</p>
      ) : (
        <div className="max-h-[42rem] space-y-1.5 overflow-y-auto pr-1">
          {shown.map((item) => {
            const threshold = Number(item.minimumStock || item.reorderLevel || 0)
            const low = threshold > 0 && Number(item.quantity) <= threshold
            const hasBalance = item.opening != null
            const isFinished = item.item_type === 'finished_good'
            const taxonomy = inventoryTaxonomy(item)
            const displayName = isFinished && item.product_family
              ? `${item.product_family}${item.package_config ? ` — ${formatPackageConfiguration(item.package_config)}` : ''}` : item.name
            return (
              <div key={item.id} className="rounded-lg border border-gray-50 px-2.5 py-1.5 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate text-gray-800" title={item.name}>{displayName}</span>
                    {tone === 'packaging' && <span className="block truncate text-[10px] text-gray-400">{taxonomy.category} · {taxonomy.subcategory}</span>}
                    {hasBalance && (
                      <span className="block text-[11px] tabular-nums text-gray-400">
                        {isFinished ? (
                          <>open {inlineFinishedQuantity(item.opening ?? 0, item.pack_size)}<br />in {inlineFinishedQuantity(item.quantityIn ?? 0, item.pack_size)} · out {inlineFinishedQuantity(item.quantityOut ?? 0, item.pack_size)}</>
                        ) : (
                          <>open {formatInventoryNumber(item.opening ?? 0)} · <span className="text-emerald-600">+{formatInventoryNumber(item.quantityIn ?? 0)}</span>{' · '}<span className="text-red-600">−{formatInventoryNumber(item.quantityOut ?? 0)}</span></>
                        )}
                      </span>
                    )}
                    {item.usedBy && item.usedBy.length > 0 && (
                      <span className="mt-0.5 block text-[10px] leading-snug text-blue-600" title={item.usedBy.join(', ')}>Used by: {item.usedBy.join(' · ')}</span>
                    )}
                  </span>
                  {isFinished ? (
                    <FinishedGoodsQuantity totalPieces={Number(item.quantity)} packSize={Number(item.pack_size)} compact
                      className={`shrink-0 text-right text-sm font-semibold ${low ? 'text-amber-600' : 'text-gray-900'}`} />
                  ) : (
                    <span className={`shrink-0 text-sm font-semibold tabular-nums ${low ? 'text-amber-600' : 'text-gray-900'}`}>
                      {formatInventoryNumber(Number(item.quantity))} <span className="text-[10px] font-normal text-gray-400">{item.base_unit || item.unit}</span>
                    </span>
                  )}
                </div>
                {item.requirements && item.requirements.length > 0 && (
                  <details className="mt-1 text-[11px] text-gray-500">
                    <summary className="cursor-pointer font-medium text-emerald-700">Packaging requirements ({item.requirements.length})</summary>
                    <ul className="mt-1 space-y-0.5 pl-3">
                      {item.requirements.map((requirement) => (
                        <li key={requirement.id}>{requirement.role}: {requirement.componentName}{requirement.selectionMode === 'one_of' ? ' (compatible option)' : ''}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )
          })}
        </div>
      )}

      {label && !search && !hasTaxonomyFilter && (
        <button type="button" onClick={() => setExpanded((value) => !value)}
          className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:border-ocg-gold/40 hover:text-ocg-gold" aria-expanded={expanded}>
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />} {label}
        </button>
      )}

      {(search || hasTaxonomyFilter) && (
        <p className="mt-2 text-center text-[11px] text-gray-400">
          {shown.length} of {items.length} shown ·{' '}
          <button type="button" onClick={() => { setQuery(''); chooseCategory('') }} className="font-medium text-ocg-gold hover:underline">clear filters</button>
        </p>
      )}
    </section>
  )
}
