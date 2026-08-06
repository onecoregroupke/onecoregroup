# Completion Report — Duties, Calendars, Attendance, Performance, Inventory Alerts, Iceland Manufacturing, Analytics

**Branch:** `feat/shamim-workflow` · **Commits:** `68e7a8e` … `2caf551`
**Migrations:** 052–054 (applied, from the previous session) + 055–065 (new)
**Tests:** 376 passing, up from 109 · **Type-check:** clean across 7 workspaces

Audit: [01-AUDIT.md](01-AUDIT.md). Prior phase: [`docs/shamim-workflow/`](../shamim-workflow/).

---

## Read this first

**This is a data + service + test layer. There is no UI and no API for any of it.**

That was the largest gap at the end of the previous session, and this session made
it larger rather than smaller: eleven more migrations, ten more pure-logic
modules, 267 more tests — and still nothing a person can click. Shamim, Wallace,
Anthony and Gumi cannot use any of this from a browser today.

I have not scaled the brief down silently. The per-section status below says
exactly what exists.

---

## 1. Audit findings

### 1.1 The headline finding — migrations 052–054 were never applied

The previous session committed them (`e05c4b9`) but they needed the Supabase SQL
editor and were never run. **20 tables and both once-only stock indexes were
missing from production**, while the services and routes depending on them were
merged and believed live. Forms lifecycle, print identity, the whole NPT
intake/repair/movement/workshop surface, and the entire procurement
requisition→GRN→issue chain were dead code against the real database.

**Fixed.** Added `scripts/supabase-sql.mjs` (Management API runner, reads
`SUPABASE_ACCESS_TOKEN` from env/`.env.local`, never hard-codes it) and applied
052 → 053 → 054 in order. All 20 tables and both indexes verified live.

**Root cause fixed too.** "Committed" and "applied" were indistinguishable —
the repo tracked the file, nothing tracked the execution. Migration `065` adds
`schema_migrations`; the runner writes to it automatically, and
`node scripts/supabase-sql.mjs --pending` exits non-zero if any migration file
lacks a ledger entry. It currently reports **"All migrations applied"** for
001–065.

### 1.2 "Iceland" is not a brand

The addendum treats Iceland as an operation needing its own inventory, production
and sales model. **Iceland Geyser Ltd owns the Glitz N' Glim brand** — confirmed
last session against the KEBS letter, and visible in `006_glitz_products_v2.sql`
where the product copy markets cleaners "powered by Iceland Geyser minerals".

`brands` holds exactly six rows. **No brand row was created.** All manufacturing,
field-sales and petty-cash work attaches to `brand_id = glitz-n-glim`.

### 1.3 Two real defects found and fixed

| Risk | Defect | Fix |
|---|---|---|
| **2** | `ops_attendance_records` had **no unique key** on (employee, date), and `upsertAttendance()` called `.upsert()` with **no conflict target**. A re-imported biometric week INSERTED duplicates instead of updating — and §37 requires duplicate-punch handling, with nothing to deduplicate against. | Unique index added (table was empty, no backfill) + the missing `onConflict`. |
| **3** | Attendance identity fell back to a case-insensitive **name** match when a record had no email. Two employees sharing a name could see each other's attendance. | Fallback removed — no email now returns nothing rather than guessing. Biometric identity got its own mapping table, since devices emit an enrolment id, not an email. |

### 1.4 What already existed and was reused, not rebuilt

- **The recurrence engine.** `048` + `lib/recurrence.ts` already covered §1's whole schedule vocabulary — daily, weekdays, selected days, monthly, last working day, every N days, start/end, time, timezone, grace-adjacent fields. §2's core correctness property was already right too: occurrences are *derived*, not generated, so history cannot be overwritten.
- **The stock ledger.** `inventory_movements` already stored `quantity_after` per line with source-document FKs and once-only partial indexes. **§20 was already built.** 060 classified items and added production on top rather than creating a second ledger.
- **The procurement chain.** `054` already delivered §§22–23 with its integrity rules unit-tested.
- **Charge separation in petty cash.** `045` already kept transaction charges apart from the expense amount, which addendum §7 requires.
- Also reused: `ocg_record_attachments` (document packets), `ocg_brand_print_identities` (delivery notes), `data_imports` (staged import framework), `record_versions`, `ocg_audit_events`, `ocg_notifications`.

---

## 2. Per-section status

