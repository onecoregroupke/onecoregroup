# Shamim Workflow / NPT / Iceland — Mandatory Initial Audit (§1)

**Repo:** `onecoregroup-main` · **App:** `apps/ops-hub` · **Branch at audit:** `feat/ocg-corrections-cont` (`6670fa5`)
**Date:** 2026-08-05 · **Status:** Phase 1 gate — audit only, no code changed yet.

Source references: 17 photographs supplied 2026-08-05 (`WhatsApp Unknown 2026-08-05 at 09.51.16.zip`).
Every image was opened and read before this document was written. Image-by-image mapping in §C.

---

## A. What already exists

The platform is substantially further along than `CLAUDE.md` (v1.0, May 2026) describes — that file
documents 18 migrations; the repo has **51**. Findings below come from the migrations and route
tree, not from the handover doc.

| Area | Status | Where |
|---|---|---|
| Brands (6) + per-section permissions + per-section **brand** scoping | Works | `007`, `packages/db/src/types.ts` (`SectionKey`, `BrandAccessMap`) |
| Custom form templates + submissions | Works (basic) | `042_custom_forms.sql`, `/api/forms`, `/forms` |
| Recurring duties + per-day completion logs | Works | `030`, `048_recurring_duties.sql`, `/api/duties`, `/management/duties` |
| Inventory items + stock movements (with `quantity_after`) | Works | `035_launch_foundation.sql` |
| Procurement vendors / purchases / purchase items | Works | `035`, `040`, `049` |
| Procurement item classification (`stock` vs `consume`) | Works, unit-tested | `lib/procurementModel.ts` + `.test.ts` |
| Procurement scope (`brand` / `group_shared` / `shared_selected`) | Works | `lib/procurementModel.ts` |
| Receiving a purchase → stock-in movement | Works, all-or-nothing | `lib/procurement.ts:231` |
| NPT customers / pianos / service jobs / service history / quotes+invoices / reminders | Works | `025_ocg_management_os.sql`, `032_npt_gazelle.sql`, `/npt/*` |
| NPT contacts / appointments / measurements / timeline events | Works | `032_npt_gazelle.sql` |
| Finance chart of accounts, transactions, reconciliation, exceptions | Works | `034_finance_operations.sql` |
| Audit events with before/after + undo | Works | `036_audit_inbox_attendance.sql` (`ocg_audit_events`) |
| Notifications | Works | `036` (`ocg_notifications`) |
| Private attachment storage pattern (signed, path-scoped) | Works | `047_chat_attachments.sql` |
| Team members (name, email, role, brand_ids, phone, job_title, department, start_date) | Works | `017` + `035` |
| PDF/DOCX document generation | Works | `/api/meetings/[meetingId]/notes/docx`, student transcript + certificate routes |

**Consequence:** almost nothing in this brief needs a new subsystem. The work is
*extension* of seven existing subsystems plus roughly a dozen genuinely new tables.

---

## B. What is missing, incomplete, or incorrectly scoped

### B1. The brief's premise about form permissions is **incorrect** — no fix needed there

§3 asks me to "correct the forms permission system" because respondents can allegedly edit form
structure. **They cannot.** `apps/ops-hub/src/app/api/forms/route.ts` already enforces, server-side:

- `POST {action:'submit'}` → requires `forms.view` only (respondent)
- `POST {action:'create-template'}` → requires `forms.edit` (designer)
- `PATCH` (field/layout/validation edits) → requires `forms.edit`, plus brand-scope re-check
- CSV export → requires `forms_responses.edit`
- Seeing others' submissions → requires `forms_responses.view`

