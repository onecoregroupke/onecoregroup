# Audit — Duties, Calendars, Attendance, Performance, Inventory Alerts, Iceland Manufacturing, Analytics

**Phase 1 of the management-meeting addendum.** Continues the Shamim workflow build
(`docs/shamim-workflow/`), which delivered migrations 052–054 as API-only surface.

Audited: live Supabase schema (via `scripts/supabase-sql.mjs`), all 54 repo
migrations, `apps/ops-hub/src/lib`, the route tree, and the prior audit docs.

---

## 0. The finding that comes first

**Migrations 052, 053 and 054 had never been applied to the live database.**

The previous session ended with them committed (`e05c4b9`) but unapplied — the repo has
no migration runner, and they needed the Supabase SQL editor. Every service and route
built in that session (forms lifecycle, print identity, NPT intake/repair/movement/workshop,
the whole procurement requisition→GRN→issue chain) was therefore dead code against
production: 20 tables and both once-only stock indexes were missing.

**Resolved in this session.** Added `scripts/supabase-sql.mjs` (Management API runner,
reads `SUPABASE_ACCESS_TOKEN` from env/`.env.local`, never hard-codes it) and applied
052 → 053 → 054 in order. Verified live:

| Migration | Tables | Status |
|---|---|---|
| 052 forms lifecycle + print identity | `ocg_brand_print_identities`, `ocg_form_template_versions`, `ocg_record_attachments` | ✅ live |
| 053 NPT intake/repair/movement | `npt_intakes`, `npt_intake_items`, `npt_repair_cases`, `npt_repair_case_status_history`, `npt_repair_activities`, `npt_workshop_plans`, `npt_workshop_plan_rows`, `npt_movements`, `npt_training_sessions`, `npt_training_attendance` | ✅ live |
| 054 procurement chain | `procurement_requisitions(+_items)`, `procurement_goods_receipts(+_items)`, `procurement_goods_issues(+_items)`, `procurement_credit_applications` | ✅ live |
| 054 stock guarantees | `idx_inv_movements_receipt_item_once`, `idx_inv_movements_issue_item_once` | ✅ live |

Migrations 001–051 were already applied, including 048's recurrence columns and 050's
fee-rollup RPCs. **Nothing else in the repo is unapplied.**

> Process gap this exposes: there is no record of which migrations have run. Committing a
> `.sql` file and applying it are separate acts, and only the first was tracked. A
> `schema_migrations` ledger is proposed in §5.

---

## 1. "Iceland" is not a brand

The addendum treats Iceland as a manufacturing operation needing its own inventory,
production and sales model. It is not a seventh brand and must not become one.

**Iceland Geyser Ltd owns the Glitz N' Glim brand** — confirmed in the previous session
against the KEBS letter, and visible in `006_glitz_products_v2.sql`, where the product
copy markets cleaners and handwashes "powered by Iceland Geyser minerals". `brands`
holds exactly six rows; there is no Iceland row and none should be added.

**Therefore: everything the addendum calls "Iceland" maps to `brand_id` =
`glitz-n-glim`.** The manufacturing, field-sales and petty-cash work in §§19–34 attaches
to that brand. `lib/brandCategories.ts` and `lib/procurementChain.ts` already carry this
assumption in comments.

The product families the addendum lists (multi-surface cleaner, toilet cleaner, glass
cleaner, strawberry handwash, shower gel, fabric softener) match the Glitz catalogue
already seeded in `006`.

---

## 2. What exists and is reusable

### Recurring duties — stronger than the addendum assumes
`030` created `ocg_daily_duties` + `ocg_daily_duty_logs`; `048` upgraded it into a real
recurrence engine. `lib/recurrence.ts` is pure and unit-tested.

Already supported: `daily`, `weekdays`, `weekly` (selected days), `monthly` (incl. last
working day), `interval` (every N days), `start_date`, `end_date`, `time_of_day`,
`timezone`, `priority`, `category`, `requires_proof`, `reminder_minutes`, `paused`.

**§1's schedule configuration is largely already built.** So is §2's core correctness
requirement: occurrences are *derived* from the rule rather than generated as rows, and
completion is a single `(duty_id, duty_date)` log row — so the same occurrence
structurally cannot appear as two underlying tasks, and yesterday's result can never be
overwritten by today's.

Missing: targeting beyond one assignee (no team/department/role/location), checklists,
required-form / required-attachment / required-approval, reviewer, grace period,
escalation.

### Procurement chain — §§22–23 substantially exist
`054` delivers requisition → approval → goods receipt → issue, with the integrity rules
unit-tested in `procurementChainModel.test.ts`: a requester cannot approve their own
requisition, approval moves no stock, only *accepted* quantity is stocked, issue cannot
exceed approved or available. Double-posting is blocked by partial unique indexes on
`inventory_movements` — at the database level, not in application code.

### Inventory ledger — the bones are right
`inventory_movements` already stores `quantity_after` per line and keeps
`inventory_items.quantity` in sync, with source-document FKs (`goods_receipt_id`,
`receipt_item_id`, `goods_issue_id`, `issue_item_id`). **This is already the ledger §20
asks for**, and `recordStockMovement` already refuses to drive stock negative.

### Other reusable foundations
- **Tasks** — `ops_tasks`, brand-aware, assignment emails, no-login completion links.
- **Morning brief** — `/api/reports/team-briefs` exists, cron-gated, fails closed without `CRON_SECRET`.
- **Notifications** — `ocg_notifications` with read state and `href` deep-links.
- **Audit** — `ocg_audit_events` with before/after JSONB, changed-field arrays and undo linkage.
- **Attachments** — `ocg_record_attachments` (052) is a generic record-attachment table, directly reusable for §11–12 document packets.
- **Print identity** — `ocg_brand_print_identities` (052) already renders branded document headers; reusable for §27 delivery notes.
- **Imports** — `data_imports` + `data_import_rows` (046) is a staged import framework with preview/validation, directly reusable for QuickBooks (§2–3 addendum) and the sales workbook (§24).
- **Record versions** — `record_versions` (046) supports the §32 no-silent-deletion rule.
- **Permissions** — section-based `can()` with brand scoping and a deliberate no-fallback policy for money-adjacent sections.

