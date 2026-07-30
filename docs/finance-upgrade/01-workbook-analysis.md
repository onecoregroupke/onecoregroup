# Workbook Analysis — Finance / School Accounts Upgrade

**Status:** internal analysis note (audit phase). No real student data is reproduced
here — every example below is redacted or synthetic. Real names, admission numbers,
receipt numbers and M‑Pesa codes from the source workbooks are **not** committed to
this repository.

Source workbooks inspected (read directly, byte-for-byte, via a dependency-free
XLSX reader — sharedStrings + styles for date detection):

| Key | File | Sheets | Purpose |
|---|---|---|---|
| `rayyan` | `AR-RAYYAN DAYCARE AND PLAYHOUSE AUDIT (2024-MARCH 2026).xlsx` | 9 | Ar‑Rayyan student fee ledgers (Daycare + Playhouse) |
| `rhythms` | `RHYTHMS COLLEGE-ALL DEPARTMENTS RECORDS.xlsx` | 13 | Rhythms College fee ledgers by department |
| `wallace` | `wallace pc.xlsx` | 1 | Petty cash (income + expenses, custodian blocks) |

> The two `(1)`-suffixed downloads are byte-identical duplicates of the originals
> (same size/hash) — treat as the same source.

---

## 1. Cross-cutting structures (all workbooks)

These patterns appear across the school workbooks and drive the import framework
(Part 8). The parser must treat them as first-class:

1. **Per-student ledger blocks.** A student's rows form a contiguous block. Identity
   (admission no. + name) appears **only on the first row**; subsequent rows inherit it
   ("carry-down"). Blocks are separated by **blank rows** and/or a new identity row.
2. **Blank rows are ambiguous.** A blank row can mean (a) a new student follows, or
   (b) a *year/section sub-block* of the **same** student follows (Rayyan Playhouse).
   Rule adopted: after a blank row, the next non-blank row starts a **new student only
   if it carries an admission number**; otherwise it continues the current student.
3. **TOTAL / subtotal rows.** Every block usually ends with a `TOTAL` (or
   `TOTAL (2024)`, `TOTAL (2025)`) row summing Dr/Cr. These are **summary rows and must
   never be imported as transactions.** Detect by keyword in the DETAILS/CATEGORY column
   and/or absence of a date + presence of both Dr and Cr sums.
4. **Debit / Credit / Balance columns.** `Dr` = amount charged/invoiced,
   `Cr` = amount paid/credited. The `BALANCE` column is **per-line (Dr − Cr for that
   row), not a cumulative running balance**, and is frequently inconsistent or blank
   (data-entry drift). **Do not trust the stored BALANCE.** The canonical student
   balance is derived: `Σ Dr − Σ Cr` across the student's committed ledger entries.
   A negative figure is a **credit/overpayment**, not necessarily debt — see §5.
5. **Dates are mixed.** Real transaction dates are Excel **serials** (detected via cell
   number-format and converted to ISO). But several columns contain **corrupt serials**
   (numbers Excel auto-formatted as dates, e.g. a "term" value stored as `37` or a
   nonsensical `1901-05-14`). Only trust the dedicated DATE column; treat other
   date-looking cells as suspect.
6. **References are strings.** Receipt numbers (`RCT 005`, `NO RCT`, `0 01`, `929`) and
   M‑Pesa codes (10-char alphanumerics, sometimes with stray spaces, sometimes
   `CODE_A / CODE_B` pairs) must be preserved **verbatim as text** — never coerced to
   numbers, never zero-padded away.
7. **Operational text mixed into ledgers.** The NAME/second row often carries a status
   word instead of a name — `TRANSFERRED`, `WENT TO PLAYHOUSE`, `NO RECORDS OF THIS
   STUDENT`. These are student-status annotations, not names or transactions.
8. **Stray numbers in identity columns.** The ADM column sometimes holds unrelated
   numbers mid-block (dates typed wrong, receipt fragments). Rule: within a block, only
   a value matching the school's admission-number **pattern** starts/identifies a
   student; other stray values are ignored for identity (kept as row provenance).
