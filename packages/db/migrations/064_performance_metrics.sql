-- Migration 064: transparent performance metrics (§11).
--
-- §11 is unusually prescriptive about what NOT to build:
--   "Do not create a single mysterious percentage without showing how it was
--    calculated."
--   "Approved leave must not reduce the rating."
--   "Weight attendance moderately rather than letting it dominate."
--   "Do not activate consequential scoring until the data inputs have been
--    validated."
--
-- So this migration stores COMPONENTS and their source counts, never a bare
-- score. Weights are configurable rows, not constants in code. And every period
-- carries an explicit `is_provisional` flag which defaults TRUE — Phase 1 is
-- component dashboards only, and nothing here is consequential until a human
-- clears it.

-- ─── 1. WEIGHT CONFIGURATION (§11 "Make the weights configurable") ──────────
CREATE TABLE IF NOT EXISTS performance_weight_profiles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT '',      -- '' = default profile
  brand_id      UUID REFERENCES brands(id) ON DELETE CASCADE,
  -- The brief's proposed starting model, stored as data so it can be changed
  -- without a deploy. Attendance is deliberately the smallest weight.
  weight_task_duty      NUMERIC(5, 2) NOT NULL DEFAULT 40,
  weight_role_output    NUMERIC(5, 2) NOT NULL DEFAULT 30,
  weight_quality        NUMERIC(5, 2) NOT NULL DEFAULT 20,
  weight_attendance     NUMERIC(5, 2) NOT NULL DEFAULT 10,
  active        BOOLEAN NOT NULL DEFAULT true,
  notes         TEXT NOT NULL DEFAULT '',
  created_by    TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Weights must total 100, or a "score" means nothing.
ALTER TABLE performance_weight_profiles
  DROP CONSTRAINT IF EXISTS performance_weights_total_check;
ALTER TABLE performance_weight_profiles
  ADD CONSTRAINT performance_weights_total_check
  CHECK (weight_task_duty + weight_role_output + weight_quality + weight_attendance = 100);

-- §11: "Weight attendance moderately rather than letting it dominate."
-- Encoded as a hard ceiling so no configuration can make attendance the
-- dominant term.
ALTER TABLE performance_weight_profiles
  DROP CONSTRAINT IF EXISTS performance_attendance_not_dominant;
ALTER TABLE performance_weight_profiles
  ADD CONSTRAINT performance_attendance_not_dominant
  CHECK (weight_attendance <= 25);

