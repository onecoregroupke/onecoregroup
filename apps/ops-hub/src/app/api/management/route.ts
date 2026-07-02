import { NextResponse, type NextRequest } from 'next/server'
import { getApiActor, type Actor } from '@/lib/api-auth'
import { db } from '@/lib/serverClient'
import {
  insertManagedRow, updateManagedRow, sectionForMutationType, tableForType, type MutationType,
} from '@/lib/managementMutations'

/**
 * Brand compartmentalization for finance_* writes: a finance user scoped to
 * specific brands may only touch rows booked to those brands. Applies to both
 * the brand fields in the incoming values and (on update) the existing row.
 */
async function assertFinanceScope(
  actor: Actor,
  type: MutationType,
  values: Record<string, unknown>,
  existingId?: string,
): Promise<void> {
  if (!type.startsWith('finance_')) return
  const allowed = actor.allowedBrandIds('finance')
  if (allowed === null) return

  const brandFields = ['brand_id', 'from_brand_id', 'to_brand_id', 'counterparty_brand_id']
  const present = brandFields.filter((f) => values[f] !== undefined && values[f] !== '')
  for (const field of present) {
    const v = values[field]
    if (v !== null && !allowed.includes(String(v))) {
      throw new Error('You do not have finance access to that brand.')
    }
  }
  // Scoped users must book new primary rows to one of their brands.
  if (!existingId && !present.some((f) => f === 'brand_id' || f === 'from_brand_id')) {
    throw new Error('Select one of your brands for this finance record.')
  }
  if (existingId) {
    const { data } = await db().from(tableForType(type)).select('*').eq('id', existingId).maybeSingle()
    const row = data as Record<string, unknown> | null
    if (!row) throw new Error('Record not found.')
    for (const field of ['brand_id', 'from_brand_id', 'to_brand_id']) {
      const v = row[field]
      if (v !== undefined && v !== null && !allowed.includes(String(v))) {
        throw new Error('You do not have finance access to that brand.')
      }
    }
  }
}

export async function POST(req: NextRequest) {
  const actor = await getApiActor(req)
  if (!actor) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  try {
    const body = await req.json()
    const type = body?.type as MutationType
    if (!actor.can(sectionForMutationType(type), 'edit')) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }
    const values = {
      ...(body?.values ?? {}),
      ...(type === 'approval' ? { requested_by: body?.values?.requested_by || actor.email || actor.userId } : {}),
      ...(type === 'meeting' ? { created_by: body?.values?.created_by || actor.email || actor.userId } : {}),
    }
    await assertFinanceScope(actor, type, values)
    const row = await insertManagedRow(type, values)
    return NextResponse.json({ ok: true, row }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}

export async function PATCH(req: NextRequest) {
  const actor = await getApiActor(req)
  if (!actor) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  try {
    const body = await req.json()
    const type = body?.type as MutationType
    if (!actor.can(sectionForMutationType(type), 'edit')) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }
    await assertFinanceScope(actor, type, body?.values ?? {}, body?.id)
    const row = await updateManagedRow(type, body?.id, body?.values ?? {})
    return NextResponse.json({ ok: true, row })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}
