-- Finance operations cockpit.
-- Tracks business and owner-held payment accounts, brand income/expenditure,
-- inter-brand movements, reconciliation batches, matched statements, and
-- unresolved exceptions across all OCG brands.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS finance_accounts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id              UUID REFERENCES brands(id) ON DELETE SET NULL,
  account_name          TEXT NOT NULL,
  account_type          TEXT NOT NULL DEFAULT 'mpesa_till',
  provider              TEXT NOT NULL DEFAULT '',
  account_identifier    TEXT NOT NULL DEFAULT '',
  legal_owner           TEXT NOT NULL DEFAULT 'business',
  owner_person          TEXT NOT NULL DEFAULT '',
  business_use_notes    TEXT NOT NULL DEFAULT '',
  opening_balance_ksh   NUMERIC(14, 2) NOT NULL DEFAULT 0,
  current_balance_ksh   NUMERIC(14, 2) NOT NULL DEFAULT 0,
  reconciliation_status TEXT NOT NULL DEFAULT 'needs_review',
  is_active             BOOLEAN NOT NULL DEFAULT true,
  notes                 TEXT NOT NULL DEFAULT '',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_accounts_brand ON finance_accounts(brand_id);
CREATE INDEX IF NOT EXISTS idx_finance_accounts_type ON finance_accounts(account_type);
CREATE INDEX IF NOT EXISTS idx_finance_accounts_owner ON finance_accounts(owner_person);

