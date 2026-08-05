import { db, mintReference, nowIso } from './serverClient'
import { auditEvent } from './audit'
import type { NptIntakeItemRow, NptIntakeRow, NptRepairCaseRow } from '@ocg/db'

/** Narrow actor shape the NPT services need — satisfied by the route's Actor. */
export type NptActor = { userId?: string; email: string; name: string }

function auditActor(actor: NptActor) {
  return { userId: actor.userId ?? '', email: actor.email, name: actor.name }
}

// =============================================================================
// NPT instrument intake — the digital Instrument Repair Receiving Form.
//
// An intake is a DRAFT while the counter form is being filled, and only becomes
// a real operational record when it is received. Receiving is the single point
// at which downstream records are materialised:
//
//   customer (created or matched) → instrument asset → repair case per item
//
// Receiving is idempotent: an intake already at 'received' is refused, so a
// double-tap or a resubmitted form can never create duplicate customers,
// instruments or cases.
//
// A received instrument is NOT a confirmed repair job — every case opens at
// `received` and must pass assessment/approval before work is scheduled.
// =============================================================================

export async function getIntake(id: string): Promise<NptIntakeRow | null> {
  if (!id) return null
  const { data } = await db().from('npt_intakes').select('*').eq('id', id).maybeSingle()
  return (data as NptIntakeRow | null) ?? null
}

export async function getIntakeItems(intakeId: string): Promise<NptIntakeItemRow[]> {
  const { data } = await db()
    .from('npt_intake_items')
    .select('*')
    .eq('intake_id', intakeId)
    .order('sort_order', { ascending: true })
  return (data as NptIntakeItemRow[] | null) ?? []
}

export async function listIntakes(opts: { status?: string; limit?: number } = {}): Promise<NptIntakeRow[]> {
  let q = db()
    .from('npt_intakes')
    .select('*')
    .order('date_received', { ascending: false })
    .limit(opts.limit ?? 200)
  if (opts.status) q = q.eq('status', opts.status)
  const { data } = await q
  return (data as NptIntakeRow[] | null) ?? []
}

export interface IntakeItemInput {
  instrument_category?: string
  instrument_type_other?: string
  quantity?: number
  brand_make?: string
  model?: string
  serial_number?: string
  colour_finish?: string
  accessories?: string[]
  accessories_notes?: string
  condition_at_receipt?: string
  reported_issue?: string
  work_requested?: string
  urgency?: string
  /** Set when the customer already owns this instrument in our records. */
  piano_id?: string | null
}

export interface IntakeInput {
  brand_id?: string | null
  date_received?: string
  time_received?: string
  received_by?: string
  received_by_email?: string
  brought_in_by?: string
  reception_location?: string
  intake_channel?: string
  ownership_type?: 'personal' | 'institution'
  customer_id?: string | null
  customer_name?: string
  customer_phone?: string
  customer_email?: string
  customer_location?: string
  alternative_contact?: string
  preferred_channel?: string
  institution_name?: string
  institution_contact_person?: string
  institution_phone?: string
  institution_email?: string
  institution_location?: string
  notes?: string
  items?: IntakeItemInput[]
}

function cleanItems(items: IntakeItemInput[] | undefined): Required<IntakeItemInput>[] {
  return (items ?? [])
    .filter((i) => (i.instrument_category ?? '').trim() !== '' || (i.brand_make ?? '').trim() !== '')
    .map((i, index) => ({
      instrument_category: i.instrument_category || 'piano',
      instrument_type_other: i.instrument_type_other ?? '',
      quantity: Math.max(1, Number(i.quantity ?? 1) || 1),
      brand_make: i.brand_make ?? '',
      model: i.model ?? '',
      serial_number: i.serial_number ?? '',
      colour_finish: i.colour_finish ?? '',
      accessories: (i.accessories ?? []).map((a) => String(a).trim()).filter(Boolean),
      accessories_notes: i.accessories_notes ?? '',
      condition_at_receipt: i.condition_at_receipt ?? '',
      reported_issue: i.reported_issue ?? '',
      work_requested: i.work_requested ?? '',
      urgency: i.urgency || 'Normal',
      piano_id: i.piano_id ?? null,
      sort_order: index,
    })) as unknown as Required<IntakeItemInput>[]
}

