-- Migration 062: petty-cash float cycles and document packets
-- (addendum §§5–14, §30).
--
-- Migration 045 already gave petty cash accounts, transactions (with transaction
-- charges kept SEPARATE from the expense amount, which the addendum §7 requires)
-- and reconciliations. What it lacked is the thing the Iceland team actually
-- works in: the FLOAT CYCLE.
--
-- Addendum §5: "Do not treat petty cash as one endless undifferentiated
-- transaction list." A float opens with a funding amount, transactions run
-- against it, and it closes with a calculated balance that may carry forward
-- into the next float. This also fixes the audit's RISK 4: with no float
-- boundary, running_balance_ksh was recomputed over an unbounded list, so one
-- mis-ordered insert silently corrupted every later balance.

-- ─── 1. FLOAT CYCLE (§6) ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS petty_cash_floats (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  float_ref             TEXT NOT NULL,
  account_id            UUID REFERENCES petty_cash_accounts(id) ON DELETE SET NULL,
  brand_id              UUID REFERENCES brands(id) ON DELETE SET NULL,
  custodian             TEXT NOT NULL DEFAULT '',
  custodian_id          UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,

  opened_on             DATE NOT NULL DEFAULT CURRENT_DATE,
  opening_amount_ksh    NUMERIC(14, 2) NOT NULL DEFAULT 0,
  funding_source        TEXT NOT NULL DEFAULT '',
  funding_reference     TEXT NOT NULL DEFAULT '',   -- M-Pesa / bank reference

  -- §10: carry-forward. Linked in BOTH directions so float-to-float continuity
  -- is navigable without scanning (§30 "Float-to-float continuity").
  previous_float_id     UUID REFERENCES petty_cash_floats(id) ON DELETE SET NULL,
  succeeding_float_id   UUID REFERENCES petty_cash_floats(id) ON DELETE SET NULL,
  balance_brought_forward_ksh NUMERIC(14, 2) NOT NULL DEFAULT 0,
  additional_funding_ksh      NUMERIC(14, 2) NOT NULL DEFAULT 0,

  -- Total available is DERIVED, never typed (§8).
  total_available_ksh   NUMERIC(14, 2) GENERATED ALWAYS AS
    (opening_amount_ksh + balance_brought_forward_ksh + additional_funding_ksh) STORED,

  purpose               TEXT NOT NULL DEFAULT '',
  -- draft | open | active | awaiting_documents | awaiting_review
  -- | reconciled | closed | reopened | cancelled
  status                TEXT NOT NULL DEFAULT 'draft',

  -- Closure (§9). Calculated vs physical, with the difference explicit.
  closed_on             DATE,
  calculated_balance_ksh NUMERIC(14, 2),
  physical_balance_ksh  NUMERIC(14, 2),
  variance_ksh          NUMERIC(14, 2),
  variance_explanation  TEXT NOT NULL DEFAULT '',
  amount_reimbursed_ksh NUMERIC(14, 2) NOT NULL DEFAULT 0,
  amount_returned_ksh   NUMERIC(14, 2) NOT NULL DEFAULT 0,
  carry_forward_decision TEXT NOT NULL DEFAULT '',  -- carried | returned | reimbursed | written_off

  reviewed_by           TEXT NOT NULL DEFAULT '',
  reviewed_at           TIMESTAMPTZ,
  approved_by           TEXT NOT NULL DEFAULT '',
  approved_at           TIMESTAMPTZ,
  reopened_by           TEXT NOT NULL DEFAULT '',
  reopened_reason       TEXT NOT NULL DEFAULT '',
  closure_notes         TEXT NOT NULL DEFAULT '',

  -- QuickBooks reconciliation state for the float as a whole.
  reconciliation_status TEXT NOT NULL DEFAULT 'not_ready',
  created_by            TEXT NOT NULL DEFAULT '',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_petty_float_ref ON petty_cash_floats (float_ref);

ALTER TABLE petty_cash_floats
  DROP CONSTRAINT IF EXISTS petty_cash_floats_status_check;
ALTER TABLE petty_cash_floats
  ADD CONSTRAINT petty_cash_floats_status_check
  CHECK (status IN (
    'draft', 'open', 'active', 'awaiting_documents', 'awaiting_review',
    'reconciled', 'closed', 'reopened', 'cancelled'
  ));

-- §6: "Only one active float should normally exist for the same custodian and
-- operational scope." Enforced in the database, so a second open float requires
-- deliberately closing the first.
CREATE UNIQUE INDEX IF NOT EXISTS idx_petty_float_one_active
  ON petty_cash_floats (
    COALESCE(account_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(custodian)
  )
  WHERE status IN ('open', 'active', 'awaiting_documents', 'awaiting_review');

-- §10: "Do not count the carried-forward amount twice." A float may be named as
-- the predecessor of at most one successor.
CREATE UNIQUE INDEX IF NOT EXISTS idx_petty_float_one_successor
  ON petty_cash_floats (previous_float_id) WHERE previous_float_id IS NOT NULL;

-- A float cannot be its own predecessor.
ALTER TABLE petty_cash_floats
  DROP CONSTRAINT IF EXISTS petty_cash_floats_no_self_link;
ALTER TABLE petty_cash_floats
  ADD CONSTRAINT petty_cash_floats_no_self_link
  CHECK (previous_float_id IS DISTINCT FROM id AND succeeding_float_id IS DISTINCT FROM id);

-- §9: closing requires the variance to be explained.
ALTER TABLE petty_cash_floats
  DROP CONSTRAINT IF EXISTS petty_cash_floats_variance_explained;
ALTER TABLE petty_cash_floats
  ADD CONSTRAINT petty_cash_floats_variance_explained
  CHECK (
    status <> 'closed'
    OR COALESCE(variance_ksh, 0) = 0
    OR variance_explanation <> ''
  );

CREATE INDEX IF NOT EXISTS idx_petty_floats_brand  ON petty_cash_floats (brand_id, opened_on DESC);
CREATE INDEX IF NOT EXISTS idx_petty_floats_status ON petty_cash_floats (status);

-- Transactions belong to a float cycle.
ALTER TABLE petty_cash_transactions
  ADD COLUMN IF NOT EXISTS float_id           UUID REFERENCES petty_cash_floats(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supplier_invoice_no TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS receipt_no         TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS requisition_id     UUID REFERENCES procurement_requisitions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS goods_receipt_id   UUID REFERENCES procurement_goods_receipts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS inventory_item_id  UUID REFERENCES inventory_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cost_centre        TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS reconciliation_status TEXT NOT NULL DEFAULT 'not_ready',
  ADD COLUMN IF NOT EXISTS quickbooks_ref     TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS document_status    TEXT NOT NULL DEFAULT 'incomplete';

CREATE INDEX IF NOT EXISTS idx_petty_txn_float ON petty_cash_transactions (float_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_petty_txn_recon ON petty_cash_transactions (reconciliation_status);

-- ─── 2. SUPPORTING DOCUMENT PACKET (§§11–13) ────────────────────────────────
-- §11: "Do not store these as a loose folder of unrelated files." Every document
-- is linked to the float, the transaction, and the operational records it
-- evidences.
CREATE TABLE IF NOT EXISTS petty_cash_documents (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  float_id         UUID REFERENCES petty_cash_floats(id) ON DELETE CASCADE,
  transaction_id   UUID REFERENCES petty_cash_transactions(id) ON DELETE CASCADE,
  brand_id         UUID REFERENCES brands(id) ON DELETE SET NULL,
  -- voucher | supplier_invoice | receipt | goods_received_note | delivery_note
  -- | procurement_request | purchase_order | mpesa_confirmation
  -- | bank_confirmation | approval | photo | other
  document_type    TEXT NOT NULL DEFAULT 'other',
  document_number  TEXT NOT NULL DEFAULT '',
  document_date    DATE,
  amount_ksh       NUMERIC(14, 2),
  supplier         TEXT NOT NULL DEFAULT '',
  file_url         TEXT NOT NULL DEFAULT '',
  file_name        TEXT NOT NULL DEFAULT '',
  file_checksum    TEXT NOT NULL DEFAULT '',
  mime_type        TEXT NOT NULL DEFAULT '',
  -- Cross-links to the operational records this document evidences.
  requisition_id   UUID REFERENCES procurement_requisitions(id) ON DELETE SET NULL,
  goods_receipt_id UUID REFERENCES procurement_goods_receipts(id) ON DELETE SET NULL,
  movement_id      UUID REFERENCES inventory_movements(id) ON DELETE SET NULL,
  confidentiality  TEXT NOT NULL DEFAULT 'internal',   -- internal | restricted | confidential
  -- §12: "Do not alter the original uploaded files." Originals are immutable;
  -- a generated merged packet is stored as a DERIVED document instead.
  is_generated     BOOLEAN NOT NULL DEFAULT false,
  uploaded_by      TEXT NOT NULL DEFAULT '',
  uploaded_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes            TEXT NOT NULL DEFAULT ''
);

ALTER TABLE petty_cash_documents
  DROP CONSTRAINT IF EXISTS petty_cash_documents_subject_check;
ALTER TABLE petty_cash_documents
  ADD CONSTRAINT petty_cash_documents_subject_check
  CHECK (float_id IS NOT NULL OR transaction_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_petty_docs_float ON petty_cash_documents (float_id);
CREATE INDEX IF NOT EXISTS idx_petty_docs_txn   ON petty_cash_documents (transaction_id);
CREATE INDEX IF NOT EXISTS idx_petty_docs_type  ON petty_cash_documents (document_type);
-- §31: supporting-document search by supplier / invoice / receipt / M-Pesa code.
CREATE INDEX IF NOT EXISTS idx_petty_docs_number ON petty_cash_documents (document_number) WHERE document_number <> '';

-- §13: which documents a transaction type requires, configurable by finance.
CREATE TABLE IF NOT EXISTS petty_cash_document_rules (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id          UUID REFERENCES brands(id) ON DELETE CASCADE,
  expense_category  TEXT NOT NULL DEFAULT '',
  transaction_kind  TEXT NOT NULL DEFAULT 'general',  -- stock_purchase | service | transport | general
  required_documents TEXT[] NOT NULL DEFAULT '{}',
  amount_threshold_ksh NUMERIC(14, 2) NOT NULL DEFAULT 0,
  requires_approval BOOLEAN NOT NULL DEFAULT false,
  active            BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_petty_doc_rules ON petty_cash_document_rules (brand_id, transaction_kind) WHERE active;

-- ─── 3. FLOAT LEDGER VIEW (§8) ──────────────────────────────────────────────
-- The calculated balance, derived from the transactions in the float. §8: "The
-- user should not manually type the calculated closing balance."
CREATE OR REPLACE VIEW petty_cash_float_ledger AS
  SELECT
    f.id                      AS float_id,
    f.float_ref,
    f.brand_id,
    f.custodian,
    f.status,
    f.opening_amount_ksh,
    f.balance_brought_forward_ksh,
    f.additional_funding_ksh,
    f.total_available_ksh,
    COALESCE(SUM(t.expense_amount_ksh), 0)                       AS total_expenses_ksh,
    COALESCE(SUM(t.transaction_charge_ksh + t.withdrawal_charge_ksh
                 + t.secondary_charge_ksh), 0)                   AS total_charges_ksh,
    COALESCE(SUM(t.cash_received_ksh), 0)                        AS total_refunds_ksh,
    COUNT(t.id)                                                  AS transaction_count,
    COUNT(t.id) FILTER (WHERE t.document_status <> 'complete')   AS transactions_missing_documents,
    COUNT(t.id) FILTER (WHERE t.reconciliation_status <> 'reconciled') AS transactions_unreconciled,
    -- calculated closing = available + refunds - expenses - charges
    f.total_available_ksh
      + COALESCE(SUM(t.cash_received_ksh), 0)
      - COALESCE(SUM(t.expense_amount_ksh), 0)
      - COALESCE(SUM(t.transaction_charge_ksh + t.withdrawal_charge_ksh
                     + t.secondary_charge_ksh), 0)               AS calculated_balance_ksh,
    f.physical_balance_ksh,
    f.previous_float_id,
    f.succeeding_float_id
  FROM petty_cash_floats f
  LEFT JOIN petty_cash_transactions t ON t.float_id = f.id
  GROUP BY f.id;

GRANT SELECT ON petty_cash_float_ledger TO service_role;

-- ─── 4. REFERENCE SEQUENCE ──────────────────────────────────────────────────
INSERT INTO ops_id_sequences (name, current_val) VALUES ('petty_float', 0)
ON CONFLICT (name) DO NOTHING;

-- ─── 5. RLS + GRANTS ────────────────────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'petty_cash_floats', 'petty_cash_documents', 'petty_cash_document_rules'
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
