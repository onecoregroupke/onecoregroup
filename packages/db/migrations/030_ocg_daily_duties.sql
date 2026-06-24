-- Migration 030: Daily duties per individual
-- Additive only. Lets the manager set up recurring daily duties per team member
-- and track per-day completion, so progress is visible and the duties can be
-- rolled into each person's daily update.
-- Run in the Supabase SQL editor. Idempotent — safe to re-run.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── DUTY TEMPLATES (one row per recurring daily duty for a person) ──────────
CREATE TABLE IF NOT EXISTS ocg_daily_duties (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignee_id UUID REFERENCES ops_team_members(id) ON DELETE CASCADE,
  brand_id    UUID REFERENCES brands(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  department  TEXT NOT NULL DEFAULT 'Operations',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ocg_daily_duties_assignee ON ocg_daily_duties(assignee_id);
CREATE INDEX IF NOT EXISTS idx_ocg_daily_duties_active ON ocg_daily_duties(active);

-- ─── DAILY LOGS (one row per duty per day, capturing completion) ────────────
CREATE TABLE IF NOT EXISTS ocg_daily_duty_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  duty_id      UUID NOT NULL REFERENCES ocg_daily_duties(id) ON DELETE CASCADE,
  assignee_id  UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,
  duty_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  status       TEXT NOT NULL DEFAULT 'done',  -- done | skipped | pending
  note         TEXT NOT NULL DEFAULT '',
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (duty_id, duty_date)
);

CREATE INDEX IF NOT EXISTS idx_ocg_duty_logs_duty ON ocg_daily_duty_logs(duty_id);
CREATE INDEX IF NOT EXISTS idx_ocg_duty_logs_date ON ocg_daily_duty_logs(duty_date DESC);
CREATE INDEX IF NOT EXISTS idx_ocg_duty_logs_assignee ON ocg_daily_duty_logs(assignee_id);

-- ─── RLS + GRANTS ───────────────────────────────────────────────────────────
ALTER TABLE ocg_daily_duties     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocg_daily_duty_logs  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ocg_daily_duties_auth" ON ocg_daily_duties;
CREATE POLICY "ocg_daily_duties_auth" ON ocg_daily_duties FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "ocg_duty_logs_auth" ON ocg_daily_duty_logs;
CREATE POLICY "ocg_duty_logs_auth" ON ocg_daily_duty_logs FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "ocg_daily_duties_service" ON ocg_daily_duties;
CREATE POLICY "ocg_daily_duties_service" ON ocg_daily_duties USING (auth.role() = 'service_role') WITH CHECK (true);
DROP POLICY IF EXISTS "ocg_duty_logs_service" ON ocg_daily_duty_logs;
CREATE POLICY "ocg_duty_logs_service" ON ocg_daily_duty_logs USING (auth.role() = 'service_role') WITH CHECK (true);

GRANT ALL ON TABLE ocg_daily_duties    TO service_role;
GRANT ALL ON TABLE ocg_daily_duty_logs TO service_role;
