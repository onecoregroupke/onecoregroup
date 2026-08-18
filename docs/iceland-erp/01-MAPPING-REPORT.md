# Iceland Geyser — Source Document → ERP Mapping Report

**Repo:** `onecoregroup-main` · **App:** `apps/ops-hub` · **Base:** `main` @ `d9ce1df`
**Date:** 2026-08-18 · **Status:** target model mapped in full; source workbooks **not received**

Prior work: [`docs/shamim-workflow/`](../shamim-workflow/) ·
[`docs/duties-calendar-manufacturing/`](../duties-calendar-manufacturing/)

---

## 0. What this document is, and what it is not

The instruction was: *map every spreadsheet and document into the current ERP
data model before importing any data, and do not import until the mapping is
validated.*

This report maps **both halves of that contract for everything that has actually
been supplied**, and states plainly where a source is missing rather than
inventing a plausible column list.

| Source class | Supplied? | Mapping status |
|---|---|---|
| Physical operational documents (17 photographs) | **Yes** — audited 2026-08-05, re-sent 2026-08-18 | **Complete, field by field** (§3–§6) |
| QuickBooks exports | **No** | Target columns + join keys defined; source headers **pending** (§9) |
| Iceland sales-tracking spreadsheets | **No** | Target tables defined; worksheet inventory **pending** (§2) |
| Delivery Notes (electronic series) | **No** | Numbering model defined; live series **pending** (§7) |
| Petty Cash records | **No** | Target defined; sheet layout **pending** (§2) |
| Supplier documents | Partly — 3 blank pads photographed | Form fields mapped; **supplier list pending** (§6) |
| Goods movement records | Partly — GRN/GIN/GTN blank pads | Fields mapped; **historical movements pending** |
| Inventory records | **No** | SKU master schema defined; **values pending** (§4) |

**The 2026-08-18 attachment is a re-send.** Its 17 JPEGs are byte-identical as a
set to the 2026-08-05 zip (verified by md5 over the file set). It contains no new
document. Everything in §3–§6 below therefore derives from documents this project
has already read, not from newly supplied material.

**No data has been imported.** No importer was run, no rows were written, no
sequence was advanced.

---

## 1. The target model, in one picture

Everything below maps into an ERP that already exists and is live in Supabase
(migrations 001–065, all applied, verified via `node scripts/supabase-sql.mjs --pending`).
Nothing in this report proposes a new table where one already models the concept.

```
                       ┌─────────────────────┐
  SUPPLIER ────────────│ procurement_vendors │  (+31 profile cols, 054)
     │                 └─────────────────────┘
     │                            │
     │            procurement_credit_applications  (supplier credit)
     ▼
  procurement_requisitions ──► procurement_purchases ──► procurement_goods_receipts
   (MRF pad)                    (LPO / ORDER pad)         (GRN pad)
                                                              │ accepted qty only
                                                              ▼
  ┌──────────────────────────── inventory_movements ────────────────────────────┐
  │  THE ONE STOCK LEDGER. direction + quantity + quantity_after, one row per    │
  │  event, each carrying the FK of the document that caused it. Partial UNIQUE  │
  │  indexes make double-posting impossible at the database level.               │
  └──────────────────────────────────────────────────────────────────────────────┘
       ▲            ▲              ▲                ▲                 ▲
       │            │              │                │                 │
  goods_receipt  goods_issue   fg_transfer     allocation_item   stock_count_item
   (GRN)        (GIN / GTN)   (production)     (delivery note)     (count adj)
                     │              ▲
                     ▼              │
            production_runs ────────┘
         (raw + packaging consumed → finished goods)
                     │
                     ▼
        field_sales_allocations (weekly delivery note)
                     │
        field_sales_custody_movements   ← SECOND ledger, same shape, custody only
                     │
        field_sales_daily_returns (sold / damaged / sample / on hand + cash)
                     │
        field_sales_return_notes (unsold stock back to store)
                     │
                     ▼
        quickbooks_transactions ◄── quickbooks_matches ──► any operational record
```

Two ledgers exist by design, not by accident: `inventory_movements` (company
stock) and `field_sales_custody_movements` (stock held by a salesperson). A
weekly allocation deducts the main store **once** and opens custody; a daily
invoice then reduces **custody only**. This is what stops the 500-allocated /
300-sold double-deduction, and it is unit-tested.

---

## 2. Worksheets

**Source status: not supplied.** Nothing here can be completed without the files.

