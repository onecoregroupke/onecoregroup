-- Migration 041: NPT client communications + richer client details
-- Additive only. Supports the appointment communication loop:
--   - richer client contact details (secondary phone, physical address,
--     auto-reminder opt-out)
--   - npt_comm_logs: every automated email/notification sent about an
--     appointment (confirmation, T-3d / T-1d / day-of reminders, technician
--     notices) is logged here — the reminder cron uses it to never send the
--     same reminder twice.
-- Run in the Supabase SQL editor. Idempotent — safe to re-run.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── Client enrichments ──────────────────────────────────────────────────────
ALTER TABLE npt_customers ADD COLUMN IF NOT EXISTS secondary_phone     TEXT NOT NULL DEFAULT '';
ALTER TABLE npt_customers ADD COLUMN IF NOT EXISTS address             TEXT NOT NULL DEFAULT '';
ALTER TABLE npt_customers ADD COLUMN IF NOT EXISTS city                TEXT NOT NULL DEFAULT 'Nairobi';
ALTER TABLE npt_customers ADD COLUMN IF NOT EXISTS send_auto_reminders BOOLEAN NOT NULL DEFAULT true;

-- ─── Communication log (dedupe + audit for automated comms) ─────────────────
CREATE TABLE IF NOT EXISTS npt_comm_logs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID REFERENCES npt_appointments(id) ON DELETE CASCADE,
  customer_id    UUID REFERENCES npt_customers(id) ON DELETE SET NULL,
  -- confirmation | reminder_3d | reminder_1d | reminder_day | tech_assigned |
  -- tech_reminder_1d | tech_reminder_day
  kind           TEXT NOT NULL,
  channel        TEXT NOT NULL DEFAULT 'email',   -- email | portal
  recipient      TEXT NOT NULL DEFAULT '',
  subject        TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'sent',    -- sent | failed | skipped
  detail         TEXT NOT NULL DEFAULT '',
  sent_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_npt_comm_logs_appt ON npt_comm_logs (appointment_id);
CREATE INDEX IF NOT EXISTS idx_npt_comm_logs_kind ON npt_comm_logs (appointment_id, kind);

ALTER TABLE npt_comm_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "npt_comm_logs_read" ON npt_comm_logs;
CREATE POLICY "npt_comm_logs_read" ON npt_comm_logs FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "npt_comm_logs_service" ON npt_comm_logs;
CREATE POLICY "npt_comm_logs_service" ON npt_comm_logs
  USING (auth.role() = 'service_role') WITH CHECK (true);
GRANT ALL ON TABLE npt_comm_logs TO service_role;
