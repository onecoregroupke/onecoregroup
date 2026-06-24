-- Migration 032: NPT Gazelle-style scheduling layer
-- Additive only. Brings the NPT service module closer to Gazelle: multiple
-- contacts per client, appointments (start/end/duration/technician + audit),
-- piano measurements (temp/humidity), tuning interval (to derive next-due), a
-- free-text timeline event store (comments/notices/system), plus referral and
-- preferred-technician fields. The profile-page timeline is otherwise DERIVED by
-- merging appointments, service history, measurements, quotes/invoices, and
-- reminders — so most events need no separate write.
-- Run in the Supabase SQL editor. Idempotent — safe to re-run.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── Customer enrichments (Gazelle client fields) ───────────────────────────
ALTER TABLE npt_customers ADD COLUMN IF NOT EXISTS company_name           TEXT NOT NULL DEFAULT '';
ALTER TABLE npt_customers ADD COLUMN IF NOT EXISTS preferred_technician_id UUID REFERENCES ops_team_members(id) ON DELETE SET NULL;
ALTER TABLE npt_customers ADD COLUMN IF NOT EXISTS referred_by            TEXT NOT NULL DEFAULT '';
ALTER TABLE npt_customers ADD COLUMN IF NOT EXISTS tax_exempt             BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE npt_customers ADD COLUMN IF NOT EXISTS tags                   TEXT[] NOT NULL DEFAULT '{}';

-- ─── Piano enrichments (tuning schedule) ────────────────────────────────────
ALTER TABLE npt_pianos ADD COLUMN IF NOT EXISTS tuning_interval_months INTEGER NOT NULL DEFAULT 6;
ALTER TABLE npt_pianos ADD COLUMN IF NOT EXISTS tags                   TEXT[] NOT NULL DEFAULT '{}';

-- ─── Contacts (a client can have many) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS npt_contacts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES npt_customers(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  phone       TEXT,
  email       TEXT,
  role        TEXT NOT NULL DEFAULT '',
  is_primary  BOOLEAN NOT NULL DEFAULT false,
  is_billing  BOOLEAN NOT NULL DEFAULT false,
  notes       TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_npt_contacts_customer ON npt_contacts(customer_id);

-- ─── Appointments (scheduling primitive) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS npt_appointments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id    UUID REFERENCES npt_customers(id) ON DELETE SET NULL,
  piano_id       UUID REFERENCES npt_pianos(id) ON DELETE SET NULL,
  technician_id  UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,
  service_job_id UUID REFERENCES npt_service_jobs(id) ON DELETE SET NULL,
  title          TEXT NOT NULL DEFAULT 'Appointment',
  location       TEXT NOT NULL DEFAULT '',
  start_at       TIMESTAMPTZ,
  end_at         TIMESTAMPTZ,
  status         TEXT NOT NULL DEFAULT 'Scheduled',  -- Scheduled | Completed | Cancelled | No-show
  notes          TEXT NOT NULL DEFAULT '',
  created_by     TEXT NOT NULL DEFAULT '',
  completed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_npt_appts_customer ON npt_appointments(customer_id);
CREATE INDEX IF NOT EXISTS idx_npt_appts_piano ON npt_appointments(piano_id);
CREATE INDEX IF NOT EXISTS idx_npt_appts_tech ON npt_appointments(technician_id);
CREATE INDEX IF NOT EXISTS idx_npt_appts_start ON npt_appointments(start_at);
CREATE INDEX IF NOT EXISTS idx_npt_appts_status ON npt_appointments(status);

-- ─── Piano measurements (temp/humidity) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS npt_piano_measurements (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  piano_id      UUID REFERENCES npt_pianos(id) ON DELETE CASCADE,
  technician_id UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,
  measured_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  temperature_c NUMERIC(5, 2),
  humidity_pct  NUMERIC(5, 2),
  notes         TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_npt_measurements_piano ON npt_piano_measurements(piano_id);
CREATE INDEX IF NOT EXISTS idx_npt_measurements_at ON npt_piano_measurements(measured_at DESC);

-- ─── Timeline events (free-text: comments, notices, system, messages/calls) ──
CREATE TABLE IF NOT EXISTS npt_timeline_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id    UUID REFERENCES npt_customers(id) ON DELETE CASCADE,
  piano_id       UUID REFERENCES npt_pianos(id) ON DELETE SET NULL,
  appointment_id UUID REFERENCES npt_appointments(id) ON DELETE SET NULL,
  event_type     TEXT NOT NULL DEFAULT 'comment', -- comment | notice | system | message | call
  title          TEXT NOT NULL DEFAULT '',
  body           TEXT NOT NULL DEFAULT '',
  actor          TEXT NOT NULL DEFAULT '',
  occurred_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_npt_timeline_customer ON npt_timeline_events(customer_id);
CREATE INDEX IF NOT EXISTS idx_npt_timeline_piano ON npt_timeline_events(piano_id);
CREATE INDEX IF NOT EXISTS idx_npt_timeline_type ON npt_timeline_events(event_type);
CREATE INDEX IF NOT EXISTS idx_npt_timeline_at ON npt_timeline_events(occurred_at DESC);

-- ─── RLS + GRANTS ───────────────────────────────────────────────────────────
ALTER TABLE npt_contacts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE npt_appointments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE npt_piano_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE npt_timeline_events    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "npt_contacts_auth" ON npt_contacts;
CREATE POLICY "npt_contacts_auth" ON npt_contacts FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "npt_appts_auth" ON npt_appointments;
CREATE POLICY "npt_appts_auth" ON npt_appointments FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "npt_measurements_auth" ON npt_piano_measurements;
CREATE POLICY "npt_measurements_auth" ON npt_piano_measurements FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "npt_timeline_auth" ON npt_timeline_events;
CREATE POLICY "npt_timeline_auth" ON npt_timeline_events FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "npt_contacts_service" ON npt_contacts;
CREATE POLICY "npt_contacts_service" ON npt_contacts USING (auth.role() = 'service_role') WITH CHECK (true);
DROP POLICY IF EXISTS "npt_appts_service" ON npt_appointments;
CREATE POLICY "npt_appts_service" ON npt_appointments USING (auth.role() = 'service_role') WITH CHECK (true);
DROP POLICY IF EXISTS "npt_measurements_service" ON npt_piano_measurements;
CREATE POLICY "npt_measurements_service" ON npt_piano_measurements USING (auth.role() = 'service_role') WITH CHECK (true);
DROP POLICY IF EXISTS "npt_timeline_service" ON npt_timeline_events;
CREATE POLICY "npt_timeline_service" ON npt_timeline_events USING (auth.role() = 'service_role') WITH CHECK (true);

GRANT ALL ON TABLE npt_contacts           TO service_role;
GRANT ALL ON TABLE npt_appointments       TO service_role;
GRANT ALL ON TABLE npt_piano_measurements TO service_role;
GRANT ALL ON TABLE npt_timeline_events    TO service_role;