What the importer needs from each workbook, and where the answer lands:

| Needed from the workbook | ERP target | Why it matters |
|---|---|---|
| Sheet names + row/col counts | `data_imports.sheets_available` (JSONB) | The preview UI lists sheets for selection; already implemented in `lib/imports/framework.ts` |
| Header row index per sheet | `data_imports.field_mappings` | Sheets with title/logo rows above the header break naive parsing |
| Which sheets are data vs summary | `ParsedRow.record_kind` (`skip`/`subtotal`/`header`) | The framework refuses to commit non-data rows — see `SKIP_KINDS` |
| Merged-cell regions | — | Merged headers are the single most common cause of column drift |
| Negative-number convention | adapter-level | Parenthesised negatives `(1,200)` vs `-1200` change every sign |
| Date format + locale | adapter-level | `01/02/2026` is ambiguous KE vs US; must be pinned per workbook |
| Formula vs value cells | — | Formula cells must be read as computed values, not `=SUM(...)` |
| Blank-row / repeated-header pagination | `record_kind` | Printed workbooks repeat headers every N rows |

**Deliverable when files arrive:** one row per worksheet in a table of
`file → sheet → header row → record kind → target table → adapter`.

The reusable machinery this plugs into already exists and is not being rebuilt:
`lib/imports/framework.ts` provides upload → parse → stage → duplicate-classify →
validate (dry run) → commit → receipt → rollback, with the file hash retained
(`data_imports.file_hash`) and prior-import detection by hash
(`findPriorImportByHash`). Two adapters exist as reference implementations
(`pettyCashAdapter.ts`, `schoolLedgerAdapter.ts`).

---

## 3. Document types

Every document type observed in the photographs, mapped to its live target.
**No new table is required for any of them.**

| # | Physical document | Target table(s) | Discriminator |
|---|---|---|---|
| 1 | **INVOICE** (Ice Land Geyser, No. 1261/1262) | *see §8 — the one genuine gap* | — |
| 2 | **ORDER pad** (LPO, No. 64) | `procurement_purchases` + `_items` | — |
| 3 | **GOODS RECEIVED NOTE** | `procurement_goods_receipts` + `_items` | — |
| 4 | **GOODS/RAW MATERIAL ISSUE NOTE** | `procurement_goods_issues` + `_items` | `kind='issue'` |
| 5 | **GOODS TRANSFER NOTE** | `procurement_goods_issues` + `_items` | `kind='transfer'` |
| 6 | **MATERIAL REQUISITION FORM** | `procurement_requisitions` + `_items` | — |
| 7 | **SUPPLIER GENERAL INFORMATION FORM** (2pp) | `procurement_vendors` (+31 cols) | — |
| 8 | **APPLICATION FOR CREDIT FACILITIES** | `procurement_credit_applications` | supplier-side |
| 9 | **ACCOUNT OPENING APPLICATION FORM** | *customer credit — see §8* | customer-side |
| 10 | **LEAVE APPLICATION FORM** `[IGL/ACC//F05]` | `ocg_leave_requests` (056) | — |
| 11 | **INSTRUMENT REPAIR RECEIVING FORM** | `npt_intakes` + `npt_intake_items` | NPT |
| 12 | **DAILY JOB ALLOCATION / PLANNER** | `npt_workshop_plans` + `_rows` | NPT |
| 13 | **Repair progress notebook** ("JUNIOR (JULY)") | `npt_repair_activities` | NPT |
| 14 | **Piano movement log** ("JULY") | `npt_movements` | NPT |
| 15 | **KEBS permit-waiver letter** | reference only — brand identity evidence | — |
| 16 | **Weekly delivery note** (field sales) | `field_sales_allocations` | not photographed; modelled |
| 17 | **Petty cash records** | `petty_cash_floats` + `petty_cash_transactions` | not photographed |

Documents 1 and 9 are the only two with no live target table. See §8.

---

## 4. SKUs and product hierarchy

### 4.1 The hierarchy the ERP already models

`inventory_items` carries the full hierarchy after migration 060. **No separate
product-master table exists or is needed.**

