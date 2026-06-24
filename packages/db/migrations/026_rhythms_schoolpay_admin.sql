-- Migration 026: Rhythms College admin + SchoolPay reconciliation
-- Additive only. Keeps Rhythms student/fee reconciliation separate from Rayyan.

CREATE TABLE IF NOT EXISTS rhythms_students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  admission_number TEXT,
  schoolpay_code TEXT,
  programme TEXT NOT NULL DEFAULT '',
  cohort TEXT NOT NULL DEFAULT '',
  guardian_name TEXT,
  phone TEXT,
  email TEXT,
  enrollment_status TEXT NOT NULL DEFAULT 'enquiry',
  start_date DATE,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rhythms_students_status ON rhythms_students(enrollment_status);
CREATE INDEX IF NOT EXISTS idx_rhythms_students_schoolpay ON rhythms_students(schoolpay_code);
CREATE INDEX IF NOT EXISTS idx_rhythms_students_admission ON rhythms_students(admission_number);

CREATE TABLE IF NOT EXISTS rhythms_schoolpay_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_label TEXT NOT NULL DEFAULT 'SchoolPay export',
  imported_by TEXT NOT NULL DEFAULT 'system',
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  row_count INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS rhythms_schoolpay_payment_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID REFERENCES rhythms_schoolpay_import_batches(id) ON DELETE CASCADE,
  student_id UUID REFERENCES rhythms_students(id) ON DELETE SET NULL,
  schoolpay_code TEXT NOT NULL DEFAULT '',
  admission_number TEXT NOT NULL DEFAULT '',
  student_name TEXT NOT NULL DEFAULT '',
  fee_item TEXT NOT NULL DEFAULT '',
  amount_expected_ksh NUMERIC(12,2),
  amount_paid_ksh NUMERIC(12,2),
  balance_ksh NUMERIC(12,2),
  payment_status TEXT NOT NULL DEFAULT 'unknown',
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rhythms_schoolpay_code ON rhythms_schoolpay_payment_snapshots(schoolpay_code);
CREATE INDEX IF NOT EXISTS idx_rhythms_schoolpay_student ON rhythms_schoolpay_payment_snapshots(student_id);
CREATE INDEX IF NOT EXISTS idx_rhythms_schoolpay_batch ON rhythms_schoolpay_payment_snapshots(batch_id);
CREATE INDEX IF NOT EXISTS idx_rhythms_schoolpay_status ON rhythms_schoolpay_payment_snapshots(payment_status);

ALTER TABLE rhythms_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE rhythms_schoolpay_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE rhythms_schoolpay_payment_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rhythms_students_auth" ON rhythms_students;
CREATE POLICY "rhythms_students_auth" ON rhythms_students FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "rhythms_batches_auth" ON rhythms_schoolpay_import_batches;
CREATE POLICY "rhythms_batches_auth" ON rhythms_schoolpay_import_batches FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "rhythms_snapshots_auth" ON rhythms_schoolpay_payment_snapshots;
CREATE POLICY "rhythms_snapshots_auth" ON rhythms_schoolpay_payment_snapshots FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "rhythms_students_service" ON rhythms_students;
CREATE POLICY "rhythms_students_service" ON rhythms_students USING (auth.role() = 'service_role') WITH CHECK (true);
DROP POLICY IF EXISTS "rhythms_batches_service" ON rhythms_schoolpay_import_batches;
CREATE POLICY "rhythms_batches_service" ON rhythms_schoolpay_import_batches USING (auth.role() = 'service_role') WITH CHECK (true);
DROP POLICY IF EXISTS "rhythms_snapshots_service" ON rhythms_schoolpay_payment_snapshots;
CREATE POLICY "rhythms_snapshots_service" ON rhythms_schoolpay_payment_snapshots USING (auth.role() = 'service_role') WITH CHECK (true);

GRANT ALL ON TABLE rhythms_students TO service_role;
GRANT ALL ON TABLE rhythms_schoolpay_import_batches TO service_role;
GRANT ALL ON TABLE rhythms_schoolpay_payment_snapshots TO service_role;
