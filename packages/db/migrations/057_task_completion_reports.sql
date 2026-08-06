-- Migration 057: task completion reports, manager review, daily operations
-- dataset (§§12–14).
--
-- ops_completion_records already carried summary / outcome / blockers_notes /
-- file_urls, so this EXTENDS it rather than adding a second completion table —
-- two places to record "what happened" is exactly how a report layer starts
-- disagreeing with itself.
--
-- The review flow is additive: a task without requires_approval behaves exactly
-- as it does today and never enters a review queue.

-- ─── 1. COMPLETION REPORT (§12) ─────────────────────────────────────────────
ALTER TABLE ops_completion_records
  ADD COLUMN IF NOT EXISTS work_performed     TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS challenges         TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS follow_up          TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS time_spent_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS related_records    JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS review_requested   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS attachment_count   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS form_submission_id UUID REFERENCES ocg_form_submissions(id) ON DELETE SET NULL,
  -- Which duty occurrence produced this report, when the task came from a duty.
  ADD COLUMN IF NOT EXISTS duty_log_id        UUID REFERENCES ocg_daily_duty_logs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS brand_id           UUID REFERENCES brands(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS department         TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS category           TEXT NOT NULL DEFAULT '',
  -- Review state of THIS submission (§13). Each submission keeps its own verdict,
  -- so a reopen-and-resubmit history stays legible.
  ADD COLUMN IF NOT EXISTS review_state       TEXT NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS superseded_by      UUID REFERENCES ops_completion_records(id) ON DELETE SET NULL;

ALTER TABLE ops_completion_records
  DROP CONSTRAINT IF EXISTS ops_completion_records_review_state_check;
ALTER TABLE ops_completion_records
  ADD CONSTRAINT ops_completion_records_review_state_check
  CHECK (review_state IN ('not_required', 'pending', 'accepted', 'reopened'));

ALTER TABLE ops_completion_records
  DROP CONSTRAINT IF EXISTS ops_completion_records_time_spent_check;
ALTER TABLE ops_completion_records
  ADD CONSTRAINT ops_completion_records_time_spent_check
  CHECK (time_spent_minutes IS NULL OR time_spent_minutes >= 0);

CREATE INDEX IF NOT EXISTS idx_completion_task    ON ops_completion_records (task_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_completion_date    ON ops_completion_records (completion_date DESC);
CREATE INDEX IF NOT EXISTS idx_completion_brand   ON ops_completion_records (brand_id, completion_date DESC);
CREATE INDEX IF NOT EXISTS idx_completion_review  ON ops_completion_records (review_state) WHERE review_state = 'pending';
CREATE INDEX IF NOT EXISTS idx_completion_dutylog ON ops_completion_records (duty_log_id);

-- ─── 2. PER-TASK COMPLETION REQUIREMENTS (§12) ──────────────────────────────
-- "A task should support a manager-configured requirement." All default false,
-- so every existing task keeps its current, ungated behaviour.
ALTER TABLE ops_tasks
  ADD COLUMN IF NOT EXISTS requires_note       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_evidence   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_approval   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_checklist  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS required_form_template_id UUID REFERENCES ocg_form_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewer_id         UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,
  -- Set when a task instance was materialised from a recurring duty (§2), so the
  -- task keeps its duty identity instead of looking like an ordinary one-off.
  ADD COLUMN IF NOT EXISTS duty_id             UUID REFERENCES ocg_daily_duties(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS duty_date           DATE,
  ADD COLUMN IF NOT EXISTS submitted_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reopened_count      INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_tasks_duty ON ops_tasks (duty_id, duty_date);

-- One task per duty occurrence, ever. If a duty is materialised into the task
-- table, re-running that materialisation cannot create a second task for the
-- same occurrence (§2: "Do not let the same occurrence appear as two separate
-- underlying tasks").
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_duty_occurrence_once
  ON ops_tasks (duty_id, duty_date, assigned_to)
  WHERE duty_id IS NOT NULL;

-- ─── 3. REVIEW EVENTS (§13) ─────────────────────────────────────────────────
-- "Preserve every submission and review event." Append-only by intent: a
-- decision is never edited in place, a later decision is a new row.
CREATE TABLE IF NOT EXISTS ops_task_reviews (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         TEXT REFERENCES ops_tasks(task_id) ON DELETE CASCADE,
  completion_id   UUID REFERENCES ops_completion_records(id) ON DELETE SET NULL,
  duty_log_id     UUID REFERENCES ocg_daily_duty_logs(id) ON DELETE SET NULL,
  decision        TEXT NOT NULL,                 -- accepted | reopened | cancelled
  comment         TEXT NOT NULL DEFAULT '',
  quality_rating  INTEGER,
  reopen_reason   TEXT NOT NULL DEFAULT '',
  follow_up_task_id TEXT REFERENCES ops_tasks(task_id) ON DELETE SET NULL,
  reviewed_by     TEXT NOT NULL DEFAULT '',
  reviewed_by_id  UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ops_task_reviews
  DROP CONSTRAINT IF EXISTS ops_task_reviews_decision_check;
ALTER TABLE ops_task_reviews
  ADD CONSTRAINT ops_task_reviews_decision_check
  CHECK (decision IN ('accepted', 'reopened', 'cancelled'));

ALTER TABLE ops_task_reviews
  DROP CONSTRAINT IF EXISTS ops_task_reviews_rating_check;
ALTER TABLE ops_task_reviews
  ADD CONSTRAINT ops_task_reviews_rating_check
  CHECK (quality_rating IS NULL OR quality_rating BETWEEN 1 AND 5);

-- A review must attach to something reviewable.
ALTER TABLE ops_task_reviews
  DROP CONSTRAINT IF EXISTS ops_task_reviews_subject_check;
ALTER TABLE ops_task_reviews
  ADD CONSTRAINT ops_task_reviews_subject_check
  CHECK (task_id IS NOT NULL OR duty_log_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_task_reviews_task ON ops_task_reviews (task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_reviews_duty ON ops_task_reviews (duty_log_id);
CREATE INDEX IF NOT EXISTS idx_task_reviews_when ON ops_task_reviews (created_at DESC);

-- ─── 4. DAILY OPERATIONS DATASET (§14) ──────────────────────────────────────
-- "Every completed task or duty should contribute a structured entry to the
-- daily operations dataset."
--
-- A VIEW, not a table. The dataset must never be able to disagree with the
-- records it summarises, and a nightly job writing rows is exactly how that
-- drift starts. Tasks and duty occurrences are unioned into one shape so the
-- manager summary and its drill-down read from the same place.
CREATE OR REPLACE VIEW ops_daily_operations AS
  SELECT
    'task'::TEXT                              AS entry_type,
    c.task_id                                 AS source_ref,
    c.id                                      AS entry_id,
    c.completion_date                         AS entry_date,
    c.submitted_by                            AS employee,
    COALESCE(c.brand_id, t.brand_id)          AS brand_id,
    NULLIF(c.department, '')                  AS department,
    COALESCE(NULLIF(c.category, ''), t.category) AS category,
    t.task_name                               AS title,
    c.status                                  AS completion_status,
    c.submitted_at                            AS completed_at,
    COALESCE(NULLIF(c.summary, ''), c.work_performed) AS note,
    c.challenges                              AS challenges,
    c.follow_up                               AS follow_up,
    c.time_spent_minutes                      AS time_spent_minutes,
    (COALESCE(array_length(c.file_urls, 1), 0) + c.attachment_count) AS evidence_count,
    c.review_state                            AS review_state,
    t.priority                                AS priority,
    t.assigned_to                             AS assigned_to,
    (t.duty_id IS NOT NULL)                   AS from_duty
  FROM ops_completion_records c
  LEFT JOIN ops_tasks t ON t.task_id = c.task_id

  UNION ALL

  SELECT
    'duty'::TEXT                              AS entry_type,
    d.id::TEXT                                AS source_ref,
    l.id                                      AS entry_id,
    l.duty_date                               AS entry_date,
    COALESCE(NULLIF(l.completed_by, ''), m.name) AS employee,
    d.brand_id                                AS brand_id,
    NULLIF(d.department, '')                  AS department,
    NULLIF(d.category, '')                    AS category,
    d.title                                   AS title,
    l.status                                  AS completion_status,
    l.completed_at                            AS completed_at,
    l.note                                    AS note,
    ''::TEXT                                  AS challenges,
    ''::TEXT                                  AS follow_up,
    NULL::INTEGER                             AS time_spent_minutes,
    l.attachment_count                        AS evidence_count,
    l.review_state                            AS review_state,
    d.priority                                AS priority,
    m.name                                    AS assigned_to,
    TRUE                                      AS from_duty
  FROM ocg_daily_duty_logs l
  JOIN ocg_daily_duties d ON d.id = l.duty_id
  LEFT JOIN ops_team_members m ON m.id = l.assignee_id;

GRANT SELECT ON ops_daily_operations TO service_role;

-- ─── 5. RLS + GRANTS ────────────────────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['ops_task_reviews'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_service', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (auth.role() = ''service_role'') WITH CHECK (true)',
      t || '_service', t
    );
    EXECUTE format('GRANT ALL ON TABLE %I TO service_role', t);
  END LOOP;
END $$;
