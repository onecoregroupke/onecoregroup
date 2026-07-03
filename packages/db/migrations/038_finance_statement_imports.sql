-- Migration 038: finance statement import and review workflow
-- Bank/M-Pesa statement files are imported into staging rows first. Finance
-- users review classifications before approved rows are written to the ledger.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS finance_statement_imports (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id              UUID REFERENCES brands(id) ON DELETE SET NULL,
  account_id            UUID REFERENCES finance_accounts(id) ON DELETE SET NULL,
  statement_type        TEXT NOT NULL DEFAULT 'mpesa',
  source_filename       TEXT NOT NULL DEFAULT '',
  storage_bucket        TEXT NOT NULL DEFAULT '',
  storage_path          TEXT NOT NULL DEFAULT '',
  parse_status          TEXT NOT NULL DEFAULT 'pending_review',
  period_start          DATE,
  period_end            DATE,
  opening_balance_ksh   NUMERIC(14, 2),
  closing_balance_ksh   NUMERIC(14, 2),
  imported_by           TEXT NOT NULL DEFAULT '',
  reviewed_by           TEXT NOT NULL DEFAULT '',
  approved_at           TIMESTAMPTZ,
  extracted_text        TEXT NOT NULL DEFAULT '',
  notes                 TEXT NOT NULL DEFAULT '',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_finance_statement_imports_brand ON finance_statement_imports(brand_id);
CREATE INDEX IF NOT EXISTS idx_finance_statement_imports_account ON finance_statement_imports(account_id);
CREATE INDEX IF NOT EXISTS idx_finance_statement_imports_status ON finance_statement_imports(parse_status);
CREATE INDEX IF NOT EXISTS idx_finance_statement_imports_created ON finance_statement_imports(created_at DESC);

CREATE TABLE IF NOT EXISTS finance_statement_lines (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id                  UUID NOT NULL REFERENCES finance_statement_imports(id) ON DELETE CASCADE,
  brand_id                   UUID REFERENCES brands(id) ON DELETE SET NULL,
  account_id                 UUID REFERENCES finance_accounts(id) ON DELETE SET NULL,
  statement_date             DATE,
  raw_description            TEXT NOT NULL DEFAULT '',
  reference                  TEXT NOT NULL DEFAULT '',
  counterparty_name          TEXT NOT NULL DEFAULT '',
  counterparty_account_hint  TEXT NOT NULL DEFAULT '',
  direction                  TEXT NOT NULL DEFAULT 'outflow',
  amount_ksh                 NUMERIC(14, 2) NOT NULL DEFAULT 0,
  transaction_cost_ksh       NUMERIC(14, 2) NOT NULL DEFAULT 0,
  running_balance_ksh        NUMERIC(14, 2),
  suggested_category         TEXT NOT NULL DEFAULT '',
  suggested_votehead_id      UUID REFERENCES finance_voteheads(id) ON DELETE SET NULL,
  suggested_counterparty_brand_id UUID REFERENCES brands(id) ON DELETE SET NULL,
  suggested_internal_account_id UUID REFERENCES finance_accounts(id) ON DELETE SET NULL,
  matched_transaction_id     UUID REFERENCES finance_transactions(id) ON DELETE SET NULL,
  confidence                 NUMERIC(5, 2) NOT NULL DEFAULT 0,
  review_status              TEXT NOT NULL DEFAULT 'pending',
  ledger_transaction_id      UUID REFERENCES finance_transactions(id) ON DELETE SET NULL,
  notes                      TEXT NOT NULL DEFAULT '',
  raw_payload                JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_finance_statement_lines_import ON finance_statement_lines(import_id);
CREATE INDEX IF NOT EXISTS idx_finance_statement_lines_brand ON finance_statement_lines(brand_id);
CREATE INDEX IF NOT EXISTS idx_finance_statement_lines_account ON finance_statement_lines(account_id);
CREATE INDEX IF NOT EXISTS idx_finance_statement_lines_reference ON finance_statement_lines(reference);
CREATE INDEX IF NOT EXISTS idx_finance_statement_lines_status ON finance_statement_lines(review_status);
CREATE INDEX IF NOT EXISTS idx_finance_statement_lines_match ON finance_statement_lines(matched_transaction_id);

ALTER TABLE finance_transactions ADD COLUMN IF NOT EXISTS statement_import_id UUID REFERENCES finance_statement_imports(id) ON DELETE SET NULL;
ALTER TABLE finance_transactions ADD COLUMN IF NOT EXISTS statement_line_id UUID REFERENCES finance_statement_lines(id) ON DELETE SET NULL;
ALTER TABLE finance_transactions ADD COLUMN IF NOT EXISTS transaction_cost_ksh NUMERIC(14, 2) NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_finance_transactions_statement_import ON finance_transactions(statement_import_id);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_statement_line ON finance_transactions(statement_line_id);

ALTER TABLE finance_statement_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_statement_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "finance_statement_imports_service" ON finance_statement_imports;
CREATE POLICY "finance_statement_imports_service" ON finance_statement_imports
  USING (auth.role() = 'service_role') WITH CHECK (true);

DROP POLICY IF EXISTS "finance_statement_lines_service" ON finance_statement_lines;
CREATE POLICY "finance_statement_lines_service" ON finance_statement_lines
  USING (auth.role() = 'service_role') WITH CHECK (true);

GRANT ALL ON TABLE finance_statement_imports TO service_role;
GRANT ALL ON TABLE finance_statement_lines TO service_role;
