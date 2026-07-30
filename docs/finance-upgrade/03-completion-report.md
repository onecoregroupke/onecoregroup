# Completion Report — Finance / School Accounts / Petty Cash / Imports

**Scope delivered this iteration:** Phase 0 (Foundation), Phase 1 (brand-first Finance
navigation), Phase 2 (Petty Cash end-to-end), and Phase 3 (reusable Excel import/export
framework), plus the canonical student-account ledger and its read/write API. Built
autonomously on top of the existing Ops Hub without altering working modules.

## 1. Summary of what was implemented

- **Canonical student-account ledger** (school-agnostic, brand-scoped): configurable
  charge categories, programmes/courses, versioned fee structures, enrolments, ledger
  entries with a posting state machine (`draft → posted → reversed`), payment
  allocations, and non-financial completion requirements. Balances are **derived**
  (Σ charges − Σ payments); posted entries are immutable (corrections via reversal).
- **Petty cash** module (Part 7): brand/custodian floats, income/expense/opening lines,
  decimal-safe transaction + withdrawal + **ZIIDI** secondary charges, generated
  `total_cash_out`, running balance, reconciliation (physical vs expected), and a
  draft→…→closed workflow.
- **Reusable Excel import framework** (Part 8): one foundation (upload → parse → stage →
  classify duplicates → validate/dry-run → commit → receipt → rollback) with
  source-specific adapters (`petty-cash`, `school-ledger`). Server-side parsing via
  `exceljs`; uploaded workbooks retained in a **private** Storage bucket.
- **Excel export** (Part 9): styled, accountant-friendly workbooks — brand transactions,
  petty cash, and per-student statements (Date / Description / Receipt / M-Pesa / Debit /
  Credit / running Balance).
- **Brand-first Finance navigation** (Part 1): the landing page keeps the group summary
  and adds a brand breakdown; each brand opens a scoped `/finance/[brand]` workspace
  (overview, money in/out, petty cash, import, recent imports, export).
- **Autosave** hook (Part 10): debounced saves, `Saving/Saved/Offline/Unsaved/Failed`
  states, local draft recovery, retry, unload guard — wired into the petty-cash entry form.
- **Audit + versioning**: every material mutation writes an append-only `record_versions`
  snapshot and an `ocg_audit_events` entry (reusing the existing audit helper).
- **Decimal-safe money** utility used across all financial arithmetic.

## 2. Files & modules changed / added

**Migrations (additive, `044`–`046`):**
- `044_school_finance_foundation.sql` — `school_charge_categories`, `school_programmes`,
  `school_fee_structures`(+`_items`), `school_enrollments`, `school_ledger_entries`,
  `school_payment_allocations`, `school_student_requirements`.
- `045_petty_cash.sql` — `petty_cash_accounts`, `petty_cash_transactions`,
  `petty_cash_reconciliations`.
- `046_imports_and_versions.sql` — `data_imports`, `data_import_rows`, `record_versions`
  (+ wires `import_id` FKs).

**`@ocg/db`:** row types + `Database` map entries + `src/index.ts` exports for all 14 new
tables (`packages/db/src/types.ts`, `src/index.ts`).

**Lib (`apps/ops-hub/src/lib`):** `money.ts`, `xlsx.ts`, `schoolBalance.ts`,
`schoolFinance.ts`, `pettyCash.ts`, `recordVersions.ts`, `useAutosave.ts`,
`imports/framework.ts`, `imports/registry.ts`, `imports/storage.ts`,
`imports/pettyCashAdapter.ts`, `imports/schoolLedgerAdapter.ts`,
`imports/parse/pettyCash.ts`, `imports/parse/schoolLedger.ts`.

**API routes:** `/api/petty-cash`, `/api/imports`, `/api/school-accounts`,
`/api/finance/export`.

**Pages / UI:** `/finance/[brand]/page.tsx`; brand-breakdown cards added to
`/finance/page.tsx`; components `PettyCashPanel.tsx`, `ImportWizard.tsx`.

**Tests:** `money.test.ts`, `schoolBalance.test.ts`, `imports/parse/schoolLedger.test.ts`,
`imports/parse/pettyCash.test.ts`; `test` script (Node test runner + `tsx`).

