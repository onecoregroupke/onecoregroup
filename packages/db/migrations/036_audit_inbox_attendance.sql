-- Migration 036: audit trail, portal inbox, and staff attendance
-- Additive. Run in Supabase SQL editor after 035_launch_foundation.sql.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS ocg_audit_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id   UUID,
  actor_email     TEXT NOT NULL DEFAULT '',
  actor_name      TEXT NOT NULL DEFAULT '',
  action          TEXT NOT NULL,       -- create | update | undo | delete | comment | status
  entity_table    TEXT NOT NULL,
  entity_id       TEXT NOT NULL,
  entity_label    TEXT NOT NULL DEFAULT '',
  before_data     JSONB,
  after_data      JSONB,
  changed_fields  TEXT[] NOT NULL DEFAULT '{}',
  undo_event_id   UUID REFERENCES ocg_audit_events(id) ON DELETE SET NULL,
  request_id      TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ocg_audit_entity ON ocg_audit_events(entity_table, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ocg_audit_actor ON ocg_audit_events(actor_email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ocg_audit_created ON ocg_audit_events(created_at DESC);

CREATE TABLE IF NOT EXISTS ocg_notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_email TEXT NOT NULL,
  recipient_name  TEXT NOT NULL DEFAULT '',
  sender_email    TEXT NOT NULL DEFAULT '',
  sender_name     TEXT NOT NULL DEFAULT '',
  kind            TEXT NOT NULL DEFAULT 'info',
  title           TEXT NOT NULL,
  body            TEXT NOT NULL DEFAULT '',
  href            TEXT NOT NULL DEFAULT '',
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ocg_notifications_recipient ON ocg_notifications(recipient_email, read_at, created_at DESC);

CREATE TABLE IF NOT EXISTS ops_attendance_records (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id      UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,
  employee_code       TEXT NOT NULL DEFAULT '',
  employee_name       TEXT NOT NULL DEFAULT '',
  employee_email      TEXT NOT NULL DEFAULT '',
  attendance_date     DATE NOT NULL,
  check_in_at         TIMESTAMPTZ,
  check_out_at        TIMESTAMPTZ,
  source              TEXT NOT NULL DEFAULT 'manual_export', -- manual_export | device_push | api | manual
  device_name         TEXT NOT NULL DEFAULT '',
  raw_payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  imported_by         TEXT NOT NULL DEFAULT '',
  notes               TEXT NOT NULL DEFAULT '',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_code, employee_email, attendance_date, source)
);
CREATE INDEX IF NOT EXISTS idx_ops_attendance_member ON ops_attendance_records(team_member_id, attendance_date DESC);
CREATE INDEX IF NOT EXISTS idx_ops_attendance_email ON ops_attendance_records(employee_email, attendance_date DESC);
CREATE INDEX IF NOT EXISTS idx_ops_attendance_date ON ops_attendance_records(attendance_date DESC);

ALTER TABLE ocg_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocg_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_attendance_records ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['ocg_audit_events', 'ocg_notifications', 'ops_attendance_records'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s_service" ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY "%s_service" ON %I USING (auth.role() = ''service_role'') WITH CHECK (true)',
      t, t
    );
    EXECUTE format('GRANT ALL ON TABLE %I TO service_role', t);
  END LOOP;
END $$;
