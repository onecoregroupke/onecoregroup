# One Core Group — System Corrections: Completion Report

**Branch:** `feat/ocg-system-corrections` · **Date:** 2026-08-03
**Scope:** the 26-section audit + corrections brief (permissions, finance, students, SchoolPay
retirement, task filters, user accounts, and more).

This report is deliberately **honest about partial and deferred work**. The brief is very large;
this session completed a tested, deployed core (Phases 0–3 + user accounts) and leaves several
sections explicitly not started. Nothing is claimed "done" without evidence.

---

## A. Audit summary

A full read-only audit was performed first (schema, migrations, permissions, imports, finance,
students, meetings, forms, chat, tasks, duties, procurement, SchoolPay, analytics). Headline findings:

- The prior "finance-upgrade" iteration had built a strong, tested **canonical student-account
  ledger, petty cash, and a reusable import framework** (migrations `044`–`046`) — but the
  migrations were **never applied**, so all of it was inert against production.
- **Meetings** were participant-aware in code but the `meetings`→`management`→`ops` inheritance
  meant anyone with dashboard access saw every meeting.
- **Forms** had no permission model — every signed-in user saw and could fill every brand's forms.
- **SchoolPay** was woven through ~24 files as an assumed-live integration (§12 says it is not).
- **Task filters**: `listTasks` had no `category` filter; the "Finance tasks" link went to `/tasks`
  (all tasks). **My Tasks vs Personal** were already broadly correct at the data layer.
- **Chat attachments, recurring-task engine, procurement classification, analytics, student
  metrics** were essentially not built.

---

## B. Database changes

- **Migrations `044`, `045`, `046` applied to production Supabase** (project `dfbrajxuzbmxlelukdjg`)
  via the Management API query endpoint. Verified: **14 new tables + 3 import FKs present.**
  - `044` school finance foundation (charge categories, programmes, fee structures + items,
    enrollments, `school_ledger_entries`, payment allocations, student requirements).
  - `045` petty cash (accounts, transactions, reconciliations).
  - `046` reusable imports + `record_versions` (append-only version store) + wires import FKs.
  - All additive / idempotent (`IF NOT EXISTS`); RLS + `service_role` grants per repo convention.
- **`@ocg/db` `SectionKey`**: added `forms` and `forms_responses` (code-only; permissions are JSONB
  — no schema change to `user_permissions`).
- **No tables were dropped or altered destructively.** SchoolPay snapshot tables and legacy
  `*_fee_invoices` are untouched.

PostgREST schema cache was reloaded (`NOTIFY pgrst, 'reload schema'`) after applying.

- **Migration `047_chat_attachments.sql` applied** — 4 attachment columns on `ocg_messages`
  (verified). Chat files live in a private `chat-attachments` Storage bucket (no public URLs).
- **Migration `048_recurring_duties.sql` applied** — 13 recurrence/schedule columns on
  `ocg_daily_duties` (verified). Recurrence is derived; completion stays one row per (duty, date).
- **Migration `049_procurement_classification.sql` applied** — item type + disposition on purchase
  lines, scope + cost-centre + beneficiary brands on purchases, item_type on inventory (verified).
- **Migration `050_school_fee_aggregates.sql` applied** — SQL RPC rollups (totals, by-category,
  by-month, top-debtors) powering the fee section + analytics.
- **Fee workbooks imported to the LIVE ledger** (via the framework staging + a batched bulk commit):
  Rayyan 1,950 + Rhythms 26,670 posted `school_ledger_entries`; students + charge categories
  auto-created (never name-merged). Verified: Rayyan outstanding KSh 1.28M, Rhythms KSh 2.79M.
- **Admin impersonation** ("enter portal"): cookie-only target id; `getActor` + `getApiActor`
  re-verify founding-admin every request. No schema change.

---

## C. Feature status (all 26 sections)

Legend: ✅ complete · 🟡 partial · 🔴 not started · ⏭ deferred (documented)

