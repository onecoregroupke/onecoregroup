# Repository Audit & Architecture Decisions — Finance / School Upgrade

Audit of the **existing** Ops Hub before implementing the upgrade. Goal: reuse
canonical entities, avoid parallel tables, and enforce brand scope without breaking
the ~100 tables / 43 migrations already in production.

## 1. What already exists (reuse — do NOT rebuild)

**Auth & permissions** (`lib/permissions.ts`, `lib/server-auth.ts`, `lib/api-auth.ts`,
`contexts/PermissionsContext.tsx`)
- `PermissionsMap` (section → `none|view|edit`) + `BrandAccessMap` (section → brand UUID[]).
- `finance`, `inventory`, `procurement`, `all_tasks`, `marketing` are already
  **brand-scopeable** (`BRAND_SCOPED_SECTIONS`). School sections exist:
  `rayyan_admin`, `rhythms_admin`, `darul_admin`, plus `management`, `npt_service`, etc.
- `Actor` exposes `can(section, level)`, `allowedBrandIds(section)`, `isSuperAdmin`,
  `taskScope`. `requireApiSection(req, section, level)` gates API routes;
  `requireSection()` gates pages. **This is the enforcement backbone to extend.**
- No row = founding admin (full access). Transient DB errors throw (never escalate).

**Finance** (migrations 034/035/038, `lib/finance.ts`, `lib/financeStatements.ts`)
- `finance_accounts`, `finance_transactions` (brand-scoped, `direction`, `category`,
  `transaction_cost_ksh`, statement links), `finance_interbrand_transfers`,
  `finance_reconciliation_batches` / `_matches`, `finance_exceptions`, `finance_voteheads`.
- `finance_statement_imports` + `finance_statement_lines` — a **staging → review → commit**
  import pattern (file ref, `raw_payload` JSONB, `suggested_*` classifications,
  `review_status`, `ledger_transaction_id`). **Generalise this shape for Part 8.**
- The finance write path (`/api/finance`) **already** enforces brand scope via
  `actor.allowedBrandIds('finance')` + `assertBrandInScope()`. Reads must do the same.

**Schools** (migrations 025/026/027/028/033/043; routes `/rayyan`, `/rhythms`, `/darul`)
- Per-school tables: `*_students`, `*_guardians`, `*_admissions`, `*_classes`,
  `*_attendance_notes`, `*_admin_tasks`, `*_fee_followups`.
- Fees: `rayyan_fee_invoices/payments`, `rhythms_fee_invoices/payments`,
  `darul_fee_invoices/payments` — invoice = one category charge (`fee_item` + `term` +
  `amount_expected_ksh` + `amount_paid_ksh` + generated `balance_ksh`); payments link to
  an invoice.
- SchoolPay import: `*_schoolpay_import_batches` + `*_schoolpay_payment_snapshots`.
- Academics: **Rayyan only** — `rayyan_assessments` (year/term/learning_area/
  assessment_type/performance_level/score/teacher), `rayyan_activities`,
  `rayyan_student_activities`, `rayyan_student_history`. Darul has `darul_hifz_progress`.
- Student pages exist: `/rayyan/students/[id]` (+ `/transcript`); Rhythms/Darul have list
  pages only. Reports pages exist per school.

**Audit / forms / attendance**
- `ocg_audit_events` (036) + `lib/audit.ts` — append-only audit log to extend.
- `ocg_form_templates` / `_submissions` (042) — dynamic forms engine.
- `ops_attendance_records` (036).

**I/O**
- Import/export today is **CSV** (`/api/mhub/glitz/{import,export}`,
  `/api/mhub/npt/{import,export}`). **No server-side XLSX capability exists.**

## 2. Gaps vs. the brief

| # | Requirement | Status |
|---|---|---|
| 1 | Finance landing = group summary **+ brand breakdown → per-brand workspace** | `/finance` is a single combined page → **restructure** |
| 2 | Brand scope on **all** finance reads + DB-level defence | Writes scoped; **reads + RLS need work** |
| 3 | Student **category sub-ledgers** + allocations + derived balance | Partial (`fee_invoices`); **no allocations/ledger entries/categories config** |
| 4 | Rhythms **course/programme billing** config + schedule generation | **Missing** |
| 5 | Ar‑Rayyan **category/year** balances (Daycare/Playhouse) | Partial; **no section/category dimension** |
| 6 | Academic reporting for **Rhythms & Darul** + report cards/transcripts | Rayyan partial; **Rhythms/Darul missing** |
| 7 | **Petty cash** workspace + import | **Missing entirely** |
| 8 | Reusable **Excel** import framework (adapters, dup detection, receipts, rollback) | Pattern exists (038/schoolpay); **needs generalisation + XLSX** |
| 9 | **Excel export** (normalized + accountant workbook style) | **Missing (CSV only)** |
| 10 | **Autosave**, version history, undo/restore, posting state machine | **Missing** (audit log exists) |
| 11 | Permissions for new actions (post/reverse/import/approve/petty-cash/marks…) | Extend existing model |

