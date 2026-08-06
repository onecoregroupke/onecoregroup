-- Migration 063: QuickBooks import and reconciliation (addendum §§2–4).
--
-- BOUNDARY (addendum §1): QuickBooks remains the canonical ACCOUNTING source.
-- This platform is the operational source. It imports and reconciles QuickBooks
-- records and keeps the references needed to connect operational documents to
-- accounting ones — it does not become a competing accounting truth, and it does
-- not create a duplicate finance entry just because both records exist.
--
-- §2: "Do not assume live QuickBooks API access exists." The import layer is
-- file-driven with user-supplied field mapping, and the data model is shaped so
-- a live API connection can be added later without replacing it.

-- ─── 1. IMPORT BATCH (§3) ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quickbooks_imports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_ref        TEXT NOT NULL,
  brand_id          UUID REFERENCES brands(id) ON DELETE SET NULL,
  -- accounts | customers | suppliers | products | invoices | payments
  -- | expenses | petty_cash | bank | credit_notes
  export_type       TEXT NOT NULL,
  source_format     TEXT NOT NULL DEFAULT 'csv',      -- csv | xlsx | qbo | other
  file_name         TEXT NOT NULL DEFAULT '',
  -- §3: "Preserve the original uploaded file and its checksum or immutable
  -- reference." The file itself lives in storage; this is the immutable handle.
  file_url          TEXT NOT NULL DEFAULT '',
  file_checksum     TEXT NOT NULL DEFAULT '',
  file_size_bytes   BIGINT,
  period_start      DATE,
  period_end        DATE,
  -- uploaded | mapped | validated | previewed | committed | rolled_back | failed
  status            TEXT NOT NULL DEFAULT 'uploaded',
  field_mapping     JSONB NOT NULL DEFAULT '{}'::jsonb,
  detected_headers  TEXT[] NOT NULL DEFAULT '{}',

  total_rows        INTEGER NOT NULL DEFAULT 0,
  successful_rows   INTEGER NOT NULL DEFAULT 0,
  rejected_rows     INTEGER NOT NULL DEFAULT 0,
  duplicate_rows    INTEGER NOT NULL DEFAULT 0,
  auto_matched_rows INTEGER NOT NULL DEFAULT 0,
  review_rows       INTEGER NOT NULL DEFAULT 0,
  new_entities      INTEGER NOT NULL DEFAULT 0,
  total_amount_ksh  NUMERIC(16, 2) NOT NULL DEFAULT 0,
  reconciliation_difference_ksh NUMERIC(16, 2) NOT NULL DEFAULT 0,

  error_summary     TEXT NOT NULL DEFAULT '',
  imported_by       TEXT NOT NULL DEFAULT '',
  committed_by      TEXT NOT NULL DEFAULT '',
  committed_at      TIMESTAMPTZ,
  rolled_back_by    TEXT NOT NULL DEFAULT '',
  rolled_back_at    TIMESTAMPTZ,
  notes             TEXT NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_qb_import_ref ON quickbooks_imports (import_ref);

ALTER TABLE quickbooks_imports
  DROP CONSTRAINT IF EXISTS quickbooks_imports_status_check;
ALTER TABLE quickbooks_imports
  ADD CONSTRAINT quickbooks_imports_status_check
  CHECK (status IN ('uploaded','mapped','validated','previewed','committed','rolled_back','failed'));

-- The same export file cannot be committed twice.
CREATE UNIQUE INDEX IF NOT EXISTS idx_qb_import_checksum_once
  ON quickbooks_imports (file_checksum, export_type)
  WHERE file_checksum <> '' AND status = 'committed';

CREATE INDEX IF NOT EXISTS idx_qb_imports_when ON quickbooks_imports (created_at DESC);

-- ─── 2. IMPORTED TRANSACTIONS ───────────────────────────────────────────────
-- One row per QuickBooks record. These are ACCOUNTING facts, stored as read
-- from the export; operational records link to them rather than being rewritten
-- by them.
CREATE TABLE IF NOT EXISTS quickbooks_transactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id         UUID REFERENCES quickbooks_imports(id) ON DELETE CASCADE,
  brand_id          UUID REFERENCES brands(id) ON DELETE SET NULL,
  export_type       TEXT NOT NULL DEFAULT '',
  -- Natural key from QuickBooks, when the export provides one.
  qb_id             TEXT NOT NULL DEFAULT '',
  qb_doc_number     TEXT NOT NULL DEFAULT '',
  transaction_date  DATE,
  transaction_type  TEXT NOT NULL DEFAULT '',
  account_name      TEXT NOT NULL DEFAULT '',
  customer_name     TEXT NOT NULL DEFAULT '',
  supplier_name     TEXT NOT NULL DEFAULT '',
  description       TEXT NOT NULL DEFAULT '',
  reference         TEXT NOT NULL DEFAULT '',
  mpesa_code        TEXT NOT NULL DEFAULT '',
  amount_ksh        NUMERIC(16, 2) NOT NULL DEFAULT 0,
  tax_ksh           NUMERIC(16, 2) NOT NULL DEFAULT 0,
  currency          TEXT NOT NULL DEFAULT 'KES',
  raw               JSONB NOT NULL DEFAULT '{}'::jsonb,
  row_number        INTEGER,
  -- unmatched | suggested | matched | partially_matched | difference | reconciled | rejected
  match_state       TEXT NOT NULL DEFAULT 'unmatched',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- §3 duplicate detection: the same QuickBooks record cannot land twice.
