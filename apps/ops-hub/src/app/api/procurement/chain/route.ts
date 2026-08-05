import { NextResponse, type NextRequest } from 'next/server'
import { getApiActor } from '@/lib/api-auth'
import {
  approveRequisition,
  createGoodsIssue,
  createGoodsReceipt,
  createRequisition,
  getGoodsIssue,
  getGoodsIssueItems,
  getGoodsReceipt,
  getGoodsReceiptItems,
  getRequisition,
  getRequisitionItems,
  listGoodsIssues,
  listGoodsReceipts,
  listRequisitions,
  postGoodsIssue,
  postGoodsReceipt,
  submitRequisition,
  updateGoodsReceipt,
  updateRequisition,
  type ChainActor,
} from '@/lib/procurementChain'

/**
 * Procurement chain — material requisitions, goods received notes, and goods
 * issue / transfer notes.
 *
 * Gated on the existing `procurement` section, brand-scoped:
 *   procurement.view → read requisitions, receipts, issue notes
 *   procurement.edit → raise, submit, approve, receive, issue
 *
 * The rules that protect stock (no self-approval, approval moves no stock,
 * accepted-only stocking, once-only posting) live in the service layer, so they
 * hold for any caller — not just this route.
 */

function actorOf(a: { userId: string; email: string | null; name: string }): ChainActor {
  return { userId: a.userId, email: a.email ?? '', name: a.name }
}

export async function GET(req: NextRequest) {
  const actor = await getApiActor(req)
  if (!actor) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  if (!actor.can('procurement', 'view')) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }

  const url = new URL(req.url)
  const view = url.searchParams.get('view') ?? 'requisitions'
  const id = url.searchParams.get('id') ?? ''
  const status = url.searchParams.get('status') ?? undefined
  const brandIds = actor.allowedBrandIds('procurement')

  try {
    switch (view) {
      case 'requisitions':
        return NextResponse.json({ ok: true, requisitions: await listRequisitions({ brandIds, status }) })

      case 'requisition': {
        const requisition = await getRequisition(id)
        if (!requisition || !inScope(requisition.brand_id, brandIds)) {
          return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
        }
        return NextResponse.json({ ok: true, requisition, items: await getRequisitionItems(requisition.id) })
      }

      case 'receipts':
        return NextResponse.json({
          ok: true,
          receipts: await listGoodsReceipts({
            brandIds,
            status,
            purchaseId: url.searchParams.get('purchase') ?? undefined,
          }),
        })

      case 'receipt': {
        const receipt = await getGoodsReceipt(id)
        if (!receipt || !inScope(receipt.brand_id, brandIds)) {
          return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
        }
        return NextResponse.json({ ok: true, receipt, items: await getGoodsReceiptItems(receipt.id) })
      }

      case 'issues':
        return NextResponse.json({
          ok: true,
          issues: await listGoodsIssues({ brandIds, status, kind: url.searchParams.get('kind') ?? undefined }),
        })

      case 'issue': {
        const issue = await getGoodsIssue(id)
        if (!issue || !inScope(issue.brand_id, brandIds)) {
          return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
        }
        return NextResponse.json({ ok: true, issue, items: await getGoodsIssueItems(issue.id) })
      }

      default:
        return NextResponse.json({ ok: false, error: `Unknown view: ${view}` }, { status: 400 })
    }
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}

export async function POST(req: NextRequest) {
  const actor = await getApiActor(req)
  if (!actor) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  if (!actor.can('procurement', 'edit')) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }
  const me = actorOf(actor)
  const brandIds = actor.allowedBrandIds('procurement')

  try {
    const body = await req.json()
    const action = String(body?.action ?? '')
    const values = body?.values ?? {}

    // A brand-scoped user may only ever write inside their own brands.
    if (values.brand_id && !inScope(values.brand_id, brandIds)) {
      return NextResponse.json({ ok: false, error: 'That brand is outside your scope.' }, { status: 403 })
    }

    switch (action) {
      // ── Requisitions ──
      case 'create-requisition':
        return NextResponse.json({ ok: true, requisition: await createRequisition(values, me) }, { status: 201 })

      case 'update-requisition':
        return NextResponse.json({ ok: true, requisition: await updateRequisition(String(body?.id ?? ''), values) })

      case 'submit-requisition':
        return NextResponse.json({ ok: true, requisition: await submitRequisition(String(body?.id ?? ''), me) })

      case 'approve-requisition':
        return NextResponse.json({
          ok: true,
          requisition: await approveRequisition({
            requisition_id: String(body?.id ?? ''),
            approvals: body?.approvals ?? [],
            comment: (body?.comment as string) ?? '',
            actor: me,
            // Self-approval is never enabled from the API surface; it exists in
            // the model only for an explicit, separately-granted policy.
          }),
        })

      // ── Goods received notes ──
      case 'create-receipt':
        return NextResponse.json({ ok: true, receipt: await createGoodsReceipt(values, me) }, { status: 201 })

      case 'update-receipt':
        return NextResponse.json({ ok: true, receipt: await updateGoodsReceipt(String(body?.id ?? ''), values) })

      case 'post-receipt': {
        const result = await postGoodsReceipt(String(body?.id ?? ''), me)
        return NextResponse.json({ ok: true, receipt: result.receipt, movements: result.movementsCreated })
      }

      // ── Goods issue / transfer notes ──
      case 'create-issue':
        return NextResponse.json({ ok: true, issue: await createGoodsIssue(values, me) }, { status: 201 })

      case 'post-issue': {
        const result = await postGoodsIssue(String(body?.id ?? ''), me)
        return NextResponse.json({ ok: true, issue: result.issue, movements: result.movementsCreated })
      }

      default:
        return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}

function inScope(brandId: string | null, brandIds: string[] | null): boolean {
  if (brandIds === null) return true
  if (!brandId) return true
  return brandIds.includes(brandId)
}
