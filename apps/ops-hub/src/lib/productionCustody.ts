import type {
  InventoryDisposalLossEventRow,
  InventoryItemRow,
  InventoryQualityIncidentRow,
  ProductionCustodyEventRow,
  ProductionRecoveredPackagingRow,
} from '@ocg/db'
import { toInventoryBaseQuantity } from './inventoryUnits'
import { db, mintReference, nowIso } from './serverClient'
import { scopedBrandIds } from './stockCards'

export type ProductionCustodyState =
  | 'materials'
  | 'packaging'
  | 'recovered_packaging'
  | 'bulk_wip'
  | 'packaged_output'
  | 'quality_hold'
  | 'rework'

export interface ProductionCustodyBalance {
  brand_id: string | null
  production_store_id: string | null
  item_id: string
  item_name: string
  sku: string
  batch_number: string
  custody_state: ProductionCustodyState
  unit: string
  quantity: number
  equivalent_quantity: number | null
  equivalent_unit: string
  first_received_at: string | null
  last_event_at: string
  latest_run_id: string | null
  latest_source_document_type: string
  latest_source_document_id: string | null
}

export interface CompanyCustodyPosition {
  brand_id: string | null
  item_id: string
  item_name: string
  sku: string
  batch_number: string
  custody_type: string
  custody_id: string | null
  custody_label: string
  quantity: number
  unit: string
  equivalent_quantity: number | null
  equivalent_unit: string
  active_custody: boolean
  last_event_at: string
}

type RpcResult<T> = Promise<{ data: T | null; error: { message: string } | null }>

function rpc<T>(name: string, args: Record<string, unknown>): RpcResult<T> {
  return (db().rpc as unknown as (fn: string, values: Record<string, unknown>) => RpcResult<T>)(name, args)
}

export function productionStateForItem(item: Pick<InventoryItemRow, 'item_type'>): ProductionCustodyState {
  return item.item_type === 'packaging' ? 'packaging' : 'materials'
}

export async function resolveProductionStore(brandId: string | null, explicitId?: string | null): Promise<string> {
  let query = db().from('inventory_stores').select('id,brand_id').eq('active', true).eq('store_type', 'production')
  if (explicitId) query = query.eq('id', explicitId)
  if (brandId) query = query.eq('brand_id', brandId)
  const { data, error } = await query.order('created_at', { ascending: true }).limit(2)
  if (error) throw new Error(error.message)
  const rows = (data as Array<{ id: string; brand_id: string | null }> | null) ?? []
  if (rows.length === 0) throw new Error('Create an active Production store for this brand before posting custody movements.')
  if (!explicitId && rows.length > 1) throw new Error('Choose the Production store; more than one active Production store is configured.')
  return rows[0]!.id
}

export async function listProductionCustody(
  allowed: string[] | null,
  opts: { brandId?: string; state?: ProductionCustodyState; itemId?: string; limit?: number } = {},
): Promise<ProductionCustodyBalance[]> {
  const brands = scopedBrandIds(allowed, opts.brandId)
  // Views are intentionally read through a narrow cast until generated
  // Supabase view types are refreshed after migration execution.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (db() as any).from('production_custody_balances').select('*')
    .order('last_event_at', { ascending: false }).limit(opts.limit ?? 500)
  if (brands !== null) query = query.in('brand_id', brands)
  if (opts.state) query = query.eq('custody_state', opts.state)
  if (opts.itemId) query = query.eq('item_id', opts.itemId)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return ((data as ProductionCustodyBalance[] | null) ?? []).map((row) => ({
    ...row,
    quantity: Number(row.quantity ?? 0),
    equivalent_quantity: row.equivalent_quantity == null ? null : Number(row.equivalent_quantity),
  }))
}