| Level | Column | Example (shape only — no values invented) | Notes |
|---|---|---|---|
| Classification | `item_type` | `raw_material` / `packaging` / `work_in_progress` / `finished_good` / `damaged` / `returned` / `sample` / `consumable` | CHECK-constrained; drives which store a thing may live in |
| Family | `product_family` | *pending* | The product line, e.g. a cleaner range |
| Item | `name` | *pending* | |
| Size | `size_label` | `1ltr`, `500ml` | Taken from the invoice's **QTY** column — see §10 |
| Pack | `package_config` | `8PC` | Taken from the invoice's **UNIT** column — see §10 |
| Code | `sku` | *pending* | Maps from the invoice **CODE** column |
| Barcode | `barcode` | *pending* | |
| Price | `selling_price_ksh` | *pending* | |
| Cost | `unit_value_ksh` | *pending* | Pre-existing (035) |
| Reorder | `reorder_level`, `minimum_stock`, `maximum_stock`, `production_threshold` | *pending* | 059/060 |
| Shelf life | `shelf_life_days` | *pending* | |
| Location | `store_id` → `inventory_stores` | Raw / Packaging / Finished Goods | Physically separated stores |

### 4.2 The SKU identity problem — decide before import

`inventory_items.sku` is `TEXT NOT NULL DEFAULT ''` with **no unique index**.
That is safe today (SKUs are largely unused) and dangerous the moment a
spreadsheet import starts matching on it.

**Recommendation:** add a partial unique index
`(brand_id, lower(sku)) WHERE sku <> ''` before the first SKU-bearing import, so
two spreadsheets cannot create two rows for the same product. This is a one-line
migration and is listed in §13 as a pre-import action, deliberately **not** run
yet — it would fail if the live table already contains duplicate SKUs, and that
is itself the check worth running first.

### 4.3 Matching rule for the importer (proposed, needs the workbook to confirm)

Resolve a spreadsheet product row to an `inventory_items` row in this order,
stopping at the first hit, and **never** creating silently:

1. `barcode` exact
2. `sku` exact, case-insensitive, trimmed
3. `(product_family, name, size_label, package_config)` exact, case-insensitive
4. `name` exact, case-insensitive → **flag for review, do not auto-commit**
5. no match → **new-entity row in the preview**, requires explicit operator approval

Rule 4 exists because product names in hand-kept workbooks drift
("Glitz 1L", "GLITZ 1 LTR", "Glitz1litre") and an automatic fuzzy match would
merge two real products or split one.

---

## 5. Reference numbering

### 5.1 How the ERP mints references

One atomic minter, `ocg_next_reference(seq_name, prefix, width)` (migration 052),
built on the `ops_id_sequences` row lock. Sequences self-register on first use,
so a new document type needs no migration. Called from
`mintReference()` in [`lib/serverClient.ts`](../../apps/ops-hub/src/lib/serverClient.ts).

Registered sequences, by migration:

| Sequence | Migration | Used for |
|---|---|---|
| `task`, `project`, `client` | 017 | `TASK-0001`, `PROJ-001`, `CLIENT-001` |
| `npt_intake`, `npt_repair_case`, `npt_movement`, `npt_training` | 053 | NPT documents |
| `requisition`, `goods_receipt`, `goods_issue`, `goods_transfer`, `credit_application` | 054 | Procurement chain |
| `production_run`, `fg_transfer`, `stock_count` | 060 | Manufacturing |
| `fs_allocation`, `fs_daily_return`, `fs_return_note`, `delivery_note` | 061 | Field sales |
| `petty_float` | 062 | Petty cash floats |
| `qb_import` | 063 | QuickBooks imports |

### 5.2 The critical distinction: system reference vs physical document number

Every document carries **two** numbers, and conflating them would be the single
most damaging modelling error in this import.

| | System reference | Physical document number |
|---|---|---|
| Column | `reference` / `*_ref` | `delivery_note_number`, `lpo_number`, `invoice_number`, `stock_card_number`, `delivery_note_no` |
| Minted by | `ocg_next_reference` | The printed pad in the store |
| Guaranteed unique | Yes, globally | Only per brand, and only where non-blank |
| Gaps allowed | No | Yes — pads get spoiled, skipped, lost |
| Back-dating | Never | Common |

The schema already honours this: e.g. `procurement_goods_receipts.reference` is
`TEXT UNIQUE` (system) while `delivery_note_number` is a plain text field (as
written on the pad), and `field_sales_allocations` has both `allocation_ref`
(unique globally) and `delivery_note_no` (unique **per brand, only when
non-empty**).

**Import rule:** historical rows keep their physical numbers verbatim in the
physical column and receive a **fresh** system reference. The importer must
never seed `ops_id_sequences` from a physical series, or the next new document
will collide with a historical one.

