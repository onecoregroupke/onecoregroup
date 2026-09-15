-- Migration 079: reconcile historical derived attendance records with IN and no OUT.
--
-- This updates only the canonical daily attendance rows. It does not create
-- biometric evidence, does not touch ops_attendance_events, and does not alter
-- punch_count/all_punches from the original import.

BEGIN;

UPDATE ops_attendance_records
SET
  check_out_at = scheduled_end_at,
  raw_payload = COALESCE(raw_payload, '{}'::jsonb) || jsonb_build_object(
    'check_out_source', 'system_auto',
    'system_auto_closed', true,
    'system_auto_reconciled_at', now(),
    'system_auto_processed_at', now(),
    'effective_checkout_at', scheduled_end_at,
    'auto_close_reason', 'Historical open record reconciled at scheduled end'
  ),
  notes = trim(both ' ' from concat_ws(' ', NULLIF(notes, ''), 'Auto-closed')),
  actual_minutes = GREATEST(
    0,
    ROUND(EXTRACT(EPOCH FROM (scheduled_end_at - check_in_at)) / 60)::integer - COALESCE(break_minutes, 0)
  ),
  early_departure_minutes = 0,
  overtime_minutes = 0,
  status = CASE
    WHEN expected_minutes > 0
      AND GREATEST(0, ROUND(EXTRACT(EPOCH FROM (scheduled_end_at - check_in_at)) / 60)::integer - COALESCE(break_minutes, 0)) <= expected_minutes / 2
      THEN 'half_day'
    WHEN late_minutes > 0 THEN 'late'
    ELSE 'present'
  END,
  evidence_summary_generated_at = now(),
  updated_at = now()
WHERE check_in_at IS NOT NULL
  AND check_out_at IS NULL
  AND scheduled_end_at IS NOT NULL
  AND attendance_date < CURRENT_DATE;

COMMIT;