## 3. Key architecture decisions

**D1 — Student accounting: add a canonical ledger layer, keep existing fee tables.**
Introduce shared, school-agnostic tables: `school_charge_categories` (configurable per
school/programme/section, effective-dated), `school_ledger_entries` (student + category +
`entry_type` charge|payment|adjustment|reversal + decimal amount + posting `state`
draft|posted|reversed + source provenance + import id), and `school_payment_allocations`
(payment → charges). Balances are **derived** (`Σ charges − Σ payments`), never stored as
the source of truth. Existing `*_fee_invoices/payments` are **preserved** and backfilled
into ledger entries (non-destructive; old tables remain readable during transition).
*Rationale:* the brief mandates multiple sub-ledgers, allocations, derived balances,
immutable posted entries and effective-dated pricing — the flat invoice model can't
express these, and per-school duplication (×3+) is worse than one scoped table keyed by
`school`/`brand_id`.

**D2 — Brand/school scope enforced in the query layer (primary) + RLS (defence).**
API routes use the **service role** (RLS bypassed), so the real enforcement point is the
query layer: every read/mutation filters by `actor.allowedBrandIds(section)` via a shared
`assertBrandInScope` / `scopedBrandFilter` helper (extend the finance pattern to all
modules). Additionally add **corrected RLS policies** for the `authenticated` role as
defence-in-depth. Enforced in code **and** DB — never only hidden in the UI.

**D3 — One import foundation + adapters (generalise migration 038).**
`imports` (file, hash, type, brand, counts, status, rollback status) + `import_rows`
(staging, `raw_payload`, mapped fields, `dup_status`, `row_state`, target FK) + optional
`import_field_mappings`. Adapters: `school-ledger`, `debtors`, `petty-cash`, `completion`,
`payments`. Commit is transactional & idempotent; each committed row links back to its
source; rollback deletes only still-safe (draft/unreconciled) rows.

**D4 — Add `exceljs` (server-side) for read + styled write.** No XLSX capability exists;
`exceljs` covers streaming reads (large sheets) and the "accountant workbook" styled
export. Parsing runs **server-side** (Part 8/execution rule 15). Uploaded workbooks go to
Supabase Storage (private bucket) as an import attachment — never public.

**D5 — Posting state machine + versioning for autosave.** Money records are
`draft → posted → reversed`; autosave writes **drafts** only (never a posted ledger row).
Posted rows are immutable — corrections via reversal/adjustment entries. Add
`record_versions` (append-only snapshots for undo/restore) and extend `ocg_audit_events`
for material changes (old/new value, brand scope, reason, import id). Autosave is a
generic client hook (debounced, Saving/Saved/Offline/Unsaved/Failed, conflict detection
via `updated_at`).

**D6 — Petty cash as a first-class finance module.** New `petty_cash_accounts`,
`petty_cash_transactions` (float, cash_received, expense, transaction_charge,
secondary_charge/ZIIDI, derived total_cash_out, running balance), `petty_cash_reconciliations`
(physical count vs expected). Workflow mapped onto the existing permission system
(draft→submitted→reviewed→approved→reconciled→closed). Decimal-safe throughout.

**D7 — Extend academics with the Rayyan pattern.** Generalise assessments to Rhythms &
Darul via configurable assessment areas / scales / report templates (reuse the forms-engine
JSONB config style). Report cards & transcripts render server-side (print CSS / DOCX like
the existing meeting-notes DOCX route). Finance↔academics links are **indicators only**;
any blocking rule is explicitly configured, permissioned, auditable, reversible.

## 4. Migration & backward-compatibility strategy (Part 15)

- New migrations start at **`044_…`**, additive only. No `DROP`/destructive changes; no
  edits to existing migration files. New tables carry explicit
  `GRANT ALL … TO service_role` + RLS (per repo convention).
- Money = `NUMERIC(14,2)`; currency defaults to **KES**. External refs (receipt, M‑Pesa)
  stored as **TEXT**, with unique constraints only where a reference is trustworthy.
- Backfill `*_fee_invoices/payments` → ledger entries idempotently; keep originals.
- Records that can't be safely brand-scoped go to a **review queue**, never auto-assigned.
- Types added to `packages/db/src/types.ts` (+ `Database` map + `src/index.ts` export) per
  the repo's documented "add an ops migration" flow.
- Migrations are applied by a human in the Supabase SQL editor (repo convention) — this
  agent does not run them against production.

## 5. Reuse map (quick reference)

| Need | Reuse |
|---|---|
| Gate API routes | `requireApiSection(req, section, level)` |
| Brand scope | `actor.allowedBrandIds(section)` + `assertBrandInScope()` |
| Money movement | `recordMoneyMovement()` / `finance_transactions` |
| Import pattern | migration 038 staging→review→commit |
| Audit | `ocg_audit_events` + `lib/audit.ts` |
| Config JSONB | forms engine (042) conventions |
| Print/DOCX export | meeting-notes DOCX route pattern |
| Students/guardians/classes | existing `*_students` etc. — extend, don't replace |