CREATE UNIQUE INDEX IF NOT EXISTS idx_perf_profile_role
  ON performance_weight_profiles (lower(role), COALESCE(brand_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE active;

-- ─── 2. ROLE-SPECIFIC METRIC DEFINITIONS (§11C) ─────────────────────────────
-- "This must differ by role. Do not compare employees performing fundamentally
-- different roles using raw output numbers."
CREATE TABLE IF NOT EXISTS performance_role_metrics (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role           TEXT NOT NULL,
  brand_id       UUID REFERENCES brands(id) ON DELETE CASCADE,
  metric_key     TEXT NOT NULL,           -- units_sold, target_attainment, repair_completion…
  label          TEXT NOT NULL,
  -- Where the number comes from, so a metric is always traceable to records.
  source_table   TEXT NOT NULL DEFAULT '',
  source_note    TEXT NOT NULL DEFAULT '',
  unit           TEXT NOT NULL DEFAULT '',
  target_value   NUMERIC(14, 3),
  higher_is_better BOOLEAN NOT NULL DEFAULT true,
  weight_within_role NUMERIC(5, 2) NOT NULL DEFAULT 0,
  active         BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_perf_role_metric_once
  ON performance_role_metrics (lower(role), metric_key,
    COALESCE(brand_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE active;

-- ─── 3. PERIOD COMPONENT SCORES (§11 "Show component scores") ───────────────
CREATE TABLE IF NOT EXISTS performance_periods (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id  UUID NOT NULL REFERENCES ops_team_members(id) ON DELETE CASCADE,
  brand_id        UUID REFERENCES brands(id) ON DELETE SET NULL,
  role            TEXT NOT NULL DEFAULT '',
  profile_id      UUID REFERENCES performance_weight_profiles(id) ON DELETE SET NULL,
  period_start    DATE NOT NULL,
  period_end      DATE NOT NULL,

  -- Component scores, 0..100 each. Each is accompanied by the raw counts below
  -- so the number is never unexplained.
  score_task_duty   NUMERIC(6, 2),
  score_role_output NUMERIC(6, 2),
  score_quality     NUMERIC(6, 2),
  score_attendance  NUMERIC(6, 2),
  overall_score     NUMERIC(6, 2),

  -- Raw source counts (§11 "Show the underlying records").
  tasks_assigned    INTEGER NOT NULL DEFAULT 0,
  tasks_completed   INTEGER NOT NULL DEFAULT 0,
  tasks_on_time     INTEGER NOT NULL DEFAULT 0,
  tasks_overdue     INTEGER NOT NULL DEFAULT 0,
  tasks_reopened    INTEGER NOT NULL DEFAULT 0,
  duties_due        INTEGER NOT NULL DEFAULT 0,
  duties_completed  INTEGER NOT NULL DEFAULT 0,
  duties_on_time    INTEGER NOT NULL DEFAULT 0,
  evidence_provided INTEGER NOT NULL DEFAULT 0,
  evidence_required INTEGER NOT NULL DEFAULT 0,
  days_scheduled    INTEGER NOT NULL DEFAULT 0,
  days_present      INTEGER NOT NULL DEFAULT 0,
  days_late         INTEGER NOT NULL DEFAULT 0,
  days_absent       INTEGER NOT NULL DEFAULT 0,
  days_on_leave     INTEGER NOT NULL DEFAULT 0,
  role_metrics      JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- §11: "Do not activate consequential scoring until the data inputs have been
  -- validated." Defaults TRUE and must be cleared deliberately.
  is_provisional  BOOLEAN NOT NULL DEFAULT true,
  data_quality_note TEXT NOT NULL DEFAULT '',

  -- Manager context (§11 "Allow managers to record context").
  manager_comment TEXT NOT NULL DEFAULT '',
  reviewed_by     TEXT NOT NULL DEFAULT '',
  reviewed_at     TIMESTAMPTZ,
  employee_visible BOOLEAN NOT NULL DEFAULT false,
  computed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE performance_periods
  DROP CONSTRAINT IF EXISTS performance_periods_range_check;
ALTER TABLE performance_periods
  ADD CONSTRAINT performance_periods_range_check CHECK (period_end >= period_start);

ALTER TABLE performance_periods
  DROP CONSTRAINT IF EXISTS performance_periods_score_range_check;
ALTER TABLE performance_periods
  ADD CONSTRAINT performance_periods_score_range_check
  CHECK (
    (score_task_duty   IS NULL OR score_task_duty   BETWEEN 0 AND 100) AND
    (score_role_output IS NULL OR score_role_output BETWEEN 0 AND 100) AND
    (score_quality     IS NULL OR score_quality     BETWEEN 0 AND 100) AND
    (score_attendance  IS NULL OR score_attendance  BETWEEN 0 AND 100) AND
    (overall_score     IS NULL OR overall_score     BETWEEN 0 AND 100)
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_perf_period_once
  ON performance_periods (team_member_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_perf_periods_member ON performance_periods (team_member_id, period_start DESC);

-- ─── 4. MANUAL ADJUSTMENT AUDIT (§11) ───────────────────────────────────────
-- "Keep an audit trail of any manual adjustment." Adjustments are recorded as
-- separate rows rather than by editing the score, so the computed figure and the
-- human override are both always visible.
CREATE TABLE IF NOT EXISTS performance_adjustments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id      UUID NOT NULL REFERENCES performance_periods(id) ON DELETE CASCADE,
  component      TEXT NOT NULL,        -- task_duty | role_output | quality | attendance | overall
  previous_value NUMERIC(6, 2),
  new_value      NUMERIC(6, 2),
  reason         TEXT NOT NULL,
  adjusted_by    TEXT NOT NULL DEFAULT '',
  adjusted_by_id UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- An adjustment without a reason is exactly the "mysterious percentage" §11
-- forbids.
ALTER TABLE performance_adjustments
  DROP CONSTRAINT IF EXISTS performance_adjustments_reason_required;
ALTER TABLE performance_adjustments
  ADD CONSTRAINT performance_adjustments_reason_required
  CHECK (btrim(reason) <> '');

CREATE INDEX IF NOT EXISTS idx_perf_adjustments ON performance_adjustments (period_id, created_at DESC);

-- ─── 5. DEFAULT PROFILE ─────────────────────────────────────────────────────
INSERT INTO performance_weight_profiles (name, role, weight_task_duty, weight_role_output, weight_quality, weight_attendance, notes)
SELECT 'Group default', '', 40, 30, 20, 10,
       'Starting model from the brief. Weights are data, not code - tune per role before any consequential use.'
WHERE NOT EXISTS (SELECT 1 FROM performance_weight_profiles WHERE role = '' AND brand_id IS NULL);

-- ─── 6. RLS + GRANTS ────────────────────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'performance_weight_profiles', 'performance_role_metrics',
    'performance_periods', 'performance_adjustments'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_service', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (auth.role() = ''service_role'') WITH CHECK (true)',
      t || '_service', t
    );
    EXECUTE format('GRANT ALL ON TABLE %I TO service_role', t);
  END LOOP;
END $$;
