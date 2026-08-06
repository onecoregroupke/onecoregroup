-- Migration 055: configurable recurring duties for every employee (§§1–4).
--
-- Builds on 030 (duties + logs) and 048 (recurrence rule). The recurrence engine
-- in lib/recurrence.ts already covers §1's schedule configuration, so this
-- migration adds the three things it lacks:
--
--   1. TARGETING  — a duty may address an employee, team, department, brand,
--                   location or role, not just one assignee.
--   2. STRUCTURE  — checklists, and required note / attachment / form / approval.
--   3. LIFECYCLE  — grace, escalation, manager review, on-time measurement.
--
-- The occurrence model is deliberately unchanged in spirit: an occurrence is
-- DERIVED from the rule, and its result is one row in ocg_daily_duty_logs. That
-- is what stops the same occurrence existing as two underlying tasks (§2).
--
-- One structural change is unavoidable. Once a duty can target a GROUP, the
-- occurrence key must include the person, so the unique key moves from
-- (duty_id, duty_date) to (duty_id, duty_date, assignee). See §7 below — the
-- re-key is done without ever dropping the old guarantee unprotected.

-- ─── 1. TEAM + LOCATION ON THE EMPLOYEE RECORD ──────────────────────────────
-- ops_team_members already carries role, department, job_title and brand_ids.
-- Team and location are what targeting still needs.
ALTER TABLE ops_team_members
  ADD COLUMN IF NOT EXISTS team     TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS location TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_team_members_team       ON ops_team_members (team)       WHERE team <> '';
CREATE INDEX IF NOT EXISTS idx_team_members_location   ON ops_team_members (location)   WHERE location <> '';
CREATE INDEX IF NOT EXISTS idx_team_members_department ON ops_team_members (department) WHERE department <> '';
CREATE INDEX IF NOT EXISTS idx_team_members_role       ON ops_team_members (role)       WHERE role <> '';

-- ─── 2. DUTY TEMPLATE: TARGETING, STRUCTURE, LIFECYCLE ──────────────────────
ALTER TABLE ocg_daily_duties
  -- Targeting (§1). 'employee' preserves existing behaviour and stays the default,
  -- so every duty created before this migration keeps resolving to assignee_id.
  ADD COLUMN IF NOT EXISTS target_kind        TEXT NOT NULL DEFAULT 'employee',
  ADD COLUMN IF NOT EXISTS target_team        TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS target_department  TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS target_role        TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS target_location    TEXT NOT NULL DEFAULT '',

  -- Structure (§1 "Duty structure")
  ADD COLUMN IF NOT EXISTS instructions       TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS duty_kind          TEXT NOT NULL DEFAULT 'task',
  ADD COLUMN IF NOT EXISTS location           TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS reviewer_id        UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,

  -- Completion requirements (§1, §12). requires_proof (048) is kept as the
  -- attachment flag; these add the rest so the system can refuse an incomplete
  -- completion rather than silently accepting it.
  ADD COLUMN IF NOT EXISTS requires_note      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_checklist BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_approval  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS required_form_template_id UUID REFERENCES ocg_form_templates(id) ON DELETE SET NULL,

  -- Timing policy (§1 "Duty schedule configuration")
  ADD COLUMN IF NOT EXISTS grace_minutes      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS escalation_minutes INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS skip_holidays      BOOLEAN NOT NULL DEFAULT false,

  -- Provenance + the one-time assignment email (§4). Nullable timestamp, not a
  -- boolean: "never sent" and "sent at T" are different facts, and the send is
  -- guarded by this column so a template edit cannot re-trigger it.
  ADD COLUMN IF NOT EXISTS created_by         TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS updated_by         TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS assignment_email_sent_at TIMESTAMPTZ;

ALTER TABLE ocg_daily_duties
  DROP CONSTRAINT IF EXISTS ocg_daily_duties_target_kind_check;
ALTER TABLE ocg_daily_duties
  ADD CONSTRAINT ocg_daily_duties_target_kind_check
  CHECK (target_kind IN ('employee', 'team', 'department', 'brand', 'location', 'role'));

ALTER TABLE ocg_daily_duties
  DROP CONSTRAINT IF EXISTS ocg_daily_duties_duty_kind_check;
ALTER TABLE ocg_daily_duties
  ADD CONSTRAINT ocg_daily_duties_duty_kind_check
  CHECK (duty_kind IN ('task', 'checklist', 'report', 'form', 'inspection'));

CREATE INDEX IF NOT EXISTS idx_duties_target_kind ON ocg_daily_duties (target_kind);
CREATE INDEX IF NOT EXISTS idx_duties_reviewer    ON ocg_daily_duties (reviewer_id);
CREATE INDEX IF NOT EXISTS idx_duties_brand       ON ocg_daily_duties (brand_id);