export async function listCompanyCustody(
  allowed: string[] | null,
  opts: { brandId?: string; itemId?: string; activeOnly?: boolean; limit?: number } = {},
): Promise<CompanyCustodyPosition[]> {
  const brands = scopedBrandIds(allowed, opts.brandId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (db() as any).from('inventory_company_custody_positions').select('*')
    .order('item_name').order('custody_type').limit(opts.limit ?? 1000)
  if (brands !== null) query = query.in('brand_id', brands)
  if (opts.itemId) query = query.eq('item_id', opts.itemId)
  if (opts.activeOnly) query = query.eq('active_custody', true)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return ((data as CompanyCustodyPosition[] | null) ?? []).map((row) => ({
    ...row,
    quantity: Number(row.quantity ?? 0),
    equivalent_quantity: row.equivalent_quantity == null ? null : Number(row.equivalent_quantity),
  }))
}

export async function listProductionCustodyEvents(
  opts: { runId?: string; incidentId?: string; itemId?: string; limit?: number } = {},
): Promise<ProductionCustodyEventRow[]> {
  let query = db().from('production_custody_events').select('*')
    .order('effective_at', { ascending: false }).limit(opts.limit ?? 200)
  if (opts.runId) query = query.eq('production_run_id', opts.runId)
  if (opts.incidentId) query = query.eq('quality_incident_id', opts.incidentId)
  if (opts.itemId) query = query.eq('item_id', opts.itemId)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data as ProductionCustodyEventRow[] | null) ?? []
}

export async function recordProductionCustodyEvent(input: {
  item_id: string
  production_store_id?: string | null
  batch_number?: string
  custody_state: ProductionCustodyState
  direction: 'in' | 'out'
  event_kind: string
  quantity: number
  unit: string
  source_custody?: string
  destination_custody?: string
  source_store_id?: string | null
  destination_store_id?: string | null
  salesperson_id?: string | null
  allocation_id?: string | null
  production_run_id?: string | null
  quality_incident_id?: string | null
  source_document_type?: string
  source_document_id?: string | null
  source_document_line_id?: string | null
  reason?: string
  effective_at?: string
  recorded_by: string
  recorded_by_id?: string | null
  approved_by?: string
  approved_by_id?: string | null
  idempotency_key: string
  metadata?: Record<string, unknown>
}): Promise<ProductionCustodyEventRow> {
  if (!(Number(input.quantity) > 0)) throw new Error('Custody quantity must be greater than zero.')
  const { data: item, error: itemError } = await db().from('inventory_items').select('*').eq('id', input.item_id).single()
  if (itemError || !item) throw new Error(itemError?.message ?? 'Inventory item not found.')
  const stock = item as InventoryItemRow
  const baseUnit = stock.base_unit || stock.unit || input.unit
  const baseQuantity = toInventoryBaseQuantity(Number(input.quantity), input.unit, baseUnit)
  const productionStoreId = await resolveProductionStore(stock.brand_id, input.production_store_id)
  const equivalent = Number(stock.size_ml ?? 0) > 0
    ? baseQuantity * Number(stock.size_ml) / 1000
    : null
  const { data, error } = await rpc<ProductionCustodyEventRow>('post_production_custody_event', {
    p_brand_id: stock.brand_id,
    p_production_store_id: productionStoreId,
    p_item_id: stock.id,
    p_batch_number: input.batch_number ?? '',
    p_custody_state: input.custody_state,
    p_direction: input.direction,
    p_event_kind: input.event_kind,
    p_quantity: Number(input.quantity),
    p_unit: input.unit,
    p_base_quantity: baseQuantity,
    p_base_unit: baseUnit,
    p_equivalent_quantity: equivalent,
    p_equivalent_unit: equivalent == null ? '' : 'litres',
    p_source_custody: input.source_custody ?? '',
    p_destination_custody: input.destination_custody ?? '',
    p_source_store_id: input.source_store_id ?? null,
    p_destination_store_id: input.destination_store_id ?? null,
    p_salesperson_id: input.salesperson_id ?? null,
    p_allocation_id: input.allocation_id ?? null,
    p_production_run_id: input.production_run_id ?? null,
    p_quality_incident_id: input.quality_incident_id ?? null,
    p_source_document_type: input.source_document_type ?? '',
    p_source_document_id: input.source_document_id ?? null,
    p_source_document_line_id: input.source_document_line_id ?? null,
    p_reason: input.reason ?? '',
    p_effective_at: input.effective_at ?? nowIso(),
    p_recorded_by: input.recorded_by,
    p_recorded_by_id: input.recorded_by_id ?? null,
    p_approved_by: input.approved_by ?? '',
    p_approved_by_id: input.approved_by_id ?? null,
    p_idempotency_key: input.idempotency_key,
    p_metadata: input.metadata ?? {},
  })
  if (error || !data) throw new Error(error?.message ?? 'Production custody event was not recorded.')
  return data
}