9. **Provenance.** Every imported row records source `workbook`, `sheet`, and original
   `row_number`.

---

## 2. `rayyan` — Ar‑Rayyan Daycare & Playhouse

Nine sheets, cleanly split into a **Daycare** section and a **Playhouse** section,
each with per-category sheets plus a debtors sheet. This maps directly to Part 5.

| Sheet | Rows | Shape | Maps to |
|---|---|---|---|
| `DAYCARE FEES` | ~300 | Student ledger blocks | Daycare · Daycare fees |
| `DAYCARE TRANSPORT` | ~14 | Student ledger blocks | Daycare · Transport |
| `DAYCARE TRIPS` | ~2 | Student ledger blocks | Daycare · Trips |
| `DAYCARE DEBTORS` | ~42 | Summary (one row per student) | Daycare · Debtors |
| `PLAYHOUSE FEES` | ~700 | Student ledger blocks (+ CATEGORY, TERM, multi-year) | Playhouse · Tuition/Registration/etc. |
| `PLAYHOUSE UNIFORM & TRANSPORT` | ~246 | Student ledger blocks | Playhouse · Uniform/Transport |
| `PLAYHOUSE ACTIVITIES` | ~214 | Student ledger blocks | Playhouse · Activities |
| `PLAYHOUSE TRIPS` | ~17 | Student ledger blocks | Playhouse · Trips |
| `PLAYHOUSE DEBTORS` | ~183 | **Year-pivot** (2024/2025/2026 balance columns) | Playhouse · Debtor ageing by year |

### Column layouts

**Daycare FEES** header:
`ADM NO | NAME | DATE | RCT NO | MPESA TRANSACTION CODE | DETAILS | DR | CR | BALANCE | COMMENT`

**Playhouse FEES** header (adds TERM + CATEGORY):
`ADM NO | NAME | DATE | TERM | RCT NO | MPESA TRANSACTION CODE | CATEGORY | DETAILS | DR | CR | BALANCE | COMMENT`

- **Admission-number pattern:** `NNNN/NNN/AR-DC` (Daycare) and `NNNN/NNN/AR-PH`
  (Playhouse). The first 2 digits encode the intake year (e.g. `24…` = 2024).
- **DETAILS** carries the charge item: `Registration`, `daycare @ 300/=`, `TUITION FEE`,
  `DIARY`, `STATIONERY`, `CAUTION FEE`, `BOOKS`, `UNIFORM`, `ACTIVITIES`, `TRIP`,
  `bal clearance` (a payment against prior balance). **These become configurable charge
  categories per section**, not hard-coded.
- **CATEGORY** (Playhouse) is a coarse grouping (`FEES`, `ACTIVITIES`, …) filled on the
  first line of a group only → carry-down.
- **TERM** (Playhouse) is unreliable: valid values like `2ND TERM 2024` mixed with
  corrupt serials. Prefer deriving the term/year from the transaction DATE; keep the raw
  TERM string only as a hint/label.
- **Multi-year sub-blocks:** within one student block, a blank row separates year groups,
  each ending in `TOTAL (YYYY)`. The consolidated student balance spans all years; the
  per-year totals feed the "balances by year" view (Part 5).

### DEBTORS sheets

- `DAYCARE DEBTORS`: `NAME | ADM NO | AMOUNT | STATUS | NOTES`. One row/student with an
  outstanding `AMOUNT` and a `STATUS` (`TRANSFERRED`, `ONGOING`, `WENT TO PLAYHOUSE`,
  `TRANSFERRED WITH UNPAID …`). Occasionally a **second** row per student (ADM No.
  repeated in the NAME column with a separate unpaid amount) — a distinct historical debt.
- `PLAYHOUSE DEBTORS`: a **pivot** — `NAME | ADM NO | DETAILS | <2024> | <2025> | <2026> |
  NOTES` with the year labels sitting in a secondary header row. Import as **per-year
  opening debt** rows, not one lump.

