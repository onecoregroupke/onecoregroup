import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import {
  listContacts,
  getContactById,
  createContact,
  updateContact,
  type ListContactsFilters,
} from '@/lib/marketing/contacts'
import { listDeals } from '@/lib/marketing/deals'
import { listActivitiesForContact } from '@/lib/marketing/activities'
import type { LifecycleStage } from '@/lib/marketing/types'

export async function GET(req: NextRequest) {
  if (!(await requireUser(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const params = req.nextUrl.searchParams
  const id = params.get('id')
  if (id) {
    const contact = await getContactById(id)
    if (!contact) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const [deals, activities] = await Promise.all([
      listDeals({ contactId: id, stage: 'any' }),
      listActivitiesForContact(id),
    ])
    return NextResponse.json({ contact, deals, activities })
  }
  const filters: ListContactsFilters = {
    lifecycleStage: (params.get('stage') as LifecycleStage | 'any' | null) || undefined,
    ownerEmail: params.get('owner') || undefined,
    query: params.get('q') || undefined,
  }
  const contacts = await listContacts(filters)
  return NextResponse.json({ contacts })
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  const result = await createContact({ ...body, createdByEmail: user.email ?? 'unknown' })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ contact: result.contact })
}

export async function PATCH(req: NextRequest) {
  if (!(await requireUser(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = (await req.json().catch(() => null)) as ({ id?: string } & Record<string, unknown>) | null
  if (!body?.id) return NextResponse.json({ error: 'Contact id is required.' }, { status: 400 })
  const { id, ...patch } = body
  const result = await updateContact(id, patch)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ contact: result.contact })
}