-- ─── 3. CHECKLIST DEFINITION ────────────────────────────────────────────────
-- The template's checklist. Edited only by someone with duty-edit rights; the
-- assignee ticks results (§7) and never changes the definition (§3).
CREATE TABLE IF NOT EXISTS ocg_duty_checklist_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  duty_id     UUID NOT NULL REFERENCES ocg_daily_duties(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL DEFAULT 0,
  label       TEXT NOT NULL,
  hint        TEXT NOT NULL DEFAULT '',
  required    BOOLEAN NOT NULL DEFAULT true,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_duty_checklist_duty ON ocg_duty_checklist_items (duty_id, position);

-- ─── 4. OCCURRENCE RESULT ───────────────────────────────────────────────────
-- ocg_daily_duty_logs IS the occurrence record. Extended, not replaced, so
-- history stays in one place and yesterday's row is never overwritten (§1).
ALTER TABLE ocg_daily_duty_logs
  ADD COLUMN IF NOT EXISTS due_at             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_on_time  BOOLEAN,
  ADD COLUMN IF NOT EXISTS checklist_done     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS checklist_total    INTEGER NOT NULL DEFAULT 0,

  -- Manager review (§13). 'not_required' keeps duties without requires_approval
  -- out of every review queue.
  ADD COLUMN IF NOT EXISTS review_state       TEXT NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS reviewed_by        TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS reviewed_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_comment     TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS quality_rating     INTEGER,

  -- Evidence + linkage
  ADD COLUMN IF NOT EXISTS form_submission_id UUID REFERENCES ocg_form_submissions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS attachment_count   INTEGER NOT NULL DEFAULT 0,
  -- ops_tasks is keyed by task_id TEXT ('TASK-0001'), not a UUID surrogate.
  ADD COLUMN IF NOT EXISTS task_ref           TEXT REFERENCES ops_tasks(task_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS escalated_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_by       TEXT NOT NULL DEFAULT '';

ALTER TABLE ocg_daily_duty_logs
  DROP CONSTRAINT IF EXISTS ocg_duty_logs_review_state_check;
ALTER TABLE ocg_daily_duty_logs
  ADD CONSTRAINT ocg_duty_logs_review_state_check
  CHECK (review_state IN ('not_required', 'pending', 'accepted', 'reopened'));

ALTER TABLE ocg_daily_duty_logs
  DROP CONSTRAINT IF EXISTS ocg_duty_logs_quality_rating_check;
ALTER TABLE ocg_daily_duty_logs
  ADD CONSTRAINT ocg_duty_logs_quality_rating_check
  CHECK (quality_rating IS NULL OR quality_rating BETWEEN 1 AND 5);

CREATE INDEX IF NOT EXISTS idx_duty_logs_review ON ocg_daily_duty_logs (review_state)
  WHERE review_state = 'pending';
CREATE INDEX IF NOT EXISTS idx_duty_logs_task   ON ocg_daily_duty_logs (task_ref);

-- ─── 5. CHECKLIST RESULTS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ocg_duty_checklist_results (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  log_id       UUID NOT NULL REFERENCES ocg_daily_duty_logs(id) ON DELETE CASCADE,
  item_id      UUID NOT NULL REFERENCES ocg_duty_checklist_items(id) ON DELETE CASCADE,
  checked      BOOLEAN NOT NULL DEFAULT false,
  note         TEXT NOT NULL DEFAULT '',
  checked_by   TEXT NOT NULL DEFAULT '',
  checked_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One result per checklist item per occurrence.
  UNIQUE (log_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_duty_checklist_results_log ON ocg_duty_checklist_results (log_id);

-- ─── 6. WORKING-DAY / HOLIDAY POLICY ────────────────────────────────────────
-- Referenced by duties (skip_holidays) and, from 058, by attendance. brand_id
-- NULL = applies group-wide.
CREATE TABLE IF NOT EXISTS ocg_holidays (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id       UUID REFERENCES brands(id) ON DELETE CASCADE,
  holiday_date   DATE NOT NULL,
  name           TEXT NOT NULL,
  is_working_day BOOLEAN NOT NULL DEFAULT false,  -- true = declared working day that would otherwise be off
  notes          TEXT NOT NULL DEFAULT '',
  created_by     TEXT NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_holidays_date_brand
  ON ocg_holidays (holiday_date, COALESCE(brand_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ─── 7. RE-KEY THE OCCURRENCE GUARANTEE ─────────────────────────────────────
-- Was: UNIQUE (duty_id, duty_date) — correct while a duty had exactly one
-- assignee. With group targeting a duty legitimately produces one occurrence PER
-- PERSON per date, so the person joins the key.
--
-- assignee_id is nullable, and NULLs never collide in a plain unique index, so
-- an unassigned duty could otherwise be logged repeatedly for one date. COALESCE
-- to the nil UUID closes that.
--
-- The new index is created BEFORE the old constraint is dropped, so there is no
-- window in which duplicate occurrences could be written.
CREATE UNIQUE INDEX IF NOT EXISTS idx_duty_logs_occurrence_once
  ON ocg_daily_duty_logs
     (duty_id, duty_date, COALESCE(assignee_id, '00000000-0000-0000-0000-000000000000'::uuid));

ALTER TABLE ocg_daily_duty_logs
  DROP CONSTRAINT IF EXISTS ocg_daily_duty_logs_duty_id_duty_date_key;

-- ─── 8. RLS + GRANTS ────────────────────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ocg_duty_checklist_items', 'ocg_duty_checklist_results', 'ocg_holidays'
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
