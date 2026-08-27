import { NextResponse, type NextRequest } from 'next/server'
import { requireApiSection } from '@/lib/api-auth'
import {
  approveStockTake,
  getStockTakeDetail,
  postStockTake,
  startStockTake,
  submitStockTakeForReview,
  updateStockTakeLines,
} from '@/lib/inventoryStockTake'

export async function GET(req: NextRequest) {
  const gate = await requireApiSection(req, 'inventory', 'view')
  if (gate instanceof NextResponse) return gate
  const actor = gate
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ ok: false, error: 'id is required' }, { status: 400 })
  try {
    const detail = await getStockTakeDetail(actor.allowedBrandIds('inventory'), id)
    return NextResponse.json({ ok: true, detail })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireApiSection(req, 'inventory', 'edit')
  if (gate instanceof NextResponse) return gate
  const actor = gate
  const actorName = actor.name || actor.email || 'unknown'
  const allowed = actor.allowedBrandIds('inventory')

  try {
    const body = await req.json()
    const action = String(body?.action ?? '')

    if (action === 'start') {
      const count = await startStockTake({
        store_id: String(body.store_id ?? ''),
        effective_date: body.effective_date ? String(body.effective_date) : undefined,
        notes: String(body.notes ?? ''),
        counted_by: actorName,
        allowed,
      })
      return NextResponse.json({ ok: true, count }, { status: 201 })
    }

    if (action === 'update-lines') {
      const detail = await updateStockTakeLines({
        count_id: String(body.count_id ?? ''),
        lines: Array.isArray(body.lines) ? body.lines : [],
        actor_name: actorName,
        allowed,
      })
      return NextResponse.json({ ok: true, detail })
    }

    if (action === 'submit-review') {
      const detail = await submitStockTakeForReview({ count_id: String(body.count_id ?? ''), actor_name: actorName, allowed })
      return NextResponse.json({ ok: true, detail })
    }

    if (action === 'approve') {
      const detail = await approveStockTake({ count_id: String(body.count_id ?? ''), actor_name: actorName, allowed })
      return NextResponse.json({ ok: true, detail })
    }

    if (action === 'post') {
      const detail = await postStockTake({ count_id: String(body.count_id ?? ''), actor_name: actorName, allowed })
      return NextResponse.json({ ok: true, detail })
    }

    return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}
