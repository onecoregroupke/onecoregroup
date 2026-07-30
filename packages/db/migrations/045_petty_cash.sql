-- Migration 045: Petty cash workspace (Part 7).
--
-- Additive. Brand-scoped petty-cash floats with income + expense lines,
-- decimal-safe charges (incl. the workbook-specific ZIIDI secondary charge),
-- reconciliation (physical count vs expected), and a draft→…→closed workflow
-- mapped onto the existing permission system.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Petty cash floats (per brand / department / custodian) ───────────────────
CREATE TABLE IF NOT EXISTS petty_cash_accounts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id           UUID REFERENCES brands(id) ON DELETE SET NULL,
  operating_unit     TEXT NOT NULL DEFAULT '',           -- e.g. imported "Manager"/"NN" label, pre-mapping
  department         TEXT NOT NULL DEFAULT '',
  branch             TEXT NOT NULL DEFAULT '',
  custodian          TEXT NOT NULL DEFAULT '',
  name               TEXT NOT NULL,
  currency           TEXT NOT NULL DEFAULT 'KES',
  opening_float_ksh  NUMERIC(14, 2) NOT NULL DEFAULT 0,
  current_balance_ksh NUMERIC(14, 2) NOT NULL DEFAULT 0, -- derived cache; source of truth = transactions
  is_active          BOOLEAN NOT NULL DEFAULT true,
  notes              TEXT NOT NULL DEFAULT '',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_petty_cash_accounts_brand ON petty_cash_accounts(brand_id);
CREATE INDEX IF NOT EXISTS idx_petty_cash_accounts_custodian ON petty_cash_accounts(custodian);

-- ── Petty cash transactions (income / expense / opening lines) ───────────────
CREATE TABLE IF NOT EXISTS petty_cash_transactions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            UUID REFERENCES petty_cash_accounts(id) ON DELETE CASCADE,
  brand_id              UUID REFERENCES brands(id) ON DELETE SET NULL,
  department            TEXT NOT NULL DEFAULT '',
  branch                TEXT NOT NULL DEFAULT '',
  custodian             TEXT NOT NULL DEFAULT '',
  entry_kind            TEXT NOT NULL DEFAULT 'expense'
                          CHECK (entry_kind IN ('opening','income','expense')),
  transaction_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  -- income / opening
  opening_float_ksh     NUMERIC(14, 2) NOT NULL DEFAULT 0,
  cash_received_ksh     NUMERIC(14, 2) NOT NULL DEFAULT 0,
  source_of_funds       TEXT NOT NULL DEFAULT '',
  -- expense
  expense_amount_ksh    NUMERIC(14, 2) NOT NULL DEFAULT 0,
  expense_category      TEXT NOT NULL DEFAULT '',
  payee                 TEXT NOT NULL DEFAULT '',
  description           TEXT NOT NULL DEFAULT '',
  -- charges (decimal-safe)
  transaction_charge_ksh NUMERIC(14, 2) NOT NULL DEFAULT 0,
  withdrawal_charge_ksh  NUMERIC(14, 2) NOT NULL DEFAULT 0,
  secondary_charge_ksh   NUMERIC(14, 2) NOT NULL DEFAULT 0,   -- e.g. ZIIDI
  secondary_charge_label TEXT NOT NULL DEFAULT '',
  -- total cash out = expense + all charges (income/opening rows keep 0s → total 0)
  total_cash_out_ksh    NUMERIC(14, 2) GENERATED ALWAYS AS
                          (expense_amount_ksh + transaction_charge_ksh + withdrawal_charge_ksh + secondary_charge_ksh) STORED,
  running_balance_ksh   NUMERIC(14, 2),                    -- app-computed in date/created order
  -- supporting + lifecycle
  reference             TEXT NOT NULL DEFAULT '',
  receipt_url           TEXT NOT NULL DEFAULT '',
  state                 TEXT NOT NULL DEFAULT 'draft'
                          CHECK (state IN ('draft','submitted','reviewed','approved','rejected','reconciled','closed')),
  notes                 TEXT NOT NULL DEFAULT '',
  -- provenance / audit
  source_workbook       TEXT NOT NULL DEFAULT '',
  source_sheet          TEXT NOT NULL DEFAULT '',
  source_row            INTEGER,
  import_id             UUID,
  created_by            TEXT NOT NULL DEFAULT '',
  modified_by           TEXT NOT NULL DEFAULT '',
  approved_by           TEXT NOT NULL DEFAULT '',
  approved_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_petty_cash_tx_account ON petty_cash_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_petty_cash_tx_brand ON petty_cash_transactions(brand_id);
CREATE INDEX IF NOT EXISTS idx_petty_cash_tx_date ON petty_cash_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_petty_cash_tx_state ON petty_cash_transactions(state);
CREATE INDEX IF NOT EXISTS idx_petty_cash_tx_import ON petty_cash_transactions(import_id);
-- Uniqueness per entry_kind: one workbook row can carry both an income and an
-- expense entry, so both may legitimately land from the same source coordinate.
CREATE UNIQUE INDEX IF NOT EXISTS uq_petty_cash_tx_source
  ON petty_cash_transactions(source_workbook, source_sheet, source_row, entry_kind)
  WHERE source_workbook <> '' AND source_row IS NOT NULL;

-- ── Reconciliations (physical count vs expected) ─────────────────────────────
CREATE TABLE IF NOT EXISTS petty_cash_reconciliations (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id             UUID REFERENCES petty_cash_accounts(id) ON DELETE CASCADE,
  brand_id               UUID REFERENCES brands(id) ON DELETE SET NULL,
  period_start           DATE,
  period_end             DATE,
  opening_float_ksh      NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_received_ksh     NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_expenses_ksh     NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_charges_ksh      NUMERIC(14, 2) NOT NULL DEFAULT 0,
  expected_closing_ksh   NUMERIC(14, 2) NOT NULL DEFAULT 0,
  physical_count_ksh     NUMERIC(14, 2) NOT NULL DEFAULT 0,
  difference_ksh         NUMERIC(14, 2) GENERATED ALWAYS AS (physical_count_ksh - expected_closing_ksh) STORED,
  status                 TEXT NOT NULL DEFAULT 'open',    -- open | balanced | variance | closed
  reviewed_by            TEXT NOT NULL DEFAULT '',
  notes                  TEXT NOT NULL DEFAULT '',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_petty_cash_recon_account ON petty_cash_reconciliations(account_id);
CREATE INDEX IF NOT EXISTS idx_petty_cash_recon_brand ON petty_cash_reconciliations(brand_id);

-- ── RLS + grants ─────────────────────────────────────────────────────────────
ALTER TABLE petty_cash_accounts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE petty_cash_transactions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE petty_cash_reconciliations ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['petty_cash_accounts','petty_cash_transactions','petty_cash_reconciliations'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%1$s_auth" ON %1$s;', t);
    EXECUTE format('CREATE POLICY "%1$s_auth" ON %1$s FOR SELECT TO authenticated USING (true);', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s_service" ON %1$s;', t);
    EXECUTE format('CREATE POLICY "%1$s_service" ON %1$s USING (auth.role() = ''service_role'') WITH CHECK (true);', t);
    EXECUTE format('GRANT ALL ON TABLE %1$s TO service_role;', t);
  END LOOP;
END $$;
