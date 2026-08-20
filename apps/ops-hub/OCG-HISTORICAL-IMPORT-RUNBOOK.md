# OCG Historical Import Runbook

How real OCG historical data gets from a source file into the operational ledger, safely and
progressively. This describes the mechanism only — **no real historical data has been imported
under this runbook yet.** See the completion report for the recommended first batch.

---

## 1. Principle

Never parse a historical file straight into a live operational table. Everything goes:

```
Source → Batch → Staged rows → Mapped/validated → Dry run → Approved → Posted → Reconciled → Locked
```

Each arrow is a distinct, auditable state change (`data_imports.status`, enforced by
`assertImportTransition` in `src/lib/governanceModel.ts`) — you cannot skip from "uploaded"
straight to "posted".

## 2. Source register

Every historical file gets one `historical_import_sources` row first, independent of any batch:
title, filename, source type, entity, reporting period, checksum (SHA-256), description, storage
reference. `register-source` in `/api/historical-imports`. This is Class 1–5 evidence
registration (§25 of the brief) — a source exists and is described before anyone decides what to
do with it.

**Evidence classes** (`historical_import_sources.evidence_class`, 1–5):

1. Master data (SKUs, suppliers, customers, stores, people, accounts)
2. Transaction-level history (invoices, payments, receipts, movements, journals)
3. Point-in-time snapshots (stock counts, debtor balances, month-end balances)
4. Management reports (weekly sales, salesperson performance, budget/quantity reports)
5. Knowledge/reference (manuals, schedules, SOPs, legacy systems)

A Class 5 source is refused a transactional batch outright (`createHistoricalBatch` throws) — it
must go through `/knowledge`, not the accounting import engine. A Class 4 report (the current
QuickBooks workbook package, for example) is a control total to reconcile against, never a
source of manufactured invoices/payments — nothing in the importer infers a transaction from a
summary number.

## 3. Batch

One `data_imports` row per (source, target domain, period) via `create-batch`. Idempotency key =
`sha256(brand|import_type|file_hash|period_start|period_end)` — retrying the exact same
registration returns the existing batch, never a duplicate (verified live: two identical
`create-batch` calls returned the same row id, and a direct count against `idempotency_key`
confirmed exactly one row). A batch also upserts its `historical_import_periods` row
(`brand+target_domain+period_start+period_end`), which is how period status is tracked
independent of any one batch.

States: `uploaded → parsed → mapping_required → validation_failed → ready_for_review → approved →
posted → reconciled → locked` (or `cancelled` from most points). Transitions are asserted, not
just UI-hidden.

## 4. Staging

`parseAndStage()` (`src/lib/imports/framework.ts`) never writes to a final table. Each row lands
in `data_import_rows` with `raw_payload` (exactly what the source contained), `mapped_payload`
(the interpreted version), `dup_status` (new / probable_duplicate / exact_duplicate, checked
against both already-committed rows and rows within the same file) and `row_state`
(valid/warning/error/skipped/committed). The raw value is never overwritten by mapping — you can
always answer "what did the source actually say" after the fact.

## 5. Mapping

`historical_import_mappings`: `original_value → normalized_value`, scoped to brand + target
domain + source field, with `target_type`/`target_id` once resolved and a `status` of
proposed/confirmed/rejected. `add-mapping` in `/api/historical-imports`. A mapping never edits the
raw source row — "Multi purpose 500ml" and "M/P 500" both stay exactly as the source wrote them;
only the mapping says they resolve to the same canonical SKU. Unmapped values stay
`needs_mapping`, not silently guessed (verified live: a mapping's `original_value` round-tripped
unchanged after creation).

## 6. Dry run / validation

`dry-run` action runs the same commit logic as a real post but with `dryRun: true` —
`importValidationSummary()` reports total/valid/committed/warnings/errors/needs-mapping/fatal
exceptions/failed or pending reconciliations. `ready_for_review` and `approved` transitions are
blocked (`canApproveImport`) while any fatal exception or open error remains. Posting is refused
the same way. (Verified live: dry run on a synthetic petty-cash workbook reported rows created
with zero failures before anything touched a real table.)

## 7. Approval / posting — authority, not just permission

Moving a batch to `approved`, `posted` or `locked` requires an explicit `employee_authorities`
grant (`review`/`approve`/`post`/`authorise` respectively, scoped to `operational_area =
'historical_imports'` and the batch's brand) — a user with only module edit permission on
`historical_imports` cannot approve or post their own batch. `posted` also requires the prior
status to be `approved`; nothing can post directly from staging.

## 8. Idempotent posting

`commitImport()` posts each valid staged row through the target-domain adapter's `commit()`,
which writes through the same source-document-FK partial-unique-index protection every other
operational write path uses — replaying a posted batch does not duplicate rows, it reports
"already posted" against the existing target IDs.

## 9. Reconciliation

`addReconciliation()` records a named control (`reconciliation_type`, `control_name`,
`source_total`, `posted_total`, computed `variance`, `result` = matched/variance_explained/
failed/pending) against the batch. `reconciled` is refused while any control is `failed` or
`pending`.

## 10. Period locking

`locked` requires `reconciled` status and zero failed/pending reconciliations
(`canLockImport`). A locked `historical_import_periods` row is not casually editable by normal
users — corrections after lock go through a new adjusting entry/reversal with its own audit
trail, never an edit of locked history (§3.1/§35 of the brief).

## 11. Chronological loading

Design intent, not yet exercised with real data: **July first.** Register July's sources, stage,
map, dry-run, fix exceptions, approve, post, reconcile against July's control totals, lock. Only
then open August. `historical_import_periods.status` (not_started/staging/under_review/
reconciled/locked) is the visible signal for "is this month safe to build on."

## 12. Opening balances

Where full prior transaction history isn't available, an opening balance is its own explicitly
marked record (source, import batch, approver, effective date, notes) — never a fabricated string
of backdated transactions manufactured to reach a number.

## 13. What this runbook does not cover yet

- No real OCG source files have been registered.
- No adapters have been written for the actual Iceland/NPT/Rhythms/Rayyan source formats beyond
  what already existed (petty-cash, QuickBooks reconciliation) — writing a new adapter for a new
  source shape is expected, ordinary work for the next task, following the `ImportAdapter`
  interface in `src/lib/imports/framework.ts`.
- Knowledge-class (5) sources go through `/knowledge`, which has its own versioning and does not
  use this batch/period machinery at all — see `OCG-PEOPLE-KNOWLEDGE-MODEL.md`.
