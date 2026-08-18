# Iceland ERP — Decisions Taken, and Stage 2 Completion Report

**Branch:** `feat/erp-ui` · **Commits:** `ca8fe07` → `8f8853b`
**Migration:** `066` written, **applied and verified live**
**Tests:** 376 pass · **Type-check:** clean · **All new routes compile**

Prior: [01-MAPPING-REPORT.md](./01-MAPPING-REPORT.md) · [02-COMPLETION-REPORT.md](./02-COMPLETION-REPORT.md)

---

## 1. The four blocking questions — decided, built, and why

You asked me to recommend and build rather than wait. Each decision is now
encoded in the schema, not just in a document, so it cannot drift.

### 1.1 VAT — reproduce the pad (inclusive, back-computed at 16%)

**Decision: the rates on the pad INCLUDE VAT.** The digital invoice reproduces
the paper exactly.

Invoice 1261 reads AMOUNT 2,568.97 + VAT 411.03 = TOTAL 2,980.00. That is only
consistent with inclusive rates: 2,980 × 16/116 = 411.03, and 2,980 × 100/116 =
2,568.97. I ran that arithmetic **against the live database** after applying the
migration:

```
vat 411.03 · net 2568.97 · total 2980.00
```

**Why this way.** The customer holds a piece of paper saying 2,980. If the
system computed exclusive-then-added it would print 3,456.80 for the same sale,
and every historical invoice would be restated by 16%. Reproducing the pad means
the digital record and the customer's copy agree, which is the only version an
argument can be settled with.

**The safeguard that matters more than the choice.** `vat_rate_percent` and
`prices_include_vat` are stored **on every line**, not on a company setting. If
Kenya changes the VAT rate, or you decide to switch conventions, historical
invoices keep the rate and convention they were issued under. A settings toggle
would have silently rewritten history — this cannot.

The form has a checkbox ("Rates include VAT — matches the pad") so a future
exclusive-priced customer is a per-invoice choice, not a migration.

### 1.2 Delivery-note and invoice numbering — a series the operator seeds

**Decision: keep the physical pad numbers as data, and add a `document_series`
table where the operator enters the current number once.**

The system then suggests the next one. Two properties matter:

- **The system reference and the pad number are separate.** `invoice_ref`
  (`INV-0001`) is minted and globally unique; `invoice_number` is whatever is
  written on the pad, unique **per brand, only when non-blank**. Gaps are legal
  on paper and illegal in the system reference.
- **The minter is never seeded from a pad.** This is the trap I most wanted to
  avoid: if `ops_id_sequences` were set to 1261, the next system reference would
  eventually collide with a historical document. It isn't, so it can't.

`advanceSeries()` only ever moves the counter **forward**, so back-dating a
document cannot rewind the pad.

**What I still need from you:** the actual current numbers. Enter them once at
Finance → set-series (or via `/api/sales` `set-series`) and the suggestions
become correct. Until then the field is simply blank and typed by hand — which
is exactly what happens today.

### 1.3 UNIT / QTY — normalise the data, print the pad

**Decision: store a real numeric quantity, and keep the pad's two text columns
verbatim for printing.**

The pad inverts the usual meaning: `UNIT` holds the pack count (`8PC`) and `QTY`
holds the pack size (`1ltr`). Neither is a number you can multiply.

So `sales_invoice_items` carries:

| Column | Holds | Used for |
|---|---|---|
| `pad_unit_text` | `8PC` | Printing the UNIT column |
| `pad_qty_text` | `1ltr` | Printing the QTY column |
| `quantity` | `8` | Arithmetic **and the stock ledger** |
| `uom` | `pcs` | The unit that quantity is counted in |

**Why not just normalise and drop the pad text.** Because the storekeeper
reconciles against paper. A printed invoice that says "8" where the pad says
"8PC / 1ltr" is a different document, and the first time someone disputes a
delivery, that difference costs more than the column did to store.

**Why not just keep the pad text.** Because you cannot deduct `8PC` from stock.

### 1.4 Customer vocabulary — a fourth table, deliberately

**Decision: create `sales_customers`, and link rather than merge.**