---

## 6. Supplier references

### 6.1 Target

`procurement_vendors` — the base 5 contact fields from 035, plus 31 columns added
by 054 covering the two-page Supplier General Information Form: directorship,
shareholders and `% Held`, turnover by year, year of commencement, quality
certification, major customers, bankers, senior management (MD/CEO, Finance,
Sales), and a **restricted banking block**.

`procurement_credit_applications` is a separate record, linked to the vendor,
covering the Application for Credit Facilities: business type, PIN, VAT,
bankers + branch, and trade references 1–3.

### 6.2 Identity and duplicate risk

`procurement_vendors` has **no unique constraint on name** — only
`idx_procurement_vendors_name`, a plain index. A supplier import will therefore
happily create "Acme Ltd", "ACME Ltd." and "Acme Limited" as three suppliers.

**Match order for the importer:**

1. PIN number exact (once populated — this is the only true legal identifier)
2. `lower(trim(name))` exact
3. normalised name (strip `ltd|limited|co|company|.|,` + collapse whitespace) → **review, never auto-commit**
4. no match → new-entity row requiring approval

**Pre-import action (§13):** run a duplicate scan over existing
`procurement_vendors` and resolve before loading a supplier list, not after.

---

## 7. Delivery note numbering

Two distinct things share the phrase "delivery note" in this business:

| Sense | Where it lives | Column | Uniqueness |
|---|---|---|---|
| **Inbound** — the supplier's DN accompanying goods into our store ("D/NO." on the GRN pad) | `procurement_goods_receipts` | `delivery_note_number` | None. It is the *supplier's* number; two different suppliers may legitimately both use "1042" |
| **Outbound** — our weekly delivery note handing stock to a sales team | `field_sales_allocations` | `delivery_note_no` | **Unique per brand where non-blank** (`idx_fs_allocation_dn`) |

**Source status: the live outbound series is not supplied.** The prior report
recorded this as blocked, and it remains so: the current number lives on the
physical pad and must be read off it.

**Import rules already enforced or required:**

- An outbound DN number may not repeat within a brand — enforced by partial unique index.
- Duplicate detection must be case- and whitespace-insensitive, including
  repeats *within a single import file*. This logic is built and unit-tested
  (`fieldSalesModel.test.ts`); only the column mapping is missing.
- A blank DN number is allowed (drafts) and must not collide with other blanks —
  hence the `WHERE delivery_note_no <> ''` predicate.

---

## 8. Invoice numbering — and the one genuine schema gap

### 8.1 The gap

**There is no customer sales-invoice table for the Iceland operation.** This was
recorded in the 2026-08-05 audit (§B4) and has not been built since. What exists:

- `orders` / `order_items` (003) — the Glitz **storefront** web-shop, not a B2B order book
- NPT quotes/invoices (025) — NPT service work only
- School fee invoices (033/044) — schools only
- `field_sales_daily_returns.invoice_ref` — a **text reference** to a paper invoice, not an invoice record

So invoices 1261/1262 have nowhere to land today, and neither does the
**Account Opening Application Form** (customer credit).

### 8.2 Numbering model when it is built

| Aspect | Decision |
|---|---|
| Physical series | Continues from the pad (1261, 1262, …) — stored verbatim |
| System reference | Separate, minted (`invoice` sequence), never derived from the pad |
| Uniqueness | Physical number unique **per brand**; gaps expected and permitted |
| Sequence seeding | **Never** seed the minter from the pad series |

### 8.3 VAT convention — unresolved, and it changes every stored line total

Invoice 1261 reads: AMOUNT 2,568.97 + VAT 411.03 = TOTAL 2,980.00.
411.03 / 2568.97 = 16.0%, and 2,980.00 × (16/116) = 411.03. The pad's rates are
therefore **VAT-inclusive, back-computed at 16%**.

This question was raised on 2026-08-05 and has not been answered. It cannot be
defaulted safely: choosing exclusive-then-added changes every line total by
16%, and choosing wrong corrupts every imported historical invoice.
**Listed as a blocking question in §13.**

---

## 9. QuickBooks field mappings

### 9.1 Target — deliberately format-agnostic

`quickbooks_imports` stores `detected_headers TEXT[]` and a user-supplied
`field_mapping JSONB`. The system does **not** hard-code QuickBooks column names,
because QuickBooks export shapes vary by version, locale and report type. This
was a deliberate design decision in migration 063 and it is why the missing
exports do not block the engine — only the concrete mapping.