/** Atomically posts one physical boundary crossing. The store leg updates the
 * compatibility store total; the opposite leg enters the Production ledger. */
export async function postStoreProductionTransfer(input: {
  item: InventoryItemRow
  store_id: string
  store_direction: 'in' | 'out'
  quantity: number
  movement_unit: string
  effective_at?: string
  reason: string
  reference: string
  source: 'goods_issue' | 'goods_transfer'
  goods_issue_id: string
  issue_item_id: string
  production_run_id?: string | null
  batch_number?: string
  production_store_id?: string | null
  production_state: ProductionCustodyState
  production_event_kind: 'gin_receipt' | 'gtn_receipt' | 'gtn_transfer' | 'return_to_store'
  source_custody: string
  destination_custody: string
  quality_incident_id?: string | null
  recorded_by: string
  recorded_by_id?: string | null
  idempotency_key: string
}): Promise<{ inventory_movement_id: string; production_event_id: string }> {
  const baseUnit = input.item.base_unit || input.item.unit || input.movement_unit
  const baseQuantity = toInventoryBaseQuantity(Number(input.quantity), input.movement_unit, baseUnit)
  const conversionRate = baseQuantity / Number(input.quantity)
  const productionStoreId = await resolveProductionStore(input.item.brand_id, input.production_store_id)
  const productionDirection = input.store_direction === 'out' ? 'in' : 'out'
  const { data, error } = await rpc<{ inventory_movement_id: string; production_event_id: string }>('post_store_production_transfer', {
    p_item_id: input.item.id,
    p_store_id: input.store_id,
    p_store_direction: input.store_direction,
    p_quantity: Number(input.quantity),
    p_movement_unit: input.movement_unit,
    p_conversion_rate: conversionRate,
    p_base_quantity: baseQuantity,
    p_effective_at: input.effective_at ?? nowIso(),
    p_reason: input.reason,
    p_reference: input.reference,
    p_source: input.source,
    p_goods_issue_id: input.goods_issue_id,
    p_issue_item_id: input.issue_item_id,
    p_production_run_id: input.production_run_id ?? null,
    p_batch_number: input.batch_number ?? '',
    p_production_store_id: productionStoreId,
    p_production_state: input.production_state,
    p_production_direction: productionDirection,
    p_production_event_kind: input.production_event_kind,
    p_source_custody: input.source_custody,
    p_destination_custody: input.destination_custody,
    p_quality_incident_id: input.quality_incident_id ?? null,
    p_recorded_by: input.recorded_by,
    p_recorded_by_id: input.recorded_by_id ?? null,
    p_idempotency_key: input.idempotency_key,
  })
  if (error || !data) throw new Error(error?.message ?? 'Store/Production transfer was not posted.')
  return data
}

/** Allocate stock already held by Production to a linked rework run.
 * The database posts the OUT, IN and run-material link in one transaction. */