The 2026-08-05 audit warned against adding a fourth customer vocabulary, and it
was right to. I have added one anyway, and here is the reasoning:

- `npt_customers` is a **piano owner** — a service relationship, with an
  instrument and a service history.
- marketing `contacts` are **leads** — someone who may buy.
- A shop buying Glitz on account is **neither**. It has a BR number, a VAT PIN,
  a credit limit, payment terms and an invoice history.

Forcing all three into one table would mean a piano owner with a credit limit
and a supermarket with a tuning history. The honest modelling is separate tables
with an explicit join: `sales_customers.npt_customer_id` links the same legal
entity where it exists in both, so it is joined, never duplicated.

**Duplicate guards added** (the mapping report §11.2 flagged their absence):

- unique on `lower(vat_pin_number)` where non-blank — the true legal identifier
- unique on `(brand_id, lower(business_name))` — catches the obvious repeat

Both surface as plain-English errors, not constraint strings.

---

## 2. Forms that feed manufacturing — the main ask

**`/forms/operations`** carries each paper pad with the same fields in the same
order, and **every posted form writes through the one stock ledger**, so the
stock card recalculates the instant it is saved. There is no batch job and no
second copy of the numbers to fall out of step.

| Pad | Fields | Effect on stock |
|---|---|---|
| **Goods Received Note** | DATE · D/NO. · L.P.O. · GRN NO. · VEHICLE NO. · TIME · RECEIVED BY · SUPPLIER · lines · IN WORDS · REMARKS · AUTHORISED BY · ENTERED BY · STOCK CARD NO. · CHECKED BY | **+ accepted quantity only** |
| **Goods / Raw Material Issue Note** | GIN NO. · Issued to · Date · [QUANTITY \| DESCRIPTION \| REMARKS] · Stock card entered by · Issued by · Received by | **− issued quantity** |
| **Goods Transfer Note** | GTN NO. · Transferred To · Date · same lines · Stock card entered by · Goods issued by · Goods received by | **− from source store** |
| **Material Requisition** | DATE · NO. · [SR. No. \| ITEMS \| QUANTITY] · Prepared by · Authorised by | **none — by design** |
| **Invoice** | M/s · Date · Invoice No · [CODE \| DESCRIPTION \| UNIT \| QTY \| RATE \| AMOUNT \| VAT] · AMOUNT · VAT · TOTAL | **− finished goods** |
| **Delivery Note** | D/Note no. · week · salesperson · vehicle/route · lines | **− store, + custody** |

### The three modelling decisions inside those forms

**1. The GRN's single QUANTITY column is split into four.** Ordered, delivered,
accepted, rejected. The audit found that receiving stocked the *ordered*
quantity — which is precisely how rejected goods inflate inventory. Now
`delivered = accepted + rejected` is enforced, only **accepted** reaches stock,
and a rejection without a reason is refused.

**2. A requisition moves nothing.** Not when raised, not when approved. Approval
is a decision; stock moves when the issue note posts. Conflating the two is how
a store's book balance stops matching its shelf.

**3. Each form states its stock effect before you submit it.** A coloured notice
says, in units, what will move. A GIN whose quantity exceeds what is on hand
warns before submission — and is refused by the ledger regardless.

---

## 3. What else was built this stage

### Field sales — custody as a second ledger

`/field-sales`. The weekly delivery note deducts the main store **once** and
opens custody. Daily sales reduce **custody only**.

Allocate 500, sell 300 → the store is down 500, not 800. This is the single most
expensive error the module prevents, and it is why there are two ledgers rather
than one. Weekly reconciliation shows issued / sold / damaged / sampled /
returned / in-custody per item, flags **unaccounted** stock, and compares cash
expected against cash submitted with credit sales excluded.

Returned stock: accepted units re-enter sellable inventory; **rejected units do
not**. Damaged goods coming off a van must not silently become stock again.

### Petty cash — the float cycle

`/petty-cash`. Open → spend → close against a physical count → carry, return,
reimburse or write off.

- Closing **refuses an unexplained variance**, and refuses while supporting
  documents are outstanding.
- **One active float per custodian.** Spending needs an unambiguous home.
- **One successor per float** — a carried balance cannot also be reimbursed.
- Transaction charges stay **separate** from the expense amount (as the sheets
  keep them) and are combined only when comparing against a bank line.