/** Create the intake as a draft, with its instrument rows. */
export async function createIntake(input: IntakeInput, actor: { email: string; name: string }): Promise<NptIntakeRow> {
  const now = nowIso()
  const { data, error } = await db()
    .from('npt_intakes')
    .insert({
      brand_id: input.brand_id ?? null,
      date_received: input.date_received || now.slice(0, 10),
      time_received: input.time_received ?? '',
      received_by: input.received_by || actor.name,
      received_by_email: input.received_by_email || actor.email,
      brought_in_by: input.brought_in_by ?? '',
      reception_location: input.reception_location ?? '',
      intake_channel: input.intake_channel || 'walk_in',
      ownership_type: input.ownership_type || 'personal',
      customer_id: input.customer_id ?? null,
      customer_name: input.customer_name ?? '',
      customer_phone: input.customer_phone ?? '',
      customer_email: input.customer_email ?? '',
      customer_location: input.customer_location ?? '',
      alternative_contact: input.alternative_contact ?? '',
      preferred_channel: input.preferred_channel ?? '',
      institution_name: input.institution_name ?? '',
      institution_contact_person: input.institution_contact_person ?? '',
      institution_phone: input.institution_phone ?? '',
      institution_email: input.institution_email ?? '',
      institution_location: input.institution_location ?? '',
      notes: input.notes ?? '',
      status: 'draft',
      created_by: actor.email,
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  const intake = data as NptIntakeRow

  await replaceIntakeItems(intake.id, input.items)
  return intake
}

export async function updateIntake(
  id: string,
  patch: Partial<IntakeInput>,
  actor: { email: string },
): Promise<NptIntakeRow> {
  const existing = await getIntake(id)
  if (!existing) throw new Error('Intake not found')
  if (existing.status !== 'draft') {
    throw new Error('This receipt has already been issued and can no longer be edited.')
  }
  const update: Record<string, unknown> = { updated_at: nowIso() }
  const passthrough: (keyof IntakeInput)[] = [
    'brand_id', 'date_received', 'time_received', 'received_by', 'brought_in_by', 'reception_location',
    'intake_channel', 'ownership_type', 'customer_id', 'customer_name', 'customer_phone', 'customer_email',
    'customer_location', 'alternative_contact', 'preferred_channel', 'institution_name',
    'institution_contact_person', 'institution_phone', 'institution_email', 'institution_location', 'notes',
  ]
  for (const key of passthrough) {
    if (patch[key] !== undefined) update[key] = patch[key]
  }
  const { data, error } = await db().from('npt_intakes').update(update).eq('id', id).select('*').single()
  if (error) throw new Error(error.message)
  if (patch.items !== undefined) await replaceIntakeItems(id, patch.items)
  void actor
  return data as NptIntakeRow
}

async function replaceIntakeItems(intakeId: string, items: IntakeItemInput[] | undefined): Promise<void> {
  if (items === undefined) return
  const rows = cleanItems(items)
  await db().from('npt_intake_items').delete().eq('intake_id', intakeId)
  if (rows.length === 0) return
  const { error } = await db()
    .from('npt_intake_items')
    .insert(rows.map((r) => ({ ...r, intake_id: intakeId })))
  if (error) throw new Error(error.message)
}

/**
 * Issue the receipt. Materialises the customer, the instrument assets and one
 * repair case per received instrument, then stamps the intake reference.
 *
 * Idempotent by status: a receipt that has already been issued is refused
 * rather than re-materialised, so resubmitting the form cannot duplicate
 * customers, instruments or cases.
 */
export async function receiveIntake(
  intakeId: string,
  actor: { email: string; name: string },
): Promise<{ intake: NptIntakeRow; cases: NptRepairCaseRow[] }> {
  const intake = await getIntake(intakeId)
  if (!intake) throw new Error('Intake not found')
  if (intake.status === 'received') throw new Error('This receipt has already been issued.')
  if (intake.status === 'cancelled') throw new Error('This receipt was cancelled.')

  const items = await getIntakeItems(intakeId)
  if (items.length === 0) throw new Error('Add at least one instrument before issuing the receipt.')

  const customerId = intake.customer_id ?? (await ensureCustomer(intake))
  const now = nowIso()
  const reference = intake.reference ?? (await mintReference('npt_intake', 'INT-'))
  const cases: NptRepairCaseRow[] = []

  for (const item of items) {
    const pianoId = item.piano_id ?? (await ensureInstrument(item, customerId, intake))
    if (pianoId && !item.piano_id) {
      await db().from('npt_intake_items').update({ piano_id: pianoId }).eq('id', item.id)
    }

    const caseReference = await mintReference('npt_repair_case', 'REP-')
    const { data, error } = await db()
      .from('npt_repair_cases')
      .insert({
        reference: caseReference,
        intake_id: intake.id,
        intake_item_id: item.id,
        piano_id: pianoId,
        customer_id: customerId,
        status: 'received',
        priority: item.urgency === 'Urgent' ? 'High' : 'Medium',
        reported_issue: item.reported_issue || item.work_requested,
        current_location: intake.reception_location || 'Workshop',
        opened_on: intake.date_received,
        created_by: actor.email,
      })
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    const repairCase = data as NptRepairCaseRow

    if (pianoId) {
      await db()
        .from('npt_pianos')
        .update({
          current_repair_case_id: repairCase.id,
          current_status: 'received',
          current_location: intake.reception_location || 'Workshop',
          updated_at: now,
        })
        .eq('id', pianoId)
    }

    await db().from('npt_repair_case_status_history').insert({
      repair_case_id: repairCase.id,
      previous_status: '',
      new_status: 'received',
      changed_by: actor.email,
      changed_by_name: actor.name,
      comment: `Received on intake ${reference}`,
    })

    cases.push(repairCase)
  }

  const { data: updated, error: updateError } = await db()
    .from('npt_intakes')
    .update({
      status: 'received',
      reference,
      customer_id: customerId,
      acknowledged_at: now,
      updated_at: now,
    })
    .eq('id', intake.id)
    .select('*')
    .single()
  if (updateError) throw new Error(updateError.message)

  await auditEvent({
    actor: auditActor(actor),
    action: 'status',
    entity_table: 'npt_intakes',
    entity_id: intake.id,
    entity_label: reference,
    before_data: { status: intake.status },
    after_data: { status: 'received', repair_cases_created: cases.length },
  })

  return { intake: updated as NptIntakeRow, cases }
}

/** Match an existing customer by phone/email, otherwise create one. */
async function ensureCustomer(intake: NptIntakeRow): Promise<string> {
  const isInstitution = intake.ownership_type === 'institution'
  const phone = (isInstitution ? intake.institution_phone : intake.customer_phone).trim()
  const email = (isInstitution ? intake.institution_email : intake.customer_email).trim().toLowerCase()

  if (phone) {
    const { data } = await db().from('npt_customers').select('id').eq('phone', phone).limit(1)
    const hit = (data as { id: string }[] | null)?.[0]
    if (hit) return hit.id
  }
  if (email) {
    const { data } = await db().from('npt_customers').select('id').eq('email', email).limit(1)
    const hit = (data as { id: string }[] | null)?.[0]
    if (hit) return hit.id
  }

  const fullName = isInstitution
    ? intake.institution_name || intake.institution_contact_person || 'Institution'
    : intake.customer_name || 'Walk-in customer'

  const { data, error } = await db()
    .from('npt_customers')
    .insert({
      full_name: fullName,
      phone: phone || null,
      email: email || null,
      location: isInstitution ? intake.institution_location : intake.customer_location,
      customer_type: isInstitution ? 'institution' : 'home',
      company_name: isInstitution ? intake.institution_name : '',
      contact_person: isInstitution ? intake.institution_contact_person : '',
      preferred_communication_channel: intake.preferred_channel,
      lead_source: 'workshop_intake',
    })
    .select('id')
    .single()
  if (error) throw new Error(`Could not create the customer record: ${error.message}`)
  return (data as { id: string }).id
}

/** Match an instrument by serial number for this customer, otherwise create it. */
async function ensureInstrument(
  item: NptIntakeItemRow,
  customerId: string,
  intake: NptIntakeRow,
): Promise<string | null> {
  const serial = item.serial_number.trim()
  if (serial) {
    const { data } = await db().from('npt_pianos').select('id').eq('serial_number', serial).limit(1)
    const hit = (data as { id: string }[] | null)?.[0]
    if (hit) return hit.id
  }

  const { data, error } = await db()
    .from('npt_pianos')
    .insert({
      customer_id: customerId,
      make: item.brand_make,
      model: item.model || null,
      serial_number: serial || null,
      instrument_category: item.instrument_category,
      instrument_type_other: item.instrument_type_other,
      colour_finish: item.colour_finish,
      condition: item.condition_at_receipt,
      location: intake.reception_location || 'Workshop',
      current_location: intake.reception_location || 'Workshop',
      current_status: 'received',
    })
    .select('id')
    .single()
  if (error) throw new Error(`Could not create the instrument record: ${error.message}`)
  return (data as { id: string }).id
}

export async function cancelIntake(intakeId: string, actor: { email: string; name: string }): Promise<NptIntakeRow> {
  const intake = await getIntake(intakeId)
  if (!intake) throw new Error('Intake not found')
  if (intake.status === 'received') {
    throw new Error('An issued receipt cannot be cancelled — cancel the repair cases instead.')
  }
  const { data, error } = await db()
    .from('npt_intakes')
    .update({ status: 'cancelled', updated_at: nowIso() })
    .eq('id', intakeId)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  await auditEvent({
    actor: auditActor(actor),
    action: 'status',
    entity_table: 'npt_intakes',
    entity_id: intakeId,
    entity_label: intake.reference ?? intakeId,
    before_data: { status: intake.status },
    after_data: { status: 'cancelled' },
  })
  return data as NptIntakeRow
}