`quickbooks_transactions` is the canonical landing table:

| Target column | Expected QuickBooks source | Notes |
|---|---|---|
| `qb_id` | internal/list ID where exported | **The natural key.** `UNIQUE (export_type, qb_id) WHERE qb_id <> ''` — the same record cannot land twice |
| `qb_doc_number` | Num / Doc Number | The human-facing document number |
| `transaction_date` | Date | Format must be pinned per export |
| `transaction_type` | Type | Invoice / Bill / Payment / Expense / Journal |
| `account_name` | Account / Split | |
| `customer_name` | Name / Customer | |
| `supplier_name` | Name / Vendor | QuickBooks often uses one "Name" column for both |
| `description` | Memo / Description | |
| `reference` | Ref No. | |
| `mpesa_code` | *usually inside Memo* | Indexed separately because it is the highest-quality match signal in Kenya |
| `amount_ksh` | Amount | Sign convention must be pinned |
| `tax_ksh` | Tax / VAT | |
| `raw` | the entire source row | JSONB — **every** original value retained, always |
| `row_number` | source row index | Traceability back to the file |

`export_type` is constrained to: `accounts`, `customers`, `suppliers`,
`products`, `invoices`, `payments`, `expenses`, `petty_cash`, `bank`,
`credit_notes`.

### 9.2 Reconciliation rules already enforced in the database

- **A match may not be accepted on amount alone.** `quickbooks_matches` has a
  CHECK requiring `array_length(match_basis, 1) >= 2` for `decision='accepted'`.
  Signals: date, amount, reference, `mpesa_code`, supplier.
- **One accepted link per (QB transaction, operational record)** — partial unique index.
- **The same file cannot be committed twice** —
  `UNIQUE (file_checksum, export_type) WHERE status='committed'`.
- Split (one QB txn → many operational records) and combine (many → one) are both
  supported by the join-table shape with `matched_amount_ksh` per link.
- Full decision history in `quickbooks_match_events`.

### 9.3 Pending

The concrete `field_mapping` per export type. This is operator-supplied by
design (the UI asks for it), but the *defaults* should be pre-filled from the
real exports so the accountant is not mapping 14 columns by hand each month.

---

## 10. Ambiguous columns

Ranked by how much damage a wrong reading does.

| # | Ambiguity | Where | Risk if read wrong | Resolution |
|---|---|---|---|---|
| 1 | **VAT inclusive vs exclusive** | Invoice pad | Every line total wrong by 16% | **Blocked — needs decision** (§8.3) |
| 2 | **`UNIT` / `QTY` inverted** | Invoice pad: `UNIT`=`8PC` (pack count), `QTY`=`1ltr` (pack size) | Quantities and pack sizes swapped throughout | Modelled as `package_config` + `size_label`; **confirm before import** |
| 3 | **Negative-number convention** | Spreadsheets | Sign flips on every credit/return | Pending — needs the workbook |
| 4 | **Date locale** `01/02/2026` | Spreadsheets, QuickBooks | Jan 2 vs Feb 1 | Pin per file at mapping time |
| 5 | **"Name" column** = customer or supplier | QuickBooks | Records land against the wrong party | Derive from `transaction_type`, not the column |
| 6 | **Duplicate "Accessories Received"** column | NPT receiving form | A phantom second field | Resolved 2026-08-05: printing artefact — one structured list + `condition_at_receipt` |
| 7 | **"Location"** written as "from X to Y" | Piano movement log | Origin and destination merged in one cell | Split on `to`/`-`; **flag for review**, never silently |
| 8 | **Amount sign on payments** | QuickBooks | Payments added instead of subtracted | Pin per export type |
| 9 | **`Paid` column** (blank / tick / amount) | Piano movement log | Boolean vs money conflated | Read as boolean; amount to notes if numeric |
| 10 | **Stock Card No.** | GRN/GIN/GTN pads | Looks like a system ref, is a manual book folio | Stored as `stock_card_number` text; **not** a system reference |

---

## 11. Duplicate risks

### 11.1 Already prevented in the database — nothing to build