### QuickBooks — unblocked, exactly as you described

You were right that this was never really blocked. The manual forms produce the
figures that get keyed into QuickBooks, so I built the projection instead of
waiting for the export.

`qb_expected_entries` is a **view** that renders every posted invoice, payment,
goods receipt and petty-cash transaction into QuickBooks's shape — date,
document number, party, amount, tax. `/finance/quickbooks` shows what the books
*should* say for any period, per event type, with the debit/credit accounts from
an editable `qb_account_map` (seeded with conventional names, flagged as
defaults rather than presented as your real chart of accounts).

When an export arrives, matching is comparing two lists. The matcher scores
candidates on date, amount, reference, M-Pesa code and party — and **a match
still cannot be accepted on amount alone**: two agreeing signals minimum,
enforced by a database CHECK, not by convention.

---

## 4. Migration 066 — applied, not just committed

The root-cause failure of an earlier session was that "committed" and "applied"
were indistinguishable. So, explicitly:

```
node scripts/supabase-sql.mjs --pending   →  All migrations applied.
```

All 9 new objects verified present in the live database. The VAT arithmetic was
verified **against the live database**, not just in TypeScript.

Everything is additive: new tables, one view, two new nullable FK columns on
`inventory_movements`, and seeded defaults with `ON CONFLICT DO NOTHING`. No
existing row was altered. Rolling back means dropping the new objects.

---

## 5. Honest status

### Complete and usable

Daily duties · Calendar · Manufacturing · Inventory stock card · Operational
analytics · **Operational forms** · **Field sales** · **Petty cash floats** ·
**Sales invoices and payments** · **QuickBooks expected-entries**

### Built but not yet surfaced in UI

- **Customer / account-opening screens.** `sales_customers` and
  `sales_account_applications` have full schema, service and API — including the
  verifier-cannot-approve rule — but no page. Customers can be created through
  `/api/sales`; there is no form yet.
- **Supplier profile and credit application forms.** The 31-column supplier
  profile from migration 054 still has no screen.
- **Stock counts and reorder alerts.** Tables and logic exist; no UI.
- **Document-series editor.** Settable via API; no settings screen. This is the
  one that blocks §1.2 from being useful, and it is small.

### Not built

- Leave application form (§18 of the original brief)
- PDF rendering of any document — the print identity is seeded and now shown at
  the head of each on-screen pad, but there is no PDF renderer
- Notification dispatcher — alerts and briefs compute, nothing sends
- Spreadsheet import adapters — still genuinely blocked on the workbooks

### Testing

| Check | Result |
|---|---|
| `npm test` | **376 pass, 0 fail** |
| `npm run type-check` | **7 workspaces clean** |
| Migration applied | **verified live** |
| VAT arithmetic | **verified against the live database** |
| New route compilation | all return 307 → `/login` unauthenticated |
| Server errors | none |

**No new automated tests were added this stage**, and none of the new write
paths has been exercised against live data. The invariants they rely on
(accepted-only stocking, once-only posting, custody non-negativity, one
successor per float, two-signal matching) are enforced by database constraints
and by the previously-tested pure models — but the new service functions
themselves are covered only by type-checking. That is the largest gap in this
stage's work and I am not going to describe it as anything else.

**No screenshots.** Every page is behind authentication and I cannot sign in.

---

## 6. Recommendations

1. **Enter the pad numbers.** One number per series (invoice, delivery note,
   GRN). Until then the suggestion field is blank. I would build the small
   settings screen for this next — it is an hour of work and it completes §1.2.
2. **Classify the inventory items.** Production planning and the three-store
   view only work once items are marked raw / packaging / finished. The
   manufacturing page shows a warning counting how many are still unclassified.
3. **Run one form end to end** — a GRN, then check the stock card. That single
   exercise validates the whole chain, and I have not been able to do it.
4. **Add integration tests for the new write paths** before real volume. The
   constraints will catch a double-post; a test would catch it in CI instead of
   in production.
5. **Send the workbooks when convenient.** Everything else is now unblocked, but
   the historical import still needs them.