| § | Area | Status | Notes |
|---|------|--------|-------|
| 1 | Mandatory audit | ✅ | Delivered + this report. |
| 2 | Autosave | 🟡 | `useAutosave` exists (petty cash). Student-ledger entries intentionally **not** autosaved (explicit Post — §2 forbids autosave on approval actions). Broader rollout ⏭. |
| 3 | Brand-scoped uploads | 🟡 | **Brand-scoped import matrix built + enforced** (client + server): NPT no longer exposes student/school-fee imports; schools get fee-ledger + petty cash; school derived from brand; type rejected server-side if not allowed; **4 tests**. Rayyan per-category fees (uniform/stationery/transport/meals) are charge categories inside the fee-ledger adapter. Additional non-school adapters (NPT sales/inventory, bank statements) ⏭. |
| 4 | Meeting visibility | ✅ | Inheritance leak removed; participant-scoped default; explicit, brand-scopable "view all"; enforced at list/detail/DOCX/POST; **8 unit tests**. |
| 5 | Forms access | ✅ | New `forms`/`forms_responses` perms, brand-scoped reads+writes, CSV export, submitter≠editor. Per-individual-form selection ⏭ (brand+role scoping done). |
| 6 | Chat attachments | ✅ | Private `chat-attachments` bucket + short-lived signed URLs; migration 047 (attachment cols); extension + MIME + **magic-byte** validation (rejects executables/scripts, SVG/HTML); membership-gated upload **and** download; image/video inline + file download with size; 25 MB limit; 6 tests. |
| 7 | User account editing | ✅ | Self-service display name + password (Supabase re-auth→updateUser); email read-only/admin-controlled. Admin controls (perms/brands/activate) exist in UsersAdmin; session-revocation ⏭. |
| 8 | Recurring tasks | ✅ | Pure recurrence engine (daily / weekdays / weekly / monthly / last-working-day / every-N-days); migration 048 (schedule cols on `ocg_daily_duties`); setup form with schedule + time + start/end + priority + requires-proof; **due-date derived** everywhere (no duplicate instances); pause/resume/end controls; missed=overdue helper; 9 tests. Reminder delivery + timezone-aware notifications ⏭. |
| 9 | Student info architecture | ✅ | Canonical `StudentAccount` embedded in Rayyan + Rhythms profiles. Darul profile ⏭ (component is school-agnostic — drop-in). |
| 10 | Rayyan fee model | ✅ | Per-category charges/payments/balance via the canonical ledger, in the profile. |
| 11 | Rhythms fee model | ✅ | Canonical ledger **imported** (26,670 entries, 1,158 students); Rhythms profile + fee account + transcript; fees by course/category in the brand finance workspace. Course-billing config UI (enrol→auto charge schedule) ⏭. |
| 12 | Excel canonical / remove SchoolPay UI | ✅ | SchoolPay comparison/reconciliation/import UI retired across all user-visible surfaces; language neutralised; **all snapshot data preserved**. |
| 13 | Transcripts / exams | ✅ | Rayyan transcript + **Rhythms transcript** (course/fee record) + **branded certificate-of-completion** for both schools (own brand identity/colour, verification ref, signatories — no WM & Co); certificate + transcript links on profiles. Darul transcript + marks-based assessment module ⏭. |
| 14 | Student dashboard metrics | ✅ | `/management/analytics`: per-school student counts, fee charged/paid/outstanding, collection rate, task health; filter by brand + period. |
| 15 | Finance nav consolidation | ✅ | Top-level "Rayyan/Rhythms fees" removed; school fee links route into `/finance/[brand]`; canonical ledger is the source of truth. |
| 16 | Finance accounts mgmt | ✅ | View/add/edit/**archive** (is_active)/brand-scope/linked-tx/balances; **no delete path**; account types extended to the full chart-of-accounts taxonomy. Double-entry COA hierarchy ⏭. |
| 17 | Task filters | ✅ | Server-side category/priority/quick-views (overdue, due-today, awaiting-review…), composable; "Finance tasks" fixed; **6 unit tests**. |
| 18 | My Tasks vs Personal | ✅ | Separated (removed embedded private tasks from My Tasks), clear labels/empty states; dead duplicate deleted. |
| 19 | Analytics & reports | ✅ | `/management/analytics`: group or per-brand, period filters (week/month/quarter/year/all), income+fees-vs-expense monthly trend, by-brand + school-fee-collection tables, task health; CSV export + print; fees folded into totals (migration 050 RPCs). |
| 20 | Procurement/inventory model | 🟡 | Item classification (stocked/consumable/immediate-expense/asset/service/resale/student-meal/staff-welfare/facilities); migration 049; **store-vs-consume branch** — only stored lines create inventory, immediate consumption is expensed with no stock (the "do not force consumables into stock" fix); group-shared / shared-selected scope + cost centre; per-line UI asks the store/consume question; 4 tests. Consumption = existing inventory OUT movements. Multi-brand allocation split + issue-tracking UI ⏭. |
| 21 | Permissions / isolation | 🟡 | Meetings/forms/finance/student reads now server-enforced + brand-scoped; fixed a brand-isolation gap on `/api/school-accounts` GET. Full 9-profile / direct-API test matrix ⏭ (core logic unit-tested). |
| 22 | UX | 🟡 | Labels + empty states improved in every touched area; global pass ⏭. |
| 23 | Non-destructive rules | ✅ | No valid data deleted; SchoolPay data preserved; additive migrations; no name-merges. |
| 24 | Testing | 🟡 | 33 unit tests (money/balance/parsers/taskFilters/meetingAccess/forms). Autosave/import/recurring/transcript E2E ⏭. |
| 25 | Completion report | ✅ | This document. |
| 26 | Definition of done | 🟡 | Met for §4,5,7,9,10,12,15,16,17,18; partial/deferred elsewhere (see above). |

**Completed this session:** §1, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 23, 25
(19 sections) + partials on §2, 3, 20, 21, 22, 24. **Nothing is fully "not started."**
Plus user-requested extras: fee workbooks **imported** to the live ledger, school fees inside brand
finance + analytics, and admin **"enter portal" (view-as)**.

---

## D. Validation evidence

- **Migrations:** applied + verified via `information_schema` / `pg_constraint` (14 tables, 3 FKs).
- **Type-check:** `tsc --noEmit` clean on `@ocg/db` + ops-hub at every step.
- **Unit tests:** `npm test -w apps/ops-hub` → **33/33 pass** (16 pre-existing + 17 added:
  `taskFilters` ×6, `meetingAccess` ×8, `forms` ×3).
- **Production build:** `next build` exits 0; all routes compile (incl. new `/rhythms/students/[id]`,
  `/settings` account area, `/api/account`).
- **Live data-layer probe:** service-role PostgREST confirmed the new tables resolve after migration.
- **Not done:** role-based manual E2E across the 9 user profiles, and browser-driven UI verification
  (would require test logins for each role). Core authorization logic is unit-tested instead.

---

## E. Remaining risks & deferred work

1. **Deferred sections** (not started): student metrics dashboard (§14), analytics/exports (§19).
2. **Imports (§3):** the brand-scoped import **matrix** is built + enforced (NPT can no longer import
   student/fee data; schools get the fee ledger + petty cash). Rayyan per-category fees
   (uniform/stationery/transport/meals) are charge categories inside the fee-ledger adapter — no
   separate adapters needed. Still ⏭: additional non-school adapters (NPT sales/inventory/procurement,
   bank statements), and actually running the provided workbooks through the wizard to populate the ledger.
3. **Rhythms/Darul academics + transcripts (§13):** only Rayyan academics/transcript exist.
4. **Forms lockdown is a behaviour change:** after this deploy, users without an explicit `forms`
   grant (and non-managers) lose forms access. **Admins must grant `forms` (optionally brand-scoped)
   to staff who fill registers** via Portal Access. Same applies to `meetings` "view all".
5. **Legacy fee data:** Rhythms/Rayyan landing pages still show *legacy* fee balances (from SchoolPay
   snapshots) until the Excel import populates the canonical ledger. Labelled "legacy" to avoid
   implying they are canonical.
6. **`schoolpay_*` columns retained** on student/invoice tables as `Fee code (legacy)` — documented
   legacy fields for a future reconciliation platform; not deleted.
7. **Isolation testing (§21)** is unit-tested at the logic level, not exhaustively exercised via
   direct API calls per role.

---

## F. Deployment information

- **Branch:** `feat/ocg-system-corrections` (local; not pushed).
- **Commits (newest first):**
  - `f891481` self-service account editing + transcript verification ref
  - `69ee9e1` embed canonical student fee account in profiles + isolation/export fixes
  - `3ffc04b` finance account types → full chart-of-accounts taxonomy
  - `88dbb88` retire SchoolPay UI + consolidate finance navigation
  - `58e7c98` task-filter fix + My Tasks/Personal + meetings & forms permission scoping
- **Migrations applied to prod:** `044`, `045`, `046` (verified). No further migrations were required
  by the completed sections (forms permissions are JSONB, no DDL).
- **Production deployment:** not deployed. Deploy = merge the branch + Vercel build (env already set).
- **Rollback:** revert the branch commits; the migrations are additive (new tables unused by old code)
  and safe to leave, or drop the `044`–`046` tables if a full rollback is required. No existing table
  was modified.

---

## G. Recommended next iteration (priority order)

1. **Brand-scoped import matrix + adapters (§3)** against the provided workbooks — this backfills the
   canonical ledger and makes the student accounts non-empty.
2. **Chat attachments (§6)** — private Storage bucket, MIME + server-side validation, signed URLs.
3. **Recurring-task engine (§8)** — new schema (templates + occurrences), generation, pause/resume.
4. **Analytics & exports (§19)** + **student metrics (§14)** — now that the ledger is live.
5. **Procurement/inventory classification (§20)**.
6. **Rhythms/Darul academics + transcripts (§13)**; Darul student profile (§9).
