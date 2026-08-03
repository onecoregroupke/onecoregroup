-- Migration 048: recurring-duty recurrence controls (§8).
--
-- Additive. Upgrades daily-only "duties" into a full recurring-task engine while
-- preserving existing behaviour (default frequency = 'daily'). Whether a duty is
-- due on a date is DERIVED from the rule (see lib/recurrence.ts); completion is
-- still the single (duty_id, duty_date) row in ocg_daily_duty_logs — so no
-- uncontrolled duplicate task instances are ever created.

ALTER TABLE ocg_daily_duties
  ADD COLUMN IF NOT EXISTS frequency        TEXT      NOT NULL DEFAULT 'daily', -- daily|weekdays|weekly|monthly|interval
  ADD COLUMN IF NOT EXISTS weekdays         INTEGER[] NOT NULL DEFAULT '{}',    -- 0=Sun … 6=Sat
  ADD COLUMN IF NOT EXISTS day_of_month     INTEGER,                            -- 1..31, or -1 = last working day
  ADD COLUMN IF NOT EXISTS interval_days    INTEGER   NOT NULL DEFAULT 0,       -- every N days (frequency=interval)
  ADD COLUMN IF NOT EXISTS time_of_day      TEXT      NOT NULL DEFAULT '',      -- 'HH:MM'
  ADD COLUMN IF NOT EXISTS timezone         TEXT      NOT NULL DEFAULT 'Africa/Nairobi',
  ADD COLUMN IF NOT EXISTS start_date       DATE,
  ADD COLUMN IF NOT EXISTS end_date         DATE,
  ADD COLUMN IF NOT EXISTS priority         TEXT      NOT NULL DEFAULT 'Medium',
  ADD COLUMN IF NOT EXISTS category         TEXT      NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS requires_proof   BOOLEAN   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_minutes INTEGER   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paused           BOOLEAN   NOT NULL DEFAULT false;
