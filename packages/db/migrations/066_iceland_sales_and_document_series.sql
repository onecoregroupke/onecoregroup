-- Migration 066: Iceland sales (customers → orders → invoices → payments),
-- physical document series, and the QuickBooks-shaped projection of every
-- operational document.
--
-- WHY THIS EXISTS
-- The 2026-08-05 audit recorded one genuine schema gap: there is no customer
-- sales-invoice table for the Iceland operation. Invoices 1261/1262 have
-- nowhere to land, and neither does the Account Opening Application Form.
-- Everything else in the brief extended a table that already existed.
--
-- FOUR OPERATOR DECISIONS ARE ENCODED HERE. Each was an open question in
-- docs/iceland-erp/01-MAPPING-REPORT.md §13 and is answered in the schema:
--
--  1. VAT — the pad's rates are VAT-INCLUSIVE, back-computed at 16%
--     (invoice 1261: 2568.97 + 411.03 = 2980.00 exactly). Reproduced. The rate
--     AND the convention are stored per LINE, not per company, so changing the
--     VAT rate later cannot silently restate a historical invoice.
--
--  2. DELIVERY-NOTE / INVOICE NUMBERING — physical pads are numbered by hand and
--     the current number lives on paper. `document_series` lets the operator
--     enter that number ONCE; the system continues from it. The system's own
--     references keep coming from ocg_next_reference, which is never seeded from
--     a pad, so a new document can never collide with a historical one.
--
--  3. UNIT / QTY — the pad inverts the usual meaning (UNIT holds the pack count
--     "8PC", QTY holds the pack size "1ltr"). Stored NORMALISED — a true numeric
--     quantity plus pack_config/size_label — and PRINTED in the pad's order. The
--     paper stays recognisable; the data stays computable.
--
--  4. CUSTOMER VOCABULARY — a fourth table is created deliberately, not by
--     accident. npt_customers is a piano owner (service relationship);
--     marketing contacts are leads. A shop buying Glitz on account is neither.
--     sales_customers carries an explicit npt_customer_id link so one legal
--     entity that is BOTH can be joined rather than duplicated.

