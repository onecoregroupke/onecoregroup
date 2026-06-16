-- Migration 025: One Core Management OS foundation
-- Additive only. Extends Ops Hub into a management cockpit, NPT service OS,
-- and Ar Rayyan SchoolPay-complementary admin layer without changing existing
-- Ops/Marketing production tables.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── MANAGEMENT CONTROL LAYER ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ocg_approvals (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id           UUID REFERENCES brands(id) ON DELETE SET NULL,
  related_task_id    TEXT REFERENCES ops_tasks(task_id) ON DELETE SET NULL,
  related_project_id TEXT REFERENCES ops_projects(project_id) ON DELETE SET NULL,
  approval_type      TEXT NOT NULL DEFAULT 'general',
  title              TEXT NOT NULL,
  description        TEXT NOT NULL DEFAULT '',
  requested_by       TEXT NOT NULL DEFAULT '',
  approver_id        UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,
  status             TEXT NOT NULL DEFAULT 'pending',
  priority           TEXT NOT NULL DEFAULT 'Medium',
  due_date           TEXT,
  decision_notes     TEXT NOT NULL DEFAULT '',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ocg_approvals_brand ON ocg_approvals(brand_id);
CREATE INDEX IF NOT EXISTS idx_ocg_approvals_status ON ocg_approvals(status);
CREATE INDEX IF NOT EXISTS idx_ocg_approvals_due ON ocg_approvals(due_date);

CREATE TABLE IF NOT EXISTS ocg_blockers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id            UUID REFERENCES brands(id) ON DELETE SET NULL,
  task_id             TEXT REFERENCES ops_tasks(task_id) ON DELETE SET NULL,
  project_id          TEXT REFERENCES ops_projects(project_id) ON DELETE SET NULL,
  title               TEXT NOT NULL,
  description         TEXT NOT NULL DEFAULT '',
  blocker_type        TEXT NOT NULL DEFAULT 'operational',
  severity            TEXT NOT NULL DEFAULT 'Medium',
  owner_id            UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,
  escalation_owner_id UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,
  status              TEXT NOT NULL DEFAULT 'open',
  next_action         TEXT NOT NULL DEFAULT '',
  blocked_since       DATE NOT NULL DEFAULT CURRENT_DATE,
  resolved_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ocg_blockers_brand ON ocg_blockers(brand_id);
CREATE INDEX IF NOT EXISTS idx_ocg_blockers_status ON ocg_blockers(status);
CREATE INDEX IF NOT EXISTS idx_ocg_blockers_severity ON ocg_blockers(severity);

CREATE TABLE IF NOT EXISTS ocg_meetings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id     UUID REFERENCES brands(id) ON DELETE SET NULL,
  title        TEXT NOT NULL,
  meeting_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  attendees    TEXT[] NOT NULL DEFAULT '{}',
  notes        TEXT NOT NULL DEFAULT '',
  summary      TEXT NOT NULL DEFAULT '',
  created_by   TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ocg_meetings_brand ON ocg_meetings(brand_id);
CREATE INDEX IF NOT EXISTS idx_ocg_meetings_date ON ocg_meetings(meeting_date DESC);

CREATE TABLE IF NOT EXISTS ocg_decisions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id   UUID REFERENCES brands(id) ON DELETE SET NULL,
  project_id TEXT REFERENCES ops_projects(project_id) ON DELETE SET NULL,
  meeting_id UUID REFERENCES ocg_meetings(id) ON DELETE SET NULL,
  title      TEXT NOT NULL,
  decision   TEXT NOT NULL DEFAULT '',
  owner_id   UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,
  due_date   TEXT,
  status     TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ocg_decisions_brand ON ocg_decisions(brand_id);
CREATE INDEX IF NOT EXISTS idx_ocg_decisions_status ON ocg_decisions(status);

CREATE TABLE IF NOT EXISTS ocg_recurring_tasks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id            UUID REFERENCES brands(id) ON DELETE SET NULL,
  title               TEXT NOT NULL,
  description         TEXT NOT NULL DEFAULT '',
  recurrence_rule     TEXT NOT NULL DEFAULT '',
  default_assignee_id UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,
  department          TEXT NOT NULL DEFAULT 'Operations',
  priority            TEXT NOT NULL DEFAULT 'Medium',
  next_run_at         TIMESTAMPTZ,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ocg_recurring_brand ON ocg_recurring_tasks(brand_id);
CREATE INDEX IF NOT EXISTS idx_ocg_recurring_next_run ON ocg_recurring_tasks(next_run_at) WHERE is_active = true;

-- ─── NPT SERVICE OS ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS npt_customers (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name                       TEXT NOT NULL,
  phone                           TEXT,
  email                           TEXT,
  location                        TEXT NOT NULL DEFAULT '',
  area_estate                     TEXT NOT NULL DEFAULT '',
  customer_type                   TEXT NOT NULL DEFAULT 'home',
  lead_source                     TEXT NOT NULL DEFAULT '',
  preferred_communication_channel TEXT NOT NULL DEFAULT '',
  notes                           TEXT NOT NULL DEFAULT '',
  last_contacted_at               DATE,
  next_follow_up_date             DATE,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_npt_customers_name ON npt_customers(full_name);
CREATE INDEX IF NOT EXISTS idx_npt_customers_followup ON npt_customers(next_follow_up_date);

CREATE TABLE IF NOT EXISTS npt_pianos (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id                   UUID REFERENCES npt_customers(id) ON DELETE CASCADE,
  make                          TEXT NOT NULL DEFAULT '',
  model                         TEXT,
  serial_number                 TEXT,
  piano_type                    TEXT NOT NULL DEFAULT 'upright',
  location                      TEXT NOT NULL DEFAULT '',
  condition                     TEXT NOT NULL DEFAULT '',
  last_tuning_date              DATE,
  last_repair_date              DATE,
  recommended_next_service_date DATE,
  media_urls                    TEXT[] NOT NULL DEFAULT '{}',
  technician_notes              TEXT NOT NULL DEFAULT '',
  sales_status                  TEXT NOT NULL DEFAULT 'not_for_sale',
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_npt_pianos_customer ON npt_pianos(customer_id);
CREATE INDEX IF NOT EXISTS idx_npt_pianos_next_service ON npt_pianos(recommended_next_service_date);

CREATE TABLE IF NOT EXISTS npt_service_jobs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id           UUID REFERENCES npt_customers(id) ON DELETE SET NULL,
  piano_id              UUID REFERENCES npt_pianos(id) ON DELETE SET NULL,
  ops_task_id           TEXT REFERENCES ops_tasks(task_id) ON DELETE SET NULL,
  service_type          TEXT NOT NULL DEFAULT 'tuning',
  requested_date        DATE,
  scheduled_at          TIMESTAMPTZ,
  technician_id         UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,
  location              TEXT NOT NULL DEFAULT '',
  job_notes             TEXT NOT NULL DEFAULT '',
  internal_notes        TEXT NOT NULL DEFAULT '',
  customer_facing_notes TEXT NOT NULL DEFAULT '',
  status                TEXT NOT NULL DEFAULT 'New enquiry',
  priority              TEXT NOT NULL DEFAULT 'Medium',
  estimated_cost_ksh    NUMERIC(12, 2),
  final_cost_ksh        NUMERIC(12, 2),
  required_tools        TEXT[] NOT NULL DEFAULT '{}',
  completion_summary    TEXT NOT NULL DEFAULT '',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_npt_jobs_status ON npt_service_jobs(status);
CREATE INDEX IF NOT EXISTS idx_npt_jobs_schedule ON npt_service_jobs(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_npt_jobs_technician ON npt_service_jobs(technician_id);

CREATE TABLE IF NOT EXISTS npt_service_history (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id        UUID REFERENCES npt_customers(id) ON DELETE SET NULL,
  piano_id           UUID REFERENCES npt_pianos(id) ON DELETE SET NULL,
  service_job_id     UUID REFERENCES npt_service_jobs(id) ON DELETE SET NULL,
  technician_id      UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,
  service_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  work_done          TEXT NOT NULL DEFAULT '',
  recommendations    TEXT NOT NULL DEFAULT '',
  next_service_date  DATE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_npt_history_piano ON npt_service_history(piano_id);
CREATE INDEX IF NOT EXISTS idx_npt_history_service_date ON npt_service_history(service_date DESC);

CREATE TABLE IF NOT EXISTS npt_quote_invoice_records (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id        UUID REFERENCES npt_customers(id) ON DELETE SET NULL,
  service_job_id     UUID REFERENCES npt_service_jobs(id) ON DELETE SET NULL,
  record_type        TEXT NOT NULL DEFAULT 'quote',
  quote_amount_ksh   NUMERIC(12, 2),
  invoice_amount_ksh NUMERIC(12, 2),
  status             TEXT NOT NULL DEFAULT 'draft',
  payment_status     TEXT NOT NULL DEFAULT 'unpaid',
  sent_date          DATE,
  paid_date          DATE,
  notes              TEXT NOT NULL DEFAULT '',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_npt_quote_invoice_job ON npt_quote_invoice_records(service_job_id);
CREATE INDEX IF NOT EXISTS idx_npt_quote_invoice_status ON npt_quote_invoice_records(status);

CREATE TABLE IF NOT EXISTS npt_reminders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     UUID REFERENCES npt_customers(id) ON DELETE SET NULL,
  piano_id        UUID REFERENCES npt_pianos(id) ON DELETE SET NULL,
  service_job_id  UUID REFERENCES npt_service_jobs(id) ON DELETE SET NULL,
  reminder_type   TEXT NOT NULL DEFAULT 'follow_up',
  title           TEXT NOT NULL,
  due_at          TIMESTAMPTZ,
  channel         TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'pending',
  notes           TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_npt_reminders_due ON npt_reminders(due_at);
CREATE INDEX IF NOT EXISTS idx_npt_reminders_status ON npt_reminders(status);

-- ─── AR RAYYAN ADMIN + SCHOOLPAY RECONCILIATION ─────────────────────────────
CREATE TABLE IF NOT EXISTS rayyan_guardians (
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

CREATE INDEX IF NOT EXISTS idx_rayyan_guardians_name ON rayyan_guardians(full_name);

CREATE TABLE IF NOT EXISTS rayyan_students (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name              TEXT NOT NULL,
  admission_number       TEXT,
  schoolpay_code         TEXT,
  class_level            TEXT NOT NULL DEFAULT '',
  guardian_id            UUID REFERENCES rayyan_guardians(id) ON DELETE SET NULL,
  enrollment_status      TEXT NOT NULL DEFAULT 'enquiry',
  start_date             DATE,
  notes                  TEXT NOT NULL DEFAULT '',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rayyan_students_status ON rayyan_students(enrollment_status);
CREATE INDEX IF NOT EXISTS idx_rayyan_students_code ON rayyan_students(schoolpay_code);

CREATE TABLE IF NOT EXISTS rayyan_admissions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id           UUID REFERENCES rayyan_students(id) ON DELETE SET NULL,
  guardian_id          UUID REFERENCES rayyan_guardians(id) ON DELETE SET NULL,
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

CREATE INDEX IF NOT EXISTS idx_rayyan_admissions_status ON rayyan_admissions(pipeline_status);
CREATE INDEX IF NOT EXISTS idx_rayyan_admissions_followup ON rayyan_admissions(next_follow_up_date);

CREATE TABLE IF NOT EXISTS rayyan_fee_followups (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id             UUID REFERENCES rayyan_students(id) ON DELETE SET NULL,
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

CREATE INDEX IF NOT EXISTS idx_rayyan_fee_followups_status ON rayyan_fee_followups(follow_up_status);
CREATE INDEX IF NOT EXISTS idx_rayyan_fee_followups_next ON rayyan_fee_followups(next_follow_up_date);

CREATE TABLE IF NOT EXISTS rayyan_schoolpay_import_batches (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_label   TEXT NOT NULL DEFAULT 'SchoolPay export',
  imported_by    TEXT NOT NULL DEFAULT '',
  imported_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  row_count      INTEGER NOT NULL DEFAULT 0,
  notes          TEXT NOT NULL DEFAULT '',
  metadata       JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS rayyan_schoolpay_payment_snapshots (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id           UUID REFERENCES rayyan_schoolpay_import_batches(id) ON DELETE CASCADE,
  student_id         UUID REFERENCES rayyan_students(id) ON DELETE SET NULL,
  schoolpay_code     TEXT NOT NULL DEFAULT '',
  admission_number   TEXT NOT NULL DEFAULT '',
  student_name       TEXT NOT NULL DEFAULT '',
  fee_item           TEXT NOT NULL DEFAULT '',
  amount_expected_ksh NUMERIC(12, 2),
  amount_paid_ksh     NUMERIC(12, 2),
  balance_ksh         NUMERIC(12, 2),
  payment_status      TEXT NOT NULL DEFAULT '',
  raw_payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  captured_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rayyan_schoolpay_code ON rayyan_schoolpay_payment_snapshots(schoolpay_code);
CREATE INDEX IF NOT EXISTS idx_rayyan_schoolpay_batch ON rayyan_schoolpay_payment_snapshots(batch_id);

CREATE TABLE IF NOT EXISTS rayyan_classes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  level      TEXT NOT NULL DEFAULT '',
  teacher_id UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,
  notes      TEXT NOT NULL DEFAULT '',
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rayyan_attendance_notes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      UUID REFERENCES rayyan_students(id) ON DELETE CASCADE,
  class_id        UUID REFERENCES rayyan_classes(id) ON DELETE SET NULL,
  attendance_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status          TEXT NOT NULL DEFAULT 'present',
  notes           TEXT NOT NULL DEFAULT '',
  created_by      TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rayyan_attendance_student ON rayyan_attendance_notes(student_id);
CREATE INDEX IF NOT EXISTS idx_rayyan_attendance_date ON rayyan_attendance_notes(attendance_date DESC);

CREATE TABLE IF NOT EXISTS rayyan_admin_tasks (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id          UUID REFERENCES rayyan_students(id) ON DELETE SET NULL,
  guardian_id         UUID REFERENCES rayyan_guardians(id) ON DELETE SET NULL,
  ops_task_id         TEXT REFERENCES ops_tasks(task_id) ON DELETE SET NULL,
  task_type           TEXT NOT NULL DEFAULT 'admin',
  title               TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending',
  priority            TEXT NOT NULL DEFAULT 'Medium',
  due_date            DATE,
  notes               TEXT NOT NULL DEFAULT '',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rayyan_admin_tasks_status ON rayyan_admin_tasks(status);
CREATE INDEX IF NOT EXISTS idx_rayyan_admin_tasks_due ON rayyan_admin_tasks(due_date);

-- ─── RLS + GRANTS ───────────────────────────────────────────────────────────
ALTER TABLE ocg_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocg_blockers ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocg_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocg_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocg_recurring_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE npt_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE npt_pianos ENABLE ROW LEVEL SECURITY;
ALTER TABLE npt_service_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE npt_service_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE npt_quote_invoice_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE npt_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE rayyan_guardians ENABLE ROW LEVEL SECURITY;
ALTER TABLE rayyan_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE rayyan_admissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rayyan_fee_followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE rayyan_schoolpay_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE rayyan_schoolpay_payment_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE rayyan_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE rayyan_attendance_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE rayyan_admin_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ocg_approvals_auth" ON ocg_approvals FOR SELECT TO authenticated USING (true);
CREATE POLICY "ocg_blockers_auth" ON ocg_blockers FOR SELECT TO authenticated USING (true);
CREATE POLICY "ocg_meetings_auth" ON ocg_meetings FOR SELECT TO authenticated USING (true);
CREATE POLICY "ocg_decisions_auth" ON ocg_decisions FOR SELECT TO authenticated USING (true);
CREATE POLICY "ocg_recurring_auth" ON ocg_recurring_tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "npt_customers_auth" ON npt_customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "npt_pianos_auth" ON npt_pianos FOR SELECT TO authenticated USING (true);
CREATE POLICY "npt_jobs_auth" ON npt_service_jobs FOR SELECT TO authenticated USING (true);
CREATE POLICY "npt_history_auth" ON npt_service_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "npt_quote_invoice_auth" ON npt_quote_invoice_records FOR SELECT TO authenticated USING (true);
CREATE POLICY "npt_reminders_auth" ON npt_reminders FOR SELECT TO authenticated USING (true);
CREATE POLICY "rayyan_guardians_auth" ON rayyan_guardians FOR SELECT TO authenticated USING (true);
CREATE POLICY "rayyan_students_auth" ON rayyan_students FOR SELECT TO authenticated USING (true);
CREATE POLICY "rayyan_admissions_auth" ON rayyan_admissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "rayyan_fee_followups_auth" ON rayyan_fee_followups FOR SELECT TO authenticated USING (true);
CREATE POLICY "rayyan_schoolpay_batches_auth" ON rayyan_schoolpay_import_batches FOR SELECT TO authenticated USING (true);
CREATE POLICY "rayyan_schoolpay_snapshots_auth" ON rayyan_schoolpay_payment_snapshots FOR SELECT TO authenticated USING (true);
CREATE POLICY "rayyan_classes_auth" ON rayyan_classes FOR SELECT TO authenticated USING (true);
CREATE POLICY "rayyan_attendance_auth" ON rayyan_attendance_notes FOR SELECT TO authenticated USING (true);
CREATE POLICY "rayyan_admin_tasks_auth" ON rayyan_admin_tasks FOR SELECT TO authenticated USING (true);

CREATE POLICY "ocg_approvals_service" ON ocg_approvals USING (auth.role() = 'service_role') WITH CHECK (true);
CREATE POLICY "ocg_blockers_service" ON ocg_blockers USING (auth.role() = 'service_role') WITH CHECK (true);
CREATE POLICY "ocg_meetings_service" ON ocg_meetings USING (auth.role() = 'service_role') WITH CHECK (true);
CREATE POLICY "ocg_decisions_service" ON ocg_decisions USING (auth.role() = 'service_role') WITH CHECK (true);
CREATE POLICY "ocg_recurring_service" ON ocg_recurring_tasks USING (auth.role() = 'service_role') WITH CHECK (true);
CREATE POLICY "npt_customers_service" ON npt_customers USING (auth.role() = 'service_role') WITH CHECK (true);
CREATE POLICY "npt_pianos_service" ON npt_pianos USING (auth.role() = 'service_role') WITH CHECK (true);
CREATE POLICY "npt_jobs_service" ON npt_service_jobs USING (auth.role() = 'service_role') WITH CHECK (true);
CREATE POLICY "npt_history_service" ON npt_service_history USING (auth.role() = 'service_role') WITH CHECK (true);
CREATE POLICY "npt_quote_invoice_service" ON npt_quote_invoice_records USING (auth.role() = 'service_role') WITH CHECK (true);
CREATE POLICY "npt_reminders_service" ON npt_reminders USING (auth.role() = 'service_role') WITH CHECK (true);
CREATE POLICY "rayyan_guardians_service" ON rayyan_guardians USING (auth.role() = 'service_role') WITH CHECK (true);
CREATE POLICY "rayyan_students_service" ON rayyan_students USING (auth.role() = 'service_role') WITH CHECK (true);
CREATE POLICY "rayyan_admissions_service" ON rayyan_admissions USING (auth.role() = 'service_role') WITH CHECK (true);
CREATE POLICY "rayyan_fee_followups_service" ON rayyan_fee_followups USING (auth.role() = 'service_role') WITH CHECK (true);
CREATE POLICY "rayyan_schoolpay_batches_service" ON rayyan_schoolpay_import_batches USING (auth.role() = 'service_role') WITH CHECK (true);
CREATE POLICY "rayyan_schoolpay_snapshots_service" ON rayyan_schoolpay_payment_snapshots USING (auth.role() = 'service_role') WITH CHECK (true);
CREATE POLICY "rayyan_classes_service" ON rayyan_classes USING (auth.role() = 'service_role') WITH CHECK (true);
CREATE POLICY "rayyan_attendance_service" ON rayyan_attendance_notes USING (auth.role() = 'service_role') WITH CHECK (true);
CREATE POLICY "rayyan_admin_tasks_service" ON rayyan_admin_tasks USING (auth.role() = 'service_role') WITH CHECK (true);

GRANT ALL ON TABLE ocg_approvals TO service_role;
GRANT ALL ON TABLE ocg_blockers TO service_role;
GRANT ALL ON TABLE ocg_meetings TO service_role;
GRANT ALL ON TABLE ocg_decisions TO service_role;
GRANT ALL ON TABLE ocg_recurring_tasks TO service_role;
GRANT ALL ON TABLE npt_customers TO service_role;
GRANT ALL ON TABLE npt_pianos TO service_role;
GRANT ALL ON TABLE npt_service_jobs TO service_role;
GRANT ALL ON TABLE npt_service_history TO service_role;
GRANT ALL ON TABLE npt_quote_invoice_records TO service_role;
GRANT ALL ON TABLE npt_reminders TO service_role;
GRANT ALL ON TABLE rayyan_guardians TO service_role;
GRANT ALL ON TABLE rayyan_students TO service_role;
GRANT ALL ON TABLE rayyan_admissions TO service_role;
GRANT ALL ON TABLE rayyan_fee_followups TO service_role;
GRANT ALL ON TABLE rayyan_schoolpay_import_batches TO service_role;
GRANT ALL ON TABLE rayyan_schoolpay_payment_snapshots TO service_role;
GRANT ALL ON TABLE rayyan_classes TO service_role;
GRANT ALL ON TABLE rayyan_attendance_notes TO service_role;
GRANT ALL ON TABLE rayyan_admin_tasks TO service_role;
