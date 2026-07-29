import { NextResponse, type NextRequest } from 'next/server'
import { getApiActor } from '@/lib/api-auth'
import { auditEvent, listAuditEvents } from '@/lib/audit'
import { db } from '@/lib/serverClient'

const UNDO_TABLES = new Set([
  'ops_tasks',
  'finance_accounts',
  'finance_transactions',
  'finance_interbrand_transfers',
  'finance_reconciliation_batches',
  'finance_exceptions',
  'ops_team_members',
])

export async function GET(req: NextRequest) {
  const actor = await getApiActor(req)
  if (!actor) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  // Audit events carry full before/after row snapshots (finance, tasks, team,
  // …). Reading them is a management-level action — never open to every user
  // who happens to know a table name + id.
  if (!actor.isSuperAdmin && !actor.can('management', 'view')) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }
  const url = new URL(req.url)
  const table = url.searchParams.get('table') ?? ''
  const id = url.searchParams.get('id') ?? ''
  if (!table || !id) return NextResponse.json({ ok: false, error: 'table and id are required' }, { status: 400 })
  const events = await listAuditEvents(table, id)
  return NextResponse.json({ ok: true, events })
}

export async function POST(req: NextRequest) {
  const actor = await getApiActor(req)
  if (!actor) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  try {
    const body = await req.json()
    if (body?.action !== 'undo') return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
    const eventId = String(body?.event_id ?? '')
    const { data: event } = await db().from('ocg_audit_events').select('*').eq('id', eventId).maybeSingle()
    const row = event as { entity_table: string; entity_id: string; before_data: Record<string, unknown> | null } | null
    if (!row?.before_data) return NextResponse.json({ ok: false, error: 'No undo snapshot available.' }, { status: 400 })
    if (!UNDO_TABLES.has(row.entity_table)) return NextResponse.json({ ok: false, error: 'Undo is not enabled for this record type.' }, { status: 400 })
    if (!actor.isSuperAdmin && !actor.can('management', 'edit')) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }
    const key = row.entity_table === 'ops_tasks' ? 'task_id' : 'id'
    const supabase = db()
    // Dynamic table name is guarded by UNDO_TABLES above.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fromDynamic = () => (supabase as any).from(row.entity_table)
    const { data: beforeUndo } = await fromDynamic().select('*').eq(key, row.entity_id).maybeSingle()
    const { data: afterUndo, error } = await fromDynamic()
      .update(row.before_data)
      .eq(key, row.entity_id)
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    await auditEvent({
      actor,
      action: 'undo',
      entity_table: row.entity_table,
      entity_id: row.entity_id,
      before_data: (beforeUndo as Record<string, unknown> | null) ?? null,
      after_data: (afterUndo as Record<string, unknown> | null) ?? null,
      undo_event_id: eventId,
    })
    return NextResponse.json({ ok: true, row: afterUndo })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}