**Docs:** `docs/finance-upgrade/01`…`05`.

## 3. Workbook structures detected & assumptions

Documented in `01-workbook-analysis.md`. Key assumptions applied:
- Per-student blocks with carry-down identity; a blank row starts a new student **only if**
  the next row carries an admission number (else it's a same-student sub-block).
- TOTAL/subtotal rows are never imported (detected by keyword).
- The workbook `BALANCE` column is stored as `source_balance` (audit only); the system
  balance is always derived.
- Dr = charge, Cr = payment; a mirrored Dr+Cr row yields one charge + one payment
  (uniqueness is per `(workbook, sheet, row, entry_type)`).
- Only the DATE column is trusted for dates; corrupt serials elsewhere are ignored.
- Petty-cash columns are detected **per block** (they shift); ZIIDI is the labelled
  secondary charge.

## 4. Security & permission changes

- All new writes gated by `requireApiSection(req, 'finance', 'edit')` and brand-scoped via
  `actor.allowedBrandIds('finance')` + `assertBrandInScope` (enforced in the service
  layer, which runs as service-role — the real enforcement point). Reads gated on
  `finance` view + brand scope.
- New tables carry RLS (authenticated read where appropriate; service-role full) + explicit
  `GRANT ALL … TO service_role`, per repo convention. Staging + version tables are
  service-role only.
- Uploaded workbooks are retained in a **private** bucket; downloads require a short-lived
  signed URL.

## 5. Tests & results

- **16/16 unit tests pass** (`npm test -w apps/ops-hub`): decimal-safe money, balance
  convention (charges +, payments −, overpayment credit, drafts excluded, reversals drop
  out, per-category/per-year, sum-equals-ledger), school-ledger parsing (carry-down,
  TOTAL skip, Dr+Cr split, receipts/M-Pesa preserved, dates from DATE column), petty-cash
  parsing (income+expense, ZIIDI, TOTAL skip, column shift).
- **Real-workbook validation** (aggregates only, no private data): petty cash → 2 blocks,
  4 income / 22 expense / 2 TOTALs skipped / 4 ZIIDI charges; Rayyan → 84 students,
  1000 charges / 1026 payments / 219 TOTALs skipped; Rhythms → 1,165 students,
  15,117 charges / 16,680 payments / 2,335 TOTALs skipped; no crash on corrupt dates.
- **Type-check:** `tsc --noEmit` clean (db + ops-hub).
- **Production build:** `next build` succeeds (exit 0); all new routes compiled.

## 6. Existing functionality preserved

No existing tables, migrations, routes, or components were modified destructively. The
only change to an existing page is an **additive** brand-breakdown section on
`/finance/page.tsx`. Existing `*_fee_invoices/_fee_payments` and SchoolPay imports are
untouched; new pages use tolerant fetches (`safeRows` / null-safe queries) so they render
empty (not error) until migrations `044`–`046` are applied.

## 7. Known limitations / requiring human review

1. **Migrations `044`–`046` must be run** in the Supabase SQL editor (repo convention).
   Until then the new UI shows empty states. They are additive and reversible.
2. **Student-account & academic UI**: the ledger is fully functional via API + export and
   the petty-cash workspace is complete, but the student-account *table view* is not yet
   embedded inside the existing `/rayyan|rhythms|darul/students/[id]` pages — see
   `05-next-iteration.md`.
3. **Academic reporting for Rhythms & Darul** (Part 6) and report-card/transcript
   rendering are scoped but not built this iteration (Rayyan academics already exist).
4. **RLS brand-scoping** is defence-in-depth; primary enforcement is the query layer
   because API routes use the service role (documented in `02-…-architecture.md`, D2).
5. **Petty-cash column detection** is heuristic for the shifting-column workbook; the
   import review UI + (future) explicit column mapping is the safety net.
6. **Duplicate detection** classifies exact/probable across imports by signature; the
   fuzzy "possible duplicate" tier is conservative and surfaced for review.

## 8. Recommended next iteration

See `05-next-iteration.md` — student-profile account tab, Rhythms course-billing config UI,
academic reporting for Rhythms/Darul, report cards/transcripts, per-brand RLS policies,
and mapping-override UI in the importer.
