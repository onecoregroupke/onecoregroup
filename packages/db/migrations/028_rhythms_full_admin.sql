-- Migration 028: Rhythms College — full admin parity with Ar Rayyan
-- Additive only. Brings Rhythms up to the same depth as the Rayyan admin layer:
-- guardians, admissions pipeline, classes, fee follow-ups, admin tasks, and
-- attendance — on top of the existing rhythms_students + SchoolPay reconciliation
-- (migration 026, which stays untouched). Rhythms keeps SchoolPay for fees.
-- Run in the Supabase SQL editor. Idempotent — safe to re-run.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── GUARDIANS ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rhythms_guardians (
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

CREATE INDEX IF NOT EXISTS idx_rhythms_guardians_name ON rhythms_guardians(full_name);

-- ─── CLASSES ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rhythms_classes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  level      TEXT NOT NULL DEFAULT '',
  teacher_id UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,
  notes      TEXT NOT NULL DEFAULT '',
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── LINK STUDENTS TO GUARDIAN + CLASS (additive columns) ───────────────────
ALTER TABLE rhythms_students ADD COLUMN IF NOT EXISTS guardian_id UUID REFERENCES rhythms_guardians(id) ON DELETE SET NULL;
ALTER TABLE rhythms_students ADD COLUMN IF NOT EXISTS class_id    UUID REFERENCES rhythms_classes(id) ON DELETE SET NULL;

-- ─── ADMISSIONS PIPELINE ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rhythms_admissions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id           UUID REFERENCES rhythms_students(id) ON DELETE SET NULL,
  guardian_id          UUID REFERENCES rhythms_guardians(id) ON DELETE SET NULL,
  pipeline_status      TEXT NOT NULL DEFAULT 'New enquiry',
  source               TEXT NOT NULL DEFAULT '',
  tour_date            TIMESTAMPTZ,
  documents_status     TEXT NOT NULL DEFAULT 'pending',
  schoolpay_status     TEXT NOT NULL DEFAULT 'unknown',
  next_follow_up_date  DATE,
  notes                TEXT NOT NULL DEFAULT '',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rhythms_admissions_status ON rhythms_admissions(pipeline_status);
CREATE INDEX IF NOT EXISTS idx_rhythms_admissions_followup ON rhythms_admissions(next_follow_up_date);

-- ─── FEE FOLLOW-UPS (around SchoolPay) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS rhythms_fee_followups (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id             UUID REFERENCES rhythms_students(id) ON DELETE SET NULL,
  schoolpay_code         TEXT NOT NULL DEFAULT '',
  expected_fee_item      TEXT NOT NULL DEFAULT '',
  follow_up_status       TEXT NOT NULL DEFAULT 'pending',
  parent_contacted_date  DATE,
  last_known_fee_status  TEXT NOT NULL DEFAULT '',
  next_follow_up_date    DATE,
  notes                  TEXT NOT NULL DEFAULT '',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rhythms_fee_followups_status ON rhythms_fee_followups(follow_up_status);
CREATE INDEX IF NOT EXISTS idx_rhythms_fee_followups_next ON rhythms_fee_followups(next_follow_up_date);

-- ─── ATTENDANCE NOTES ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rhythms_attendance_notes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      UUID REFERENCES rhythms_students(id) ON DELETE CASCADE,
  class_id        UUID REFERENCES rhythms_classes(id) ON DELETE SET NULL,
  attendance_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status          TEXT NOT NULL DEFAULT 'present',
  notes           TEXT NOT NULL DEFAULT '',
  created_by      TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rhythms_attendance_student ON rhythms_attendance_notes(student_id);
CREATE INDEX IF NOT EXISTS idx_rhythms_attendance_date ON rhythms_attendance_notes(attendance_date DESC);

-- ─── ADMIN TASKS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rhythms_admin_tasks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID REFERENCES rhythms_students(id) ON DELETE SET NULL,
  guardian_id UUID REFERENCES rhythms_guardians(id) ON DELETE SET NULL,
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

CREATE INDEX IF NOT EXISTS idx_rhythms_admin_tasks_status ON rhythms_admin_tasks(status);
CREATE INDEX IF NOT EXISTS idx_rhythms_admin_tasks_due ON rhythms_admin_tasks(due_date);

-- ─── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE rhythms_guardians        ENABLE ROW LEVEL SECURITY;
ALTER TABLE rhythms_classes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE rhythms_admissions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE rhythms_fee_followups    ENABLE ROW LEVEL SECURITY;
ALTER TABLE rhythms_attendance_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE rhythms_admin_tasks      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rhythms_guardians_auth" ON rhythms_guardians;
CREATE POLICY "rhythms_guardians_auth" ON rhythms_guardians FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "rhythms_classes_auth" ON rhythms_classes;
CREATE POLICY "rhythms_classes_auth" ON rhythms_classes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "rhythms_admissions_auth" ON rhythms_admissions;
CREATE POLICY "rhythms_admissions_auth" ON rhythms_admissions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "rhythms_fee_followups_auth" ON rhythms_fee_followups;
CREATE POLICY "rhythms_fee_followups_auth" ON rhythms_fee_followups FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "rhythms_attendance_auth" ON rhythms_attendance_notes;
CREATE POLICY "rhythms_attendance_auth" ON rhythms_attendance_notes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "rhythms_admin_tasks_auth" ON rhythms_admin_tasks;
CREATE POLICY "rhythms_admin_tasks_auth" ON rhythms_admin_tasks FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "rhythms_guardians_service" ON rhythms_guardians;
CREATE POLICY "rhythms_guardians_service" ON rhythms_guardians USING (auth.role() = 'service_role') WITH CHECK (true);
DROP POLICY IF EXISTS "rhythms_classes_service" ON rhythms_classes;
CREATE POLICY "rhythms_classes_service" ON rhythms_classes USING (auth.role() = 'service_role') WITH CHECK (true);
DROP POLICY IF EXISTS "rhythms_admissions_service" ON rhythms_admissions;
CREATE POLICY "rhythms_admissions_service" ON rhythms_admissions USING (auth.role() = 'service_role') WITH CHECK (true);
DROP POLICY IF EXISTS "rhythms_fee_followups_service" ON rhythms_fee_followups;
CREATE POLICY "rhythms_fee_followups_service" ON rhythms_fee_followups USING (auth.role() = 'service_role') WITH CHECK (true);
DROP POLICY IF EXISTS "rhythms_attendance_service" ON rhythms_attendance_notes;
CREATE POLICY "rhythms_attendance_service" ON rhythms_attendance_notes USING (auth.role() = 'service_role') WITH CHECK (true);
DROP POLICY IF EXISTS "rhythms_admin_tasks_service" ON rhythms_admin_tasks;
CREATE POLICY "rhythms_admin_tasks_service" ON rhythms_admin_tasks USING (auth.role() = 'service_role') WITH CHECK (true);

-- ─── GRANTS ─────────────────────────────────────────────────────────────────
GRANT ALL ON TABLE rhythms_guardians        TO service_role;
GRANT ALL ON TABLE rhythms_classes          TO service_role;
GRANT ALL ON TABLE rhythms_admissions       TO service_role;
GRANT ALL ON TABLE rhythms_fee_followups    TO service_role;
GRANT ALL ON TABLE rhythms_attendance_notes TO service_role;
GRANT ALL ON TABLE rhythms_admin_tasks      TO service_role;
