-- Migration 078: attendance system auto-checkout evidence.
--
-- Keeps the 7:00 PM automatic close auditable without mislabelling it as
-- employee self-clock, reviewer/manual evidence, biometric data, or historical
-- import evidence.

BEGIN;

ALTER TABLE ops_attendance_events
  DROP CONSTRAINT IF EXISTS ops_attendance_event_source_check;

ALTER TABLE ops_attendance_events
  ADD CONSTRAINT ops_attendance_event_source_check CHECK (
    source IN ('biometric','employee_self','reviewer_manual','historical_import','system_auto')
  );

COMMIT;
