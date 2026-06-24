-- Migration 027: Darul Swafa Madrassa — full school-admin module
-- Additive only. Mirrors the Ar Rayyan admin layer (migration 025) but tailored
-- for a madrassa: halaqa levels + Qur'an memorization (hifz) progress, and a
-- MANUAL fee model (invoices + payments + follow-ups) instead of SchoolPay,
-- because Darul Swafa collects fees directly (M-Pesa / cash / bank).
-- Run in the Supabase SQL editor. Idempotent — safe to re-run.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── GUARDIANS / PARENTS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS darul_guardians (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name                       TEXT NOT NULL,
  phone                           TEXT,
  email                           TEXT,
  relationship_to_child           TEXT NOT NULL DEFAULT '',
  preferred_communication_channel TEXT NOT NULL DEFAULT '',
  notes                           TEXT NOT NULL DEFAULT '',
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_darul_guardians_name ON darul_guardians(full_name);

-- ─── HALAQAS (classes) ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS darul_classes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  level      TEXT NOT NULL DEFAULT '',          -- halaqa / memorization level
  teacher_id UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,
  notes      TEXT NOT NULL DEFAULT '',
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── STUDENTS ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS darul_students (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name           TEXT NOT NULL,
  admission_number    TEXT,
  guardian_id         UUID REFERENCES darul_guardians(id) ON DELETE SET NULL,
  class_id            UUID REFERENCES darul_classes(id) ON DELETE SET NULL,
  halaqa_level        TEXT NOT NULL DEFAULT '',  -- e.g. Juz Amma, Nazira, Hifz
  hifz_juz_completed  INTEGER NOT NULL DEFAULT 0, -- juz memorized (0-30)
  current_surah       TEXT NOT NULL DEFAULT '',
  enrollment_status   TEXT NOT NULL DEFAULT 'enquiry',
  start_date          DATE,
  notes               TEXT NOT NULL DEFAULT '',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_darul_students_status ON darul_students(enrollment_status);
CREATE INDEX IF NOT EXISTS idx_darul_students_class ON darul_students(class_id);

-- ─── ADMISSIONS PIPELINE ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS darul_admissions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id           UUID REFERENCES darul_students(id) ON DELETE SET NULL,
  guardian_id          UUID REFERENCES darul_guardians(id) ON DELETE SET NULL,
  pipeline_status      TEXT NOT NULL DEFAULT 'New enquiry',
  source               TEXT NOT NULL DEFAULT '',
  tour_date            TIMESTAMPTZ,
  documents_status     TEXT NOT NULL DEFAULT 'pending',
  next_follow_up_date  DATE,
  notes                TEXT NOT NULL DEFAULT '',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_darul_admissions_status ON darul_admissions(pipeline_status);
CREATE INDEX IF NOT EXISTS idx_darul_admissions_followup ON darul_admissions(next_follow_up_date);

-- ─── HIFZ / QUR'AN MEMORIZATION PROGRESS ────────────────────────────────────
CREATE TABLE IF NOT EXISTS darul_hifz_progress (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   UUID REFERENCES darul_students(id) ON DELETE CASCADE,
  juz_number   INTEGER,                          -- 1..30
  surah        TEXT NOT NULL DEFAULT '',
  ayah_range   TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'in_progress', -- in_progress | memorized | revising
  assessed_on  DATE,
  assessor_id  UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,
  notes        TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_darul_hifz_student ON darul_hifz_progress(student_id);
CREATE INDEX IF NOT EXISTS idx_darul_hifz_status ON darul_hifz_progress(status);

-- ─── ATTENDANCE NOTES ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS darul_attendance_notes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      UUID REFERENCES darul_students(id) ON DELETE CASCADE,
  class_id        UUID REFERENCES darul_classes(id) ON DELETE SET NULL,
  attendance_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status          TEXT NOT NULL DEFAULT 'present',
  notes           TEXT NOT NULL DEFAULT '',
  created_by      TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_darul_attendance_student ON darul_attendance_notes(student_id);
CREATE INDEX IF NOT EXISTS idx_darul_attendance_date ON darul_attendance_notes(attendance_date DESC);

-- ─── MANUAL FEE MODEL — invoices + payments + follow-ups ────────────────────
-- Darul Swafa collects fees directly (not via SchoolPay). An invoice tracks what
-- is owed per term/fee item; payments (M-Pesa / cash / bank) are recorded against
-- an invoice and roll up into amount_paid_ksh. balance is generated.
CREATE TABLE IF NOT EXISTS darul_fee_invoices (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id          UUID REFERENCES darul_students(id) ON DELETE SET NULL,
  fee_item            TEXT NOT NULL DEFAULT 'Tuition',
  term                TEXT NOT NULL DEFAULT '',
  amount_expected_ksh NUMERIC(12, 2) NOT NULL DEFAULT 0,
  amount_paid_ksh     NUMERIC(12, 2) NOT NULL DEFAULT 0,
  balance_ksh         NUMERIC(12, 2) GENERATED ALWAYS AS (amount_expected_ksh - amount_paid_ksh) STORED,
  status              TEXT NOT NULL DEFAULT 'unpaid',  -- unpaid | partial | paid | waived
  due_date            DATE,
  notes               TEXT NOT NULL DEFAULT '',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_darul_fee_invoices_student ON darul_fee_invoices(student_id);
CREATE INDEX IF NOT EXISTS idx_darul_fee_invoices_status ON darul_fee_invoices(status);
CREATE INDEX IF NOT EXISTS idx_darul_fee_invoices_due ON darul_fee_invoices(due_date);

CREATE TABLE IF NOT EXISTS darul_fee_payments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id   UUID REFERENCES darul_fee_invoices(id) ON DELETE CASCADE,
  student_id   UUID REFERENCES darul_students(id) ON DELETE SET NULL,
  amount_ksh   NUMERIC(12, 2) NOT NULL DEFAULT 0,
  method       TEXT NOT NULL DEFAULT 'mpesa',   -- mpesa | cash | bank | other
  reference    TEXT NOT NULL DEFAULT '',         -- M-Pesa code / receipt no.
  paid_on      DATE NOT NULL DEFAULT CURRENT_DATE,
  recorded_by  TEXT NOT NULL DEFAULT '',
  notes        TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_darul_fee_payments_invoice ON darul_fee_payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_darul_fee_payments_student ON darul_fee_payments(student_id);
CREATE INDEX IF NOT EXISTS idx_darul_fee_payments_paid_on ON darul_fee_payments(paid_on DESC);

CREATE TABLE IF NOT EXISTS darul_fee_followups (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id             UUID REFERENCES darul_students(id) ON DELETE SET NULL,
  expected_fee_item      TEXT NOT NULL DEFAULT '',
  follow_up_status       TEXT NOT NULL DEFAULT 'pending',
  parent_contacted_date  DATE,
  last_known_fee_status  TEXT NOT NULL DEFAULT '',
  next_follow_up_date    DATE,
  notes                  TEXT NOT NULL DEFAULT '',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_darul_fee_followups_status ON darul_fee_followups(follow_up_status);
CREATE INDEX IF NOT EXISTS idx_darul_fee_followups_next ON darul_fee_followups(next_follow_up_date);

-- ─── ADMIN TASKS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS darul_admin_tasks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID REFERENCES darul_students(id) ON DELETE SET NULL,
  guardian_id UUID REFERENCES darul_guardians(id) ON DELETE SET NULL,
  ops_task_id TEXT REFERENCES ops_tasks(task_id) ON DELETE SET NULL,
  task_type   TEXT NOT NULL DEFAULT 'admin',
  title       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',
  priority    TEXT NOT NULL DEFAULT 'Medium',
  due_date    DATE,
  notes       TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_darul_admin_tasks_status ON darul_admin_tasks(status);
CREATE INDEX IF NOT EXISTS idx_darul_admin_tasks_due ON darul_admin_tasks(due_date);

-- ─── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE darul_guardians        ENABLE ROW LEVEL SECURITY;
ALTER TABLE darul_classes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE darul_students         ENABLE ROW LEVEL SECURITY;
ALTER TABLE darul_admissions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE darul_hifz_progress    ENABLE ROW LEVEL SECURITY;
ALTER TABLE darul_attendance_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE darul_fee_invoices     ENABLE ROW LEVEL SECURITY;
ALTER TABLE darul_fee_payments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE darul_fee_followups    ENABLE ROW LEVEL SECURITY;
ALTER TABLE darul_admin_tasks      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "darul_guardians_auth" ON darul_guardians;
CREATE POLICY "darul_guardians_auth" ON darul_guardians FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "darul_classes_auth" ON darul_classes;
CREATE POLICY "darul_classes_auth" ON darul_classes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "darul_students_auth" ON darul_students;
CREATE POLICY "darul_students_auth" ON darul_students FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "darul_admissions_auth" ON darul_admissions;
CREATE POLICY "darul_admissions_auth" ON darul_admissions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "darul_hifz_auth" ON darul_hifz_progress;
CREATE POLICY "darul_hifz_auth" ON darul_hifz_progress FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "darul_attendance_auth" ON darul_attendance_notes;
CREATE POLICY "darul_attendance_auth" ON darul_attendance_notes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "darul_fee_invoices_auth" ON darul_fee_invoices;
CREATE POLICY "darul_fee_invoices_auth" ON darul_fee_invoices FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "darul_fee_payments_auth" ON darul_fee_payments;
CREATE POLICY "darul_fee_payments_auth" ON darul_fee_payments FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "darul_fee_followups_auth" ON darul_fee_followups;
CREATE POLICY "darul_fee_followups_auth" ON darul_fee_followups FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "darul_admin_tasks_auth" ON darul_admin_tasks;
CREATE POLICY "darul_admin_tasks_auth" ON darul_admin_tasks FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "darul_guardians_service" ON darul_guardians;
CREATE POLICY "darul_guardians_service" ON darul_guardians USING (auth.role() = 'service_role') WITH CHECK (true);
DROP POLICY IF EXISTS "darul_classes_service" ON darul_classes;
CREATE POLICY "darul_classes_service" ON darul_classes USING (auth.role() = 'service_role') WITH CHECK (true);
DROP POLICY IF EXISTS "darul_students_service" ON darul_students;
CREATE POLICY "darul_students_service" ON darul_students USING (auth.role() = 'service_role') WITH CHECK (true);
DROP POLICY IF EXISTS "darul_admissions_service" ON darul_admissions;
CREATE POLICY "darul_admissions_service" ON darul_admissions USING (auth.role() = 'service_role') WITH CHECK (true);
DROP POLICY IF EXISTS "darul_hifz_service" ON darul_hifz_progress;
CREATE POLICY "darul_hifz_service" ON darul_hifz_progress USING (auth.role() = 'service_role') WITH CHECK (true);
DROP POLICY IF EXISTS "darul_attendance_service" ON darul_attendance_notes;
CREATE POLICY "darul_attendance_service" ON darul_attendance_notes USING (auth.role() = 'service_role') WITH CHECK (true);
DROP POLICY IF EXISTS "darul_fee_invoices_service" ON darul_fee_invoices;
CREATE POLICY "darul_fee_invoices_service" ON darul_fee_invoices USING (auth.role() = 'service_role') WITH CHECK (true);
DROP POLICY IF EXISTS "darul_fee_payments_service" ON darul_fee_payments;
CREATE POLICY "darul_fee_payments_service" ON darul_fee_payments USING (auth.role() = 'service_role') WITH CHECK (true);
DROP POLICY IF EXISTS "darul_fee_followups_service" ON darul_fee_followups;
CREATE POLICY "darul_fee_followups_service" ON darul_fee_followups USING (auth.role() = 'service_role') WITH CHECK (true);
DROP POLICY IF EXISTS "darul_admin_tasks_service" ON darul_admin_tasks;
CREATE POLICY "darul_admin_tasks_service" ON darul_admin_tasks USING (auth.role() = 'service_role') WITH CHECK (true);

-- ─── GRANTS ─────────────────────────────────────────────────────────────────
GRANT ALL ON TABLE darul_guardians        TO service_role;
GRANT ALL ON TABLE darul_classes          TO service_role;
GRANT ALL ON TABLE darul_students         TO service_role;
GRANT ALL ON TABLE darul_admissions       TO service_role;
GRANT ALL ON TABLE darul_hifz_progress    TO service_role;
GRANT ALL ON TABLE darul_attendance_notes TO service_role;
GRANT ALL ON TABLE darul_fee_invoices     TO service_role;
GRANT ALL ON TABLE darul_fee_payments     TO service_role;
GRANT ALL ON TABLE darul_fee_followups    TO service_role;
GRANT ALL ON TABLE darul_admin_tasks      TO service_role;