| § | Area | Status | Notes |
|---|---|---|---|
| 1 | Configurable daily duties | **Complete (data+logic)** | Targeting by employee/team/department/brand/location/role; checklists; required note/evidence/form/approval; grace, escalation, reviewer, holidays |
| 2 | Duties as tasks | **Complete (data+logic)** | Occurrence identity = duty × date × person, enforced by unique index; one task per occurrence enforced by partial unique index |
| 3 | Duty permissions | **Complete** | All ten `duties.*` capabilities derived from the existing section/level/brand model |
| 4 | Morning brief + duty emails | **Partial** | Assembly, dedupe, send-once and manager-brief logic built and tested. **Not wired into the cron route or the email templates.** |
| 5–7 | Calendars | **Partial** | Events, visibility, leave, reschedule audit, unified feed, all four view windows. **No calendar UI.** |
| 8 | Reorder alerts | **Partial** | Full lifecycle + dedupe guarantee + recipient routing. **No trigger job, no email.** |
| 9 | Attendance / biometric | **Partial** | Schedules, calculations, exceptions, staged import with unmatched quarantine. **No import UI, no parser for a real device export.** |
| 10 | Work schedules | **Complete (data+logic)** | Effective-dated, per-employee, with overrides |
| 11 | Performance | **Complete (Phase 1)** | Components + transparency + configurable weights. Deliberately provisional-by-default; Phase 2 (consequential scoring) not activated, per the brief |
| 12 | Completion notes/reports | **Complete (data+logic)** | Structured report + gating |
| 13 | Completion review | **Complete (data+logic)** | Submitted → Under Review → Completed/Reopened; reviewer cannot accept own work |
| 14 | Daily operations collection | **Complete (data)** | `ops_daily_operations` view + summary/drill-down logic |
| 15 | Daily/weekly management reports | **Not started** | |
| 16–18 | Detailed analytics architecture, Iceland sales, NPT analytics | **Not started** | The single biggest remaining piece |
| 19–21 | Manufacturing model, ledger, document control | **Complete (data+logic)** | |
| 22–28 | Receiving → production → finished goods → planning guide | **Complete (data+logic)** | |
| 29 | Sales/finished-goods integration | **Partial** | Reservation fields exist; order→reservation flow not built |
| 30–31 | Stock cards, counts | **Complete (data+logic)** | Stock card is a view derived from the ledger |
| 32 | Manufacturing analytics | **Not started** | |
| 33 | Form-to-ledger | **Partial** | GRN/issue/transfer/allocation/return all post through documents. Other form types not mapped |
| 34 | Financial connections | **Complete (design)** | Reconciliation status separated from operational status |
| 35 | Notifications | **Partial** | Alert + brief logic exists; no dispatcher |
| 36 | Permissions | **Partial** | New keys added and modelled; **not role-tested against a live session** |
| 37 | Testing | **Partial** | 376 unit tests including the brief's manufacturing, field-sales, petty-cash, performance and duty lists. **No integration or role tests.** |

### Addendum

| § | Area | Status |
|---|---|---|
| 1–4 | QuickBooks boundary, import, reconciliation | **Complete (data+logic)**, format-agnostic |
| 5–10 | Petty-cash float cycles, carry-forward | **Complete (data+logic)** |
| 11–14 | Document packets, completeness rules | **Complete (data+logic)**; merged-PDF generation **not built** |
| 15–22 | Field-sales custody, daily returns, closure | **Complete (data+logic)** |
| 23–26 | Spreadsheet mapping, import, SKU master | **Blocked** — see §4 |
| 27 | Delivery-note generator | **Not started** |
| 28–31 | Payment reconciliation, dashboards, document search | **Not started** |
| 32–33 | Audit and role separation | **Partial** — reviewer/approver separation enforced; full matrix not tested |

---

## 3. Data model

**11 new migrations, all applied and verified.**

| Migration | New tables | Key structural guarantees |
|---|---|---|
| `055` | `ocg_duty_checklist_items`, `ocg_duty_checklist_results`, `ocg_holidays` | Occurrence key re-keyed to (duty, date, assignee) with `COALESCE` on the nullable assignee; new index created **before** the old constraint was dropped |
| `056` | `ocg_calendar_events`, `..._attendees`, `ocg_calendar_reschedules`, `ocg_leave_requests` | Visibility CHECK; brand-visibility requires a brand; `ends_at >= starts_at` |
| `057` | `ops_task_reviews` + view `ops_daily_operations` | One task per duty occurrence (partial unique index) |
| `058` | `ops_work_schedules`, `ops_schedule_overrides`, `ops_biometric_identities`, `ops_attendance_periods`, `ops_attendance_imports`, `..._rows` | **Attendance (member, code, date) unique** — the RISK 2 fix; one biometric id per device |
| `059` | `inventory_reorder_alerts`, `..._events`, `inventory_alert_recipients` | **At most one unresolved alert per item+location** (partial unique index); dismissal requires a reason |
| `060` | `inventory_stores`, `production_bom_lines`, `production_runs`, `production_run_materials`, `production_fg_transfers`, `inventory_stock_counts`, `..._items` + view `inventory_stock_cards` | `accepted+rejected <= produced`, `transferred <= accepted`; one movement per FG transfer; one adjustment per counted line; variance is a GENERATED column |
| `061` | `field_sales_allocations`, `..._items`, `field_sales_custody_movements`, `field_sales_daily_returns`, `..._items`, `field_sales_return_notes`, `..._items` + view `field_sales_custody_balances` | **Custody balance cannot be written negative** (CHECK); one custody movement per allocation line |
| `062` | `petty_cash_floats`, `petty_cash_documents`, `petty_cash_document_rules` + view `petty_cash_float_ledger` | **One active float per custodian**; **one successor per float** (the carry-forward double-count guard); `total_available` GENERATED |
| `063` | `quickbooks_imports`, `quickbooks_transactions`, `quickbooks_matches`, `quickbooks_match_events` | **A match cannot be accepted with fewer than two agreeing signals** — "do not match solely by amount", in the database; same file cannot be committed twice |
| `064` | `performance_weight_profiles`, `performance_role_metrics`, `performance_periods`, `performance_adjustments` | Weights must total 100; **attendance capped at 25**; adjustment reason mandatory |
| `065` | `schema_migrations` | The ledger that makes §1.1 unrepeatable |

