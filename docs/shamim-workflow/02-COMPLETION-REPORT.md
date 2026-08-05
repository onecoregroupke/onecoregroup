# Shamim Workflow / NPT / Iceland — Completion Report (§35)

**Repo:** `onecoregroup-main` · **App:** `apps/ops-hub`
**Date:** 2026-08-05 · **Base commit:** `6670fa5` (`feat/ocg-corrections-cont`)

> **Honest status up front.** This brief specifies a system of roughly 36 sections
> across 7 delivery phases. **Phases 1–3 are built at the database, service and
> API layers, with tests. Phases 4–7 are not started, and no new UI pages have
> been built for any phase.** Nothing below is described as complete unless it
> is. Section 6 lists exactly what is missing.

---

## 1. Audit findings

Full detail in [`01-AUDIT.md`](./01-AUDIT.md). Headlines:

**The brief's central premise about form permissions was incorrect.** §3 asks for
the forms permission system to be "corrected" because respondents can allegedly
edit form structure. They cannot, and could not before this work:
`app/api/forms/route.ts` already gated structure edits (`create-template`,
`PATCH`) on `forms.edit` server-side, with brand re-checks, while submission only
needed `forms.view`. The designer/respondent separation existed and was enforced
in the backend. The real gap was **submission lifecycle** — no draft, no
correction, no review, no reference number, no attachment, no record linkage, no
version pinning — which is what was actually built.

**Brand-naming ambiguity resolved (§1.8).** There is no Iceland brand in the
platform; `004_seed.sql` seeds only `glitz-n-glim`. The KEBS letter in the
supplied images states Iceland Geyser Ltd is *the company that owns the Glitz and
Glim brand*, and the storefront markets "products powered by Iceland Geysers".
One operation, one brand row. **No brand was renamed and no data was migrated.**
Per the operator's decision, Iceland operations run on the existing
`glitz-n-glim` brand row, and a separate print-identity layer supplies the legal
identity on generated documents.

**Permission risk found and fixed.** `ocg_form_templates` carried an RLS policy of
`USING (true)` for all authenticated users (migration 042), so brand scoping
existed only in the API layer and was bypassable through PostgREST with any valid
session. Every application read path goes through the service role, so the policy
was dropped with no behavioural change.

**Duplication avoided.** Seven things the brief asks for already existed and were
extended rather than rebuilt: `npt_pianos` (generalised to all instrument
categories instead of a new instruments table), `npt_customers` (institutions via
`customer_type`, not a new institutions table), `ops_team_members` (technicians),
`ocg_audit_events`, `ocg_notifications`, `inventory_movements`, and
`PROCUREMENT_SCOPES` (which already had exactly the brand/group-shared/selected
scoping §11 asks for).

**Data-quality risks recorded:** two pre-existing customer vocabularies
(`npt_customers` + `npt_contacts`); `npt_pianos` being piano-shaped; and stock
inflation from receiving, since the old path stocked the full ordered quantity
with no concept of rejection. The last of these is fixed below.

---

## 2. Implementation status by section

| § | Area | Status |
|---|---|---|
| 1 | Mandatory initial audit | **Complete** |
| 2 | Shamim's role and access | **Blocked** — no Shamim account found; see §5 |
| 3 | Forms permission model | **Complete** — pre-existing, verified, one RLS hole closed, `forms_approvals` added |
| 4 | Forms as operational templates | **Partially complete** — lifecycle, versioning, references, attachments, review done; PDF export not done |
| 5 | NPT instrument receiving form | **Partially complete** — schema + service + API done; no UI |
| 6 | NPT instrument lifecycle | **Partially complete** — 15-status machine + history done and tested; no UI |
| 7 | Repair activity / workshop log | **Partially complete** — schema + service + API done; no UI |
| 8 | Daily job allocation and review | **Partially complete** — schema + service + API done; no UI |
| 9 | Piano/instrument movement records | **Partially complete** — schema + service + API done; no UI |
| 10 | Piano technician class logbook | **Partially complete** — schema only, and **fields unverified** (no source image supplied) |
| 11 | General goods receiving form | **Partially complete** — schema + service + API done, incl. partial delivery and rejection; no UI |
| 12 | Supplier info + credit facility | **Partially complete** — schema done (two distinct records); no service, API or UI |
| 13 | Material requisition form | **Partially complete** — schema + service + API done, incl. no-self-approval; no UI |
| 14 | Goods / raw material issue note | **Partially complete** — schema + service + API done, incl. GTN; no UI |
| 15 | Procurement integration | **Partially complete** — chain links exist and prefill; UI-level prefill not built |
| 16 | Iceland order/sales/invoice flow | **Not started** |
| 17 | Field salesperson handover | **Not started** |
| 18 | Leave application form | **Not started** |
| 19 | Employment applications, CVs, staff documents | **Not started** |
| 20 | Vendor document management | **Not started** (generic attachment table exists) |
| 21 | Daily duties with checklists | **Not started** |
| 22 | Shamim's daily compound inspection | **Not started** |
| 23 | Inspection issue escalation | **Not started** |
| 24 | Shamim dashboard | **Not started** |
| 25 | Navigation | **Not started** |
| 26 | Branding and document output | **Partially complete** — print-identity layer built and seeded; no PDF renderers |
| 27 | Autosave and drafts | **Partially complete** — forms draft/autosave done; other modules use draft→posted states |
| 28 | Attachments | **Partially complete** — generic table + private bucket helper + MIME/size validation done; not wired into module UIs |
| 29 | Data relationships | **Partially complete** — modelled for everything built so far |
| 30 | Search and record retrieval | **Not started** |
| 31 | Reporting | **Not started** |
| 32 | Audit and record integrity | **Partially complete** — new modules write to `ocg_audit_events`; no-silent-delete enforced by draft/posted states |
| 33 | Testing requirements | **Partially complete** — 44 new unit tests on the built logic; no API-authorization or UI tests |
| 34 | Delivery phases | Phases 1–3 done to service/API level; 4–7 not started |
| 35 | Completion report | This document |
| 36 | Definition of done | **Not met** — see §6 |

