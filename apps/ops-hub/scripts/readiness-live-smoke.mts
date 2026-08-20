/**
 * Disposable production-readiness smoke test.
 *
 * It drives real localhost API routes backed by the configured Supabase
 * project, labels every row with __READINESS_SMOKE__, and removes all created
 * business/auth/audit rows in finally. It never sends mail and never uses real
 * historical source data.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
for (const file of [resolve(ROOT, '.env.local'), resolve(ROOT, 'apps/ops-hub/.env.local')]) {
  if (!existsSync(file)) continue
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line)
    if (!match || process.env[match[1]!]) continue
    let value = match[2]!.trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    process.env[match[1]!] = value
  }
}

const { createClient } = await import('@supabase/supabase-js')
const { db } = await import('../src/lib/serverClient.ts')
const { parseAndStage } = await import('../src/lib/imports/framework.ts')
const { getAdapter } = await import('../src/lib/imports/registry.ts')
const { listLedger } = await import('../src/lib/finance.ts')
const { getPrintIdentity, identityHeaderLines } = await import('../src/lib/printIdentity.ts')

const supabase = db()
const apiBase = process.env['READINESS_BASE_URL'] ?? 'http://localhost:3030'
const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL']!
const anonKey = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']!
if (!supabaseUrl || !anonKey) throw new Error('Supabase URL/anon key are required')

const run = `${Date.now()}-${randomBytes(3).toString('hex')}`
const tag = `__READINESS_SMOKE_${run}__`
const password = `Rdy!${randomBytes(12).toString('base64url')}`
const emails = {
  operator: `readiness-operator-${run}@example.invalid`,
  reviewer: `readiness-reviewer-${run}@example.invalid`,
  outsider: `readiness-outsider-${run}@example.invalid`,
}
const created = {
  userIds: [] as string[], memberIds: [] as string[], stores: [] as string[], items: [] as string[],
  templates: [] as string[], submissions: [] as string[], duties: [] as string[], requisitions: [] as string[],
  receipts: [] as string[], issues: [] as string[], runs: [] as string[], fgTransfers: [] as string[],
  allocations: [] as string[], dailyReturns: [] as string[], returnNotes: [] as string[], pettyAccounts: [] as string[],
  pettyTransactions: [] as string[], financeTransactions: [] as string[], journals: [] as string[],
  sources: [] as string[], imports: [] as string[], mappings: [] as string[], periods: [] as string[],
}
const evidence: string[] = []
const remember = (message: string) => { evidence.push(message); process.stdout.write(`PASS ${message}\n`) }
const assert = (condition: unknown, message: string): asserts condition => { if (!condition) throw new Error(`ASSERTION FAILED: ${message}`) }

type Session = { access_token: string }
async function createTestUser(email: string, name: string, brandId: string) {
  const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true })
  if (error || !data.user) throw new Error(error?.message ?? 'Could not create test user')
  created.userIds.push(data.user.id)
  const sections = ['dashboard','forms','forms_responses','forms_approvals','duties','duties_all','duties_review','procurement','inventory','finance','people','knowledge','historical_imports']
  const permissions = Object.fromEntries(sections.map((section) => [section, 'edit']))
  const brand_access = Object.fromEntries(sections.map((section) => [section, [brandId]]))
  const { error: permissionError } = await supabase.from('user_permissions').insert({
    user_id: data.user.id, display_name: name, permissions, brand_access,
    record_access: { people: 'management', knowledge: 'management', historical_imports: 'management' },
    is_active: true,
  })
  if (permissionError) throw new Error(permissionError.message)
  const { data: member, error: memberError } = await supabase.from('ops_team_members').insert({
    name, email, user_id: data.user.id, role: 'Readiness tester', job_title: 'Readiness tester',
    department: 'Operations', team: 'Readiness', brand_ids: [brandId], primary_brand_id: brandId,
    active: true, notes: tag,
  }).select('*').single()
  if (memberError) throw new Error(memberError.message)
  created.memberIds.push(member.id)
  const client = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: signed, error: signError } = await client.auth.signInWithPassword({ email, password })
  if (signError || !signed.session) throw new Error(signError?.message ?? 'Could not sign in test user')
  return { user: data.user, member, session: signed.session as Session, client }
}

async function api<T>(session: Session, path: string, body?: unknown, method = body ? 'POST' : 'GET', expected = 200): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers: { Authorization: `Bearer ${session.access_token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await response.text()
  let json: unknown
  try { json = JSON.parse(text) } catch { json = { text } }
  if (response.status !== expected) throw new Error(`${method} ${path}: expected ${expected}, got ${response.status}: ${text.slice(0, 500)}`)
  return json as T
}

async function remove(table: string, column: string, values: string[]) {
  if (values.length === 0) return
  const { error } = await supabase.from(table).delete().in(column, values)
  if (error) process.stderr.write(`cleanup ${table}: ${error.message}\n`)
}

async function cleanup() {
  // Governance/import rows.
  await remove('historical_import_events', 'import_id', created.imports)
  await remove('historical_import_reconciliations', 'import_id', created.imports)
  await remove('historical_import_exceptions', 'import_id', created.imports)
  await remove('historical_import_source_links', 'import_id', created.imports)
  await remove('data_import_rows', 'import_id', created.imports)
  await remove('data_imports', 'id', created.imports)
  await remove('historical_import_periods', 'id', created.periods)
  await remove('historical_import_mappings', 'id', created.mappings)
  await remove('historical_import_sources', 'id', created.sources)

  // Finance and petty cash.
  await remove('finance_journal_lines', 'journal_id', created.journals)
  await remove('finance_journals', 'id', created.journals)
  await remove('finance_transactions', 'id', created.financeTransactions)
  await remove('petty_cash_transactions', 'id', created.pettyTransactions)
  await remove('petty_cash_accounts', 'id', created.pettyAccounts)

  // Field sales, production, procurement, then stock.
  await remove('field_sales_return_note_items', 'return_note_id', created.returnNotes)
  await remove('field_sales_return_notes', 'id', created.returnNotes)
  await remove('field_sales_daily_return_items', 'daily_return_id', created.dailyReturns)
  await remove('field_sales_daily_returns', 'id', created.dailyReturns)
  await remove('field_sales_custody_movements', 'allocation_id', created.allocations)
  await remove('field_sales_allocation_items', 'allocation_id', created.allocations)
  await remove('field_sales_allocations', 'id', created.allocations)
  await remove('production_run_materials', 'run_id', created.runs)
  await remove('production_fg_transfers', 'id', created.fgTransfers)
  await remove('production_runs', 'id', created.runs)
  await remove('procurement_goods_issue_items', 'issue_id', created.issues)
  await remove('procurement_goods_issues', 'id', created.issues)
  await remove('procurement_goods_receipt_items', 'receipt_id', created.receipts)
  await remove('procurement_goods_receipts', 'id', created.receipts)
  await remove('procurement_requisition_items', 'requisition_id', created.requisitions)
  await remove('procurement_requisitions', 'id', created.requisitions)
  await remove('inventory_movements', 'item_id', created.items)
  await remove('inventory_items', 'id', created.items)
  await remove('inventory_stores', 'id', created.stores)

  // Duties and forms.
  await remove('ocg_duty_assignment_events', 'duty_id', created.duties)
  await remove('ocg_daily_duty_logs', 'duty_id', created.duties)
  await remove('ocg_daily_duties', 'id', created.duties)
  await remove('record_versions', 'record_id', [...created.submissions, ...created.pettyTransactions])
  await remove('ocg_form_submissions', 'id', created.submissions)
  await remove('ocg_form_template_versions', 'template_id', created.templates)
  await remove('ocg_form_templates', 'id', created.templates)

  // People, audit/inbox, then auth identities.
  await remove('employee_capability_assignments', 'member_id', created.memberIds)
  const { data: capRows } = await supabase.from('employee_capabilities').select('id').ilike('code', `${tag}%`)
  await remove('employee_capabilities', 'id', (capRows ?? []).map((row: { id: string }) => row.id))
  await remove('employee_authorities', 'member_id', created.memberIds)
  await remove('employee_entity_assignments', 'member_id', created.memberIds)
  await remove('employee_responsibilities', 'member_id', created.memberIds)
  await remove('employee_cover_assignments', 'covered_member_id', created.memberIds)
  await remove('employee_cover_assignments', 'cover_member_id', created.memberIds)
  await remove('employee_resource_assignments', 'member_id', created.memberIds)
  await remove('employee_qualifications', 'member_id', created.memberIds)
  await remove('employee_activity_history', 'member_id', created.memberIds)
  await remove('ocg_audit_events', 'actor_user_id', created.userIds)
  const allEmails = Object.values(emails)
  await remove('ocg_notifications', 'recipient_email', allEmails)
  await remove('ops_team_members', 'id', created.memberIds)
  await remove('user_permissions', 'user_id', created.userIds)
  for (const id of created.userIds) await supabase.auth.admin.deleteUser(id)
}

try {
  const { data: brandRows, error: brandError } = await supabase.from('brands').select('*').eq('is_active', true).order('name')
  if (brandError || !brandRows || brandRows.length < 3) throw new Error('At least three active brands are required')
  const [brandA, brandB, brandC] = brandRows
  const operator = await createTestUser(emails.operator, `${tag} Operator`, brandA.id)
  const reviewer = await createTestUser(emails.reviewer, `${tag} Reviewer`, brandA.id)
  const outsider = await createTestUser(emails.outsider, `${tag} Outsider`, brandB.id)
  remember('three disposable authenticated users created without email delivery')

  // People: JD/responsibility/capability/cover/authority are separate write paths.
  await api(operator.session, `/api/people/${operator.member.id}`, { action: 'job-description', values: { job_description: `${tag} formal JD` } }, 'POST', 201)
  await api(operator.session, `/api/people/${operator.member.id}`, { action: 'add-responsibility', values: { brand_id: brandA.id, title: `${tag} reconcile daily income`, responsibility_type: 'formal', cadence: 'daily' } }, 'POST', 201)
  await api(operator.session, `/api/people/${operator.member.id}`, { action: 'add-capability', values: { code: `${tag}-finance-approve`, title: 'Prepare finance journal', operational_area: 'finance', brand_id: brandA.id } }, 'POST', 201)
  await api(operator.session, `/api/people/${operator.member.id}`, { action: 'add-cover', values: { cover_member_id: reviewer.member.id, brand_id: brandA.id, process_name: 'Daily reconciliation', cover_type: 'emergency' } }, 'POST', 201)
  for (const authority_action of ['approve', 'post', 'reverse']) {
    await api(operator.session, `/api/people/${reviewer.member.id}`, { action: 'grant-authority', values: { brand_id: brandA.id, operational_area: 'finance', resource_type: 'journal', authority_action, authority_scope: 'entity', grant_reason: tag } }, 'POST', 201)
  }
  remember('structured people profile, capability, cover, and separate finance authority grants written')

  // Forms: draft → submit → correction → resubmit → approve → history.
  const templateResponse = await api<{ template: { id: string } }>(operator.session, '/api/forms', {
    action: 'create-template', values: { name: `${tag} Daily Control`, brand_id: brandA.id, state: 'published', requires_approval: true, allow_self_correction: true, reference_prefix: 'RDT', fields: [{ key: 'amount', label: 'Amount', type: 'number', required: true }] },
  }, 'POST', 201)
  created.templates.push(templateResponse.template.id)
  const draftResponse = await api<{ submission: { id: string; status: string } }>(operator.session, '/api/forms', { action: 'save-draft', template_id: templateResponse.template.id, values: { amount: 10 }, notes: tag })
  created.submissions.push(draftResponse.submission.id)
  assert(draftResponse.submission.status === 'draft', 'draft created')
  await api(operator.session, '/api/forms', { action: 'submit-draft', submission_id: draftResponse.submission.id, values: { amount: 10 } })
  await api(reviewer.session, '/api/forms', { action: 'review', submission_id: draftResponse.submission.id, decision: 'request_correction', comment: 'Add corrected total' })
  await api(operator.session, '/api/forms', { action: 'save-draft', template_id: templateResponse.template.id, submission_id: draftResponse.submission.id, values: { amount: 12 } })
  await api(operator.session, '/api/forms', { action: 'submit-draft', submission_id: draftResponse.submission.id })
  await api(reviewer.session, '/api/forms', { action: 'review', submission_id: draftResponse.submission.id, decision: 'approve', comment: 'Verified' })
  const history = await api<{ versions: unknown[] }>(operator.session, `/api/forms?history=${draftResponse.submission.id}`)
  assert(history.versions.length >= 6, 'form history contains lifecycle snapshots')
  const outsiderHistory = await api<{ error: string }>(outsider.session, `/api/forms?history=${draftResponse.submission.id}`, undefined, 'GET', 404)
  assert(outsiderHistory.error === 'not found', 'cross-brand history hidden')
  remember(`form lifecycle and ${history.versions.length}-event history verified; direct cross-brand ID returned 404`)

  // Brand print identity used by shared document pads.
  const printIdentities = await Promise.all([brandA, brandB, brandC].map((brand) => getPrintIdentity(brand.id, 'grn')))
  assert(printIdentities.every(Boolean), 'three print identities resolve')
  assert(new Set(printIdentities.map((identity) => identity!.legal_name)).size === 3, 'print identities are brand-specific')
  printIdentities.forEach((identity) => identityHeaderLines(identity!))
  remember(`brand-aware print identity resolved for ${printIdentities.map((identity) => identity!.legal_name).join(', ')}`)

  // Duties: template → derived occurrence → cover → completion, preserving original.
  const today = new Date().toISOString().slice(0, 10)
  const dutyResponse = await api<{ row: { id: string } }>(operator.session, '/api/duties', { title: `${tag} Daily Close`, brand_id: brandA.id, assignee_id: operator.member.id, target_kind: 'employee', frequency: 'daily', start_date: today, requires_note: true }, 'POST', 201)
  created.duties.push(dutyResponse.row.id)
  const occurrenceList = await api<{ rows?: unknown[]; occurrences?: unknown[] }>(operator.session, `/api/duties/occurrences?date=${today}`)
  assert((occurrenceList.rows ?? occurrenceList.occurrences ?? []).length > 0, 'duty occurrence generated')
  const covered = await api<{ row: { original_assignee_id: string; substitute_assignee_id: string } }>(operator.session, '/api/duties/cover', { duty_id: dutyResponse.row.id, duty_date: today, original_assignee_id: operator.member.id, substitute_assignee_id: reviewer.member.id, reason: tag })
  assert(covered.row.original_assignee_id === operator.member.id && covered.row.substitute_assignee_id === reviewer.member.id, 'cover preserved original')
  await api(reviewer.session, '/api/duties/complete', { duty_id: dutyResponse.row.id, assignee_id: reviewer.member.id, date: today, status: 'done', note: tag })
  remember('duty occurrence, cover assignment, original ownership, and completion verified')

  // Stores and canonical inventory.
  for (const [name, type] of [[`${tag} Source Store`, 'raw'], [`${tag} Destination Store`, 'finished_goods']] as const) {
    const response = await api<{ row: { id: string } }>(operator.session, '/api/manufacturing', { action: 'create-store', brand_id: brandA.id, name, code: `${run}-${type}`, store_type: type }, 'POST', 201)
    created.stores.push(response.row.id)
  }
  async function createItem(name: string, sku: string, quantity: number) {
    const response = await api<{ item: { id: string; quantity: number } }>(operator.session, '/api/inventory', { action: 'item', values: { brand_id: brandA.id, name, sku, category: 'Readiness', unit: 'pcs', quantity, notes: tag } }, 'POST', 201)
    created.items.push(response.item.id)
    return response.item
  }
  const raw = await createItem(`${tag} Raw`, `${run}-RAW`, 100)
  const finished = await createItem(`${tag} Finished`, `${run}-FG`, 0)
  await supabase.from('inventory_items').update({ store_id: created.stores[0], item_type: 'raw_material', canonical_name: `${tag} Raw`, base_unit: 'pcs', pack_size: 1, purchasable: true }).eq('id', raw.id)
  await supabase.from('inventory_items').update({ store_id: created.stores[1], item_type: 'finished_good', canonical_name: `${tag} Finished`, base_unit: 'pcs', pack_size: 1, producible: true, sellable: true }).eq('id', finished.id)
  remember('canonical inventory items and explicit source/destination stores created')

  // Procurement request → approval → receipt and accepted-only stock posting.
  const req = await api<{ requisition: { id: string } }>(operator.session, '/api/procurement/chain', { action: 'create-requisition', values: { brand_id: brandA.id, department: 'Production', purpose: tag, items: [{ inventory_item_id: raw.id, description: `${tag} Raw`, unit: 'pcs', quantity_requested: 10 }] } }, 'POST', 201)
  created.requisitions.push(req.requisition.id)
  await api(operator.session, '/api/procurement/chain', { action: 'submit-requisition', id: req.requisition.id })
  const reqDetail = await api<{ items: Array<{ id: string }> }>(reviewer.session, `/api/procurement/chain?view=requisition&id=${req.requisition.id}`)
  await api(reviewer.session, '/api/procurement/chain', { action: 'approve-requisition', id: req.requisition.id, approvals: [{ item_id: reqDetail.items[0]!.id, quantity_approved: 10 }] })
  const receipt = await api<{ receipt: { id: string } }>(operator.session, '/api/procurement/chain', { action: 'create-receipt', values: { brand_id: brandA.id, received_date: today, receiving_location: 'Source Store', remarks: tag, items: [{ inventory_item_id: raw.id, description: `${tag} Raw`, unit: 'pcs', quantity_ordered: 10, quantity_delivered: 10, quantity_accepted: 9, quantity_rejected: 1, rejection_reason: 'Damaged test unit', disposition: 'stock' }] } }, 'POST', 201)
  created.receipts.push(receipt.receipt.id)
  const receiptPost = await api<{ movements: number }>(operator.session, '/api/procurement/chain', { action: 'post-receipt', id: receipt.receipt.id })
  assert(receiptPost.movements === 1, 'receipt generated one movement')
  const { data: rawAfterReceipt } = await supabase.from('inventory_items').select('quantity').eq('id', raw.id).single()
  assert(Number(rawAfterReceipt!.quantity) === 109, 'only accepted receipt quantity stocked')
  remember('procurement request, independent approval, receipt, and accepted-only stock movement verified')

  // Transfer is a paired out/in with no change to global stock and replay refusal.
  const transfer = await api<{ issue: { id: string } }>(operator.session, '/api/procurement/chain', { action: 'create-issue', values: { kind: 'transfer', brand_id: brandA.id, issue_date: today, issued_to_type: 'store', issued_to_label: 'Destination', source_store_id: created.stores[0], destination_store_id: created.stores[1], transfer_to_location: 'Destination', items: [{ inventory_item_id: raw.id, description: `${tag} Raw`, unit: 'pcs', quantity_approved: 5, quantity_issued: 5 }] } }, 'POST', 201)
  created.issues.push(transfer.issue.id)
  const transferPost = await api<{ movements: number }>(operator.session, '/api/procurement/chain', { action: 'post-issue', id: transfer.issue.id })
  assert(transferPost.movements === 2, 'transfer created paired movements')
  const { data: transferMovements } = await supabase.from('inventory_movements').select('*').eq('goods_issue_id', transfer.issue.id)
  assert(transferMovements?.length === 2 && transferMovements.some((row) => row.store_id === created.stores[0] && row.direction === 'out') && transferMovements.some((row) => row.store_id === created.stores[1] && row.direction === 'in'), 'source/destination legs present')
  const { data: rawAfterTransfer } = await supabase.from('inventory_items').select('quantity').eq('id', raw.id).single()
  assert(Number(rawAfterTransfer!.quantity) === 109, 'transfer did not change group item total')
  await api(operator.session, '/api/procurement/chain', { action: 'post-issue', id: transfer.issue.id }, 'POST', 400)
  remember('store transfer paired source/destination stock effects and replay refusal verified')

  // Production consumes raw stock and adds only accepted finished goods.
  const production = await api<{ row: { id: string } }>(operator.session, '/api/manufacturing', { action: 'create-run', brand_id: brandA.id, product_item_id: finished.id, planned_quantity: 6, unit: 'pcs', notes: tag }, 'POST', 201)
  created.runs.push(production.row.id)
  const issuedMaterials = await api<{ rows: Array<{ id: string }> }>(operator.session, '/api/manufacturing', { action: 'issue-materials', run_id: production.row.id, lines: [{ item_id: raw.id, quantity: 10, expected_quantity: 10, unit: 'pcs' }], movement_date: today })
  await api(operator.session, '/api/manufacturing', { action: 'record-consumption', material_id: issuedMaterials.rows[0]!.id, consumed_quantity: 9, waste_quantity: 1 })
  const fg = await api<{ row: { id: string } }>(operator.session, '/api/manufacturing', { action: 'create-fg-transfer', run_id: production.row.id, brand_id: brandA.id, item_id: finished.id, produced_quantity: 7, accepted_quantity: 6, rejected_quantity: 1, destination_store_id: created.stores[1] }, 'POST', 201)
  created.fgTransfers.push(fg.row.id)
  await api(operator.session, '/api/manufacturing', { action: 'post-fg-transfer', id: fg.row.id })
  const { data: productionBalances } = await supabase.from('inventory_items').select('id,quantity').in('id', [raw.id, finished.id])
  assert(Number(productionBalances!.find((row) => row.id === raw.id)!.quantity) === 99, 'raw stock reduced through ledger')
  assert(Number(productionBalances!.find((row) => row.id === finished.id)!.quantity) === 6, 'accepted finished stock increased through ledger')
  await api(operator.session, '/api/manufacturing', { action: 'post-fg-transfer', id: fg.row.id }, 'POST', 400)
  remember('production raw consumption, accepted finished output, and double-post refusal verified')

  // Field sales: issue to custody, sale, unsold return, reconciliation.
  const allocation = await api<{ row: { id: string } }>(operator.session, '/api/field-sales', { action: 'create-allocation', brand_id: brandA.id, week_start: today, week_end: today, salesperson_id: operator.member.id, source_store_id: created.stores[1], delivery_note_no: `${run}-DN`, lines: [{ item_id: finished.id, quantity_issued: 2, unit: 'pcs', selling_price_ksh: 100 }] }, 'POST', 201)
  created.allocations.push(allocation.row.id)
  await api(operator.session, '/api/field-sales', { action: 'issue-allocation', id: allocation.row.id })
  await api(operator.session, '/api/field-sales', { action: 'issue-allocation', id: allocation.row.id }, 'POST', 400)
  const dailyReturn = await api<{ row: { id: string } }>(operator.session, '/api/field-sales', { action: 'submit-daily-return', allocation_id: allocation.row.id, brand_id: brandA.id, return_date: today, salesperson_id: operator.member.id, cash_received_ksh: 100, amount_submitted_ksh: 100, lines: [{ item_id: finished.id, quantity_sold: 1, quantity_on_hand: 1, selling_price_ksh: 100 }] }, 'POST', 201)
  created.dailyReturns.push(dailyReturn.row.id)
  const returnNote = await api<{ row: { id: string } }>(operator.session, '/api/field-sales', { action: 'post-return-note', allocation_id: allocation.row.id, brand_id: brandA.id, return_date: today, salesperson_id: operator.member.id, destination_store_id: created.stores[1], lines: [{ item_id: finished.id, quantity_returned: 1, quantity_accepted: 1 }] }, 'POST', 201)
  created.returnNotes.push(returnNote.row.id)
  const reconciliation = await api<{ reconciliation: { cash: { shortfall: number }; lines: unknown[] } }>(operator.session, `/api/field-sales?view=reconciliation&id=${allocation.row.id}`)
  assert(reconciliation.reconciliation.cash.shortfall === 0, 'field sales cash reconciled')
  remember('field-stock issue, custody sale, unsold return, issue replay guard, and reconciliation verified')

  // Petty cash lifecycle.
  const petty = await api<{ account: { id: string } }>(operator.session, '/api/petty-cash', { action: 'create-account', values: { name: `${tag} Float`, brand_id: brandA.id, custodian: operator.member.name, opening_float_ksh: 1000, notes: tag } }, 'POST', 201)
  created.pettyAccounts.push(petty.account.id)
  const pettyTx = await api<{ transaction: { id: string } }>(operator.session, '/api/petty-cash', { action: 'record', values: { account_id: petty.account.id, brand_id: brandA.id, entry_kind: 'expense', expense_amount_ksh: 100, payee: tag, description: 'Disposable test expense', state: 'draft' } }, 'POST', 201)
  created.pettyTransactions.push(pettyTx.transaction.id)
  await api(operator.session, '/api/petty-cash', { action: 'set-state', values: { id: pettyTx.transaction.id, state: 'submitted' } })
  await api(reviewer.session, '/api/petty-cash', { action: 'set-state', values: { id: pettyTx.transaction.id, state: 'approved' } })
  remember('petty-cash float, voucher expense, submission, and approval verified')

  // Finance transaction + double-entry journal idempotency/authority/reversal.
  const financeKey = `${tag}:movement`
  const money1 = await api<{ transaction: { id: string; posting_status: string } }>(operator.session, '/api/finance', { action: 'record', values: { brand_id: brandA.id, direction: 'outflow', amount_ksh: 50, description: tag, posting_status: 'draft', source_type: 'readiness', source_id: run, idempotency_key: financeKey } }, 'POST', 201)
  const money2 = await api<{ transaction: { id: string } }>(operator.session, '/api/finance', { action: 'record', values: { brand_id: brandA.id, direction: 'outflow', amount_ksh: 50, description: tag, posting_status: 'draft', source_type: 'readiness', source_id: run, idempotency_key: financeKey } }, 'POST', 201)
  created.financeTransactions.push(money1.transaction.id)
  assert(money1.transaction.id === money2.transaction.id && money1.transaction.posting_status === 'draft', 'money replay returned same draft')
  assert(!(await listLedger([brandA.id], { brandId: brandA.id })).some((row) => row.id === money1.transaction.id), 'draft excluded from posted ledger')

  const journalBody = { action: 'journal-create', values: { brand_id: brandA.id, effective_date: today, source_type: 'readiness', source_id: run, source_reference: tag, description: tag, idempotency_key: `${tag}:journal`, lines: [{ account_code: '1000', description: 'Test debit', debit_ksh: 50 }, { account_code: '2000', description: 'Test credit', credit_ksh: 50 }] } }
  const journal1 = await api<{ journal: { id: string } }>(operator.session, '/api/finance', journalBody, 'POST', 201)
  const journal2 = await api<{ journal: { id: string } }>(operator.session, '/api/finance', journalBody, 'POST', 201)
  created.journals.push(journal1.journal.id)
  assert(journal1.journal.id === journal2.journal.id, 'journal replay returned same journal')
  await api(operator.session, '/api/finance', { action: 'journal-approve', values: { id: journal1.journal.id } }, 'POST', 403)
  await api(reviewer.session, '/api/finance', { action: 'journal-approve', values: { id: journal1.journal.id } })
  await api(reviewer.session, '/api/finance', { action: 'journal-post', values: { id: journal1.journal.id } })
  const postedReplay = await api<{ journal: { id: string } }>(reviewer.session, '/api/finance', { action: 'journal-post', values: { id: journal1.journal.id } })
  assert(postedReplay.journal.id === journal1.journal.id, 'posting replay idempotent')
  const reversal = await api<{ journal: { id: string; reversal_of_id: string } }>(reviewer.session, '/api/finance', { action: 'journal-reverse', values: { id: journal1.journal.id, reason: tag } })
  created.journals.push(reversal.journal.id)
  assert(reversal.journal.reversal_of_id === journal1.journal.id, 'reversal linked to original')
  remember('draft ledger exclusion, transaction/journal replay protection, capability-authority separation, posting, and linked reversal verified')

  // Synthetic historical source: register → batch → stage → dry run → retry.
  const source = await api<{ row: { id: string } }>(operator.session, '/api/historical-imports', { action: 'register-source', values: { title: `${tag} Synthetic July`, filename: `${tag}.xlsx`, source_type: 'synthetic workbook', evidence_class: 2, brand_id: brandA.id, period_start: '2026-07-01', period_end: '2026-07-31', checksum_sha256: randomBytes(32).toString('hex'), description: 'Disposable synthetic evidence only' } }, 'POST', 201)
  created.sources.push(source.row.id)
  const batchBody = { action: 'create-batch', values: { source_id: source.row.id, target_domain: 'petty_cash', import_type: 'petty-cash', period_start: '2026-07-01', period_end: '2026-07-31' } }
  const batch = await api<{ row: { id: string; period_id: string | null } }>(operator.session, '/api/historical-imports', batchBody, 'POST', 201)
  created.imports.push(batch.row.id)
  if (batch.row.period_id) created.periods.push(batch.row.period_id)
  const { data: batchRecord } = await supabase.from('data_imports').select('*').eq('id', batch.row.id).single()
  const workbook = { sheets: [{ name: 'Synthetic', rows: [[null, null, new Date('2026-07-01'), 0, null, null, null, null, null], [null, 'INCOME', null, null, null, null, null, 'ZIIDI', 'TOTAL'], [null, 100, tag, null, 25, tag, 0, 0, 25]], rowCount: 3, colCount: 9 }] }
  await parseAndStage(batchRecord!, getAdapter('petty-cash'), workbook)
  const dryRun = await api<{ result: { created: number; failed: number } }>(operator.session, '/api/historical-imports', { action: 'dry-run', values: { import_id: batch.row.id } })
  assert(dryRun.result.created > 0 && dryRun.result.failed === 0, 'dry run validates staged rows')
  const retry = await api<{ row: { id: string } }>(operator.session, '/api/historical-imports', batchBody, 'POST', 201)
  assert(retry.row.id === batch.row.id, 'batch retry returned same batch')
  const mapping = await api<{ row: { id: string; original_value: string } }>(operator.session, '/api/historical-imports', { action: 'add-mapping', values: { brand_id: brandA.id, target_domain: 'inventory', source_field: 'item_name', original_value: `${tag} M/P 500`, normalized_value: 'Canonical test item', target_type: 'inventory_item', source_id: source.row.id } })
  created.mappings.push(mapping.row.id)
  assert(mapping.row.original_value === `${tag} M/P 500`, 'original mapping value preserved')
  const { count: batchCount } = await supabase.from('data_imports').select('*', { count: 'exact', head: true }).eq('idempotency_key', batchRecord!.idempotency_key)
  assert(batchCount === 1, 'database contains one idempotent batch')
  remember('synthetic source registration, raw staging, mapping lineage, dry run, retry, and no-duplicate batch verified')

  // RLS and direct-ID/server brand isolation.
  const directTeam = await outsider.client.from('ops_team_members').select('*')
  assert(Boolean(directTeam.error), 'direct team table access denied by RLS/grants')
  const directImports = await outsider.client.from('data_imports').select('*')
  assert(Boolean(directImports.error), 'direct imports table access denied by RLS/grants')
  await api(outsider.session, `/api/people/${operator.member.id}`, undefined, 'GET', 404)
  await api(outsider.session, `/api/procurement/chain?view=issue&id=${transfer.issue.id}`, undefined, 'GET', 404)
  await api(outsider.session, '/api/inventory', { action: 'movement', values: { item_id: raw.id, direction: 'out', quantity: 1, reason: tag } }, 'POST', 400)
  remember('direct PostgREST reads denied and cross-brand people/document IDs hidden by server routes')

  process.stdout.write(`\nLIVE_READINESS_SMOKE_OK ${evidence.length} assertions/groups\n`)
} finally {
  await cleanup()
  const { count } = await supabase.from('ops_team_members').select('*', { count: 'exact', head: true }).ilike('notes', `%${tag}%`)
  process.stdout.write(`CLEANUP ${count === 0 ? 'OK' : `FAILED (${count} team rows remain)`}\n`)
}
