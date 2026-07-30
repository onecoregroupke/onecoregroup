# Usage Guide — Finance, Petty Cash, Imports (Admin · Accountant · Teacher)

Applies to the Ops Hub. Access is governed by the existing permission matrix
(Management → Users). Money features are gated on **Finance**; school records on the
per-school section (**Rayyan / Rhythms / Darul Admin**). A per-brand accountant is created
by granting **Finance** and scoping it to their brand(s).

---

## A. Administrator

### Granting access
- **Group accountant:** Finance = *edit* (no brand scope) → sees every brand.
- **Brand accountant:** Finance = *edit*, scoped to one brand → sees only that brand's
  finance, petty cash, imports, and exports. Enforced server-side, not just hidden.
- **Auditor / read-only:** Finance = *view*.
- **Teachers/tutors:** the relevant school section only — **not** Finance. They never see
  student financial details.

### Running the migrations (one-time, before first use)
Run these in the Supabase SQL editor, in order:
`044_school_finance_foundation.sql` → `045_petty_cash.sql` → `046_imports_and_versions.sql`.
They are additive and reversible; no existing data is touched. Until they run, the new
screens show empty states rather than errors.

### Configuring charge categories / fee structures
Charge categories are created automatically on first import, or via the student-account
API. Categories, programmes, and fee structures are per-school and effective-dated, so a
future price change never rewrites historical charges.

---

## B. Accountant

### Finance landing (`/finance`)
Group summary at the top, then a **brand card** for each brand you can access. Open a
brand to enter its scoped workspace.

### Brand workspace (`/finance/<brand>`)
- **Money in / Money out** — daily bookkeeping (date, amount, reason, votehead, account).
- **Petty cash** — record income, expenses, transaction & ZIIDI charges; the running
  balance and reconciliation totals update automatically. Each line moves through
  `draft → submitted → reviewed → approved → reconciled → closed`. The entry form
  **autosaves** locally — if the browser closes, you're offered the draft back on return.
- **Transaction ledger** — the brand's recorded movements.
- **Excel import** — see below.
- **Export** — download brand transactions or petty cash as a styled Excel workbook.

### Importing an Excel workbook
1. Choose **import type** (Petty cash / Student fee ledger) and, for a ledger, the school.
2. Upload the `.xlsx`. The system detects sheets and stages every row.
3. Review the preview: each row shows its detected kind, duplicate status, and any
   warnings. TOTAL/subtotal and blank rows are skipped automatically and never imported.
4. **Dry run** validates without writing.
5. **Commit** writes the valid, non-duplicate rows. Exact duplicates are skipped; use
   *Commit incl. duplicates* only when you intend to force probable duplicates.
6. Read the **receipt** (created / skipped / failed). If something's wrong, **Roll back**
   removes the rows that are still safe to remove (posted-and-reconciled rows are kept and
   reported as blocked).

**What the importer guarantees**
- Balances are derived from the ledger, never copied from the workbook's BALANCE column.
- Admission numbers, receipt numbers and M-Pesa codes are stored exactly as text.
- Re-importing the same file does not duplicate rows.
- The original workbook is retained privately as the import's attachment.

### Corrections
Posted financial entries are immutable. To correct one, **reverse** it (a reason is
required); the reversal is itself audited. Do not attempt to edit posted history.

### Student accounts (API/export today)
A student's consolidated balance, per-category and per-year balances are derived from the
ledger. Download a **student statement** (Debit / Credit / running Balance) from the
export endpoint. (An in-page account tab is the next iteration — see `05`.)

---

## C. Teacher / Tutor

Teachers and tutors use the school section (Rayyan / Rhythms / Darul), **not** Finance.
- You can view and record academic information for your students (existing Rayyan academic
  screens; Rhythms/Darul academic reporting is planned — see `05`).
- You **cannot** see student fee balances, payments, or petty cash. Financial clearance
  indicators, where shown on an academic screen, are read-only flags — they never expose
  amounts, and any rule that blocks a report/exam/certificate is explicitly configured,
  permissioned, auditable, and reversible.
- Entering marks/competencies never changes financial records, and vice-versa.

---

## Data protection
Never paste real student names, admission numbers, phone numbers, or payment references
into screenshots, chat, or public documents. Uploaded workbooks are private; statement and
export downloads are scoped to your brand access and use short-lived links.