**New permission keys:** `duties`, `duties_all`, `duties_review`, `calendar_team`,
`calendar_events`.

**Backfills:** only `065`'s ledger backfill. Nothing else needed one — the
attendance table was empty and every other change is additive with defaults.

---

## 4. Blocked — and why

The addendum states that delivery notes, petty-cash sheets, the daily sales
workbook and QuickBooks exports "will be attached in the execution conversation".
**No attachments were present.** These are blocked on data, not engineering:

- **§23 spreadsheet mapping report** — cannot map sheets, formulas or negative-number conventions without the workbook.
- **§24 sales spreadsheet import** — the importer's *safety* logic is built and tested (duplicate delivery-note and invoice detection, case- and whitespace-insensitive, including repeats within one file). The concrete column mapping cannot be.
- **§26 canonical SKU master** — sizes, package configurations, barcodes and prices must come from the workbook and QuickBooks. The schema holds them; I have not invented values.
- **Addendum §2–3 QuickBooks field mappings** — export shapes unknown. Built format-agnostic with user-supplied mapping, which §3 asks for regardless.
- **§27 delivery-note numbering** — the existing series lives on the physical pads.

**Still open from last session:** §2 needs Shamim's account email; there is no
"Shamim" in the codebase and users live in Supabase.

---

## 5. What the brief asked for that I have NOT delivered

Stated plainly, since §39 asks for a truthful report:

1. **No UI, anywhere.** Not one screen. This is the dominant gap.
2. **No API routes** for duties, calendar, attendance, manufacturing, field sales, floats or QuickBooks.
3. **Analytics (§§16–18, §32) not started** — the brief's own §16 verdict on the existing analytics still stands.
4. **Daily/weekly management reports (§15) not started.**
5. **No dispatcher** — alerts, briefs and notifications compute but nothing sends them.
6. **The §39 demonstration scenarios have not been run.** The petty-cash cycle, field-sales week and manufacturing flow are enforced by constraints and covered by unit tests, but I have not executed them end-to-end against live data, and I will not claim I have.
7. **Permissions are modelled, not role-tested** against real sessions.
8. **No integration tests** — all 376 are unit tests over pure functions.

---

## 6. Evidence

```bash
node scripts/supabase-sql.mjs --pending
```
→ `All migrations applied.`

```bash
cd apps/ops-hub && npm test
```
→ `tests 376 · pass 376 · fail 0`

```bash
npm run type-check
```
→ `Tasks: 7 successful, 7 total`

The tests that matter most are the ones asserting the brief's stated invariants:

- Allocating 500 then selling 300 deducts the main store **exactly once** (−500, not −800).
- Approved leave leaves the attendance denominator entirely — four present days plus one leave day is **100%, not 80%**.
- A component with no data is **excluded and its weight redistributed**, never scored as zero.
- Matching on amount alone is **never acceptable**.
- A returned/reimbursed/written-off petty-cash balance is **not also carried forward**.
- An unassigned or blank-target duty resolves to **nobody, never everybody**.
- A private calendar event stays private **from the founding admin too**.
- The assignee of a manager-assigned task **cannot drag it** to a new date.

## 7. Deployment

- **Branch:** `feat/shamim-workflow`
- **Migrations:** applied to the live Supabase project, recorded in `schema_migrations`
- **Preview URL:** none — no UI to preview
- **Production status:** schema is live; no user-facing surface ships with it
- **Rollback:** every migration is additive (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, new indexes/constraints). No data was destroyed or rewritten. Rolling back means dropping the new tables and constraints; existing rows are untouched. The one non-additive change is `055`'s re-key of the duty-occurrence constraint — the replacement index was created before the old one was dropped, and the old constraint can be restored from `030` if needed.

## 8. Recommended next step

**Build the UI**, starting with duties and the calendar. Eleven migrations of
correct, well-tested schema deliver nothing to the business until someone can
open a page. The analytics layer (§§16–18) is the second priority, and it now
has real source tables to read from rather than the four counters it has today.