---

## 3. What is partial

| Area | State | Gap |
|---|---|---|
| **Duties** | Recurrence complete | Targeting, checklists, requirements, reviewer, escalation, grace |
| **Task lifecycle** | 8 statuses | No `Submitted`/`Under Review`/`Reopened`/`Cancelled` (§13) |
| **Task completion** | Free-text note + `ops_completion_records` | No structured report: outcome, challenges, follow-up, time spent, evidence requirements (§12) |
| **Morning brief** | Open tasks only | No duties, no overdue, no manager brief, no visual type distinction (§4) |
| **Attendance** | `ops_attendance_records`: check-in/out, source, raw payload | No schedules, expected vs actual, late/overtime, duplicate-punch handling, unmatched identifiers, corrections, weekly finalization (§§9–10) |
| **Inventory** | Ledger + reorder_level field | `reorder_level` is inert — nothing reads it. No alerts (§8) |
| **Petty cash** | `045`: accounts, transactions, charges kept separate from expense, running balance | **No float cycles.** One unbounded list per account; no open/close, no carry-forward, no closure approval, no document packet (§§5–12 addendum) |
| **Analytics** | `lib/analytics.ts`, 118 lines: finance + school fees + 4 task counters | The addendum's §16 verdict is correct. No sales, manufacturing, NPT, attendance or duty analytics; no drill-down; no period comparison |
| **Forms** | Templates, versions, submissions, attachments | Most types don't post to a ledger (§33) |

---

## 4. What does not exist at all

Calendar module (no `/calendar` route; only the marketing content calendar and a meetings
list) · work schedules · performance ratings · reorder alerts · stock counts · item
classification (raw/packaging/WIP/finished) · production runs and batches · finished-goods
store · BOM · field-sales custody · weekly allocations · daily sales returns · QuickBooks
import · sales-custody ledger.

---

## 5. Risks and conflicts

1. **No migration ledger.** The root cause of §0. Proposed: a `schema_migrations` table
   written by the runner, so "committed" and "applied" stop being indistinguishable.
2. **`ops_attendance_records` has no unique constraint** on `(team_member_id, attendance_date)`.
   `upsertAttendance` calls `.upsert()` without a conflict target, so a re-imported
   biometric week inserts duplicates rather than updating. This must be fixed before any
   weekly import workflow is built on top of it (§9), and before attendance feeds any
   performance score (§11).
3. **Attendance identity is by email/name string match.** `listAttendanceFor` falls back to
   `ilike(employee_name)` when a record has no email — two employees sharing a first name
   would see each other's attendance. Needs a hard employee-identifier link.
4. **`petty_cash_transactions.running_balance_ksh` is app-computed and stored.** With no
   float boundary, a mis-ordered insert silently corrupts every subsequent balance. Float
   cycles (§5 addendum) also fix this by bounding recomputation.
5. **`inventory_items.quantity` is a live cache** alongside the movement ledger. Correct
   today because `recordStockMovement` is the only writer, but nothing at the database
   level enforces that. Manufacturing adds more writers — worth a reconciliation check.
6. **No UI for migrations 052–054.** Now that the tables are live, the previous session's
   entire surface is reachable only by API. Shamim still cannot use any of it from a browser.

---

## 6. Blocked — missing source materials

The addendum states that delivery notes, petty-cash sheets, the daily sales workbook and
QuickBooks exports "will be attached in the execution conversation". **No attachments are
present in this conversation.**

Consequently these are blocked on real data, not on engineering:

- **§23 spreadsheet mapping report** — cannot map sheets, formulas, or negative-number conventions without the workbook.
- **§24 sales spreadsheet import** — the *importer* can be built (staged, previewed, mapped, confirmed); the concrete column mapping cannot.
- **§26 canonical SKU master** — sizes, package configurations, barcodes and selling prices must come from the workbook and QuickBooks, not be invented.
- **Addendum §2–3 QuickBooks field mappings** — export shapes are unknown; the import layer will be built format-agnostic with user-driven field mapping, which is what §3 asks for anyway.
- **§27 delivery-note numbering** — the existing series and format are on the physical pads.

Everything not on this list proceeds without them.

---

## 7. Sequencing

Ordered by dependency, not by addendum section number:

| Migration | Scope | Unblocks |
|---|---|---|
| `055` | Duties: targeting, checklists, requirements, review, escalation | §§1–4 |
| `056` | Calendar: events, visibility, unified feed | §§5–7 |
| `057` | Completion reports, review states, daily operations dataset | §§12–14 |
| `058` | Work schedules + attendance rebuild (fixes risks 2–3) | §§9–10 |
| `059` | Reorder alert lifecycle | §8, §35 |
| `060` | Manufacturing: item classes, production runs, FG transfer, stock counts | §§19–28, §32 |
| `061` | Field-sales custody, allocations, daily returns | Addendum §§15–22, §29 |
| `062` | Petty-cash float cycles + document packets (fixes risk 4) | Addendum §§5–14, §30 |
| `063` | QuickBooks import + reconciliation | Addendum §§2–4 |
| `064` | Transparent performance metrics — components only, no scoring | §11 |

Performance is deliberately last: §11 requires source data to be validated before any
consequential rating, and its inputs are 055, 057 and 058.
