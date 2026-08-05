-- Migration 054: Phase 3 — the Iceland procurement chain.
-- Additive only. Idempotent — safe to re-run. Run in the Supabase SQL editor.
--
-- Digitises five Ice Land Geyser Ltd documents and joins them into ONE chain, so
-- the same information is never retyped between stages:
--
--   MATERIAL REQUISITION FORM  → procurement_requisitions (+ items)
--   (existing) LPO / purchase  → procurement_purchases      [035]
--   GOODS RECEIVED NOTE        → procurement_goods_receipts (+ items)
--   GOODS/RAW MATERIAL ISSUE NOTE → procurement_goods_issues (+ items)
--   GOODS TRANSFER NOTE        → procurement_goods_issues with kind='transfer'
--   SUPPLIER GENERAL INFORMATION + APPLICATION FOR CREDIT FACILITIES
--                              → procurement_vendors (extended) + credit apps
--
-- Two stock-integrity rules are enforced structurally, not by convention:
--
--   1. Approving a requisition NEVER moves stock. Only a finalised issue note
--      (or an accepted goods receipt) writes to inventory_movements.
--   2. A goods receipt or issue note posts to stock EXACTLY ONCE. Each carries
--      `posted_at`; the service layer refuses to post twice, and a partial
--      unique index guarantees one posting record per document even under a
--      double submit.
--
-- Receiving now supports PARTIAL deliveries: many receipts per purchase, each
-- with delivered / accepted / rejected quantities. Only accepted quantity ever
-- reaches inventory — rejected and damaged goods are recorded, never stocked.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── 1. SUPPLIER PROFILE (SUPPLIER GENERAL INFORMATION FORM) ────────────────
-- procurement_vendors (035) had five contact fields. The paper form captures a
-- full company profile, so the existing table is extended rather than replaced.

ALTER TABLE procurement_vendors
  ADD COLUMN IF NOT EXISTS legal_name            TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS trading_name          TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS company_type          TEXT NOT NULL DEFAULT '',  -- limited|sole_proprietor|partnership|public_limited
  ADD COLUMN IF NOT EXISTS registration_number   TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tax_pin               TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS vat_number            TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS postal_address        TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS physical_location     TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS fax                   TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS website               TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS nature_of_business    TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS year_commenced_trading TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS quality_certification TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS quality_cert_year     TEXT NOT NULL DEFAULT '',
  -- [{ name, role, id_number? }] — directors / proprietors
  ADD COLUMN IF NOT EXISTS directors             JSONB NOT NULL DEFAULT '[]',
  -- [{ name, percent_held }]
  ADD COLUMN IF NOT EXISTS shareholders          JSONB NOT NULL DEFAULT '[]',
  -- [{ year, turnover_ksh }]
  ADD COLUMN IF NOT EXISTS turnover_history      JSONB NOT NULL DEFAULT '[]',
  -- [{ name, address, contact? }]
  ADD COLUMN IF NOT EXISTS trade_references      JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS major_customers       TEXT NOT NULL DEFAULT '',
  -- Senior management: MD/CEO, Finance, Sales Director — from section 8.
  ADD COLUMN IF NOT EXISTS management_md         TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS management_finance    TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS management_sales      TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS other_information     TEXT NOT NULL DEFAULT '',
  -- Bank details are restricted: never returned to ordinary operational users.
  ADD COLUMN IF NOT EXISTS bank_name             TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bank_branch           TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bank_account_name     TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bank_account_number   TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bank_postal_address   TEXT NOT NULL DEFAULT '',
  -- draft|submitted|under_review|approved|rejected|suspended|archived
  ADD COLUMN IF NOT EXISTS status                TEXT NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS signed_by             TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS signed_position       TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS signed_date           DATE,
  ADD COLUMN IF NOT EXISTS reviewed_by           TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS reviewed_at           TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_procurement_vendors_status ON procurement_vendors (status);