---

## 3. Database changes

Three new migrations, all additive and idempotent. **None has been run** — they
require the Supabase SQL editor (this repo has no migration runner).

### `052_forms_lifecycle_print_identity.sql`
- **New function** `ocg_next_reference(seq_name, prefix, width)` — self-registering
  atomic reference minter built on the existing `ops_id_sequences` row lock.
- **New tables:** `ocg_brand_print_identities`, `ocg_form_template_versions`,
  `ocg_record_attachments`.
- **Altered:** `ocg_form_templates` (+11 lifecycle columns),
  `ocg_form_submissions` (+13 lifecycle columns).
- **Backfills:** v1 snapshot for every existing template; `submitted_at` from
  `created_at` for every existing submission.
- **Seeds:** print identity for every brand — Iceland Geyser (see §4), NPT from
  the receiving form, and each remaining brand from its own name.
- **Policy dropped:** `form_templates_read` (the `USING (true)` hole).
- **Indexes:** 6 added, including a partial unique index on submission reference.

### `053_npt_intake_repair_movement.sql`
- **New tables:** `npt_intakes`, `npt_intake_items`, `npt_repair_cases`,
  `npt_repair_case_status_history`, `npt_repair_activities`,
  `npt_workshop_plans`, `npt_workshop_plan_rows`, `npt_movements`,
  `npt_training_sessions`, `npt_training_attendance`.
- **Altered:** `npt_pianos` (+6 columns generalising it beyond pianos, plus an FK
  to the live repair case), `npt_customers` (+4 institution/billing columns).
- **Backfills:** `instrument_category='piano'` for existing rows;
  `current_location` seeded from `location`.
- **Constraint:** `UNIQUE (brand_id, plan_date)` on workshop plans — one planner
  per day, so opening it twice cannot fork the day.
- **Sequences registered:** `npt_intake`, `npt_repair_case`, `npt_movement`,
  `npt_training`.

### `054_procurement_chain.sql`
- **New tables:** `procurement_credit_applications`, `procurement_requisitions`,
  `procurement_requisition_items`, `procurement_goods_receipts`,
  `procurement_goods_receipt_items`, `procurement_goods_issues`,
  `procurement_goods_issue_items`.
- **Altered:** `procurement_vendors` (+31 columns for the full supplier profile,
  incl. restricted banking block), `inventory_movements` (+4 source-document FKs).
- **Integrity indexes — the important ones:**
  `idx_inv_movements_receipt_item_once` and `idx_inv_movements_issue_item_once`
  are partial UNIQUE indexes making it **impossible at the database level** for
  one receipt or issue line to post to stock twice, even if application code is
  bypassed or a request is replayed.
- **Sequences registered:** `requisition`, `goods_receipt`, `goods_issue`,
  `goods_transfer`, `credit_application`.

RLS on every new table is service-role only, matching the repo convention.

---

## 4. Print identity seeded

Per the operator's decision, generated documents for the Iceland operation use:

```
Ice Land Geyser Ltd
P. O. Box 8067 - 00100, Nairobi, Kenya
icelandgeyser@gmail.com
0720527579 / 0704547547
PIN No: P051705964T
```

This is the block on the invoice pad currently issued to customers and on the
Application for Credit Facilities. The two other identities found in the supplied
images — **P.O. Box 2181-00100** (account opening form) and **P.O. Box
47740-00100 / info@icelandgeyser.com** (KEBS letterhead) — were deliberately not
used. All are editable in `ocg_brand_print_identities` without a code change.

NPT's identity is seeded from the receiving form (P.O. Box 8067-00100, Cell
0736569599 / 0722219775, L/LINE 020-2017737).

No One Core Group or WM & Co branding is applied to any of these documents.

---

## 5. Stock and approval guarantees (§36 items that ARE met)

These are enforced in the service layer for every caller, and unit-tested:

| Guarantee | Where | Test |
|---|---|---|
| A requester cannot approve their own requisition | `canApproveRequisition` | ✅ incl. case-insensitive email |
| Approving a requisition moves no stock | `deriveRequisitionStatus(…, 'approval')` → `ready_for_issue` | ✅ |
| Delivered must equal accepted + rejected | `validateReceiptLine` | ✅ |
| Only accepted quantity is stocked | `stockableReceiptQuantity` | ✅ |
| Rejected/damaged goods never reach inventory | same | ✅ |
| Immediately-consumed lines stock nothing | same | ✅ |
| Partial and over-delivery are variances, not errors | `receiptLineVariance` | ✅ |
| Cannot issue more than approved, or more than in stock | `validateIssueLine` | ✅ |
| A receipt or issue posts to stock exactly once | `canPostToStock` + partial unique indexes | ✅ |
| Receiving an intake is idempotent | `receiveIntake` status guard | — (integration) |
| A received instrument is not a confirmed repair job | `nextRepairStatuses('received')` | ✅ |
| Illegal repair transitions are refused | `validateRepairTransition` | ✅ |
| A respondent cannot edit an approved submission | `assertOwnEditable` | ✅ |
| Reviewers cannot review their own submission | `reviewSubmission` | — (server guard) |
| Drafts are private to their author | `listSubmissions` filter | — |

**Test suite: 109 passing (65 pre-existing + 44 new). `tsc --noEmit` clean.**

---

## 6. What is NOT done — read this before planning around it

1. **No UI was built.** Every module added in Phases 1–3 is reachable only
   through its API. Shamim cannot use any of it from the browser yet. This is the
   single largest gap.
2. **Phases 4–7 are not started**: Iceland sales (enquiry → order → invoice →
   payment), field-sales handover, leave applications, employee/vendor documents,
   checklist duties, Shamim's daily compound inspection, issue escalation, her
   dashboard, navigation, search, reporting and PDF output.
3. **Migrations have not been run.** 052–054 must be executed in the Supabase SQL
   editor, in order, before any of the new API routes will work.
4. **§2 (Shamim's access) is blocked.** There is no `Shamim` anywhere in the
   codebase — users live in Supabase `user_permissions` / `ops_team_members`, not
   in code. Her account email is needed to configure and verify her permission
   set. The permission vocabulary she needs already exists (`npt_service`,
   `procurement`, `inventory`, `forms`, `forms_responses`, `forms_approvals`,
   `finance`, `glitz_admin`) plus per-section `brand_access`.
5. **No API-authorization tests.** §33 asks for direct API authorization tests
   (e.g. Shamim hitting another brand's records by URL). The brand-scope checks
   are written into both new routes but are not covered by automated tests.
6. **§10 training logbook fields are unverified** — no photograph of the Daily
   Class Logbook was in the supplied set, so the schema follows the brief's prose
   only. Confirm against the physical book before use.
7. **§19 employment application form** — no image supplied. Nothing was invented;
   no schema was created for it.
8. **PDF/print rendering is not built.** The identity layer that PDFs will draw
   from exists and is seeded, but no document renderer was written.

---

## 7. Open questions

1. **Shamim's account email** — needed to complete §2 and verify §33.
2. **Invoice VAT convention.** Invoice 1261 shows AMOUNT 2568.97 + VAT 411.03 =
   TOTAL 2980, i.e. VAT-inclusive rates back-computed at 16%. Reproduce, or
   compute exclusive-then-added? Changes every stored line total.
3. **`UNIT` / `QTY` semantics.** The invoice pad inverts the usual meaning —
   `UNIT` holds pack count (`8PC`), `QTY` holds pack size (`1ltr`). Keep, or
   normalise to quantity + unit-of-measure?
4. **Two forms found that the brief does not mention** — the **Goods Transfer
   Note** (built, as `kind='transfer'`) and the **Account Opening Application
   Form** (customer credit; not built). Confirm both are in scope.
5. **§12 conflates two documents.** The images show a two-page *Supplier General
   Information Form* and a separate *Application for Credit Facilities*; both are
   modelled separately. Confirm that is right.
6. **Duplicate "Accessories Received" column** on the receiving form was treated
   as a printing artefact — one structured `accessories` list plus a separate
   `condition_at_receipt` field, per the brief's instruction. Confirm with the
   workshop.

---

## 8. Deployment

- **Branch:** work committed on `feat/shamim-workflow` (branched from
  `feat/ocg-corrections-cont` at `6670fa5`).
- **Migrations to run, in order:** `052`, `053`, `054` — Supabase SQL editor.
  All are `CREATE … IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` and safe to
  re-run.
- **Preview URL:** none — no UI was built, so there is nothing to preview.
- **Rollback:** the migrations are purely additive apart from one dropped RLS
  policy. To roll back, drop the new tables and columns and restore the policy
  with `CREATE POLICY "form_templates_read" ON ocg_form_templates FOR SELECT TO
  authenticated USING (true);` — though that policy is the security hole
  described in §1 and should not be restored without a replacement.
- **Code rollback:** revert the branch; nothing on `main` or the corrections
  branch was modified.