| Guarantee | Mechanism |
|---|---|
| One stock movement per GRN line, ever | `idx_inv_movements_receipt_item_once` (partial UNIQUE) |
| One stock movement per issue line, ever | `idx_inv_movements_issue_item_once` |
| One stock movement per allocation line, ever | `idx_inv_movements_allocation_item_once` |
| One movement per finished-goods transfer | 060 |
| One adjustment per counted line | 060 |
| Same QuickBooks record cannot land twice | `idx_qb_txn_natural_key` |
| Same export file cannot commit twice | `idx_qb_import_checksum_once` |
| One accepted match per (txn, record) | `idx_qb_match_accepted_once` |
| One daily return per (allocation, salesperson, date) | `idx_fs_daily_return_once` |
| Outbound DN number unique per brand | `idx_fs_allocation_dn` |
| One active float per custodian | 062 |
| One successor per float (carry-forward double-count guard) | 062 |
| One duty occurrence per (duty, date, assignee) | 055 |
| One task per duty occurrence | 057 |

### 11.2 NOT prevented — real exposure before import

| # | Risk | Why it exists | Action |
|---|---|---|---|
| 1 | **Duplicate SKUs** | No unique index on `inventory_items.sku` | Scan, then add partial unique index (§4.2) |
| 2 | **Duplicate suppliers** | No unique constraint on vendor name | Scan + normalise (§6.2) |
| 3 | **Duplicate customers** | Three customer vocabularies already exist: `npt_customers`, `npt_contacts`, marketing `contacts` | Do **not** add a fourth. Decide the canonical home before any customer import |
| 4 | **Same physical invoice imported twice** | No invoice table exists yet (§8) | Build with `UNIQUE (brand_id, invoice_number)` from day one |
| 5 | **Re-imported historical period overlapping a live period** | Nothing scopes an import to a date range | Period bounds exist (`period_start`/`period_end` on `quickbooks_imports`); enforce overlap detection at preview |

---

## 12. Historical data issues

| # | Issue | Consequence | Handling |
|---|---|---|---|
| 1 | **Opening balances have no source document** | Historical stock exists with no GRN behind it | Import as an explicit `stock_count` with `reason='opening balance'`, so the ledger stays complete and the origin is honest — never as a fabricated GRN |
| 2 | **Physical pads have gaps** | Spoiled/skipped numbers | Gaps are legal in physical series; never auto-fill |
| 3 | **Back-dated documents** | A GRN written up days after receipt | `received_date` (business date) is already separate from `created_at` (system date) |
| 4 | **Pre-system period has no custody ledger** | Field-sales custody cannot be reconstructed before go-live | Start custody at a stated cut-over date; do not synthesise history |
| 5 | **Two `npt_customers` / `npt_contacts` vocabularies** | Pre-existing, recorded 2026-08-05 | Unchanged; must be resolved before a customer import |
| 6 | **QuickBooks is the accounting truth; the ERP is the operational truth** | They will disagree, legitimately | Modelled: `quickbooks_transactions` stores accounting facts as read; reconciliation status is kept **separate** from operational status. Neither rewrites the other |
| 7 | **Rounding** | KSh sub-unit drift across 16% VAT back-computation | Store as read; compute differences explicitly into `reconciliation_difference_ksh` |
| 8 | **Deleted/voided source rows** | A voided invoice still occupies a number | Import with an explicit voided state; never skip silently |

---

## 13. Validation gate — what must happen before the first import

**Blocking questions (cannot be defaulted safely):**

1. **VAT convention** — reproduce the pad's inclusive back-computation at 16%, or
   compute exclusive-then-added? (§8.3)
2. **Current outbound delivery-note number** — the live series on the pad. (§7)
3. **`UNIT`/`QTY` semantics** — keep the pad's inverted meaning, or normalise? (§10 #2)
4. **Canonical customer table** — which of the three existing vocabularies wins? (§11.2 #3)

**Pre-import actions (engineering, not blocked — but pointless before the files):**

5. Duplicate scan of `inventory_items.sku`, then add `(brand_id, lower(sku))` partial unique index.
6. Duplicate scan of `procurement_vendors` by normalised name + PIN.
7. Build the customer sales-invoice tables (§8) — the one real schema gap.
8. Pre-fill QuickBooks `field_mapping` defaults per export type from the real exports.

**Files still required:**

QuickBooks exports · Iceland sales-tracking workbooks · delivery-note records ·
petty-cash sheets · supplier list · goods-movement history · inventory records.

---

## 14. Standing instruction honoured

> *Do not import until the mapping is validated.*

Nothing has been imported. No importer was executed, no rows written, no sequence
advanced, and no values were invented to fill a column whose source is missing.
Where a source has not arrived, this report says so instead of guessing.
