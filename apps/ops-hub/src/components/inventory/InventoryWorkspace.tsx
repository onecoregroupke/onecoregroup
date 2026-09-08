'use client'

import { useDeferredValue, useMemo, useState } from 'react'
import { Download, Settings2, TriangleAlert, X } from 'lucide-react'
import type { InventoryItemRow, InventoryMovementRow, InventoryPriceHistoryRow } from '@ocg/db'
import { api } from '@/lib/apiClient'
import { getClient } from '@/lib/supabase'
import {
  filterInventoryByTaxonomy,
  inventoryBreadcrumb,
  inventoryTaxonomy,
  serializeInventoryClassifications,
  toggleInventoryClassification,
} from '@/lib/inventoryTaxonomy'
import {
  MANAGEMENT_PRODUCT_FAMILIES,
  monthPrice,
  normalizeDisplayNomenclature,
  trailingMonths,
} from '@/lib/inventoryPresentation'
import { FinishedGoodsQuantity } from './FinishedGoodsQuantity'

type PriceType = InventoryPriceHistoryRow['price_type']

export function InventoryWorkspace({
  brand,
  initialItems,
  movements,
  initialClassifications,
  initialFamily,
  canEdit,
}: {
  brand: { id: string; slug: string; name: string }
  initialItems: InventoryItemRow[]
  movements: InventoryMovementRow[]
  initialClassifications: string[]
  initialFamily: string
  canEdit: boolean
}) {
  const [items, setItems] = useState(initialItems)
  const [classifications, setClassifications] = useState(initialClassifications)
  const [family, setFamily] = useState(initialFamily)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const deferredClassifications = useDeferredValue(classifications)
  const deferredFamily = useDeferredValue(family)

  const categoryGroups = useMemo(() => {
    const groups = new Map<string, { key: string; label: string; count: number; value: number }>()
    for (const item of items) {
      const taxonomy = inventoryTaxonomy(item)
      const current = groups.get(taxonomy.categoryKey) ?? { key: taxonomy.categoryKey, label: taxonomy.category, count: 0, value: 0 }
      current.count += 1
      current.value += Number(item.quantity) * Number(item.unit_value_ksh)
      groups.set(taxonomy.categoryKey, current)
    }
    return [...groups.values()]
  }, [items])

  const familyOptions = useMemo(() => {
    const classified = filterInventoryByTaxonomy(items, { categories: deferredClassifications })
    const available = new Set(classified.map((item) => inventoryTaxonomy(item).family).filter(Boolean))
    const ordered = MANAGEMENT_PRODUCT_FAMILIES.filter((value) => available.has(value)) as readonly string[]
    const remaining = [...available].filter((value) => !MANAGEMENT_PRODUCT_FAMILIES.includes(value as typeof MANAGEMENT_PRODUCT_FAMILIES[number])).sort()
    return [...ordered, ...remaining]
  }, [deferredClassifications, items])
  const visibleItems = useMemo(() => filterInventoryByTaxonomy(items, {
    categories: deferredClassifications,
    family: deferredFamily || undefined,
  }), [deferredClassifications, deferredFamily, items])
  const visibleIds = useMemo(() => new Set(visibleItems.map((item) => item.id)), [visibleItems])
  const visibleMovements = useMemo(() => movements.filter((movement) => visibleIds.has(movement.item_id)), [movements, visibleIds])
  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])
  const selected = selectedId ? itemById.get(selectedId) ?? null : null

  function setFilter(nextClassifications: string[], nextFamily = family) {
    setClassifications(nextClassifications)
    setFamily(nextFamily)
    const params = new URLSearchParams(window.location.search)
    const serialized = serializeInventoryClassifications(nextClassifications)
    if (serialized) params.set('classifications', serialized); else params.delete('classifications')
    if (nextFamily) params.set('family', nextFamily); else params.delete('family')
    window.history.replaceState(null, '', `${window.location.pathname}${params.size ? `?${params}` : ''}`)
  }

  function replaceItem(item: InventoryItemRow) {
    setItems((current) => current.map((row) => row.id === item.id ? item : row))
  }

  return <div className="space-y-6">
    <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-xs font-semibold uppercase tracking-wider text-ocg-gold">Current-view filters</h2><p className="mt-1 text-xs text-gray-500">Filters update instantly and remain shareable in the URL.</p></div>
        <DownloadButton brandId={brand.id} classifications={classifications} family={family} />
      </div>
      <div className="flex flex-wrap gap-2">
        {categoryGroups.map((group) => {
          const active = classifications.includes(group.key)
          return <button key={group.key} onClick={() => setFilter(toggleInventoryClassification(classifications, group.key), '')} aria-pressed={active} className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${active ? 'border-ocg-navy bg-ocg-navy text-white' : 'border-gray-200 text-gray-700 hover:border-ocg-gold/50 hover:bg-gray-50'}`}><span>{group.label}</span><span className={`text-xs font-normal ${active ? 'text-white/70' : 'text-gray-400'}`}>{group.count} · KSh {group.value.toLocaleString()}</span></button>
        })}
        {(classifications.length > 0 || family) ? <button onClick={() => setFilter([], '')} className="min-h-11 px-2 text-xs font-medium text-gray-500 underline underline-offset-4">Clear filters</button> : null}
      </div>
      {familyOptions.length > 0 ? <label className="mt-4 block max-w-xs"><span className="mb-1 block text-xs font-medium text-gray-500">Product family</span><select className="input" value={family} onChange={(event) => setFilter(classifications, event.target.value)}><option value="">All product families</option>{familyOptions.map((value) => <option key={value}>{value}</option>)}</select></label> : null}
      <p className="mt-3 text-xs text-gray-500">Showing {visibleItems.length} of {items.length} items</p>
    </section>

    <section className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-5 py-4"><h2 className="text-xs font-semibold uppercase tracking-wider text-ocg-gold">Stock register</h2><p className="mt-1 text-xs text-gray-500">Packaging is shown as individual pieces; finished goods retain their pack configuration.</p></div>
      {visibleItems.length === 0 ? <p className="p-6 text-sm text-gray-500">No inventory items match the current view.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[880px] text-sm"><thead><tr className="border-b border-gray-100 bg-gray-50 text-left text-[11px] uppercase tracking-wider text-gray-400"><Th>Item</Th><Th>Classification</Th><Th right>In stock</Th><Th right>Minimum / production / maximum</Th><Th right>Reference / prices</Th><Th right>Estimated value</Th><Th /></tr></thead><tbody className="divide-y divide-gray-50">{visibleItems.map((item) => {
        const minimum = Number(item.minimum_stock || item.reorder_level || 0)
        const low = minimum > 0 && Number(item.quantity) <= minimum
        return <tr key={item.id} className="hover:bg-gray-50"><Td><button className="text-left" onClick={() => setSelectedId(item.id)}><span className="font-medium text-gray-800 hover:text-ocg-gold">{normalizeDisplayNomenclature(item.display_name || item.name)}</span><span className="block text-xs text-gray-400">{item.sku || 'No SKU'}</span></button></Td><Td className="text-xs text-gray-500">{inventoryBreadcrumb(item)}</Td><Td right className="font-medium text-gray-800">{quantity(item)}</Td><Td right className="text-xs text-gray-500">{minimum.toLocaleString()} / {Number(item.production_threshold || 0).toLocaleString()} / {item.maximum_stock == null ? '—' : Number(item.maximum_stock).toLocaleString()} {item.base_unit || item.unit}</Td><Td right className="text-xs text-gray-600">{prices(item)}</Td><Td right>{value(item)}</Td><Td right>{low ? <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700"><TriangleAlert size={11} /> Low</span> : null}<button aria-label={`Open ${item.name} details`} onClick={() => setSelectedId(item.id)} className="ml-2 rounded p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><Settings2 size={15} /></button></Td></tr>
      })}</tbody></table></div>}
    </section>

    <section className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm"><div className="border-b border-gray-100 px-5 py-4"><h2 className="text-xs font-semibold uppercase tracking-wider text-ocg-gold">Movement history</h2><p className="mt-1 text-xs text-gray-500">The latest ledger rows matching this current view.</p></div>{visibleMovements.length === 0 ? <p className="p-6 text-sm text-gray-500">No movements match the current view.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead><tr className="border-b border-gray-100 bg-gray-50 text-left text-[11px] uppercase tracking-wider text-gray-400"><Th>Date</Th><Th>Item</Th><Th right>In</Th><Th right>Out</Th><Th right>Stock after</Th><Th>Reason</Th><Th>By</Th></tr></thead><tbody className="divide-y divide-gray-50">{visibleMovements.map((movement) => { const item = itemById.get(movement.item_id); return <tr key={movement.id}><Td className="whitespace-nowrap text-gray-600">{movement.movement_date}</Td><Td>{item ? normalizeDisplayNomenclature(item.display_name || item.name) : '—'}</Td><Td right className="font-medium text-emerald-700">{movement.direction === 'in' ? movementQuantity(item, Number(movement.base_quantity ?? movement.quantity)) : ''}</Td><Td right className="font-medium text-red-700">{movement.direction === 'out' ? movementQuantity(item, Number(movement.base_quantity ?? movement.quantity)) : ''}</Td><Td right>{movement.quantity_after == null ? '—' : movementQuantity(item, Number(movement.quantity_after))}</Td><Td className="max-w-[220px] truncate text-gray-500">{movement.reason || movement.source}</Td><Td className="whitespace-nowrap text-gray-500">{movement.recorded_by || '—'}</Td></tr> })}</tbody></table></div>}</section>

    {selected ? <ItemDrawer item={selected} canEdit={canEdit} onClose={() => setSelectedId(null)} onChange={replaceItem} /> : null}
  </div>
}

function ItemDrawer({ item, canEdit, onClose, onChange }: { item: InventoryItemRow; canEdit: boolean; onClose: () => void; onChange: (item: InventoryItemRow) => void }) {
  const [history, setHistory] = useState<InventoryPriceHistoryRow[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [settings, setSettings] = useState({
    reorder_level: String(item.reorder_level ?? 0), minimum_stock: String(item.minimum_stock ?? 0),
    production_threshold: String(item.production_threshold ?? 0), maximum_stock: item.maximum_stock == null ? '' : String(item.maximum_stock),
    display_name: item.display_name ?? '', product_family: item.product_family ?? '', size_ml: item.size_ml == null ? '' : String(item.size_ml),
    packaging_component: item.packaging_component ?? '', sort_order: String(item.sort_order ?? 0),
  })
  const [price, setPrice] = useState({ price_type: 'supplier_reference_cost' as PriceType, amount_ksh: '', effective_date: new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' }), source_reference: '', supplier_name: '', notes: '' })

  async function loadHistory(force = false) {
    if (history && !force) return
    const result = await api<{ error?: string; history?: InventoryPriceHistoryRow[] }>(`/api/inventory?item=${encodeURIComponent(item.id)}`)
    if (!result.ok) setError(result.data.error ?? 'Could not load price history.'); else setHistory(result.data.history ?? [])
  }

  async function saveSettings() {
    setBusy(true); setError('')
    const result = await api<{ error?: string; item?: InventoryItemRow }>('/api/inventory', { method: 'POST', body: JSON.stringify({ action: 'item-settings', values: { item_id: item.id, ...settings } }) })
    setBusy(false)
    if (!result.ok || !result.data.item) setError(result.data.error ?? 'Could not save settings.'); else onChange(result.data.item)
  }

  async function savePrice() {
    setBusy(true); setError('')
    const result = await api<{ error?: string }>('/api/inventory', { method: 'POST', body: JSON.stringify({ action: 'price', values: { item_id: item.id, ...price, idempotency_key: crypto.randomUUID() } }) })
    setBusy(false)
    if (!result.ok) { setError(result.data.error ?? 'Could not record price.'); return }
    setPrice((current) => ({ ...current, amount_ksh: '', source_reference: '', notes: '' })); await loadHistory(true)
    const amount = Number(price.amount_ksh)
    onChange({ ...item, unit_value_ksh: price.price_type === 'supplier_reference_cost' ? amount : item.unit_value_ksh, selling_price_ksh: price.price_type === 'retail_selling_price' ? amount : item.selling_price_ksh, wholesale_price_ksh: price.price_type === 'wholesale_selling_price' ? amount : item.wholesale_price_ksh })
  }

  return <div className="fixed inset-0 z-50 flex justify-end bg-black/30" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}><aside className="h-full w-full max-w-2xl overflow-y-auto bg-white p-6 shadow-2xl" role="dialog" aria-modal="true" aria-label={`${item.name} inventory details`}><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-ocg-gold">Inventory item</p><h2 className="mt-1 text-xl font-semibold text-gray-900">{normalizeDisplayNomenclature(item.display_name || item.name)}</h2><p className="mt-1 text-sm text-gray-500">{inventoryBreadcrumb(item)} · {quantity(item)}</p></div><button onClick={onClose} aria-label="Close item details" className="rounded-lg p-2 text-gray-400 hover:bg-gray-100"><X size={18} /></button></div>
    {error ? <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p> : null}
    {canEdit ? <section className="mt-6 rounded-xl border border-gray-100 p-4"><h3 className="text-xs font-semibold uppercase tracking-wider text-ocg-gold">Stock and display settings</h3><div className="mt-3 grid gap-3 sm:grid-cols-2"><Input label="Minimum / reorder" value={settings.minimum_stock} set={(value) => setSettings({ ...settings, minimum_stock: value, reorder_level: value })} type="number" /><Input label="Production threshold" value={settings.production_threshold} set={(value) => setSettings({ ...settings, production_threshold: value })} type="number" /><Input label="Maximum level" value={settings.maximum_stock} set={(value) => setSettings({ ...settings, maximum_stock: value })} type="number" /><Input label="Display name" value={settings.display_name} set={(value) => setSettings({ ...settings, display_name: value })} /><label><span className="mb-1 block text-xs font-medium text-gray-500">Product family</span><select className="input" value={settings.product_family} onChange={(event) => setSettings({ ...settings, product_family: event.target.value })}><option value="">Unclassified</option>{MANAGEMENT_PRODUCT_FAMILIES.map((family) => <option key={family}>{family}</option>)}</select></label><Input label="Physical size (ml)" value={settings.size_ml} set={(value) => setSettings({ ...settings, size_ml: value })} type="number" /><label><span className="mb-1 block text-xs font-medium text-gray-500">Packaging component</span><select className="input" value={settings.packaging_component} onChange={(event) => setSettings({ ...settings, packaging_component: event.target.value })}>{['','bottle','container','closure','cork','cap','pump','front_sticker','back_sticker','other'].map((value) => <option key={value} value={value}>{value ? value.replace(/_/g, ' ') : 'Not applicable'}</option>)}</select></label><Input label="Sort order" value={settings.sort_order} set={(value) => setSettings({ ...settings, sort_order: value })} type="number" /></div><button disabled={busy} onClick={saveSettings} className="mt-3 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Save settings</button></section> : null}
    <section className="mt-5 rounded-xl border border-gray-100 p-4"><div className="flex items-center justify-between"><div><h3 className="text-xs font-semibold uppercase tracking-wider text-ocg-gold">Price history</h3><p className="mt-1 text-xs text-gray-500">Missing months carry the latest evidence forward for display only.</p></div><button onClick={() => void loadHistory()} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600">{history ? 'Refresh' : 'Load history'}</button></div>{history ? <PriceHistory history={history} /> : null}
    {canEdit ? <div className="mt-4 border-t border-gray-100 pt-4"><div className="grid gap-3 sm:grid-cols-2"><label><span className="mb-1 block text-xs font-medium text-gray-500">Price concept</span><select className="input" value={price.price_type} onChange={(event) => setPrice({ ...price, price_type: event.target.value as PriceType })}><option value="supplier_reference_cost">Reference cost</option><option value="retail_selling_price">Retail price</option><option value="wholesale_selling_price">Wholesale price</option></select></label><Input label="Amount (KSh)" value={price.amount_ksh} set={(value) => setPrice({ ...price, amount_ksh: value })} type="number" /><Input label="Effective date" value={price.effective_date} set={(value) => setPrice({ ...price, effective_date: value })} type="date" /><Input label="Source reference" value={price.source_reference} set={(value) => setPrice({ ...price, source_reference: value })} /><Input label="Supplier (optional)" value={price.supplier_name} set={(value) => setPrice({ ...price, supplier_name: value })} /><Input label="Notes" value={price.notes} set={(value) => setPrice({ ...price, notes: value })} /></div><button disabled={busy || !price.amount_ksh} onClick={savePrice} className="mt-3 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Record effective price</button></div> : null}</section>
  </aside></div>
}

function PriceHistory({ history }: { history: InventoryPriceHistoryRow[] }) {
  const months = trailingMonths(new Date().toISOString(), 3)
  return <div className="mt-4 space-y-4"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-[10px] uppercase text-gray-400"><th className="py-2">Price</th>{months.map((month) => <th key={month} className="py-2 text-right">{new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-KE', { month: 'short', year: 'numeric', timeZone: 'UTC' })}</th>)}</tr></thead><tbody>{(['supplier_reference_cost','retail_selling_price','wholesale_selling_price'] as PriceType[]).map((type) => <tr key={type} className="border-b border-gray-50"><td className="py-2 text-xs text-gray-600">{priceLabel(type)}</td>{months.map((month) => <td key={month} className="py-2 text-right">{monthPrice(history, type, month) ? `KSh ${Number(monthPrice(history, type, month)!.amount_ksh).toLocaleString()}` : '—'}</td>)}</tr>)}</tbody></table></div><div className="max-h-64 overflow-auto"><table className="w-full text-xs"><thead><tr className="text-left uppercase text-gray-400"><th className="py-2">Effective</th><th>Concept</th><th className="text-right">Amount</th><th>Evidence</th></tr></thead><tbody>{history.map((row) => <tr key={row.id} className="border-t border-gray-50"><td className="py-2">{row.effective_date}</td><td>{priceLabel(row.price_type)}</td><td className="text-right">KSh {Number(row.amount_ksh).toLocaleString()}</td><td className="pl-3">{row.source_reference || row.source_description || row.supplier_name || 'Recorded price'}</td></tr>)}</tbody></table></div></div>
}

function DownloadButton({ brandId, classifications, family }: { brandId: string; classifications: string[]; family: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function download() {
    setBusy(true)
    setError('')
    try {
      const session = await getClient().auth.getSession()
      const response = await fetch('/api/inventory/pdf', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(session.data.session?.access_token ? { Authorization: `Bearer ${session.data.session.access_token}` } : {}) }, body: JSON.stringify({ brand_id: brandId, classifications, family }) })
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? 'Could not generate the inventory PDF.')
      }
      const url = URL.createObjectURL(await response.blob())
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ?? 'inventory.pdf'; anchor.click(); URL.revokeObjectURL(url)
    } catch (cause) {
      setError((cause as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return <div className="text-right"><button onClick={download} disabled={busy} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"><Download size={15} /> {busy ? 'Preparing…' : 'Download PDF'}</button>{error ? <p className="mt-1 max-w-xs text-xs text-red-600">{error}</p> : null}</div>
}

function quantity(item: InventoryItemRow) { return item.item_type === 'finished_good' ? <FinishedGoodsQuantity totalPieces={Number(item.quantity)} packSize={Number(item.pack_size || 1)} /> : `${Number(item.quantity).toLocaleString()} ${item.item_type === 'packaging' ? 'pcs' : item.base_unit || item.unit}` }
function movementQuantity(item: InventoryItemRow | undefined, value: number) { return item?.item_type === 'finished_good' ? <FinishedGoodsQuantity totalPieces={value} packSize={Number(item.pack_size || 1)} compact /> : value.toLocaleString() }
function prices(item: InventoryItemRow) { return item.item_type === 'finished_good' ? <>Retail KSh {Number(item.selling_price_ksh).toLocaleString()}<span className="block text-[10px] text-gray-400">Wholesale KSh {Number(item.wholesale_price_ksh).toLocaleString()} · Cost KSh {Number(item.unit_value_ksh).toLocaleString()}</span></> : <>Ref cost KSh {Number(item.unit_value_ksh).toLocaleString()}</> }
function value(item: InventoryItemRow) { return `KSh ${(Number(item.quantity) * Number(item.unit_value_ksh)).toLocaleString()}` }
function priceLabel(type: PriceType) { return type === 'supplier_reference_cost' ? 'Reference cost' : type === 'retail_selling_price' ? 'Retail price' : 'Wholesale price' }
function Input({ label, value, set, type = 'text' }: { label: string; value: string; set: (value: string) => void; type?: string }) { return <label><span className="mb-1 block text-xs font-medium text-gray-500">{label}</span><input className="input" type={type} min={type === 'number' ? 0 : undefined} step={type === 'number' ? '0.01' : undefined} value={value} onChange={(event) => set(event.target.value)} /></label> }
function Th({ children, right = false }: { children?: React.ReactNode; right?: boolean }) { return <th className={`px-3 py-2 ${right ? 'text-right' : ''}`}>{children}</th> }
function Td({ children, right = false, className = '' }: { children: React.ReactNode; right?: boolean; className?: string }) { return <td className={`px-3 py-2.5 align-top ${right ? 'text-right' : ''} ${className}`}>{children}</td> }