export async function stageProductionForRework(input: {
  item_id: string
  production_store_id?: string | null
  batch_number?: string
  source_state: ProductionCustodyState
  quantity: number
  unit: string
  production_run_id: string
  quality_incident_id?: string | null
  reason: string
  recorded_by: string
  recorded_by_id?: string | null
  idempotency_key: string
}): Promise<{ out_event_id: string; in_event_id: string }> {
  if (!(Number(input.quantity) > 0)) throw new Error('Staged WIP quantity must be greater than zero.')
  if (!input.reason.trim()) throw new Error('Record why this Production position is entering rework.')
  const { data: item, error: itemError } = await db().from('inventory_items').select('*').eq('id', input.item_id).single()
  if (itemError || !item) throw new Error(itemError?.message ?? 'Inventory item not found.')
  const stock = item as InventoryItemRow
  const baseUnit = stock.base_unit || stock.unit || input.unit
  const baseQuantity = toInventoryBaseQuantity(Number(input.quantity), input.unit, baseUnit)
  const productionStoreId = await resolveProductionStore(stock.brand_id, input.production_store_id)
  const { data, error } = await rpc<{ out_event_id: string; in_event_id: string }>('post_production_state_transfer', {
    p_item_id: stock.id,
    p_production_store_id: productionStoreId,
    p_batch_number: input.batch_number ?? '',
    p_source_state: input.source_state,
    p_destination_state: ['materials', 'packaging', 'recovered_packaging'].includes(input.source_state)
      ? input.source_state
      : 'rework',
    p_quantity: Number(input.quantity),
    p_unit: input.unit,
    p_base_quantity: baseQuantity,
    p_production_run_id: input.production_run_id,
    p_quality_incident_id: input.quality_incident_id ?? null,
    p_reason: input.reason,
    p_effective_at: nowIso(),
    p_recorded_by: input.recorded_by,
    p_recorded_by_id: input.recorded_by_id ?? null,
    p_idempotency_key: input.idempotency_key,
  })
  if (error || !data) throw new Error(error?.message ?? 'Production WIP was not staged for rework.')
  return data
}

export async function createQualityIncident(input: {
  brand_id: string | null
  item_id: string
  batch_number?: string
  custody_type: InventoryQualityIncidentRow['custody_type']
  custody_store_id?: string | null
  salesperson_id?: string | null
  affected_quantity: number
  unit: string
  reason_category: string
  description: string
  evidence?: unknown[]
  source_document_type?: string
  source_document_id?: string | null
  source_allocation_id?: string | null
  reported_by: string
  reported_by_id?: string | null
}): Promise<InventoryQualityIncidentRow> {
  if (!(Number(input.affected_quantity) > 0)) throw new Error('Affected quantity must be greater than zero.')
  if (!input.reason_category.trim() || !input.description.trim()) throw new Error('Reason category and description are required.')
  const { data: item, error: itemError } = await db().from('inventory_items').select('brand_id,base_unit,unit,size_ml').eq('id', input.item_id).single()
  if (itemError || !item) throw new Error(itemError?.message ?? 'Inventory item not found.')
  if ((item.brand_id ?? null) !== (input.brand_id ?? null)) throw new Error('The quality incident and inventory item must belong to the same brand.')
  const itemUnit = item.base_unit || item.unit || ''
  if (itemUnit && input.unit && itemUnit.toLowerCase() !== input.unit.toLowerCase()) {
    throw new Error(`Record the affected quantity in the item's base unit (${itemUnit}).`)
  }
  const ref = await mintReference('quality_incident', 'QI-')
  const equivalentQuantity = Number(item.size_ml ?? 0) > 0
    ? Number(input.affected_quantity) * Number(item.size_ml) / 1000
    : null
  const { data, error } = await db().from('inventory_quality_incidents').insert({
    ...input,
    incident_ref: ref,
    batch_number: input.batch_number ?? '',
    evidence: input.evidence ?? [],
    equivalent_quantity: equivalentQuantity,
    equivalent_unit: equivalentQuantity == null ? '' : 'litres',
    status: 'reported',
  }).select('*').single()
  if (error) throw new Error(error.message)
  return data as InventoryQualityIncidentRow
}

