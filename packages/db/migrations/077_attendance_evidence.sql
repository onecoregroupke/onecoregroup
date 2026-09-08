-- Migration 077: independent attendance evidence events.
--
-- Biometric, employee self-clock and reviewer/manual evidence are append-only
-- peers. This migration does not convert or overwrite historical daily rows.
-- Apply manually in the Supabase SQL editor after review.

BEGIN;

CREATE TABLE IF NOT EXISTS ops_attendance_identities (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id  UUID NOT NULL REFERENCES ops_team_members(id) ON DELETE CASCADE,
  device_name     TEXT NOT NULL DEFAULT '',
  employee_code   TEXT NOT NULL,
  active          BOOLEAN NOT NULL DEFAULT true,
  notes           TEXT NOT NULL DEFAULT '',
  created_by      TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (device_name, employee_code)
);

CREATE TABLE IF NOT EXISTS ops_attendance_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id      UUID NOT NULL REFERENCES ops_team_members(id) ON DELETE CASCADE,
  occurred_at         TIMESTAMPTZ NOT NULL,
  event_date          DATE NOT NULL,
  direction           TEXT NOT NULL,
  source              TEXT NOT NULL,
  device_name         TEXT NOT NULL DEFAULT '',
  device_event_id     TEXT NOT NULL DEFAULT '',
  recorded_by         TEXT NOT NULL DEFAULT '',
  recorded_by_user_id UUID,
  reason              TEXT NOT NULL DEFAULT '',
  notes               TEXT NOT NULL DEFAULT '',
  source_event_key    TEXT NOT NULL DEFAULT '',
  raw_payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ops_attendance_event_direction_check CHECK (direction IN ('in','out')),
  CONSTRAINT ops_attendance_event_source_check CHECK (
    source IN ('biometric','employee_self','reviewer_manual','historical_import')
  ),
  CONSTRAINT ops_attendance_event_manual_reason CHECK (
    source <> 'reviewer_manual' OR (recorded_by <> '' AND reason <> '')
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_event_source_once
  ON ops_attendance_events (source_event_key) WHERE source_event_key <> '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_self_direction_once
  ON ops_attendance_events (team_member_id, event_date, direction)
  WHERE source = 'employee_self';
CREATE INDEX IF NOT EXISTS idx_attendance_event_member_date
  ON ops_attendance_events (team_member_id, event_date, source, occurred_at);
CREATE INDEX IF NOT EXISTS idx_attendance_event_live_self
  ON ops_attendance_events (source, event_date, direction, occurred_at DESC)
  WHERE source = 'employee_self';

CREATE OR REPLACE FUNCTION prevent_append_only_ledger_change()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; post a reversal or correcting event instead', TG_TABLE_NAME;
END $$;
DROP TRIGGER IF EXISTS trg_attendance_events_append_only ON ops_attendance_events;
CREATE TRIGGER trg_attendance_events_append_only BEFORE UPDATE OR DELETE ON ops_attendance_events
  FOR EACH ROW EXECUTE FUNCTION prevent_append_only_ledger_change();

-- Daily evidence comparison. Each source remains a separate row; the manager
-- UI pivots these rows side by side and may flag discrepancies without editing
-- any underlying event.
CREATE OR REPLACE VIEW ops_attendance_evidence_daily AS
SELECT
  e.team_member_id, m.name AS employee_name, m.email AS employee_email,
  e.event_date, e.source,
  MIN(e.occurred_at) FILTER (WHERE e.direction='in') AS check_in_at,
  MAX(e.occurred_at) FILTER (WHERE e.direction='out') AS check_out_at,
  COUNT(*) FILTER (WHERE e.direction='in') AS in_evidence_count,
  COUNT(*) FILTER (WHERE e.direction='out') AS out_evidence_count,
  array_agg(e.id ORDER BY e.occurred_at) AS evidence_event_ids,
  MAX(e.created_at) AS latest_recorded_at
FROM ops_attendance_events e
JOIN ops_team_members m ON m.id=e.team_member_id
GROUP BY e.team_member_id,m.name,m.email,e.event_date,e.source;
GRANT SELECT ON ops_attendance_evidence_daily TO service_role;

ALTER TABLE ops_attendance_records
  ADD COLUMN IF NOT EXISTS evidence_summary_generated_at TIMESTAMPTZ;

ALTER TABLE ops_attendance_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ops_attendance_events_service ON ops_attendance_events;
CREATE POLICY ops_attendance_events_service ON ops_attendance_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);
GRANT ALL ON TABLE ops_attendance_events TO service_role;
ALTER TABLE ops_attendance_identities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ops_attendance_identities_service ON ops_attendance_identities;
CREATE POLICY ops_attendance_identities_service ON ops_attendance_identities
  FOR ALL TO service_role USING (true) WITH CHECK (true);
GRANT ALL ON TABLE ops_attendance_identities TO service_role;

COMMIT;