### Rayyan-specific parsing rules

- Section (Daycare vs Playhouse) is **implied by the sheet name**, not a column — capture
  it as the ledger's `branch/section`.
- Charge category is the sheet's category + the DETAILS value (Registration / Tuition /
  Transport / Uniform / Activities / Trips / Books / Caution …).
- Treat `bal clearance` and any Cr-only line as a **payment**, not a charge.
- Debtor sheets are **opening balances / historical debt**, cross-checked against the
  derived ledger balance — surface mismatches in the import review, never auto-merge.

---

## 3. `rhythms` — Rhythms College (all departments)

Thirteen sheets: one ledger sheet per **department** plus a matching `… DEBTS` summary
for most. This maps to Part 4 (programme/course billing) and Part 6 (music reporting).

| Ledger sheet | Rows | DEBTS sheet | Notes |
|---|---|---|---|
| `COMPUTER STUDIES` | ~28k* | `COMPUTER STUDIES DEBTS` | Records back to 2005; course units (Keyboarding, Windows, Word…) |
| `MUSIC` | ~4k | `MUSIC DEBTS` | Instrument line items (Piano, Guitar) → Part 6 |
| `MUSIC PRACTICE` | ~237 | `MUSIC PRACTICE DEBTS` | ADM pattern `P/NN` |
| `SECRETARIAL` | ~532 | — | Required items + monthly "LESSONS" |
| `ACCOUNTS` | ~756 | `ACCOUNTS DEBTS` | Header mislabels col B as `RCT NO` (holds ADM) |
| `LANGUAGE` | ~248 | — | |
| `BUSINESS` | ~65 | — | |
| `TOURS` | ~236 | — | |
| `COMM DEV` | ~101 | — | |

\* `COMPUTER STUDIES` reports a huge dimension (`A1:IV29683`) inflated by empty formatted
cells; ~28k rows are genuinely populated across ~20 years. The importer must **stream**
large sheets and cap/paginate the preview.

### Column layout (all ledger sheets)

`DATE | ADM | DETAILS | RCT | Dr | Cr | BALANCE | NOTES`

- **Block header row:** `ADM` (col B) + student **NAME** (col C) on the same row, with an
  empty DATE. Transaction rows below have DATE + DETAILS + RCT + Dr/Cr.
- **Admission-number pattern:** `NNN/YY` (e.g. `001/06`, `001/09`) — sequence / intake
  year. Music Practice uses `P/NN`.