export async function approveQualityDisposition(input: {
  incident_id: string
  disposition: Exclude<InventoryQualityIncidentRow['disposition'], ''>
  disposition_note: string
  reviewer: string
  reviewer_id?: string | null
}): Promise<InventoryQualityIncidentRow> {
  if (!input.disposition_note.trim()) throw new Error('Record the approved disposition rationale.')
  const now = nowIso()
  const { data, error } = await db().from('inventory_quality_incidents').update({
    status: 'disposition_approved',
    disposition: input.disposition,
    disposition_note: input.disposition_note.trim(),
    reviewed_by: input.reviewer,
    reviewed_by_id: input.reviewer_id ?? null,
    reviewed_at: now,
    disposition_approved_by: input.reviewer,
    disposition_approved_by_id: input.reviewer_id ?? null,
    disposition_approved_at: now,
    updated_at: now,
  }).eq('id', input.incident_id).in('status', ['reported', 'under_review']).select('*').single()
  if (error) throw new Error(error.message)
  return data as InventoryQualityIncidentRow
}

export async function disposeProductionCustody(input: {
  item_id: string
  production_store_id?: string | null
  batch_number?: string
  custody_state: ProductionCustodyState
  quantity: number
  unit: string
  quality_incident_id: string
  production_run_id?: string | null
  reason: string
  valuation_basis?: string
  unit_value_ksh?: number
  recorded_by: string
  recorded_by_id?: string | null
  approved_by: string
  approved_by_id?: string | null
  idempotency_key: string
}): Promise<{ loss_id: string; production_event_id: string }> {
  const { data: item, error: itemError } = await db().from('inventory_items').select('*').eq('id', input.item_id).single()
  if (itemError || !item) throw new Error(itemError?.message ?? 'Inventory item not found.')
  const stock = item as InventoryItemRow
  const baseUnit = stock.base_unit || stock.unit || input.unit
  const baseQuantity = toInventoryBaseQuantity(Number(input.quantity), input.unit, baseUnit)
  const productionStoreId = await resolveProductionStore(stock.brand_id, input.production_store_id)
  const { data, error } = await rpc<{ loss_id: string; production_event_id: string }>('post_production_disposal', {
    p_item_id: input.item_id,
    p_production_store_id: productionStoreId,
    p_batch_number: input.batch_number ?? '',
    p_custody_state: input.custody_state,
    p_quantity: Number(input.quantity),
    p_unit: input.unit,
    p_base_quantity: baseQuantity,
    p_quality_incident_id: input.quality_incident_id,
    p_production_run_id: input.production_run_id ?? null,
    p_reason: input.reason,
    p_effective_at: nowIso(),
    p_recorded_by: input.recorded_by,
    p_recorded_by_id: input.recorded_by_id ?? null,
    p_approved_by: input.approved_by,
    p_approved_by_id: input.approved_by_id ?? null,
    p_valuation_basis: input.valuation_basis ?? 'current_reference_cost',
    p_unit_value_ksh: input.unit_value_ksh ?? stock.unit_value_ksh,
    p_idempotency_key: input.idempotency_key,
  })
  if (error || !data) throw new Error(error?.message ?? 'Disposal was not posted.')
  return data
}

