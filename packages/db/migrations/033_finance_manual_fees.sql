-- Finance manual fee ledgers for Rayyan and Rhythms.
-- SchoolPay imports remain snapshots; these tables hold internally tracked fees
-- and optional links back to SchoolPay rows for reconciliation.

CREATE TABLE IF NOT EXISTS rayyan_fee_invoices (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id            UUID REFERENCES rayyan_students(id) ON DELETE SET NULL,
  schoolpay_snapshot_id UUID REFERENCES rayyan_schoolpay_payment_snapshots(id) ON DELETE SET NULL,
  schoolpay_code        TEXT NOT NULL DEFAULT '',
  fee_item              TEXT NOT NULL DEFAULT 'Tuition',
  term                  TEXT NOT NULL DEFAULT '',
  amount_expected_ksh   NUMERIC(12, 2) NOT NULL DEFAULT 0,
  amount_paid_ksh       NUMERIC(12, 2) NOT NULL DEFAULT 0,
  balance_ksh           NUMERIC(12, 2) GENERATED ALWAYS AS (amount_expected_ksh - amount_paid_ksh) STORED,
  status                TEXT NOT NULL DEFAULT 'unpaid',
  due_date              DATE,
  notes                 TEXT NOT NULL DEFAULT '',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rayyan_fee_invoices_student ON rayyan_fee_invoices(student_id);
CREATE INDEX IF NOT EXISTS idx_rayyan_fee_invoices_snapshot ON rayyan_fee_invoices(schoolpay_snapshot_id);
CREATE INDEX IF NOT EXISTS idx_rayyan_fee_invoices_status ON rayyan_fee_invoices(status);
CREATE INDEX IF NOT EXISTS idx_rayyan_fee_invoices_due ON rayyan_fee_invoices(due_date);

CREATE TABLE IF NOT EXISTS rayyan_fee_payments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id            UUID REFERENCES rayyan_fee_invoices(id) ON DELETE CASCADE,
  student_id            UUID REFERENCES rayyan_students(id) ON DELETE SET NULL,
  schoolpay_snapshot_id UUID REFERENCES rayyan_schoolpay_payment_snapshots(id) ON DELETE SET NULL,
  amount_ksh            NUMERIC(12, 2) NOT NULL DEFAULT 0,
  method                TEXT NOT NULL DEFAULT 'mpesa',
  reference             TEXT NOT NULL DEFAULT '',
  paid_on               DATE NOT NULL DEFAULT CURRENT_DATE,
  recorded_by           TEXT NOT NULL DEFAULT '',
  notes                 TEXT NOT NULL DEFAULT '',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rayyan_fee_payments_invoice ON rayyan_fee_payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_rayyan_fee_payments_student ON rayyan_fee_payments(student_id);
CREATE INDEX IF NOT EXISTS idx_rayyan_fee_payments_paid_on ON rayyan_fee_payments(paid_on);

CREATE TABLE IF NOT EXISTS rhythms_fee_invoices (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id            UUID REFERENCES rhythms_students(id) ON DELETE SET NULL,
  schoolpay_snapshot_id UUID REFERENCES rhythms_schoolpay_payment_snapshots(id) ON DELETE SET NULL,
  schoolpay_code        TEXT NOT NULL DEFAULT '',
  fee_item              TEXT NOT NULL DEFAULT 'Tuition',
  term                  TEXT NOT NULL DEFAULT '',
  amount_expected_ksh   NUMERIC(12, 2) NOT NULL DEFAULT 0,
  amount_paid_ksh       NUMERIC(12, 2) NOT NULL DEFAULT 0,
  balance_ksh           NUMERIC(12, 2) GENERATED ALWAYS AS (amount_expected_ksh - amount_paid_ksh) STORED,
  status                TEXT NOT NULL DEFAULT 'unpaid',
  due_date              DATE,
  notes                 TEXT NOT NULL DEFAULT '',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rhythms_fee_invoices_student ON rhythms_fee_invoices(student_id);
CREATE INDEX IF NOT EXISTS idx_rhythms_fee_invoices_snapshot ON rhythms_fee_invoices(schoolpay_snapshot_id);
CREATE INDEX IF NOT EXISTS idx_rhythms_fee_invoices_status ON rhythms_fee_invoices(status);
CREATE INDEX IF NOT EXISTS idx_rhythms_fee_invoices_due ON rhythms_fee_invoices(due_date);

CREATE TABLE IF NOT EXISTS rhythms_fee_payments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id            UUID REFERENCES rhythms_fee_invoices(id) ON DELETE CASCADE,
  student_id            UUID REFERENCES rhythms_students(id) ON DELETE SET NULL,
  schoolpay_snapshot_id UUID REFERENCES rhythms_schoolpay_payment_snapshots(id) ON DELETE SET NULL,
  amount_ksh            NUMERIC(12, 2) NOT NULL DEFAULT 0,
  method                TEXT NOT NULL DEFAULT 'mpesa',
  reference             TEXT NOT NULL DEFAULT '',
  paid_on               DATE NOT NULL DEFAULT CURRENT_DATE,
  recorded_by           TEXT NOT NULL DEFAULT '',
  notes                 TEXT NOT NULL DEFAULT '',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rhythms_fee_payments_invoice ON rhythms_fee_payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_rhythms_fee_payments_student ON rhythms_fee_payments(student_id);
CREATE INDEX IF NOT EXISTS idx_rhythms_fee_payments_paid_on ON rhythms_fee_payments(paid_on);

ALTER TABLE rayyan_fee_invoices  ENABLE ROW LEVEL SECURITY;
ALTER TABLE rayyan_fee_payments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE rhythms_fee_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE rhythms_fee_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rayyan_fee_invoices_auth" ON rayyan_fee_invoices;
CREATE POLICY "rayyan_fee_invoices_auth" ON rayyan_fee_invoices FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "rayyan_fee_payments_auth" ON rayyan_fee_payments;
CREATE POLICY "rayyan_fee_payments_auth" ON rayyan_fee_payments FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "rhythms_fee_invoices_auth" ON rhythms_fee_invoices;
CREATE POLICY "rhythms_fee_invoices_auth" ON rhythms_fee_invoices FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "rhythms_fee_payments_auth" ON rhythms_fee_payments;
CREATE POLICY "rhythms_fee_payments_auth" ON rhythms_fee_payments FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "rayyan_fee_invoices_service" ON rayyan_fee_invoices;
CREATE POLICY "rayyan_fee_invoices_service" ON rayyan_fee_invoices USING (auth.role() = 'service_role') WITH CHECK (true);
DROP POLICY IF EXISTS "rayyan_fee_payments_service" ON rayyan_fee_payments;
CREATE POLICY "rayyan_fee_payments_service" ON rayyan_fee_payments USING (auth.role() = 'service_role') WITH CHECK (true);
DROP POLICY IF EXISTS "rhythms_fee_invoices_service" ON rhythms_fee_invoices;
CREATE POLICY "rhythms_fee_invoices_service" ON rhythms_fee_invoices USING (auth.role() = 'service_role') WITH CHECK (true);
DROP POLICY IF EXISTS "rhythms_fee_payments_service" ON rhythms_fee_payments;
CREATE POLICY "rhythms_fee_payments_service" ON rhythms_fee_payments USING (auth.role() = 'service_role') WITH CHECK (true);

GRANT ALL ON TABLE rayyan_fee_invoices  TO service_role;
GRANT ALL ON TABLE rayyan_fee_payments  TO service_role;
GRANT ALL ON TABLE rhythms_fee_invoices TO service_role;
GRANT ALL ON TABLE rhythms_fee_payments TO service_role;
