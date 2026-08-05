import { NextResponse, type NextRequest } from 'next/server'
import { getApiActor } from '@/lib/api-auth'
import {
  cancelIntake,
  createIntake,
  getIntake,
  getIntakeItems,
  listIntakes,
  receiveIntake,
  updateIntake,
  type NptActor,
} from '@/lib/nptIntake'
import {
  changeRepairStatus,
  getCaseStatusHistory,
  getRepairCase,
  listRepairActivities,
  listRepairCases,
  logRepairActivity,
  updateRepairCase,
} from '@/lib/nptRepair'
import {
  changeMovementStatus,
  createMovement,
  listMovements,
  recordMovementPayment,
  type MovementStatus,
} from '@/lib/nptMovements'
import {
  acknowledgePlan,
  getPlan,
  getPlanRows,
  listPlans,
  openPlanForDate,
  savePlanSection,
  submitPlan,
  updatePlanHeader,
  type PlanSection,
} from '@/lib/nptWorkshop'

/**
 * NPT workshop operations — intake, repair cases, activity log, daily planner
 * and instrument movements.
 *
 * Gated on the existing `npt_service` section:
 *   npt_service.view → read intakes, cases, activities, plans, movements
 *   npt_service.edit → create/receive intakes, move cases, log work, plan, move
 *
 * Business rules (idempotent receiving, legal status transitions, one plan per
 * day) live in the service layer and are enforced for every caller, not just
 * the UI.
 */

function actorOf(a: { userId: string; email: string | null; name: string }): NptActor {
  return { userId: a.userId, email: a.email ?? '', name: a.name }
}

export async function GET(req: NextRequest) {
  const actor = await getApiActor(req)
  if (!actor) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  if (!actor.can('npt_service', 'view')) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }

  const url = new URL(req.url)
  const view = url.searchParams.get('view') ?? 'intakes'
  const id = url.searchParams.get('id') ?? ''

  try {
    switch (view) {
      case 'intakes':
        return NextResponse.json({ ok: true, intakes: await listIntakes({ status: url.searchParams.get('status') ?? undefined }) })

      case 'intake': {
        const intake = await getIntake(id)
        if (!intake) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
        return NextResponse.json({ ok: true, intake, items: await getIntakeItems(intake.id) })
      }

      case 'cases':
        return NextResponse.json({
          ok: true,
          cases: await listRepairCases({
            status: url.searchParams.get('status') ?? undefined,
            technicianId: url.searchParams.get('technician') ?? undefined,
            pianoId: url.searchParams.get('piano') ?? undefined,
            open: url.searchParams.get('open') === '1',
          }),
        })

      case 'case': {
        const repairCase = await getRepairCase(id)
        if (!repairCase) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
        return NextResponse.json({
          ok: true,
          case: repairCase,
          history: await getCaseStatusHistory(repairCase.id),
          activities: await listRepairActivities({ caseId: repairCase.id }),
        })
      }

      case 'activities':
        return NextResponse.json({
          ok: true,
          activities: await listRepairActivities({
            caseId: url.searchParams.get('case') ?? undefined,
            technicianId: url.searchParams.get('technician') ?? undefined,
            from: url.searchParams.get('from') ?? undefined,
            to: url.searchParams.get('to') ?? undefined,
          }),
        })

      case 'plans':
        return NextResponse.json({
          ok: true,
          plans: await listPlans({
            from: url.searchParams.get('from') ?? undefined,
            to: url.searchParams.get('to') ?? undefined,
          }),
        })

      case 'plan': {
        const plan = await getPlan(id)
        if (!plan) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
        return NextResponse.json({ ok: true, plan, rows: await getPlanRows(plan.id) })
      }

      case 'movements':
        return NextResponse.json({
          ok: true,
          movements: await listMovements({
            status: url.searchParams.get('status') ?? undefined,
            pianoId: url.searchParams.get('piano') ?? undefined,
            customerId: url.searchParams.get('customer') ?? undefined,
            unpaidOnly: url.searchParams.get('unpaid') === '1',
          }),
        })

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
  if (!actor.can('npt_service', 'edit')) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }
  const me = actorOf(actor)

  try {
    const body = await req.json()
    const action = String(body?.action ?? '')

    switch (action) {
      // ── Intake ──
      case 'create-intake':
        return NextResponse.json({ ok: true, intake: await createIntake(body?.values ?? {}, me) }, { status: 201 })

      case 'update-intake':
        return NextResponse.json({ ok: true, intake: await updateIntake(String(body?.id ?? ''), body?.values ?? {}, me) })

      case 'receive-intake': {
        const result = await receiveIntake(String(body?.id ?? ''), me)
        return NextResponse.json({ ok: true, intake: result.intake, cases: result.cases })
      }

      case 'cancel-intake':
        return NextResponse.json({ ok: true, intake: await cancelIntake(String(body?.id ?? ''), me) })

      // ── Repair cases ──
      case 'change-case-status':
        return NextResponse.json({
          ok: true,
          case: await changeRepairStatus({
            case_id: String(body?.id ?? ''),
            to: String(body?.status ?? ''),
            actor: me,
            comment: (body?.comment as string) ?? '',
            location: (body?.location as string) ?? undefined,
          }),
        })

      case 'update-case':
        return NextResponse.json({
          ok: true,
          case: await updateRepairCase(String(body?.id ?? ''), body?.values ?? {}, me),
        })

      case 'log-activity':
        return NextResponse.json(
          { ok: true, activity: await logRepairActivity({ ...(body?.values ?? {}), actor: me }) },
          { status: 201 },
        )

      // ── Daily planner ──
      case 'open-plan':
        return NextResponse.json({
          ok: true,
          plan: await openPlanForDate(
            String(body?.plan_date ?? new Date().toISOString().slice(0, 10)),
            (body?.brand_id as string) ?? null,
            me,
          ),
        })

      case 'update-plan':
        return NextResponse.json({ ok: true, plan: await updatePlanHeader(String(body?.id ?? ''), body?.values ?? {}) })

      case 'save-plan-section':
        return NextResponse.json({
          ok: true,
          rows: await savePlanSection(
            String(body?.id ?? ''),
            String(body?.section ?? 'allocation') as PlanSection,
            body?.rows ?? [],
          ),
        })

      case 'submit-plan':
        return NextResponse.json({ ok: true, plan: await submitPlan(String(body?.id ?? ''), me) })

      case 'acknowledge-plan':
        return NextResponse.json({
          ok: true,
          plan: await acknowledgePlan({
            plan_id: String(body?.id ?? ''),
            role: body?.role === 'director' ? 'director' : 'manager',
            comment: (body?.comment as string) ?? '',
            actor: me,
          }),
        })

      // ── Movements ──
      case 'create-movement':
        return NextResponse.json(
          { ok: true, movement: await createMovement({ ...(body?.values ?? {}), actor: me }) },
          { status: 201 },
        )

      case 'change-movement-status':
        return NextResponse.json({
          ok: true,
          movement: await changeMovementStatus({
            movement_id: String(body?.id ?? ''),
            to: String(body?.status ?? '') as MovementStatus,
            actor: me,
            comment: (body?.comment as string) ?? '',
          }),
        })

      case 'record-movement-payment':
        return NextResponse.json({
          ok: true,
          movement: await recordMovementPayment({
            movement_id: String(body?.id ?? ''),
            payment_status: body?.payment_status,
            payment_reference: (body?.payment_reference as string) ?? '',
            actor: me,
          }),
        })

      default:
        return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}