- **DETAILS = course/unit or period:** `Computer Package`, `Registration`, `Keyboarding`,
  `Windows`, `Word`, `PIANO LESSONS`, `GUITAR`, `COLLEGE ID`, `T-SHIRT`, `SHORTHAND`,
  monthly `MAR (2009)` / `APRIL LESSONS` / `… BALANCE`. Required course items often appear
  as zero-value placeholder rows at the top of a block (the enrolment's charge schedule),
  then get charged/paid over time. → **course fee-structure items** (Part 4).
- Header quirks: `ACCOUNTS` mislabels the ADM column as `RCT NO`; some blocks put ADM as a
  stray number in the DATE column. Map by **position + pattern**, not the header text.

### DEBTS sheets (per department) — completion milestones

`… DEBTS` sheets are per-student summaries. Columns vary:

- Minimal: `ADM NO | NAME | BALANCE` (Music, Music Practice).
- Extended (Computer Studies): `ADM NO | NAME | BALANCE | CATEGORY | NOTES ON BALANCE |
  EXAM BOOK STATUS | FINAL EXAM STATUS | CERTIFICATE STATUS`.

The three status columns (`EXAM BOOK`, `FINAL EXAM`, `CERTIFICATE` — values `DONE/NOT
DONE`, `ISSUED/NOT ISSUED`) are **non-financial completion milestones** (Part 4) → model
as configurable **student-course requirements**, shown on the academic/completion profile,
**not** as ledger transactions. (`CATEGORY` here holds a stray constant that looks like a
serial — treat as noise pending confirmation.)

### Rhythms-specific parsing rules

- Department = sheet name → maps to a **programme/course** (Part 4). Charge items come from
  the DETAILS values within that department.
- `… BALANCE`, `bal clearance`, Cr-only rows = payments.
- `DEBTS` balances are cross-checks; completion columns import to milestone status.
- Preserve `NO RECORDS OF THIS STUDENT` etc. as a student note/status, skip as a txn.

---

## 4. `wallace` — Petty cash

One sheet, **two stacked custodian/day blocks** separated by a blank row (the "Manager"
and "NN" areas referenced in Part 7 — labels are **operating units to be mapped at
import**, not confirmed brand names).

Each block:
- **Header line:** a DATE + an opening float figure.
- **INCOME sub-table:** `amount | source` (e.g. cash received into the float).
- **EXPENSE sub-table:** `amount | payee | transaction charge | ZIIDI | TOTAL`, where
  `TOTAL = amount + transaction charge + ZIIDI`.
- **TOTAL** row closing each block.

Critical nuance: **column positions shift between the two blocks** (block 1 puts the
expense amount in one column, block 2 in another). The importer **cannot assume fixed
columns** — it must detect the INCOME/EXPENSE headers per block and map relative to them.

`ZIIDI` is a workbook-specific secondary M‑Pesa charge (alongside the ordinary
transaction/withdrawal charge). It is explicitly called out in Part 7 as a mappable
"secondary charge" field.

### Petty-cash mapping (Part 7)

| Workbook concept | Model field |
|---|---|
| Block date | `transaction_date` |
| Opening float | `opening_float` |
| INCOME amount + source | `cash_received` + `source_of_funds` |
| EXPENSE amount | `expense_amount` |
| Payee | `payee` |
| Transaction/withdrawal charge | `transaction_charge` |
| ZIIDI | `secondary_charge` (labelled) |
| TOTAL | `total_cash_out` (derived + validated) |
| Manager / NN area | mapped to brand / department / custodian at import |

All petty-cash arithmetic uses decimal-safe money (never float).

---

## 5. Canonical balance convention (adopted)

Documented once, applied everywhere (Part 3 requirement):

- `charge` (debit) **increases** amount due.
- `payment` (credit) **decreases** amount due.
- **Student balance = Σ charges − Σ payments** over committed ledger entries, per category
  and consolidated. **Positive = owed (debtor). Negative = credit/overpaid.**
- The workbook `BALANCE` column is **informational only** (per-line, drifty) and is stored
  as `source_balance` for audit, never used as the system balance.
- Fee-structure/price changes use **effective dates / versions**; historical charges are
  never rewritten (Part 4).

---

## 6. Ambiguities to surface (never silently resolve)

Per execution rules 9–11, these are flagged for human review in the import UI rather than
guessed:

1. Debtor-sheet balance ≠ derived ledger balance for a student.
2. A blank-row boundary where the next row has no admission number (continuation vs new).
3. Stray numbers in identity columns.
4. Corrupt date/term serials.
5. Second debtor row for an already-seen admission number.
6. Petty-cash blocks whose operating unit ("Manager"/"NN") has no obvious brand mapping.
7. Students present in a ledger but absent from the school's student table (and vice-versa)
   — matched by admission number, **never** auto-merged on name similarity.

---

## 7. Recommended import adapters

One import **foundation** (file → staging rows → review → commit), with source-specific
**adapters** (Part 8):

- `school-ledger` adapter — Rayyan & Rhythms student ledgers (block detection, carry-down,
  TOTAL skipping, Dr/Cr, category from sheet+DETAILS).
- `debtors` adapter — opening balances / ageing (incl. Playhouse year-pivot).
- `petty-cash` adapter — stacked blocks, per-block header detection, ZIIDI/charge columns.
- `completion` adapter — Rhythms DEBTS milestone columns.

Duplicate detection is layered (org + brand + admission no. + date + amount + direction +
receipt + M‑Pesa code + source coordinates), classifying each row as exact / probable /
possible / new / update / conflict.