CREATE TABLE IF NOT EXISTS finance_transactions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id              UUID REFERENCES brands(id) ON DELETE SET NULL,
  account_id            UUID REFERENCES finance_accounts(id) ON DELETE SET NULL,
  counterparty_brand_id UUID REFERENCES brands(id) ON DELETE SET NULL,
  transaction_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  direction             TEXT NOT NULL DEFAULT 'outflow',
  category              TEXT NOT NULL DEFAULT 'uncategorized',
  description           TEXT NOT NULL DEFAULT '',
  amount_ksh            NUMERIC(14, 2) NOT NULL DEFAULT 0,
  payment_channel       TEXT NOT NULL DEFAULT '',
  reference             TEXT NOT NULL DEFAULT '',
  counterparty_name     TEXT NOT NULL DEFAULT '',
  owner_person          TEXT NOT NULL DEFAULT '',
  reconciliation_status TEXT NOT NULL DEFAULT 'unmatched',
  source_document_url   TEXT NOT NULL DEFAULT '',
  notes                 TEXT NOT NULL DEFAULT '',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_transactions_brand ON finance_transactions(brand_id);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_account ON finance_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_date ON finance_transactions(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_reference ON finance_transactions(reference);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_recon ON finance_transactions(reconciliation_status);

CREATE TABLE IF NOT EXISTS finance_interbrand_transfers (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_brand_id         UUID REFERENCES brands(id) ON DELETE SET NULL,
  to_brand_id           UUID REFERENCES brands(id) ON DELETE SET NULL,
  from_account_id       UUID REFERENCES finance_accounts(id) ON DELETE SET NULL,
  to_account_id         UUID REFERENCES finance_accounts(id) ON DELETE SET NULL,
  transfer_date         DATE NOT NULL DEFAULT CURRENT_DATE,
  amount_ksh            NUMERIC(14, 2) NOT NULL DEFAULT 0,
  purpose               TEXT NOT NULL DEFAULT '',
  reference             TEXT NOT NULL DEFAULT '',
  status                TEXT NOT NULL DEFAULT 'pending_reconciliation',
  recorded_by           TEXT NOT NULL DEFAULT '',
  notes                 TEXT NOT NULL DEFAULT '',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_transfers_from_brand ON finance_interbrand_transfers(from_brand_id);
CREATE INDEX IF NOT EXISTS idx_finance_transfers_to_brand ON finance_interbrand_transfers(to_brand_id);
CREATE INDEX IF NOT EXISTS idx_finance_transfers_status ON finance_interbrand_transfers(status);
CREATE INDEX IF NOT EXISTS idx_finance_transfers_date ON finance_interbrand_transfers(transfer_date DESC);

CREATE TABLE IF NOT EXISTS finance_reconciliation_batches (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          UUID REFERENCES finance_accounts(id) ON DELETE SET NULL,
  brand_id            UUID REFERENCES brands(id) ON DELETE SET NULL,
  period_start        DATE,
  period_end          DATE,
  statement_source    TEXT NOT NULL DEFAULT '',
  statement_reference TEXT NOT NULL DEFAULT '',
  opening_balance_ksh NUMERIC(14, 2),
  closing_balance_ksh NUMERIC(14, 2),
  imported_count      INTEGER NOT NULL DEFAULT 0,
  matched_count       INTEGER NOT NULL DEFAULT 0,
  exception_count     INTEGER NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'open',
  reviewed_by         TEXT NOT NULL DEFAULT '',
  notes               TEXT NOT NULL DEFAULT '',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_recon_batches_account ON finance_reconciliation_batches(account_id);
CREATE INDEX IF NOT EXISTS idx_finance_recon_batches_brand ON finance_reconciliation_batches(brand_id);
CREATE INDEX IF NOT EXISTS idx_finance_recon_batches_status ON finance_reconciliation_batches(status);

CREATE TABLE IF NOT EXISTS finance_reconciliation_matches (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id              UUID REFERENCES finance_reconciliation_batches(id) ON DELETE CASCADE,
  transaction_id         UUID REFERENCES finance_transactions(id) ON DELETE SET NULL,
  statement_date         DATE,
  statement_description  TEXT NOT NULL DEFAULT '',
  statement_amount_ksh   NUMERIC(14, 2) NOT NULL DEFAULT 0,
  statement_reference    TEXT NOT NULL DEFAULT '',
  match_status           TEXT NOT NULL DEFAULT 'unmatched',
  confidence             NUMERIC(5, 2),
  notes                  TEXT NOT NULL DEFAULT '',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_recon_matches_batch ON finance_reconciliation_matches(batch_id);
CREATE INDEX IF NOT EXISTS idx_finance_recon_matches_transaction ON finance_reconciliation_matches(transaction_id);
CREATE INDEX IF NOT EXISTS idx_finance_recon_matches_status ON finance_reconciliation_matches(match_status);

CREATE TABLE IF NOT EXISTS finance_exceptions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id              UUID REFERENCES brands(id) ON DELETE SET NULL,
  account_id            UUID REFERENCES finance_accounts(id) ON DELETE SET NULL,
  transaction_id         UUID REFERENCES finance_transactions(id) ON DELETE SET NULL,
  transfer_id            UUID REFERENCES finance_interbrand_transfers(id) ON DELETE SET NULL,
  exception_type         TEXT NOT NULL DEFAULT 'unreconciled',
  severity               TEXT NOT NULL DEFAULT 'Medium',
  title                  TEXT NOT NULL,
  description            TEXT NOT NULL DEFAULT '',
  owner_id               UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,
  status                 TEXT NOT NULL DEFAULT 'open',
  due_date               DATE,
  resolution_notes       TEXT NOT NULL DEFAULT '',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_exceptions_brand ON finance_exceptions(brand_id);
CREATE INDEX IF NOT EXISTS idx_finance_exceptions_account ON finance_exceptions(account_id);
CREATE INDEX IF NOT EXISTS idx_finance_exceptions_status ON finance_exceptions(status);
CREATE INDEX IF NOT EXISTS idx_finance_exceptions_due ON finance_exceptions(due_date);

ALTER TABLE finance_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_interbrand_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_reconciliation_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_reconciliation_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_exceptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "finance_accounts_auth" ON finance_accounts FOR SELECT TO authenticated USING (true);
CREATE POLICY "finance_transactions_auth" ON finance_transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "finance_transfers_auth" ON finance_interbrand_transfers FOR SELECT TO authenticated USING (true);
CREATE POLICY "finance_recon_batches_auth" ON finance_reconciliation_batches FOR SELECT TO authenticated USING (true);
CREATE POLICY "finance_recon_matches_auth" ON finance_reconciliation_matches FOR SELECT TO authenticated USING (true);
CREATE POLICY "finance_exceptions_auth" ON finance_exceptions FOR SELECT TO authenticated USING (true);

CREATE POLICY "finance_accounts_service" ON finance_accounts USING (auth.role() = 'service_role') WITH CHECK (true);
CREATE POLICY "finance_transactions_service" ON finance_transactions USING (auth.role() = 'service_role') WITH CHECK (true);
CREATE POLICY "finance_transfers_service" ON finance_interbrand_transfers USING (auth.role() = 'service_role') WITH CHECK (true);
CREATE POLICY "finance_recon_batches_service" ON finance_reconciliation_batches USING (auth.role() = 'service_role') WITH CHECK (true);
CREATE POLICY "finance_recon_matches_service" ON finance_reconciliation_matches USING (auth.role() = 'service_role') WITH CHECK (true);
CREATE POLICY "finance_exceptions_service" ON finance_exceptions USING (auth.role() = 'service_role') WITH CHECK (true);

GRANT ALL ON TABLE finance_accounts TO service_role;
GRANT ALL ON TABLE finance_transactions TO service_role;
GRANT ALL ON TABLE finance_interbrand_transfers TO service_role;
GRANT ALL ON TABLE finance_reconciliation_batches TO service_role;
GRANT ALL ON TABLE finance_reconciliation_matches TO service_role;
GRANT ALL ON TABLE finance_exceptions TO service_role;