export async function recallFieldSalesToProduction(input: {
  salesperson_id: string
  item_id: string
  quantity: number
  batch_number?: string
  allocation_id?: string | null
  quality_incident_id: string
  production_store_id?: string | null
  recorded_by: string
  recorded_by_id?: string | null
  idempotency_key: string
}): Promise<{ field_event_id: string; production_event_id: string }> {
  const { data: item, error: itemError } = await db().from('inventory_items').select('brand_id').eq('id', input.item_id).single()
  if (itemError || !item) throw new Error(itemError?.message ?? 'Inventory item not found.')
  const productionStoreId = await resolveProductionStore(item.brand_id, input.production_store_id)
  const { data, error } = await rpc<{ field_event_id: string; production_event_id: string }>('post_field_sales_quality_recall', {
    p_salesperson_id: input.salesperson_id,
    p_item_id: input.item_id,
    p_quantity: Number(input.quantity),
    p_batch_number: input.batch_number ?? '',
    p_allocation_id: input.allocation_id ?? null,
    p_quality_incident_id: input.quality_incident_id,
    p_production_store_id: productionStoreId,
    p_effective_at: nowIso(),
    p_recorded_by: input.recorded_by,
    p_recorded_by_id: input.recorded_by_id ?? null,
    p_idempotency_key: input.idempotency_key,
  })
  if (error || !data) throw new Error(error?.message ?? 'Quality recall was not posted.')
  return data
}

export async function listQualityIncidents(allowed: string[] | null, brandId?: string): Promise<InventoryQualityIncidentRow[]> {
  const brands = scopedBrandIds(allowed, brandId)
  let query = db().from('inventory_quality_incidents').select('*').order('incident_at', { ascending: false }).limit(250)
  if (brands !== null) query = query.in('brand_id', brands)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data as InventoryQualityIncidentRow[] | null) ?? []
}

export async function listDisposalLosses(allowed: string[] | null, brandId?: string): Promise<InventoryDisposalLossEventRow[]> {
  const brands = scopedBrandIds(allowed, brandId)
  let query = db().from('inventory_disposal_loss_events').select('*').order('created_at', { ascending: false }).limit(250)
  if (brands !== null) query = query.in('brand_id', brands)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data as InventoryDisposalLossEventRow[] | null) ?? []
}

export async function listRecoveredPackaging(runId: string): Promise<ProductionRecoveredPackagingRow[]> {
  const { data, error } = await db().from('production_recovered_packaging').select('*')
    .eq('production_run_id', runId).order('created_at')
  if (error) throw new Error(error.message)
  return (data as ProductionRecoveredPackagingRow[] | null) ?? []
}

export async function recordRecoveredPackaging(input: {
  production_run_id: string
  quality_incident_id?: string | null
  source_item_id?: string | null
  source_batch_number?: string
  component_item_id: string
  component_kind: string
  quantity: number
  unit?: string
  condition_status: ProductionRecoveredPackagingRow['condition_status']
  notes?: string
  recorded_by: string
  recorded_by_id?: string | null
  production_store_id?: string | null
  idempotency_key: string
}): Promise<ProductionRecoveredPackagingRow> {
  if (!(Number(input.quantity) > 0)) throw new Error('Recovered packaging quantity must be greater than zero.')
  if (input.condition_status === 'disposed') {
    throw new Error('Use an approved disposal action so the packaging loss receives a quantity and value history.')
  }
  const { data: run, error: runError } = await db().from('production_runs').select('brand_id').eq('id', input.production_run_id).single()
  if (runError || !run) throw new Error(runError?.message ?? 'Production run not found.')
  const productionStoreId = await resolveProductionStore(run.brand_id, input.production_store_id)
  const { data, error } = await rpc<ProductionRecoveredPackagingRow>('post_recovered_packaging', {
    p_production_run_id: input.production_run_id,
    p_quality_incident_id: input.quality_incident_id ?? null,
    p_source_item_id: input.source_item_id ?? null,
    p_source_batch_number: input.source_batch_number ?? '',
    p_component_item_id: input.component_item_id,
    p_component_kind: input.component_kind || 'other',
    p_quantity: Number(input.quantity),
    p_unit: input.unit ?? 'pcs',
    p_condition_status: input.condition_status,
    p_production_store_id: productionStoreId,
    p_notes: input.notes ?? '',
    p_recorded_by: input.recorded_by,
    p_recorded_by_id: input.recorded_by_id ?? null,
    p_idempotency_key: input.idempotency_key,
  })
  if (error || !data) throw new Error(error?.message ?? 'Recovered packaging was not recorded.')
  return data
}