-- APPLICATION FOR CREDIT FACILITIES — a distinct document from the supplier
-- information form, kept as its own record so a supplier can reapply.
CREATE TABLE IF NOT EXISTS procurement_credit_applications (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference            TEXT UNIQUE,               -- CRA-0001
  vendor_id            UUID REFERENCES procurement_vendors(id) ON DELETE CASCADE,
  brand_id             UUID REFERENCES brands(id) ON DELETE SET NULL,
  full_business_name   TEXT NOT NULL DEFAULT '',
  company_type         TEXT NOT NULL DEFAULT '',
  postal_address       TEXT NOT NULL DEFAULT '',
  physical_address     TEXT NOT NULL DEFAULT '',
  telephone            TEXT NOT NULL DEFAULT '',
  fax                  TEXT NOT NULL DEFAULT '',
  chief_executive      TEXT NOT NULL DEFAULT '',
  nature_of_business   TEXT NOT NULL DEFAULT '',
  tax_pin              TEXT NOT NULL DEFAULT '',
  vat_number           TEXT NOT NULL DEFAULT '',
  bank_name            TEXT NOT NULL DEFAULT '',
  bank_branch          TEXT NOT NULL DEFAULT '',
  bank_postal_address  TEXT NOT NULL DEFAULT '',
  trade_references     JSONB NOT NULL DEFAULT '[]',
  credit_limit_requested_ksh NUMERIC(14, 2),
  credit_terms_requested     TEXT NOT NULL DEFAULT '',
  status               TEXT NOT NULL DEFAULT 'draft',
  decision_note        TEXT NOT NULL DEFAULT '',
  approved_limit_ksh   NUMERIC(14, 2),
  approved_terms_days  INTEGER,
  decided_by           TEXT NOT NULL DEFAULT '',
  decided_at           TIMESTAMPTZ,
  created_by           TEXT NOT NULL DEFAULT '',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_credit_apps_vendor ON procurement_credit_applications (vendor_id);
CREATE INDEX IF NOT EXISTS idx_credit_apps_status ON procurement_credit_applications (status);

-- ─── 2. MATERIAL REQUISITION FORM ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS procurement_requisitions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference         TEXT UNIQUE,                  -- MRF-0001
  brand_id          UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  scope             TEXT NOT NULL DEFAULT 'brand', -- brand|group_shared|shared_selected
  shared_brand_ids  UUID[] NOT NULL DEFAULT '{}',
  department        TEXT NOT NULL DEFAULT '',
  requested_by      TEXT NOT NULL DEFAULT '',     -- email
  requested_by_name TEXT NOT NULL DEFAULT '',
  date_requested    DATE NOT NULL DEFAULT CURRENT_DATE,
  required_by       DATE,
  purpose           TEXT NOT NULL DEFAULT '',
  -- What the materials are for, when it is tied to real work.
  linked_task_id    TEXT REFERENCES ops_tasks(task_id) ON DELETE SET NULL,
  linked_repair_case_id UUID REFERENCES npt_repair_cases(id) ON DELETE SET NULL,
  -- draft|submitted|under_review|approved|partially_approved|rejected|
  -- ready_for_issue|partially_issued|fully_issued|closed|cancelled
  status            TEXT NOT NULL DEFAULT 'draft',
  prepared_by       TEXT NOT NULL DEFAULT '',
  approved_by       TEXT NOT NULL DEFAULT '',     -- email; never equal to requested_by
  approved_by_name  TEXT NOT NULL DEFAULT '',
  approved_at       TIMESTAMPTZ,
  approval_comment  TEXT NOT NULL DEFAULT '',
  notes             TEXT NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_requisitions_brand  ON procurement_requisitions (brand_id);
CREATE INDEX IF NOT EXISTS idx_requisitions_status ON procurement_requisitions (status);
CREATE INDEX IF NOT EXISTS idx_requisitions_date   ON procurement_requisitions (date_requested DESC);

CREATE TABLE IF NOT EXISTS procurement_requisition_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id    UUID NOT NULL REFERENCES procurement_requisitions(id) ON DELETE CASCADE,
  inventory_item_id UUID REFERENCES inventory_items(id) ON DELETE SET NULL,
  description       TEXT NOT NULL DEFAULT '',
  unit              TEXT NOT NULL DEFAULT 'pcs',
  quantity_requested NUMERIC(14, 2) NOT NULL DEFAULT 0,
  -- Stock on hand at the moment of request, for the approver's context.
  stock_at_request  NUMERIC(14, 2),
  quantity_approved NUMERIC(14, 2) NOT NULL DEFAULT 0,
  quantity_issued   NUMERIC(14, 2) NOT NULL DEFAULT 0,
  notes             TEXT NOT NULL DEFAULT '',
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_requisition_items_req ON procurement_requisition_items (requisition_id);

-- ─── 3. GOODS RECEIVED NOTE ─────────────────────────────────────────────────
-- Many receipts may reference one purchase — that is what makes partial
-- delivery possible. `posted_at` is the once-only stock posting marker.

CREATE TABLE IF NOT EXISTS procurement_goods_receipts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference           TEXT UNIQUE,                -- GRN-0001
  brand_id            UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  scope               TEXT NOT NULL DEFAULT 'brand',
  shared_brand_ids    UUID[] NOT NULL DEFAULT '{}',
  purchase_id         UUID REFERENCES procurement_purchases(id) ON DELETE SET NULL,
  requisition_id      UUID REFERENCES procurement_requisitions(id) ON DELETE SET NULL,
  vendor_id           UUID REFERENCES procurement_vendors(id) ON DELETE SET NULL,
  received_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  received_time       TEXT NOT NULL DEFAULT '',
  received_by         TEXT NOT NULL DEFAULT '',
  received_by_email   TEXT NOT NULL DEFAULT '',
  delivery_person     TEXT NOT NULL DEFAULT '',
  delivery_note_number TEXT NOT NULL DEFAULT '',  -- "D/NO." on the pad
  lpo_number          TEXT NOT NULL DEFAULT '',   -- "L.P.O."
  invoice_number      TEXT NOT NULL DEFAULT '',
  vehicle_number      TEXT NOT NULL DEFAULT '',
  receiving_location  TEXT NOT NULL DEFAULT '',
  stock_card_number   TEXT NOT NULL DEFAULT '',
  amount_in_words     TEXT NOT NULL DEFAULT '',
  variance_notes      TEXT NOT NULL DEFAULT '',
  damage_notes        TEXT NOT NULL DEFAULT '',
  remarks             TEXT NOT NULL DEFAULT '',
  checked_by          TEXT NOT NULL DEFAULT '',
  authorised_by       TEXT NOT NULL DEFAULT '',
  entered_by          TEXT NOT NULL DEFAULT '',
  supplier_ack_name   TEXT NOT NULL DEFAULT '',
  receiver_ack_name   TEXT NOT NULL DEFAULT '',
  -- draft while counting; posted once accepted quantities have hit stock.
  status              TEXT NOT NULL DEFAULT 'draft', -- draft|posted|cancelled
  posted_at           TIMESTAMPTZ,
  posted_by           TEXT NOT NULL DEFAULT '',
  created_by          TEXT NOT NULL DEFAULT '',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_goods_receipts_brand    ON procurement_goods_receipts (brand_id);
CREATE INDEX IF NOT EXISTS idx_goods_receipts_purchase ON procurement_goods_receipts (purchase_id);
CREATE INDEX IF NOT EXISTS idx_goods_receipts_status   ON procurement_goods_receipts (status);
CREATE INDEX IF NOT EXISTS idx_goods_receipts_date     ON procurement_goods_receipts (received_date DESC);

CREATE TABLE IF NOT EXISTS procurement_goods_receipt_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id        UUID NOT NULL REFERENCES procurement_goods_receipts(id) ON DELETE CASCADE,
  purchase_item_id  UUID REFERENCES procurement_purchase_items(id) ON DELETE SET NULL,
  inventory_item_id UUID REFERENCES inventory_items(id) ON DELETE SET NULL,
  description       TEXT NOT NULL DEFAULT '',
  unit              TEXT NOT NULL DEFAULT 'pcs',
  quantity_ordered  NUMERIC(14, 2) NOT NULL DEFAULT 0,
  quantity_delivered NUMERIC(14, 2) NOT NULL DEFAULT 0,
  -- ONLY this quantity ever reaches inventory.
  quantity_accepted NUMERIC(14, 2) NOT NULL DEFAULT 0,
  quantity_rejected NUMERIC(14, 2) NOT NULL DEFAULT 0,
  unit_cost_ksh     NUMERIC(14, 2) NOT NULL DEFAULT 0,
  batch_number      TEXT NOT NULL DEFAULT '',
  expiry_date       DATE,
  condition         TEXT NOT NULL DEFAULT 'good',  -- good|damaged|expired|wrong_item
  rejection_reason  TEXT NOT NULL DEFAULT '',
  remarks           TEXT NOT NULL DEFAULT '',
  -- Mirrors procurement item classification: only 'stock' disposition stocks.
  disposition       TEXT NOT NULL DEFAULT 'stock', -- stock|consume
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_goods_receipt_items_receipt ON procurement_goods_receipt_items (receipt_id);

-- ─── 4. GOODS ISSUE NOTE (GIN) AND GOODS TRANSFER NOTE (GTN) ────────────────
-- Both are stock leaving a store. One table, distinguished by `kind`, because
-- the pads differ only in who the counterparty is.

CREATE TABLE IF NOT EXISTS procurement_goods_issues (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference          TEXT UNIQUE,                 -- GIN-0001 / GTN-0001
  kind               TEXT NOT NULL DEFAULT 'issue', -- issue | transfer
  brand_id           UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  requisition_id     UUID REFERENCES procurement_requisitions(id) ON DELETE SET NULL,
  issue_date         DATE NOT NULL DEFAULT CURRENT_DATE,
  -- employee | department | salesperson | production | customer_order | other
  issued_to_type     TEXT NOT NULL DEFAULT 'employee',
  issued_to_member_id UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,
  issued_to_label    TEXT NOT NULL DEFAULT '',
  -- transfer only: the receiving brand/store
  transfer_to_brand_id UUID REFERENCES brands(id) ON DELETE SET NULL,
  transfer_to_location TEXT NOT NULL DEFAULT '',
  store_location     TEXT NOT NULL DEFAULT '',
  issued_by          TEXT NOT NULL DEFAULT '',
  issued_by_email    TEXT NOT NULL DEFAULT '',
  received_by        TEXT NOT NULL DEFAULT '',
  receiver_ack_at    TIMESTAMPTZ,
  variance_notes     TEXT NOT NULL DEFAULT '',
  remarks            TEXT NOT NULL DEFAULT '',
  status             TEXT NOT NULL DEFAULT 'draft', -- draft|posted|cancelled
  posted_at          TIMESTAMPTZ,
  posted_by          TEXT NOT NULL DEFAULT '',
  created_by         TEXT NOT NULL DEFAULT '',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_goods_issues_brand  ON procurement_goods_issues (brand_id);
CREATE INDEX IF NOT EXISTS idx_goods_issues_status ON procurement_goods_issues (status);
CREATE INDEX IF NOT EXISTS idx_goods_issues_req    ON procurement_goods_issues (requisition_id);
CREATE INDEX IF NOT EXISTS idx_goods_issues_date   ON procurement_goods_issues (issue_date DESC);

CREATE TABLE IF NOT EXISTS procurement_goods_issue_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id          UUID NOT NULL REFERENCES procurement_goods_issues(id) ON DELETE CASCADE,
  requisition_item_id UUID REFERENCES procurement_requisition_items(id) ON DELETE SET NULL,
  inventory_item_id UUID REFERENCES inventory_items(id) ON DELETE SET NULL,
  description       TEXT NOT NULL DEFAULT '',
  unit              TEXT NOT NULL DEFAULT 'pcs',
  quantity_approved NUMERIC(14, 2) NOT NULL DEFAULT 0,
  quantity_issued   NUMERIC(14, 2) NOT NULL DEFAULT 0,
  batch_number      TEXT NOT NULL DEFAULT '',
  store_location    TEXT NOT NULL DEFAULT '',
  remarks           TEXT NOT NULL DEFAULT '',
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_goods_issue_items_issue ON procurement_goods_issue_items (issue_id);

-- ─── 5. ONCE-ONLY STOCK POSTING GUARANTEE ───────────────────────────────────
-- inventory_movements already records every stock change. These columns let a
-- movement point back at the document that caused it, and the partial unique
-- indexes make a second posting of the same document impossible at the database
-- level — not merely discouraged in application code.

ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS goods_receipt_id UUID REFERENCES procurement_goods_receipts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS goods_issue_id   UUID REFERENCES procurement_goods_issues(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS receipt_item_id  UUID REFERENCES procurement_goods_receipt_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS issue_item_id    UUID REFERENCES procurement_goods_issue_items(id) ON DELETE SET NULL;

-- One movement per receipt line, ever. A resubmitted GRN cannot double stock.
CREATE UNIQUE INDEX IF NOT EXISTS idx_inv_movements_receipt_item_once
  ON inventory_movements (receipt_item_id) WHERE receipt_item_id IS NOT NULL;
-- One movement per issue line, ever.
CREATE UNIQUE INDEX IF NOT EXISTS idx_inv_movements_issue_item_once
  ON inventory_movements (issue_item_id) WHERE issue_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inv_movements_receipt ON inventory_movements (goods_receipt_id);
CREATE INDEX IF NOT EXISTS idx_inv_movements_issue   ON inventory_movements (goods_issue_id);

-- ─── 6. REFERENCE SEQUENCES ─────────────────────────────────────────────────
INSERT INTO ops_id_sequences (name, current_val) VALUES
  ('requisition', 0), ('goods_receipt', 0), ('goods_issue', 0),
  ('goods_transfer', 0), ('credit_application', 0)
ON CONFLICT (name) DO NOTHING;

-- ─── 7. RLS + GRANTS ────────────────────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'procurement_credit_applications', 'procurement_requisitions', 'procurement_requisition_items',
    'procurement_goods_receipts', 'procurement_goods_receipt_items',
    'procurement_goods_issues', 'procurement_goods_issue_items'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_service', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (auth.role() = ''service_role'') WITH CHECK (true)',
      t || '_service', t
    );
    EXECUTE format('GRANT ALL ON TABLE %I TO service_role', t);
  END LOOP;
END $$;