CREATE UNIQUE INDEX IF NOT EXISTS idx_qb_txn_natural_key
  ON quickbooks_transactions (export_type, qb_id) WHERE qb_id <> '';

CREATE INDEX IF NOT EXISTS idx_qb_txn_import ON quickbooks_transactions (import_id);
CREATE INDEX IF NOT EXISTS idx_qb_txn_date   ON quickbooks_transactions (transaction_date);
CREATE INDEX IF NOT EXISTS idx_qb_txn_amount ON quickbooks_transactions (amount_ksh);
CREATE INDEX IF NOT EXISTS idx_qb_txn_state  ON quickbooks_transactions (match_state);
CREATE INDEX IF NOT EXISTS idx_qb_txn_mpesa  ON quickbooks_transactions (mpesa_code) WHERE mpesa_code <> '';

-- ─── 3. RECONCILIATION MATCHES (§4) ─────────────────────────────────────────
-- §4 requires split (one QB transaction across several operational records) and
-- combine (several operational records against one QB transaction). A join table
-- with an amount per link supports both without a special case for either.
CREATE TABLE IF NOT EXISTS quickbooks_matches (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qb_transaction_id UUID NOT NULL REFERENCES quickbooks_transactions(id) ON DELETE CASCADE,
  -- The operational record being reconciled. Polymorphic by table + id, because
  -- these live in petty cash, finance, sales and procurement alike.
  entity_table      TEXT NOT NULL,
  entity_id         TEXT NOT NULL,
  matched_amount_ksh NUMERIC(16, 2) NOT NULL DEFAULT 0,
  difference_ksh    NUMERIC(16, 2) NOT NULL DEFAULT 0,
  -- suggested | accepted | rejected
  decision          TEXT NOT NULL DEFAULT 'suggested',
  confidence        NUMERIC(5, 2) NOT NULL DEFAULT 0,
  match_basis       TEXT[] NOT NULL DEFAULT '{}',   -- date, amount, reference, mpesa_code, supplier…
  note              TEXT NOT NULL DEFAULT '',
  decided_by        TEXT NOT NULL DEFAULT '',
  decided_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE quickbooks_matches
  DROP CONSTRAINT IF EXISTS quickbooks_matches_decision_check;
ALTER TABLE quickbooks_matches
  ADD CONSTRAINT quickbooks_matches_decision_check
  CHECK (decision IN ('suggested', 'accepted', 'rejected'));

-- §4: "Do not match solely by amount." A match must record what it was based
-- on, and amount alone is rejected at write time.
ALTER TABLE quickbooks_matches
  DROP CONSTRAINT IF EXISTS quickbooks_matches_basis_check;
ALTER TABLE quickbooks_matches
  ADD CONSTRAINT quickbooks_matches_basis_check
  CHECK (
    decision <> 'accepted'
    OR (array_length(match_basis, 1) >= 2)
  );

-- One ACCEPTED link between a given QB transaction and a given operational
-- record. Rejected/suggested duplicates may coexist as history.
CREATE UNIQUE INDEX IF NOT EXISTS idx_qb_match_accepted_once
  ON quickbooks_matches (qb_transaction_id, entity_table, entity_id)
  WHERE decision = 'accepted';

CREATE INDEX IF NOT EXISTS idx_qb_matches_entity ON quickbooks_matches (entity_table, entity_id);
CREATE INDEX IF NOT EXISTS idx_qb_matches_txn    ON quickbooks_matches (qb_transaction_id);

-- Decision history (§4 "Preserve the decision history").
CREATE TABLE IF NOT EXISTS quickbooks_match_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id    UUID REFERENCES quickbooks_matches(id) ON DELETE CASCADE,
  qb_transaction_id UUID REFERENCES quickbooks_transactions(id) ON DELETE CASCADE,
  action      TEXT NOT NULL,          -- suggested | accepted | rejected | split | combined | difference_recorded
  detail      TEXT NOT NULL DEFAULT '',
  amount_ksh  NUMERIC(16, 2),
  actor       TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_qb_match_events ON quickbooks_match_events (qb_transaction_id, created_at);

-- ─── 4. RECONCILIATION STATUS ON OPERATIONAL RECORDS (§4) ───────────────────
-- "Clearly distinguish operational status from accounting-posting status."
ALTER TABLE finance_transactions
  ADD COLUMN IF NOT EXISTS reconciliation_status TEXT NOT NULL DEFAULT 'not_ready',
  ADD COLUMN IF NOT EXISTS quickbooks_ref        TEXT NOT NULL DEFAULT '';

ALTER TABLE procurement_goods_receipts
  ADD COLUMN IF NOT EXISTS reconciliation_status TEXT NOT NULL DEFAULT 'not_ready',
  ADD COLUMN IF NOT EXISTS quickbooks_ref        TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_finance_txn_recon ON finance_transactions (reconciliation_status);

-- ─── 5. REFERENCE SEQUENCE ──────────────────────────────────────────────────
INSERT INTO ops_id_sequences (name, current_val) VALUES ('qb_import', 0)
ON CONFLICT (name) DO NOTHING;

-- ─── 6. RLS + GRANTS ────────────────────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'quickbooks_imports', 'quickbooks_transactions',
    'quickbooks_matches', 'quickbooks_match_events'
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
