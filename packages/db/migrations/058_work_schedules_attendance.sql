-- Migration 058: work schedules and the attendance rebuild (§§9–10).
--
-- Fixes two defects found in the Phase 1 audit before anything is built on top:
--
--   RISK 2 — ops_attendance_records had NO unique key on (employee, date), and
--            upsertAttendance() called .upsert() with no conflict target. A
--            re-imported biometric week INSERTED duplicates instead of updating.
--            §37 requires "duplicate punches" handling; without this key there
--            was nothing to deduplicate against.
--
--   RISK 3 — attendance identity was resolved by email, falling back to a
--            case-insensitive NAME match. Two employees sharing a name could
--            see each other's attendance. Biometric devices emit a device user
--            id, not an email, so identity now has its own mapping table and
--            unmatched punches are quarantined rather than guessed at.
--
-- The table is empty in production, so the unique key is added without backfill.

-- ─── 1. WORK SCHEDULES (§10) ────────────────────────────────────────────────
-- "Do not apply one universal arrival time to every employee unless that is
-- explicitly configured." A schedule is per-employee and effective-dated, so
-- attendance for a past date is always judged against the schedule that was in
-- force THEN, not the current one.
CREATE TABLE IF NOT EXISTS ops_work_schedules (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id    UUID REFERENCES ops_team_members(id) ON DELETE CASCADE,
  brand_id          UUID REFERENCES brands(id) ON DELETE SET NULL,
  name              TEXT NOT NULL DEFAULT 'Standard',
  -- 0=Sun … 6=Sat. Default Mon–Fri.
  workdays          INTEGER[] NOT NULL DEFAULT '{1,2,3,4,5}',
  start_time        TEXT NOT NULL DEFAULT '08:00',   -- 'HH:MM' wall clock
  end_time          TEXT NOT NULL DEFAULT '17:00',
  break_minutes     INTEGER NOT NULL DEFAULT 60,
  expected_hours    NUMERIC(5,2) NOT NULL DEFAULT 8,
  grace_minutes     INTEGER NOT NULL DEFAULT 10,
  timezone          TEXT NOT NULL DEFAULT 'Africa/Nairobi',
  is_shift_based    BOOLEAN NOT NULL DEFAULT false,
  effective_from    DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to      DATE,
  active            BOOLEAN NOT NULL DEFAULT true,
  notes             TEXT NOT NULL DEFAULT '',
  created_by        TEXT NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ops_work_schedules
  DROP CONSTRAINT IF EXISTS ops_work_schedules_range_check;
ALTER TABLE ops_work_schedules
  ADD CONSTRAINT ops_work_schedules_range_check
  CHECK (effective_to IS NULL OR effective_to >= effective_from);

CREATE INDEX IF NOT EXISTS idx_schedules_member ON ops_work_schedules (team_member_id, effective_from DESC);
CREATE INDEX IF NOT EXISTS idx_schedules_active ON ops_work_schedules (active) WHERE active;

-- Temporary overrides: a different shift for one date range, without rewriting
-- the standing schedule (§10 "Temporary schedule overrides").
CREATE TABLE IF NOT EXISTS ops_schedule_overrides (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id UUID NOT NULL REFERENCES ops_team_members(id) ON DELETE CASCADE,
  start_date     DATE NOT NULL,
  end_date       DATE NOT NULL,
  start_time     TEXT NOT NULL DEFAULT '',
  end_time       TEXT NOT NULL DEFAULT '',
  break_minutes  INTEGER,
  expected_hours NUMERIC(5,2),
  workdays       INTEGER[],
  reason         TEXT NOT NULL DEFAULT '',
  approved_by    TEXT NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_schedule_overrides_member ON ops_schedule_overrides (team_member_id, start_date, end_date);

-- ─── 2. BIOMETRIC IDENTITY (§9, fixes RISK 3) ───────────────────────────────
-- A device emits an enrolment id, not an email. Mapping it explicitly is what
-- lets §9's "identify unmatched biometric identifiers" work, and stops name
-- collisions resolving to the wrong person.
CREATE TABLE IF NOT EXISTS ops_biometric_identities (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id UUID NOT NULL REFERENCES ops_team_members(id) ON DELETE CASCADE,
  device_name    TEXT NOT NULL DEFAULT '',
  biometric_id   TEXT NOT NULL,
  display_name   TEXT NOT NULL DEFAULT '',
  active         BOOLEAN NOT NULL DEFAULT true,
  created_by     TEXT NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- One enrolment id per device maps to exactly one person.
CREATE UNIQUE INDEX IF NOT EXISTS idx_biometric_identity_once
  ON ops_biometric_identities (device_name, biometric_id) WHERE active;
CREATE INDEX IF NOT EXISTS idx_biometric_identity_member ON ops_biometric_identities (team_member_id);

-- ─── 3. ATTENDANCE RECORD (§9) ──────────────────────────────────────────────
ALTER TABLE ops_attendance_records
  ADD COLUMN IF NOT EXISTS schedule_id           UUID REFERENCES ops_work_schedules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS biometric_id          TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS scheduled_start_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scheduled_end_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS break_minutes         INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expected_minutes      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_minutes        INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS late_minutes          INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS early_departure_minutes INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overtime_minutes      INTEGER NOT NULL DEFAULT 0,
  -- present | late | absent | half_day | on_leave | holiday | rest_day | incomplete
  ADD COLUMN IF NOT EXISTS status                TEXT NOT NULL DEFAULT 'present',
  ADD COLUMN IF NOT EXISTS leave_request_id      UUID REFERENCES ocg_leave_requests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS correction_reason     TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS corrected_by          TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS corrected_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by           TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS approved_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS period_id             UUID,
  ADD COLUMN IF NOT EXISTS import_id             UUID,
  -- Every punch seen for the day, so duplicate-punch collapsing stays auditable
  -- rather than throwing away the raw evidence.
  ADD COLUMN IF NOT EXISTS punch_count           INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS all_punches           JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE ops_attendance_records
  DROP CONSTRAINT IF EXISTS ops_attendance_status_check;
ALTER TABLE ops_attendance_records
  ADD CONSTRAINT ops_attendance_status_check
  CHECK (status IN ('present','late','absent','half_day','on_leave','holiday','rest_day','incomplete'));

ALTER TABLE ops_attendance_records
  DROP CONSTRAINT IF EXISTS ops_attendance_source_check;
ALTER TABLE ops_attendance_records
  ADD CONSTRAINT ops_attendance_source_check
  CHECK (source IN ('biometric','manual','imported','approved_correction','manual_export','device_push','api'));

-- RISK 2 FIX: one attendance row per employee per date. The table is empty, so
-- this needs no backfill. COALESCE keeps rows that predate identity mapping
-- (team_member_id NULL) from colliding with each other on the nil UUID while
-- still being deduplicated by employee_code.
CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_member_date_once
  ON ops_attendance_records (
    COALESCE(team_member_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(NULLIF(employee_code, ''), ''),
    attendance_date
  );

CREATE INDEX IF NOT EXISTS idx_attendance_date   ON ops_attendance_records (attendance_date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_member ON ops_attendance_records (team_member_id, attendance_date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_period ON ops_attendance_records (period_id);
CREATE INDEX IF NOT EXISTS idx_attendance_status ON ops_attendance_records (status);

-- ─── 4. WEEKLY PERIODS (§9 step 8) ──────────────────────────────────────────
-- Finalising a week freezes it. Corrections after that go through a controlled
-- reopen, so a payroll-relevant week cannot be quietly edited afterwards.
CREATE TABLE IF NOT EXISTS ops_attendance_periods (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id       UUID REFERENCES brands(id) ON DELETE SET NULL,
  period_start   DATE NOT NULL,
  period_end     DATE NOT NULL,
  label          TEXT NOT NULL DEFAULT '',
  -- open | in_review | finalized | reopened
  status         TEXT NOT NULL DEFAULT 'open',
  employee_count INTEGER NOT NULL DEFAULT 0,
  record_count   INTEGER NOT NULL DEFAULT 0,
  exception_count INTEGER NOT NULL DEFAULT 0,
  finalized_by   TEXT NOT NULL DEFAULT '',
  finalized_at   TIMESTAMPTZ,
  reopened_by    TEXT NOT NULL DEFAULT '',
  reopened_at    TIMESTAMPTZ,
  reopen_reason  TEXT NOT NULL DEFAULT '',
  notes          TEXT NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ops_attendance_periods
  DROP CONSTRAINT IF EXISTS ops_attendance_periods_status_check;
ALTER TABLE ops_attendance_periods
  ADD CONSTRAINT ops_attendance_periods_status_check
  CHECK (status IN ('open','in_review','finalized','reopened'));

ALTER TABLE ops_attendance_periods
  DROP CONSTRAINT IF EXISTS ops_attendance_periods_range_check;
ALTER TABLE ops_attendance_periods
  ADD CONSTRAINT ops_attendance_periods_range_check
  CHECK (period_end >= period_start);

CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_period_once
  ON ops_attendance_periods (period_start, period_end, COALESCE(brand_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ─── 5. BIOMETRIC IMPORT (§9) ───────────────────────────────────────────────
-- Staged, never direct. §9: "Do not silently create attendance records for
-- unmatched employees" — unmatched rows stay in staging with a reason until a
-- human maps or discards them.
CREATE TABLE IF NOT EXISTS ops_attendance_imports (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id         UUID REFERENCES brands(id) ON DELETE SET NULL,
  period_id        UUID REFERENCES ops_attendance_periods(id) ON DELETE SET NULL,
  file_name        TEXT NOT NULL DEFAULT '',
  file_checksum    TEXT NOT NULL DEFAULT '',
  device_name      TEXT NOT NULL DEFAULT '',
  source_format    TEXT NOT NULL DEFAULT 'csv',
  period_start     DATE,
  period_end       DATE,
  -- uploaded | validated | previewed | committed | rolled_back | failed
  status           TEXT NOT NULL DEFAULT 'uploaded',
  total_rows       INTEGER NOT NULL DEFAULT 0,
  matched_rows     INTEGER NOT NULL DEFAULT 0,
  unmatched_rows   INTEGER NOT NULL DEFAULT 0,
  duplicate_rows   INTEGER NOT NULL DEFAULT 0,
  incomplete_rows  INTEGER NOT NULL DEFAULT 0,
  committed_rows   INTEGER NOT NULL DEFAULT 0,
  field_mapping    JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_summary    TEXT NOT NULL DEFAULT '',
  imported_by      TEXT NOT NULL DEFAULT '',
  committed_by     TEXT NOT NULL DEFAULT '',
  committed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- The same file cannot be committed twice.
CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_import_checksum
  ON ops_attendance_imports (file_checksum) WHERE file_checksum <> '' AND status = 'committed';
CREATE INDEX IF NOT EXISTS idx_attendance_imports_when ON ops_attendance_imports (created_at DESC);

CREATE TABLE IF NOT EXISTS ops_attendance_import_rows (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id        UUID NOT NULL REFERENCES ops_attendance_imports(id) ON DELETE CASCADE,
  row_number       INTEGER NOT NULL DEFAULT 0,
  raw              JSONB NOT NULL DEFAULT '{}'::jsonb,
  biometric_id     TEXT NOT NULL DEFAULT '',
  employee_name    TEXT NOT NULL DEFAULT '',
  team_member_id   UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,
  attendance_date  DATE,
  punches          JSONB NOT NULL DEFAULT '[]'::jsonb,
  check_in_at      TIMESTAMPTZ,
  check_out_at     TIMESTAMPTZ,
  -- pending | matched | unmatched | duplicate | missing_punch | committed | discarded
  resolution       TEXT NOT NULL DEFAULT 'pending',
  issue            TEXT NOT NULL DEFAULT '',
  resolved_by      TEXT NOT NULL DEFAULT '',
  resolved_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_attendance_import_rows ON ops_attendance_import_rows (import_id, resolution);

-- Late FK now that the periods/imports tables exist.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_attendance_records_period_fk') THEN
    ALTER TABLE ops_attendance_records
      ADD CONSTRAINT ops_attendance_records_period_fk
      FOREIGN KEY (period_id) REFERENCES ops_attendance_periods(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_attendance_records_import_fk') THEN
    ALTER TABLE ops_attendance_records
      ADD CONSTRAINT ops_attendance_records_import_fk
      FOREIGN KEY (import_id) REFERENCES ops_attendance_imports(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── 6. RLS + GRANTS ────────────────────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ops_work_schedules', 'ops_schedule_overrides', 'ops_biometric_identities',
    'ops_attendance_periods', 'ops_attendance_imports', 'ops_attendance_import_rows'
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
