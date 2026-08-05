import { db, mintReference, nowIso } from './serverClient'
import { auditEvent } from './audit'
import type { NptActor } from './nptIntake'
import type { NptMovementRow } from '@ocg/db'

// =============================================================================
// Instrument movements — the digital July movement log.
//
// A movement is the only thing that changes where an instrument physically is:
// arriving at the destination writes `current_location` on the instrument, so
// "where is this piano" has one answer and one owner.
//
// Billable movements carry a fee and payment status; the record is the thing an
// invoice attaches to, so a moved-and-unpaid piano is findable.
// =============================================================================

export const MOVEMENT_TYPES = [
  { value: 'customer_pickup', label: 'Customer pickup' },
  { value: 'customer_delivery', label: 'Customer delivery' },
  { value: 'internal_transfer', label: 'Internal transfer' },
  { value: 'workshop_return', label: 'Workshop return' },
  { value: 'event_movement', label: 'Event movement' },
  { value: 'storage_movement', label: 'Storage movement' },
  { value: 'other', label: 'Other' },
] as const

export const MOVEMENT_STATUSES = [
  'requested',
  'scheduled',
  'crew_assigned',
  'in_transit',
  'delivered',
  'confirmed_received',
  'completed',
  'cancelled',
  'incident_reported',
] as const

export type MovementStatus = (typeof MOVEMENT_STATUSES)[number]

/** Statuses at which the instrument has physically arrived at the destination. */
const ARRIVED: MovementStatus[] = ['delivered', 'confirmed_received', 'completed']

export function movementHasArrived(status: string): boolean {
  return (ARRIVED as string[]).includes(status)
}

export function isMovementTerminal(status: string): boolean {
  return status === 'completed' || status === 'cancelled'
}

export async function getMovement(id: string): Promise<NptMovementRow | null> {
  if (!id) return null
  const { data } = await db().from('npt_movements').select('*').eq('id', id).maybeSingle()
  return (data as NptMovementRow | null) ?? null
}

export async function listMovements(
  opts: { status?: string; pianoId?: string; customerId?: string; unpaidOnly?: boolean; limit?: number } = {},
): Promise<NptMovementRow[]> {
  let q = db()
    .from('npt_movements')
    .select('*')
    .order('scheduled_at', { ascending: false, nullsFirst: false })
    .limit(opts.limit ?? 300)
  if (opts.status) q = q.eq('status', opts.status)
  if (opts.pianoId) q = q.eq('piano_id', opts.pianoId)
  if (opts.customerId) q = q.eq('customer_id', opts.customerId)
  const { data } = await q
  const rows = (data as NptMovementRow[] | null) ?? []
  return opts.unpaidOnly
    ? rows.filter((r) => r.fee_ksh != null && Number(r.fee_ksh) > 0 && r.payment_status !== 'paid')
    : rows
}

export async function createMovement(
  input: Partial<NptMovementRow> & { actor: NptActor },
): Promise<NptMovementRow> {
  const { actor, ...values } = input
  if (!(values.origin ?? '').trim() || !(values.destination ?? '').trim()) {
    throw new Error('A movement needs both an origin and a destination.')
  }
  const reference = await mintReference('npt_movement', 'MOV-')
  const { data, error } = await db()
    .from('npt_movements')
    .insert({
      ...values,
      reference,
      status: values.status || 'requested',
      created_by: actor.email,
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)

  await auditEvent({
    actor: { userId: actor.userId ?? '', email: actor.email, name: actor.name },
    action: 'create',
    entity_table: 'npt_movements',
    entity_id: (data as NptMovementRow).id,
    entity_label: reference,
    after_data: { origin: values.origin, destination: values.destination },
  })
  return data as NptMovementRow
}

/**
 * Move the movement along. On arrival the instrument's current_location is
 * updated to the destination — this is the single writer of that field.
 */
export async function changeMovementStatus(input: {
  movement_id: string
  to: MovementStatus
  actor: NptActor
  comment?: string
}): Promise<NptMovementRow> {
  const existing = await getMovement(input.movement_id)
  if (!existing) throw new Error('Movement not found')
  if (isMovementTerminal(existing.status)) {
    throw new Error(`A ${existing.status} movement can no longer be changed.`)
  }
  if (!(MOVEMENT_STATUSES as readonly string[]).includes(input.to)) {
    throw new Error(`"${input.to}" is not a movement status.`)
  }

  const now = nowIso()
  const update: Record<string, unknown> = { status: input.to, updated_at: now }
  if (input.to === 'in_transit' && !existing.departed_at) update.departed_at = now
  if (movementHasArrived(input.to) && !existing.arrived_at) update.arrived_at = now
  if (input.comment) update.notes = [existing.notes, input.comment].filter(Boolean).join('\n')

  const { data, error } = await db()
    .from('npt_movements')
    .update(update)
    .eq('id', existing.id)
    .select('*')
    .single()
  if (error) throw new Error(error.message)

  // Arrival is what actually relocates the instrument.
  if (movementHasArrived(input.to) && existing.piano_id) {
    await db()
      .from('npt_pianos')
      .update({ current_location: existing.destination, location: existing.destination, updated_at: now })
      .eq('id', existing.piano_id)
  }

  await auditEvent({
    actor: { userId: input.actor.userId ?? '', email: input.actor.email, name: input.actor.name },
    action: 'status',
    entity_table: 'npt_movements',
    entity_id: existing.id,
    entity_label: existing.reference ?? existing.id,
    before_data: { status: existing.status },
    after_data: { status: input.to },
  })
  return data as NptMovementRow
}

export async function recordMovementPayment(input: {
  movement_id: string
  payment_status: 'unpaid' | 'partial' | 'paid' | 'not_billable'
  payment_reference?: string
  actor: NptActor
}): Promise<NptMovementRow> {
  const existing = await getMovement(input.movement_id)
  if (!existing) throw new Error('Movement not found')
  const { data, error } = await db()
    .from('npt_movements')
    .update({
      payment_status: input.payment_status,
      payment_reference: input.payment_reference ?? existing.payment_reference,
      updated_at: nowIso(),
    })
    .eq('id', existing.id)
    .select('*')
    .single()
  if (error) throw new Error(error.message)

  await auditEvent({
    actor: { userId: input.actor.userId ?? '', email: input.actor.email, name: input.actor.name },
    action: 'update',
    entity_table: 'npt_movements',
    entity_id: existing.id,
    entity_label: existing.reference ?? existing.id,
    before_data: { payment_status: existing.payment_status },
    after_data: { payment_status: input.payment_status },
  })
  return data as NptMovementRow
}