-- ─── 1. PHYSICAL DOCUMENT SERIES ────────────────────────────────────────────
-- The number printed on the pad, distinct from the system reference.
-- Gaps are legal here (pads get spoiled); gaps in a system reference are not.
CREATE TABLE IF NOT EXISTS document_series (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id       UUID REFERENCES brands(id) ON DELETE CASCADE,
  -- invoice | delivery_note | grn | gin | gtn | requisition | lpo | receipt
  doc_type       TEXT NOT NULL,
  label          TEXT NOT NULL DEFAULT '',
  prefix         TEXT NOT NULL DEFAULT '',
  suffix         TEXT NOT NULL DEFAULT '',
  pad_width      INTEGER NOT NULL DEFAULT 0,
  -- The last number USED on paper. The next suggestion is this + 1.
  current_number BIGINT NOT NULL DEFAULT 0,
  -- false = the number is typed off the pad and this row only suggests it.
  -- true  = the system assigns it (still per-brand, still gap-tolerant).
  system_assigned BOOLEAN NOT NULL DEFAULT false,
  notes          TEXT NOT NULL DEFAULT '',
  active         BOOLEAN NOT NULL DEFAULT true,
  updated_by     TEXT NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_document_series_once
  ON document_series (COALESCE(brand_id, '00000000-0000-0000-0000-000000000000'::uuid), doc_type);

-- ─── 2. TRADE CUSTOMERS ─────────────────────────────────────────────────────
-- Fields taken from the ACCOUNT OPENING APPLICATION FORM as photographed.
CREATE TABLE IF NOT EXISTS sales_customers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_ref      TEXT NOT NULL,
  brand_id          UUID REFERENCES brands(id) ON DELETE SET NULL,
  business_name     TEXT NOT NULL,
  trading_name      TEXT NOT NULL DEFAULT '',
  location_street   TEXT NOT NULL DEFAULT '',
  postal_address    TEXT NOT NULL DEFAULT '',
  telephone         TEXT NOT NULL DEFAULT '',
  mobile            TEXT NOT NULL DEFAULT '',
  email             TEXT NOT NULL DEFAULT '',
  -- sole_proprietor | partnership | limited_company
  business_type     TEXT NOT NULL DEFAULT '',
  br_number         TEXT NOT NULL DEFAULT '',
  vat_pin_number    TEXT NOT NULL DEFAULT '',
  -- distributor | general_shop | supermarket | beauty_shop | wholesaler | other
  nature_of_business TEXT NOT NULL DEFAULT '',
  nature_other      TEXT NOT NULL DEFAULT '',
  contact_person    TEXT NOT NULL DEFAULT '',

  -- Credit terms, as approved under OFFICIAL USE ONLY on the form.
  credit_approved   BOOLEAN NOT NULL DEFAULT false,
  credit_limit_ksh  NUMERIC(14, 2) NOT NULL DEFAULT 0,
  payment_terms_days INTEGER NOT NULL DEFAULT 0,
  -- weekly | by_weekly (spelling per the form) | monthly | adhoc
  purchase_frequency TEXT NOT NULL DEFAULT '',
  intended_monthly_purchase_ksh NUMERIC(14, 2) NOT NULL DEFAULT 0,

  -- One legal entity may also be an NPT service client. Linked, never copied.
  npt_customer_id   UUID REFERENCES npt_customers(id) ON DELETE SET NULL,

  status            TEXT NOT NULL DEFAULT 'active',  -- active | on_hold | closed
  notes             TEXT NOT NULL DEFAULT '',
  created_by        TEXT NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_customer_ref ON sales_customers (customer_ref);
-- Duplicate-customer guard the mapping report (§11.2) called for. Blank PINs
-- are excluded because most walk-in customers have none.
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_customer_pin
  ON sales_customers (lower(vat_pin_number)) WHERE vat_pin_number <> '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_customer_name
  ON sales_customers (COALESCE(brand_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(business_name));
CREATE INDEX IF NOT EXISTS idx_sales_customers_brand ON sales_customers (brand_id);

-- ─── 3. ACCOUNT OPENING APPLICATION (customer credit) ───────────────────────
-- The paper form, kept as its own record so the application history survives
-- even after the customer's live terms are edited.
CREATE TABLE IF NOT EXISTS sales_account_applications (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_ref   TEXT NOT NULL,
  customer_id       UUID REFERENCES sales_customers(id) ON DELETE SET NULL,
  brand_id          UUID REFERENCES brands(id) ON DELETE SET NULL,
  application_date  DATE NOT NULL DEFAULT CURRENT_DATE,

  business_name     TEXT NOT NULL DEFAULT '',
  location_street   TEXT NOT NULL DEFAULT '',
  postal_address    TEXT NOT NULL DEFAULT '',
  telephone         TEXT NOT NULL DEFAULT '',
  mobile            TEXT NOT NULL DEFAULT '',
  email             TEXT NOT NULL DEFAULT '',
  -- "Name of Directors + ID/P.P no" — a repeating block on the form.
  directors         JSONB NOT NULL DEFAULT '[]'::jsonb,
  business_type     TEXT NOT NULL DEFAULT '',
  br_number         TEXT NOT NULL DEFAULT '',
  vat_pin_number    TEXT NOT NULL DEFAULT '',
  nature_of_business TEXT NOT NULL DEFAULT '',
  amount_intended_ksh NUMERIC(14, 2) NOT NULL DEFAULT 0,
  frequency         TEXT NOT NULL DEFAULT '',
  terms_accepted    BOOLEAN NOT NULL DEFAULT false,
  customer_signature_name TEXT NOT NULL DEFAULT '',
  customer_stamped  BOOLEAN NOT NULL DEFAULT false,

  -- OFFICIAL USE ONLY block.
  company_rep_name  TEXT NOT NULL DEFAULT '',
  company_rep_date  DATE,
  verified_by       TEXT NOT NULL DEFAULT '',
  verified_date     DATE,
  approved_by       TEXT NOT NULL DEFAULT '',
  approved_date     DATE,
  approved_terms_days INTEGER,
  -- draft | submitted | verified | approved | rejected
  status            TEXT NOT NULL DEFAULT 'draft',
  rejection_reason  TEXT NOT NULL DEFAULT '',
  notes             TEXT NOT NULL DEFAULT '',
  created_by        TEXT NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_account_application_ref
  ON sales_account_applications (application_ref);

-- The person who verifies an application cannot also approve it.
ALTER TABLE sales_account_applications
  DROP CONSTRAINT IF EXISTS sales_account_applications_separation;
ALTER TABLE sales_account_applications
  ADD CONSTRAINT sales_account_applications_separation
  CHECK (
    status <> 'approved'
    OR verified_by = '' OR approved_by = ''
    OR lower(trim(verified_by)) <> lower(trim(approved_by))
  );

-- ─── 4. SALES INVOICES ──────────────────────────────────────────────────────
-- Header fields exactly as printed: M/s · Date · Invoice No · AMOUNT · VAT · TOTAL
CREATE TABLE IF NOT EXISTS sales_invoices (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- System reference. Minted, never derived from the pad.
  invoice_ref       TEXT NOT NULL,
  -- The number printed on the physical pad ("Invoice No"). Gaps are legal.
  invoice_number    TEXT NOT NULL DEFAULT '',
  brand_id          UUID REFERENCES brands(id) ON DELETE SET NULL,
  customer_id       UUID REFERENCES sales_customers(id) ON DELETE SET NULL,
  -- "M/s" as written, kept verbatim even when a customer row is linked, because
  -- the paper said what it said.
  bill_to_name      TEXT NOT NULL DEFAULT '',
  invoice_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date          DATE,

  -- DECISION 1 (VAT). Denormalised onto the invoice AND each line so a rate
  -- change can never restate history.
  vat_rate_percent  NUMERIC(6, 3) NOT NULL DEFAULT 16,
  prices_include_vat BOOLEAN NOT NULL DEFAULT true,

  -- Totals are maintained from the lines by the service layer (an aggregate
  -- cannot be a GENERATED column) and cross-checked against them on post.
  net_amount_ksh    NUMERIC(14, 2) NOT NULL DEFAULT 0,
  vat_amount_ksh    NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_amount_ksh  NUMERIC(14, 2) NOT NULL DEFAULT 0,
  amount_paid_ksh   NUMERIC(14, 2) NOT NULL DEFAULT 0,

  -- draft | issued | part_paid | paid | cancelled | credited
  status            TEXT NOT NULL DEFAULT 'draft',
  -- cash | credit
  sale_type         TEXT NOT NULL DEFAULT 'cash',
  salesperson_id    UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,
  -- Where the goods came from: a field-sales allocation, or the main store.
  allocation_id     UUID REFERENCES field_sales_allocations(id) ON DELETE SET NULL,
  daily_return_id   UUID REFERENCES field_sales_daily_returns(id) ON DELETE SET NULL,
  source_store_id   UUID REFERENCES inventory_stores(id) ON DELETE SET NULL,
  delivery_note_no  TEXT NOT NULL DEFAULT '',
  lpo_number        TEXT NOT NULL DEFAULT '',

  -- Stock is moved when the invoice is POSTED, never when it is drafted.
  posted_at         TIMESTAMPTZ,
  posted_by         TEXT NOT NULL DEFAULT '',
  reconciliation_status TEXT NOT NULL DEFAULT 'not_ready',
  notes             TEXT NOT NULL DEFAULT '',
  created_by        TEXT NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_invoice_ref ON sales_invoices (invoice_ref);
-- DECISION 2: the physical number is unique PER BRAND, only when present.
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_invoice_number
  ON sales_invoices (COALESCE(brand_id, '00000000-0000-0000-0000-000000000000'::uuid), invoice_number)
  WHERE invoice_number <> '';
CREATE INDEX IF NOT EXISTS idx_sales_invoices_customer ON sales_invoices (customer_id, invoice_date DESC);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_date     ON sales_invoices (invoice_date DESC);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_status   ON sales_invoices (status);

ALTER TABLE sales_invoices DROP CONSTRAINT IF EXISTS sales_invoices_status_check;
ALTER TABLE sales_invoices ADD CONSTRAINT sales_invoices_status_check
  CHECK (status IN ('draft', 'issued', 'part_paid', 'paid', 'cancelled', 'credited'));

-- A credit sale must name the customer being given credit.
ALTER TABLE sales_invoices DROP CONSTRAINT IF EXISTS sales_invoices_credit_needs_customer;
ALTER TABLE sales_invoices ADD CONSTRAINT sales_invoices_credit_needs_customer
  CHECK (sale_type <> 'credit' OR customer_id IS NOT NULL);

-- Line fields exactly as printed: CODE | DESCRIPTION | UNIT | QTY | RATE | AMOUNT | VAT
CREATE TABLE IF NOT EXISTS sales_invoice_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id        UUID NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
  item_id           UUID REFERENCES inventory_items(id) ON DELETE SET NULL,
  -- "CODE" on the pad.
  item_code         TEXT NOT NULL DEFAULT '',
  description       TEXT NOT NULL DEFAULT '',

  -- DECISION 3. The pad's UNIT column (pack count, e.g. "8PC") and QTY column
  -- (pack size, e.g. "1ltr") are captured VERBATIM for printing, while the real
  -- numeric quantity lives in `quantity` where arithmetic can reach it.
  pad_unit_text     TEXT NOT NULL DEFAULT '',
  pad_qty_text      TEXT NOT NULL DEFAULT '',
  quantity          NUMERIC(14, 3) NOT NULL DEFAULT 0,
  uom               TEXT NOT NULL DEFAULT 'pcs',
  rate_ksh          NUMERIC(14, 4) NOT NULL DEFAULT 0,

  vat_rate_percent  NUMERIC(6, 3) NOT NULL DEFAULT 16,
  prices_include_vat BOOLEAN NOT NULL DEFAULT true,

  -- DECISION 1 in arithmetic. Verified against invoice 1261:
  --   total 2980.00 → vat 2980*16/116 = 411.03, net 2980*100/116 = 2568.97.
  line_total_ksh NUMERIC(14, 2) GENERATED ALWAYS AS (
    CASE WHEN prices_include_vat
      THEN ROUND(quantity * rate_ksh, 2)
      ELSE ROUND(quantity * rate_ksh * (100 + vat_rate_percent) / 100, 2)
    END) STORED,
  line_vat_ksh NUMERIC(14, 2) GENERATED ALWAYS AS (
    CASE WHEN prices_include_vat
      THEN ROUND(quantity * rate_ksh * vat_rate_percent / (100 + vat_rate_percent), 2)
      ELSE ROUND(quantity * rate_ksh * vat_rate_percent / 100, 2)
    END) STORED,
  line_net_ksh NUMERIC(14, 2) GENERATED ALWAYS AS (
    CASE WHEN prices_include_vat
      THEN ROUND(quantity * rate_ksh * 100 / (100 + vat_rate_percent), 2)
      ELSE ROUND(quantity * rate_ksh, 2)
    END) STORED,

  batch_number      TEXT NOT NULL DEFAULT '',
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sales_invoice_items_invoice ON sales_invoice_items (invoice_id);
CREATE INDEX IF NOT EXISTS idx_sales_invoice_items_item    ON sales_invoice_items (item_id);

ALTER TABLE sales_invoice_items DROP CONSTRAINT IF EXISTS sales_invoice_items_qty_check;
ALTER TABLE sales_invoice_items ADD CONSTRAINT sales_invoice_items_qty_check
  CHECK (quantity >= 0 AND rate_ksh >= 0);

-- An invoice line moves finished goods out of stock EXACTLY ONCE.
ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS sales_invoice_id      UUID REFERENCES sales_invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sales_invoice_item_id UUID REFERENCES sales_invoice_items(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_inv_movements_invoice_item_once
  ON inventory_movements (sales_invoice_item_id) WHERE sales_invoice_item_id IS NOT NULL;

-- ─── 5. PAYMENTS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sales_payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_ref       TEXT NOT NULL,
  brand_id          UUID REFERENCES brands(id) ON DELETE SET NULL,
  customer_id       UUID REFERENCES sales_customers(id) ON DELETE SET NULL,
  payment_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  -- cash | mpesa | bank | cheque | credit_note
  method            TEXT NOT NULL DEFAULT 'cash',
  amount_ksh        NUMERIC(14, 2) NOT NULL DEFAULT 0,
  -- M-Pesa code / cheque number / bank slip. The highest-quality match signal.
  reference         TEXT NOT NULL DEFAULT '',
  mpesa_code        TEXT NOT NULL DEFAULT '',
  received_by       TEXT NOT NULL DEFAULT '',
  daily_return_id   UUID REFERENCES field_sales_daily_returns(id) ON DELETE SET NULL,
  reconciliation_status TEXT NOT NULL DEFAULT 'not_ready',
  notes             TEXT NOT NULL DEFAULT '',
  created_by        TEXT NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_payment_ref ON sales_payments (payment_ref);
-- The same M-Pesa code cannot be banked twice.
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_payment_mpesa
  ON sales_payments (lower(mpesa_code)) WHERE mpesa_code <> '';
CREATE INDEX IF NOT EXISTS idx_sales_payments_customer ON sales_payments (customer_id, payment_date DESC);

ALTER TABLE sales_payments DROP CONSTRAINT IF EXISTS sales_payments_amount_check;
ALTER TABLE sales_payments ADD CONSTRAINT sales_payments_amount_check CHECK (amount_ksh > 0);

-- One payment may settle several invoices, and one invoice may take several
-- payments — so allocation is its own table, not a column.
CREATE TABLE IF NOT EXISTS sales_payment_allocations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id    UUID NOT NULL REFERENCES sales_payments(id) ON DELETE CASCADE,
  invoice_id    UUID NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
  amount_ksh    NUMERIC(14, 2) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_allocation_once
  ON sales_payment_allocations (payment_id, invoice_id);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_invoice ON sales_payment_allocations (invoice_id);

ALTER TABLE sales_payment_allocations DROP CONSTRAINT IF EXISTS sales_payment_allocations_amount_check;
ALTER TABLE sales_payment_allocations ADD CONSTRAINT sales_payment_allocations_amount_check
  CHECK (amount_ksh > 0);

-- ─── 6. THE QUICKBOOKS-SHAPED PROJECTION ────────────────────────────────────
-- The operator's point: the manual forms produce the very figures that are
-- keyed into QuickBooks. So the reconciliation problem is not "wait for the
-- export to learn our shape" — it is "project our documents into QuickBooks's
-- shape now, and compare two lists when the export lands".
--
-- qb_account_map turns an operational event into an account name. Seeded with
-- conventional Kenyan SME account names, all editable — no account code is
-- invented as if authoritative.
CREATE TABLE IF NOT EXISTS qb_account_map (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id      UUID REFERENCES brands(id) ON DELETE CASCADE,
  -- sales_invoice | sales_payment | goods_receipt | goods_issue
  -- | petty_cash_expense | petty_cash_income | production_output | stock_adjustment
  event_type    TEXT NOT NULL,
  debit_account  TEXT NOT NULL DEFAULT '',
  credit_account TEXT NOT NULL DEFAULT '',
  tax_account   TEXT NOT NULL DEFAULT '',
  qb_class      TEXT NOT NULL DEFAULT '',
  active        BOOLEAN NOT NULL DEFAULT true,
  notes         TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_qb_account_map_once
  ON qb_account_map (COALESCE(brand_id, '00000000-0000-0000-0000-000000000000'::uuid), event_type);

INSERT INTO qb_account_map (brand_id, event_type, debit_account, credit_account, tax_account, notes) VALUES
  (NULL, 'sales_invoice',      'Accounts Receivable', 'Sales',              'VAT Payable', 'Editable defaults — confirm against the real chart of accounts.'),
  (NULL, 'sales_payment',      'Cash and Bank',       'Accounts Receivable', '',           'Method decides the specific cash/bank account.'),
  (NULL, 'goods_receipt',      'Inventory',           'Accounts Payable',    'VAT Input',  ''),
  (NULL, 'goods_issue',        'Cost of Goods Sold',  'Inventory',           '',           ''),
  (NULL, 'production_output',  'Inventory',           'Work in Progress',    '',           ''),
  (NULL, 'petty_cash_expense', 'Expenses',            'Petty Cash',          '',           ''),
  (NULL, 'petty_cash_income',  'Petty Cash',          'Cash and Bank',       '',           ''),
  (NULL, 'stock_adjustment',   'Stock Adjustment',    'Inventory',           '',           '')
ON CONFLICT DO NOTHING;

-- Every operational document, projected into the shape a QuickBooks export
-- arrives in. This is what reconciliation compares against
-- quickbooks_transactions — built from documents we already hold, so it works
-- before any export exists.
CREATE OR REPLACE VIEW qb_expected_entries AS
  SELECT
    'sales_invoice'::TEXT              AS event_type,
    i.id                               AS entity_id,
    'sales_invoices'::TEXT             AS entity_table,
    i.brand_id,
    i.invoice_date                     AS entry_date,
    COALESCE(NULLIF(i.invoice_number, ''), i.invoice_ref) AS doc_number,
    COALESCE(NULLIF(i.bill_to_name, ''), c.business_name, '') AS party_name,
    'Invoice'::TEXT                    AS transaction_type,
    i.total_amount_ksh                 AS amount_ksh,
    i.vat_amount_ksh                   AS tax_ksh,
    ''::TEXT                           AS mpesa_code,
    i.notes                            AS memo,
    i.reconciliation_status
  FROM sales_invoices i
  LEFT JOIN sales_customers c ON c.id = i.customer_id
  WHERE i.status NOT IN ('draft', 'cancelled')

  UNION ALL

  SELECT
    'sales_payment', p.id, 'sales_payments', p.brand_id, p.payment_date,
    COALESCE(NULLIF(p.reference, ''), p.payment_ref),
    COALESCE(c.business_name, ''), 'Payment',
    p.amount_ksh, 0, p.mpesa_code, p.notes, p.reconciliation_status
  FROM sales_payments p
  LEFT JOIN sales_customers c ON c.id = p.customer_id

  UNION ALL

  SELECT
    'goods_receipt', r.id, 'procurement_goods_receipts', r.brand_id, r.received_date,
    COALESCE(NULLIF(r.invoice_number, ''), NULLIF(r.delivery_note_number, ''), r.reference),
    COALESCE(v.name, ''), 'Bill',
    COALESCE((
      SELECT SUM(ri.quantity_accepted * ri.unit_cost_ksh)
      FROM procurement_goods_receipt_items ri WHERE ri.receipt_id = r.id
    ), 0),
    0, '', r.remarks, 'not_ready'
  FROM procurement_goods_receipts r
  LEFT JOIN procurement_vendors v ON v.id = r.vendor_id
  WHERE r.status = 'posted'

  UNION ALL

  SELECT
    CASE WHEN t.entry_kind = 'expense' THEN 'petty_cash_expense' ELSE 'petty_cash_income' END,
    t.id, 'petty_cash_transactions', t.brand_id, t.transaction_date,
    COALESCE(NULLIF(t.reference, ''), NULLIF(t.receipt_no, ''), t.id::TEXT),
    COALESCE(t.payee, ''),
    CASE WHEN t.entry_kind = 'expense' THEN 'Expense' ELSE 'Deposit' END,
    -- An expense costs the full cash out (amount PLUS charges); income and the
    -- opening float bring cash in. Charges stay separate from the expense
    -- amount in the table (045) and are only combined here, at the point of
    -- comparing against a bank/QuickBooks line, which is what actually moved.
    CASE WHEN t.entry_kind = 'expense'
      THEN t.total_cash_out_ksh
      ELSE t.cash_received_ksh + t.opening_float_ksh
    END,
    0, '', t.description, COALESCE(t.reconciliation_status, 'not_ready')
  FROM petty_cash_transactions t;

GRANT SELECT ON qb_expected_entries TO service_role;

-- ─── 7. REFERENCE SEQUENCES ─────────────────────────────────────────────────
INSERT INTO ops_id_sequences (name, current_val) VALUES
  ('sales_customer', 0), ('sales_invoice', 0), ('sales_payment', 0), ('account_application', 0)
ON CONFLICT (name) DO NOTHING;

-- ─── 8. RLS + GRANTS (service-role only, matching every other table) ────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'document_series', 'sales_customers', 'sales_account_applications',
    'sales_invoices', 'sales_invoice_items', 'sales_payments',
    'sales_payment_allocations', 'qb_account_map'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT ALL ON TABLE %I TO service_role', t);
  END LOOP;
END $$;