Row-level security backs this up (`form_submissions_own` restricts `authenticated` reads to the
submitter's own email; everything else goes through `service_role`). The designer/respondent
separation the brief asks for **already exists and is enforced in the backend, not just the UI.**

What is *actually* missing from the forms engine:

| Requirement (§4) | Present? |
|---|---|
| Draft state + autosave, edit-own-draft-before-submit | **No** — submission is immediate and final |
| Correct-own-submission-after-submit | **No** — there is no submission `PATCH` at all |
| Review / approve / reject / request-correction workflow | **No** |
| Version number, draft vs published template states | **No** |
| Auto-generated reference number | **No** |
| Attachments on a submission | **No** |
| Signature / approval acknowledgement | **No** |
| Printable view + branded PDF export | **No** (CSV only) |
| Per-submission audit history | **No** (`ocg_audit_events` exists but forms don't write to it) |
| Links to customer / supplier / instrument / order / stock records | **No** — `values` is an opaque JSONB blob |

So the real §3/§4 gap is **submission lifecycle and record-linkage**, not permission enforcement.
The permission list in §3 maps onto the existing two keys as follows — I recommend adding three
keys rather than the ten proposed, to avoid a parallel permission vocabulary:

| Brief's proposed key | Recommendation |
|---|---|
| `forms.design`, `forms.manage` | already `forms:edit` |
| `forms.view`, `forms.submit` | already `forms:view` |
| `forms.response.view_own` | already implicit (RLS) |
| `forms.response.view_all` | already `forms_responses:view` |
| `forms.response.export` | already `forms_responses:edit` |
| `forms.response.correct_own` | **new behaviour**, gate on submission status not a new key |
| `forms.response.review`, `.approve` | **new key** `forms_approvals` (`view`/`edit`) |

### B2. Duties are single-line, not checklists (§21/§22 — confirmed gap)

`ocg_daily_duties` is one row = one duty; `ocg_daily_duty_logs` is one row per `(duty_id, duty_date)`
carrying a single `status` + `note`. `048` added real recurrence (frequency, weekdays, day_of_month,
interval, time_of_day, timezone, priority, `requires_proof`, pause). There is **no section, no
checklist item, no per-item response, no per-item photo, no issue escalation, no template
versioning**. The brief's diagnosis here is correct.

Good news: the completion contract (`UNIQUE (duty_id, duty_date)`) is exactly right and must be
preserved — it is what stops duplicate task instances. Sections/items hang *below* it.

### B3. Procurement chain is missing three of its five links (§11–§15)

Present: requisition → **(missing)** → purchase → receive (all-or-nothing) → stock-in.

| Link | Status |
|---|---|
| Material requisition | **Missing entirely** |
| Purchase / LPO | Present (`procurement_purchases`) |
| Goods Received Note as a *record* | **Missing** — receiving is a status flip on the purchase (`lib/procurement.ts:231`), not a document |
| Partial delivery / multiple deliveries per PO | **Not possible** — `status === 'received'` throws on second receive |
| Accepted vs rejected vs damaged quantities | **Missing** — full ordered quantity is stocked |
| Goods Issue Note (GIN) | **Missing** |
| Goods Transfer Note (GTN) | **Missing** |
| Supplier general information / credit application / documents | **Missing** — `procurement_vendors` has 5 contact fields, no documents, no bank details, no status workflow |

The duplicate-stock protection the brief demands in §11 partly exists (the `status === 'received'`
guard) but it is a read-then-write check, not atomic, and it will not survive the move to partial
deliveries. Idempotency must be re-established on the GRN, not the purchase.

### B4. No sales pipeline for Iceland/Glitz (§16, §17)

There is `orders` / `order_items` (migration `003`, the Glitz **storefront** — a public web-shop
table), and school fee invoices (`033`, `044`), and NPT quotes/invoices (`025`). There is **no**
B2B enquiry → sales order → invoice → payment chain for the Iceland operation, and no
field-salesperson handover/reconciliation anywhere. `/mhub/marketing/crm` has contacts/deals but
it is a marketing CRM, not an order book.

### B5. No HR document or leave layer (§18, §19)

`ops_team_members` is a directory row. There is **no** leave application, leave entitlement/balance,
employee document store, confidentiality classification, or document expiry. Nothing to extend —
this is genuinely new.

### B6. NPT has service jobs but no *intake* and no *movement* (§5, §6, §7, §9)

`npt_service_jobs` models a **visit-based** service call (`service_type` default `tuning`,
`scheduled_at`, `technician_id`, `location`) — a technician going *to* an instrument. The paper form
is the opposite: an instrument arriving *at* the workshop. Specifically missing:

- Instrument receiving/intake record (date+time received, received by, brought in by, intake channel)
- Personal vs institution ownership branching, and any institution entity at all (`npt_customers` is a person)
- Multiple instruments per receipt; non-piano instrument categories (`npt_pianos` is piano-shaped: `piano_type`, `last_tuning_date`)
- Accessories received
- Repair case lifecycle (the 15 statuses in §6) — `npt_service_jobs.status` is a free-text default `'New enquiry'`
- Dated repair-activity log per case (the notebook in §7)
- Daily workshop planner / job allocation (§8)
- Instrument movement records (§9)

### B7. Permission risks found

1. **`ocg_form_templates` is world-readable to any authenticated user.** RLS policy
   `form_templates_read` is `USING (true)` — brand scoping is applied only in the API layer
   (`allowedBrandIds('forms')`). Anyone holding the anon key + a valid session can read every
   brand's template definitions directly from PostgREST, bypassing the route. Low severity today
   (templates are structure, not answers) but it becomes a real leak once templates carry
   supplier/employee field definitions. Same pattern is worth checking across the newer tables.
2. **No self-approval prevention anywhere.** `ocg_approvals` exists but nothing stops the requester
   being the approver. §13 and §2 both require this; it must be enforced server-side.
3. **No confidentiality tier on documents.** Everything in a brand is visible to anyone with that
   brand's section access. §19 requires HR documents to be more restricted than that.

### B8. Data-quality risks

1. **Two customer/contact vocabularies already exist** (`npt_customers` + `npt_contacts` from `032`,
   plus marketing `contacts`). Adding an "institution" entity risks a third. Must be reconciled, not
   appended to.
2. **`npt_pianos` is piano-shaped.** Receiving saxophones/guitars/flutes through it means either
   abusing `piano_type` or creating a parallel instrument table — the second duplicates ownership,
   location and media. Recommendation: generalise `npt_pianos` (add `instrument_category`, keep the
   table) rather than create `npt_instruments`.
3. **Stock can currently be inflated by rejected goods** — receiving stocks the ordered quantity.

---

## C. Image → module map (all 17 inspected)

| # | Image (09.50.xx) | Document | Maps to |
|---|---|---|---|
| 1 | `48` | **Ice Land Geyser INVOICE** ×2 (No. 1261, 1262) | §16 Stage 3 |
| 2 | `48 (1)` | **ORDER pad No. 64** (LPO) + handwritten NPT note | §15 purchase order |
| 3 | `48 (2)` | KEBS permit-waiver letter, 19 Jun 2026 | Brand-identity evidence (§D) |
| 4 | `49` | **ACCOUNT OPENING APPLICATION FORM** (customer credit) | §16 — *not in brief* |
| 5 | `49 (1)` | **GOODS RECEIVED NOTE** | §11 |
| 6 | `49 (2)` | **GOODS TRANSFER NOTE** (GTN) | §14 — *not in brief* |
| 7 | `50` | **MATERIAL REQUISITION FORM** | §13 |
| 8 | `50 (1)` | **SUPPLIER GENERAL INFORMATION FORM** p1 (items 1–5) | §12 |
| 9 | `50 (2)` | **SUPPLIER GENERAL INFORMATION FORM** p2 (items 6–9 + signature) | §12 |
| 10 | `50 (3)` | **APPLICATION FOR CREDIT FACILITIES** | §12 |
| 11 | `50 (4)` | Material Requisition Form (duplicate of #7) | §13 |
| 12 | `51` | **GOODS/RAW MATERIAL ISSUE NOTE** (GIN) | §14 |
| 13 | `51 (1)` | **LEAVE APPLICATION FORM** `[IGL/ACC//F05]` | §18 |
| 14 | `51 (2)` | **"JUNIOR (JULY)"** technician repair-progress notebook | §7 |
| 15 | `51 (3)` | **INSTRUMENT REPAIR RECEIVING FORM** (filled: Bösendorfer, 26/11/25) | §5 |
| 16 | `52` | **NPT DAILY JOB ALLOCATION / CONSULTANCY GUIDE / PLANNER** | §8 |
| 17 | `52 (1)` | **"JULY"** piano movement log | §9 |

### Exact fields read off the images

**Instrument Repair Receiving Form** (Piano Technicians Guild + Nairobi Piano Technicians seal;
P.O. Box 8067-00100 Nairobi; Cell 0736569599 / 0722219775; L/LINE 020-2017737):
Date Received · Received by · Time of arrival · Brought in by · Client Information [Personal
Instrument | Institute Instrument] · Full Name · Phone Number · Email Address · Location ·
Institution Information: Name of Institution · Person in charge · Phone Number · Email · Location ·
Instrument Details grid — **rows** Piano / Keyboard / Saxophone / Guitar / Flute / Clarinet / Other;
**columns** Instrument · No of PCS · Brand Model · Serial Number · **Accessories Received** ·
**Accessories Received**.

> The duplicated "Accessories Received" column in §5 is **confirmed real** — it is a printing
> artefact of the pad, not a second data field. Per instruction: one structured accessories list +
> a separate condition/remarks field.

> The paper form has **no** field for reported problem, work requested, urgency, condition, colour,
> or photographs. Those are additions the brief requests (§5); they will be marked as additions,
> not as transcriptions.

**Daily Job Allocation / Consultancy Guide / Planner:** Date · Is workshop clean [Yes|No] + Comment ·
Is show room clean / Neat? [Yes|No] + Comment · **JOB ALLOCATION** · **REVIEW OF YESTERDAY JOB** ·
**CHALLENGES OF YESTERDAY JOB** — all three tables carry the *same four columns*: Instrument Name ·
Tech Name · Consulting Guide · Target & Plan · then COMMENT + SIGN for DIRECTOR and MANAGER.

> §8 specifies different columns for the review and challenges tables (actual outcome, status,
> challenge, intervention, responsible person, resolution target). Those are enhancements beyond the
> paper form and will be built as such.

**Repair progress notebook ("JUNIOR (JULY)"):** Date · Day · Piano Working On · Repairs Being Done ·
Status. Observed status values: `not yet`, `Done`, `still in process`. Header is the technician's
name — it is a per-technician monthly log.

**Piano movement log ("JULY"):** Date · Name of Client · Location (written as "from X to Y") ·
Type of Piano · Crew · Paid · Sign.

**Goods Received Note:** DATE · D/NO. · L.P.O. · GRN NO. · VEHICLE NO. · TIME · RECEIVED BY · SIGN ·
SUPPLIER · [QUANTITY | DESCRIPTION] rows · IN WORDS · REMARKS · AUTHORISED BY · ENTERED BY ·
STOCK CARD NO. · CHECKED BY.

**Goods/Raw Material Issue Note:** GIN NO. · Issued to · Date · [QUANTITY | DESCRIPTION | REMARKS]
rows · Stock Card entered by · Issued by · Received by.

**Goods Transfer Note:** GTN NO. · Transferred To · Date · [QUANTITY | DESCRIPTION | REMARKS] rows ·
Stock Card entered by · Goods Issued by · Goods Received by.

**Material Requisition Form:** DATE · NO. · [SR. No. | ITEMS | QUANTITY] rows · Prepared by + Date ·
Authorised by + Date.

**Supplier General Information Form:** 1 General information (name, address, telephone, fax,
physical location, e-mail, type of business: Limited/Sole Proprietor/Partnership) · 2 Directorship /
Proprietorship details · 3 Major shareholders / proprietors + **% Held** · 4 Company turnover (Year,
Shs. p.a.) · 5 Other details (year of commencement of trading, quality certification + year) ·
6 Details of major customers · 7 Name and address of bankers · 8 Senior management (Managing
Director/CEO, Finance, Sales Director/Manager) · 9 Any other useful information · NB: enclose
company profile · Signature · Position · Date · Company Stamp · NOTES.

**Application for Credit Facilities** (*a separate form from the above*): Full business name · Type
of company [Public Ltd | Private Ltd | Partnership | Sole Proprietor] · Postal address · Physical
address · Telephone · Fax · Name and contact of chief executive/owner/managing partner · Nature of
business · PIN No · VAT No · Bankers · Branch · Postal address · Trade references (1–3).

**Account Opening Application Form** (*customer-side, not supplier*): Full Business Name ·
Location/Street · P.O. Box · Tel · Mobile · E-mail · Name of Directors + ID/P.P no · Type of
Business [Sole proprietor | Partnership | Limited company] · BR no · VAT/PIN No · Nature of Business
[Distributor | General shop | S/market | Beauty shop | W/Salers | others] · Amount intended to
purchase on account (Ksh) · Frequency [weekly | by-weekly] · Terms & Conditions (a)–(e) ·
Customer's signature · Stamp · **OFFICIAL USE ONLY:** Company Rep Name/Sign/Date · Details Verified
by/Sign/Date · Account opening Approved by/Sign/Date · Approved Payment Terms (DAYS).

**Leave Application Form** `[IGL/ACC//F05]`: submitted in triplicate, ≥7 days before commencement.
PART 1(A) applicant: NAME · DESIGNATION · PF NO · DEPARTMENT · NATURE OF LEAVE (Annual, Contract,
Maternity, Paternity, Study, Sick, Sabbatical, Special-Leave, Emergency) · Number of days requested ·
From · To · Signature of Applicant · Date · Leave Address · Phone Contact · Reason.
PART II (FOR OFFICIAL USE ONLY): Annual Leave Entitlement · Leave Taken so far During the
Year/Contract Period · Leave Accumulated with Prior Permission · Total Leave Due · Leave Now Granted ·
Balance Due · Entered/Checked by (Name, Signature, Date) · Leave Approved / Not Approved · Director.

**Invoice** (Ice Land Geyser Ltd; P.O. Box 8067-00100; icelandgeyser@gmail.com; **PIN No.
P051705964T**): M/s · Date · Invoice No · [CODE | DESCRIPTION | UNIT | QTY | RATE | AMOUNT | VAT]
rows · AMOUNT · VAT · TOTAL.

> Column semantics on the real invoice are inverted from the usual convention: **UNIT** holds the
> pack count (`8PC`) and **QTY** holds the pack size (`1ltr`, `500ml`). Sample 1261: AMOUNT 2568.97,
> VAT 411.03, TOTAL 2980 — i.e. **VAT-inclusive line rates back-computed at 16%**. The digital
> invoice must reproduce this or deliberately depart from it; see §E open questions.

---

## D. Brand-naming ambiguity (§1.8) — resolved, with a decision still required

**There is no Iceland brand in the platform.** `brands` is seeded once, in `004_seed.sql`; the only
related row is:

```sql
('glitz-n-glim', 'Glitz N'' Glim', 'Glitz', '#b07a00', NULL)
```

The link between the two names is asserted in exactly one place in code — a comment in
`apps/ops-hub/src/lib/brandCategories.ts:3`:

> `Glitz N' Glim (Iceland Geysers) runs a production flow (raw material → WIP → finished goods)`

The supplied images settle the relationship. The KEBS letter (image `48 (2)`) states:

> "We have recently finalized the acquisition of **Iceland Geyser Ltd** the company that owns the
> **Glitz and Glim** brand."

And the Glitz storefront markets *"Premium cleaning & personal care products powered by Iceland
Geysers"* (`apps/glitz-n-glim/src/app/layout.tsx:6`).

**Conclusion: Iceland Geyser Ltd is the legal entity / manufacturer; Glitz N' Glim is its product
brand.** They are one operation, currently represented by one brand row, `glitz-n-glim`.

Nothing has been renamed. The modelling decision is deferred to the user — see §E, Q1.

### Legal-identity conflict on the stationery

The company's own documents disagree with each other, so no printed-document identity can be
derived safely:

| Source | Name as printed | P.O. Box | Email |
|---|---|---|---|
| Invoice (`48`) | Ice Land Geyser Ltd | 8067-00100 | icelandgeyser@gmail.com |
| Credit facilities (`50 (3)`) | Ice Land Geyser Ltd | 8067-00100 | — |
| Account opening (`49`) | ICE LAND GEYSER LIMITED | 2181-00100 | Icelandgeyser@gmail.com |
| KEBS letterhead footer (`48 (2)`) | Ice Land Geyser ltd | 47740-00100 | info@icelandgeyser.com |
| Leave form (`51 (1)`) | ICELAND GEYSER LTD (one word) | — | — |

Three different P.O. boxes and two spellings of the name. Also note the **NPT receiving form shares
P.O. Box 8067-00100** with the Iceland invoice.

---

## E. Open questions blocking implementation

1. **Brand modelling for Iceland Geyser Ltd** — new brand row, or operate on the existing
   `glitz-n-glim` row with a document-identity layer? Affects `brand_id` on every new table across
   Phases 3–5.
2. **Authoritative legal identity for printed documents** — which name/P.O. Box/email/PIN block
   goes on generated invoices, GRNs, GINs and leave forms?
3. **Shamim's user account** — no `Shamim` anywhere in the codebase (users live in Supabase, not in
   code). Need the email on her `user_permissions` / `ops_team_members` row to scope and verify §2.
4. **Invoice VAT convention** — reproduce the inclusive-rate back-computation seen on invoice 1261,
   or compute VAT exclusive-then-added? Changes every stored line total.
5. **`UNIT` / `QTY` column semantics** — keep the pad's inverted meaning (UNIT = pack count,
   QTY = pack size) or normalise to quantity + unit-of-measure?
6. **§10 Piano Technician Daily Class Logbook — no source image was supplied.** The brief describes
   it in detail but no photograph in this zip shows it. Fields will be taken from the brief's
   description only, and flagged as unverified.
7. **§19 Employment application form — no source image was supplied.** Per the brief's own
   instruction, a configurable template will be created and no sensitive or legally consequential
   questions will be invented.
8. **Two forms found that the brief does not mention** — the **Goods Transfer Note** (inter-store
   transfer, distinct from the GIN) and the **Account Opening Application Form** (customer credit,
   distinct from the supplier credit application). Confirm both are in scope.
9. **§12 conflates two distinct documents.** The brief describes one "supplier information or
   credit-facility application"; the images show a two-page **Supplier General Information Form**
   *and* a separate one-page **Application for Credit Facilities**. Plan is to model them as two
   linked records on the supplier profile.

---

## F. What can be extended safely vs what would be duplicated

**Extend (do not rebuild):**
`ocg_form_templates`/`ocg_form_submissions` · `ocg_daily_duties`/`ocg_daily_duty_logs` ·
`inventory_items`/`inventory_movements` · `procurement_vendors`/`procurement_purchases` ·
`npt_customers`/`npt_pianos`/`npt_service_jobs` · `ocg_audit_events` · `ocg_notifications` ·
`ops_team_members` · the `chat-attachments` private-bucket pattern · `PROCUREMENT_SCOPES`.

**Would be duplicated if built as specified — must be merged instead:**

| Brief asks for | Already exists as | Action |
|---|---|---|
| "Instrument" entity | `npt_pianos` | Generalise with `instrument_category`, don't add a table |
| "Institution" customer | `npt_customers` (person-shaped) | Add `customer_type` + org fields |
| "Technician" | `ops_team_members` | Reuse; do not create a technicians table |
| "Free-text notebook module" (§7) | — | Explicitly rejected by the brief; bind entries to repair cases |
| "Follow-up task" (§23) | `ops_tasks` | Reuse with a link column |
| "Attachment" infrastructure (§28) | `chat-attachments` bucket pattern | Reuse pattern, new bucket per domain |
| "Audit event" (§32) | `ocg_audit_events` | Reuse; wire new modules into it |
| Brand scope on goods receiving (§11) | `PROCUREMENT_SCOPES` | Reuse the three existing values |

---

## G. Migrations required (proposed, not yet written)

`052` forms lifecycle (draft/submitted/approved, versioning, reference numbers, attachments,
record links) · `053` checklist duties (sections, items, responses, issue escalation, template
versions) · `054` NPT intake + instrument generalisation + repair cases + activity log ·
`055` NPT workshop planner · `056` NPT movements · `057` supplier profiles, credit applications,
documents · `058` material requisitions · `059` goods received notes (partial/rejected) ·
`060` goods issue + transfer notes · `061` Iceland sales enquiries → orders → invoices → payments ·
`062` field-sales handover + reconciliation · `063` leave applications + entitlements ·
`064` employee documents + confidentiality tiers · `065` document identity / brand print profiles.

Sequencing follows the brief's Phases 1–7. Nothing above has been created yet.
