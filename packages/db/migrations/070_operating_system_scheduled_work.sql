-- Migration 070: the company Operating System, scheduled work, atomic
-- countersignatures, and disposable Knowledge cleanup.
--
-- Five independent concerns, one migration because they ship together:
--
--   1. SCHEDULED WORK      — a task can now say WHEN it should be performed,
--                            separately from when it is DUE.
--   2. OPERATING SYSTEM    — versioned manuals describing how the group and
--                            each entity actually operate. Deliberately NOT
--                            stored in ocg_knowledge_entries: Knowledge is an
--                            atomic document library, the Operating System is a
--                            connected manual. Two purposes, two models.
--   3. ATOMIC COUNTERSIGN  — a review verdict and its immutable audit event now
--                            commit together or not at all.
--   4. REVIEW TRANSITIONS  — only a pending occurrence can be accepted/reopened.
--   5. KNOWLEDGE CLEANUP   — hard-delete two disposable smoke-test records,
--                            under a rule narrow enough that it cannot reach
--                            real company Knowledge.
--
-- Additive and idempotent. No operational, employee or historical data is
-- seeded — only the seven Operating System manual shells and their v1 version
-- rows, which carry metadata; the vetted chapter text lives in the repository
-- (see apps/ops-hub/src/lib/operatingSystem/manuals) so it is reviewable as
-- code rather than as an opaque SQL blob.

BEGIN;

-- ─── 1. SCHEDULED WORK (§§40–45) ────────────────────────────────────────────
--
-- target_date is a DEADLINE ("finish by Friday"). It was being used as the only
-- time signal a task had, so "Wallace should do this Wednesday 10:00–12:00"
-- could not be expressed at all. These columns carry the SCHEDULE; the deadline
-- stays exactly where it was.
--
-- All nullable: every task that exists today keeps behaving as it does today,
-- appearing on the calendar as an all-day deadline marker.
ALTER TABLE ops_tasks
  ADD COLUMN IF NOT EXISTS scheduled_start_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scheduled_end_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scheduled_all_day   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS scheduled_location  TEXT NOT NULL DEFAULT '';

-- A window that ends before it starts is never a typo worth keeping.
ALTER TABLE ops_tasks DROP CONSTRAINT IF EXISTS ops_tasks_schedule_window_check;
ALTER TABLE ops_tasks
  ADD CONSTRAINT ops_tasks_schedule_window_check
  CHECK (
    scheduled_start_at IS NULL
    OR scheduled_end_at IS NULL
    OR scheduled_end_at >= scheduled_start_at
  );

-- The calendar asks "what is scheduled in this window?" on every render.
CREATE INDEX IF NOT EXISTS idx_tasks_scheduled_start
  ON ops_tasks (scheduled_start_at) WHERE scheduled_start_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_scheduled_assignee
  ON ops_tasks (assigned_to, scheduled_start_at) WHERE scheduled_start_at IS NOT NULL;

-- ─── 2. OPERATING SYSTEM (§§4–7) ────────────────────────────────────────────
--
-- One manual per scope (the group, plus one per entity), each with an ordered
-- version history. Identity and governance metadata live here; chapter content
-- is resolved by content_ref against the vetted baseline in the repository, or
-- from `content` once a future authoring surface writes structured chapters
-- directly. The resolver prefers `content` when it is non-empty, so this table
-- is ready for editing without a second migration — and the web page and the
-- PDF read whichever wins through ONE resolver, so they cannot drift (§7).
CREATE TABLE IF NOT EXISTS ocg_operating_system_manuals (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug               TEXT NOT NULL,
  -- 'group' = One Core Group as a whole; 'brand' = one entity.
  scope_type         TEXT NOT NULL DEFAULT 'brand',
  brand_id           UUID REFERENCES brands(id) ON DELETE CASCADE,
  title              TEXT NOT NULL,
  summary            TEXT NOT NULL DEFAULT '',
  sort_order         INTEGER NOT NULL DEFAULT 0,
  current_version_id UUID,
  active             BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ocg_os_manual_scope_check CHECK (scope_type IN ('group', 'brand')),
  -- A group manual has no brand; an entity manual must name one.
  CONSTRAINT ocg_os_manual_brand_check CHECK (
    (scope_type = 'group' AND brand_id IS NULL)
    OR (scope_type = 'brand' AND brand_id IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_os_manual_slug ON ocg_operating_system_manuals (slug);
CREATE INDEX IF NOT EXISTS idx_os_manual_brand ON ocg_operating_system_manuals (brand_id, active);

CREATE TABLE IF NOT EXISTS ocg_operating_system_versions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manual_id      UUID NOT NULL REFERENCES ocg_operating_system_manuals(id) ON DELETE CASCADE,
  version_no     INTEGER NOT NULL,
  -- working_draft: readable and downloadable, but explicitly NOT approved
  -- policy. v1 manuals are compiled partly from historical material, so calling
  -- them 'current' would misrepresent 2015 procedure as 2026 policy (§53).
  status         TEXT NOT NULL DEFAULT 'working_draft',
  -- Structured chapters. Empty = resolve from the repository baseline named by
  -- content_ref.
  content        JSONB NOT NULL DEFAULT '[]'::jsonb,
  content_ref    TEXT NOT NULL DEFAULT '',
  source_summary TEXT NOT NULL DEFAULT '',
  effective_from DATE,
  review_date    DATE,
  generated_by   TEXT NOT NULL DEFAULT '',
  approved_by    TEXT NOT NULL DEFAULT '',
  approved_at    TIMESTAMPTZ,
  change_summary TEXT NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ocg_os_version_status_check
    CHECK (status IN ('working_draft', 'current', 'superseded', 'archived')),
  -- 'current' means approved. Approval needs a name and a time.
  CONSTRAINT ocg_os_version_approved_check
    CHECK (status <> 'current' OR (approved_by <> '' AND approved_at IS NOT NULL)),
  UNIQUE (manual_id, version_no)
);
CREATE INDEX IF NOT EXISTS idx_os_version_manual
  ON ocg_operating_system_versions (manual_id, version_no DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ocg_os_current_version_fk') THEN
    ALTER TABLE ocg_operating_system_manuals
      ADD CONSTRAINT ocg_os_current_version_fk
      FOREIGN KEY (current_version_id) REFERENCES ocg_operating_system_versions(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── 3. SEED THE SEVEN v1 MANUALS (§63) ─────────────────────────────────────
--
-- Re-runnable: keyed on slug, so a second apply updates the shell rather than
-- creating a duplicate manual. Entity manuals are attached to their brand by
-- slug; if a brand row is missing the manual is simply not created, rather than
-- being orphaned or silently attached to the wrong entity.
DO $$
DECLARE
  spec RECORD;
  v_brand_id UUID;
  v_manual_id UUID;
  v_version_id UUID;
BEGIN
  FOR spec IN
    SELECT * FROM (VALUES
      ('one-core-group',            'group', NULL::TEXT,
       'One Core Group Operating System',
       'How the group operates: shared functions, responsibility and authority, recurring duties, controls, records and management review across all entities.', 0),
      ('nairobi-piano-technicians', 'brand', 'nairobi-piano-technicians',
       'Nairobi Piano Technicians Operating System',
       'Instrument intake, workshop and service operation, movement records, parts, invoicing and customer follow-up.', 1),
      ('iceland-glitz-n-glim',      'brand', 'glitz-n-glim',
       'Iceland / Glitz N'' Glim Operating System',
       'The full chain: procurement, raw and packaging stores, material requisition, production and QC, finished goods, field-sales custody and daily reconciliation.', 2),
      ('rhythms-college',           'brand', 'rhythms-college',
       'Rhythms College Operating System',
       'Opening and facility control, front office, admissions, fees and receipting, academic delivery, teaching records, examinations, management verification and events.', 3),
      ('ar-rayyan',                 'brand', 'ar-rayyan-playhouse',
       'Ar-Rayyan Playhouse & Daycare Operating System',
       'Safeguarding and opening, learner reception, classroom delivery, daycare and playgroup, meals and hygiene, release and transport, academic quality and records.', 4),
      ('darul-swafa',               'brand', 'darul-swafa',
       'Darul Swafa Operating System',
       'Madrasa administration, attendance, teaching delivery, student records, food and boarding supplies, daily diary, purchases and management review.', 5),
      ('nuura-nest',                'brand', 'nuuranest-stays',
       'Nuura Nest Operating System',
       'The short-stay portfolio as the current system supports it: property register, listing stewardship, income categorisation and reconciliation, and property readiness work.', 6)
    ) AS t(slug, scope_type, brand_slug, title, summary, sort_order)
  LOOP
    v_brand_id := NULL;
    IF spec.brand_slug IS NOT NULL THEN
      SELECT id INTO v_brand_id FROM brands WHERE slug = spec.brand_slug;
      -- No brand row → skip rather than orphan the manual.
      CONTINUE WHEN v_brand_id IS NULL;
    END IF;

    INSERT INTO ocg_operating_system_manuals
      (slug, scope_type, brand_id, title, summary, sort_order)
    VALUES
      (spec.slug, spec.scope_type, v_brand_id, spec.title, spec.summary, spec.sort_order)
    ON CONFLICT (slug) DO UPDATE
      SET title = EXCLUDED.title,
          summary = EXCLUDED.summary,
          sort_order = EXCLUDED.sort_order,
          brand_id = EXCLUDED.brand_id,
          updated_at = now()
    RETURNING id INTO v_manual_id;

    -- v1, only if this manual has no version yet. Re-running must not mint a v2
    -- of an unchanged manual.
    SELECT id INTO v_version_id
      FROM ocg_operating_system_versions
      WHERE manual_id = v_manual_id AND version_no = 1;

    IF v_version_id IS NULL THEN
      INSERT INTO ocg_operating_system_versions
        (manual_id, version_no, status, content_ref, source_summary, generated_by, change_summary)
      VALUES (
        v_manual_id, 1, 'working_draft', spec.slug,
        'Compiled from the current OCG Ops Hub operating architecture, management-provided operational records, employee routine records, existing company Knowledge, and legacy entity operating manuals where applicable. Some procedures remain subject to management confirmation as structured employee and historical data are progressively loaded.',
        'system', 'Initial working draft.'
      )
      RETURNING id INTO v_version_id;
    END IF;

    UPDATE ocg_operating_system_manuals
      SET current_version_id = v_version_id, updated_at = now()
      WHERE id = v_manual_id;
  END LOOP;
END $$;

-- ─── 4. ATOMIC COUNTERSIGN (§47) + REVIEW TRANSITIONS (§48) ─────────────────
--
-- The portal tells an employee "Countersigned by Fatma". That sentence is only
-- true if the immutable review event exists. Writing the verdict to the log and
-- then appending the event best-effort meant a failed append left a
-- countersignature with no record of who gave it — which is precisely the thing
-- a countersignature is for.
--
-- Both writes now happen inside one function, so they commit together or not at
-- all. The state check moved in here too: a log id alone must not be enough to
-- accept work twice, or to reopen something nobody submitted (§48).
CREATE OR REPLACE FUNCTION review_duty_occurrence(
  p_log_id         UUID,
  p_decision       TEXT,
  p_comment        TEXT,
  p_quality_rating INTEGER,
  p_reviewed_by    TEXT,
  p_reviewed_by_id UUID
) RETURNS ocg_daily_duty_logs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  occurrence ocg_daily_duty_logs;
BEGIN
  IF p_decision NOT IN ('accept', 'reopen') THEN
    RAISE EXCEPTION 'Unknown review decision: %', p_decision;
  END IF;

  SELECT * INTO occurrence FROM ocg_daily_duty_logs WHERE id = p_log_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Occurrence not found';
  END IF;

  -- Only work that is actually awaiting a decision can receive one.
  IF occurrence.review_state <> 'pending' THEN
    RAISE EXCEPTION 'This occurrence is not awaiting review (current state: %)', occurrence.review_state
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  UPDATE ocg_daily_duty_logs
     SET review_state   = CASE WHEN p_decision = 'accept' THEN 'accepted' ELSE 'reopened' END,
         -- Reopening returns the occurrence to the assignee's list; accepting
         -- leaves the recorded completion untouched.
         status         = CASE WHEN p_decision = 'reopen' THEN 'pending' ELSE status END,
         review_comment = COALESCE(p_comment, ''),
         quality_rating = p_quality_rating,
         reviewed_by    = p_reviewed_by,
         reviewed_at    = now()
   WHERE id = p_log_id
   RETURNING * INTO occurrence;

  -- Append-only, in the same transaction. A failure here aborts the verdict.
  INSERT INTO ops_task_reviews
    (duty_log_id, decision, comment, quality_rating, reopen_reason, reviewed_by, reviewed_by_id)
  VALUES (
    p_log_id,
    CASE WHEN p_decision = 'accept' THEN 'accepted' ELSE 'reopened' END,
    COALESCE(p_comment, ''),
    p_quality_rating,
    CASE WHEN p_decision = 'reopen' THEN COALESCE(p_comment, '') ELSE '' END,
    p_reviewed_by,
    p_reviewed_by_id
  );

  RETURN occurrence;
END $$;
REVOKE ALL ON FUNCTION review_duty_occurrence(UUID, TEXT, TEXT, INTEGER, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION review_duty_occurrence(UUID, TEXT, TEXT, INTEGER, TEXT, UUID) TO service_role;

-- The task equivalent. `p_expected_status` is an optimistic-concurrency guard:
-- the caller states the status it made its authorization decision against, and
-- the update refuses if someone else moved the task in between.
CREATE OR REPLACE FUNCTION review_task_completion(
  p_task_id         TEXT,
  p_status          TEXT,
  p_note            TEXT,
  p_reviewed_by     TEXT,
  p_reviewed_by_id  UUID,
  p_expected_status TEXT
) RETURNS ops_tasks
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  task ops_tasks;
BEGIN
  SELECT * INTO task FROM ops_tasks WHERE task_id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found';
  END IF;

  IF p_expected_status IS NOT NULL AND task.current_status <> p_expected_status THEN
    RAISE EXCEPTION 'This task has moved on since you opened it (now: %)', task.current_status
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  UPDATE ops_tasks
     SET current_status      = p_status,
         latest_work_comment = CASE WHEN COALESCE(p_note, '') <> '' THEN p_note ELSE latest_work_comment END,
         last_updated_by     = p_reviewed_by,
         -- last_updated_date is TEXT and the application writes ISO-8601;
         -- now()::TEXT would write a different shape into the same column.
         last_updated_date   = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') || 'Z',
         active              = CASE WHEN p_status IN ('Completed', 'Cancelled') THEN 'No' ELSE 'Yes' END,
         reopened_count      = CASE WHEN p_status = 'Reopened' THEN reopened_count + 1 ELSE reopened_count END,
         updated_at          = now()
   WHERE task_id = p_task_id
   RETURNING * INTO task;

  INSERT INTO ops_task_reviews
    (task_id, decision, comment, reopen_reason, reviewed_by, reviewed_by_id)
  VALUES (
    p_task_id,
    CASE WHEN p_status = 'Reopened' THEN 'reopened' ELSE 'accepted' END,
    COALESCE(p_note, ''),
    CASE WHEN p_status = 'Reopened' THEN COALESCE(p_note, '') ELSE '' END,
    p_reviewed_by,
    p_reviewed_by_id
  );

  RETURN task;
END $$;
REVOKE ALL ON FUNCTION review_task_completion(TEXT, TEXT, TEXT, TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION review_task_completion(TEXT, TEXT, TEXT, TEXT, UUID, TEXT) TO service_role;

-- ─── 5. DISPOSABLE KNOWLEDGE CLEANUP (§§35–37) ──────────────────────────────
--
-- Two Reader smoke-test records were left behind by live verification. They are
-- disposable test data, not institutional Knowledge, and should not exist.
--
-- Knowledge versions are append-only by trigger, which is correct and stays
-- correct. The trigger gains ONE narrow exemption: a record may be deleted only
-- if it is unmistakably disposable test data — the reserved __KREAD_SMOKE_
-- title prefix AND both the 'smoke' and 'disposable' tags. A real archived
-- policy satisfies none of those, so this path cannot reach company records.
CREATE OR REPLACE FUNCTION is_disposable_test_knowledge(p_entry_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM ocg_knowledge_entries e
     WHERE e.id = p_entry_id
       AND starts_with(e.title, '__KREAD_SMOKE_')
       AND e.tags @> ARRAY['smoke']::TEXT[]
       AND e.tags @> ARRAY['disposable']::TEXT[]
  );
$$;

CREATE OR REPLACE FUNCTION prevent_published_knowledge_rewrite()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- The single exemption: explicitly disposable test data.
    IF is_disposable_test_knowledge(OLD.entry_id) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'Knowledge versions are append-only; archive or supersede instead';
  END IF;
  IF OLD.status <> 'draft' AND (
    NEW.content_body IS DISTINCT FROM OLD.content_body OR
    NEW.file_url IS DISTINCT FROM OLD.file_url OR
    NEW.file_hash IS DISTINCT FROM OLD.file_hash OR
    NEW.source_title IS DISTINCT FROM OLD.source_title OR
    NEW.source_type IS DISTINCT FROM OLD.source_type OR
    NEW.source_date IS DISTINCT FROM OLD.source_date OR
    NEW.source_reference IS DISTINCT FROM OLD.source_reference OR
    NEW.version_no IS DISTINCT FROM OLD.version_no
  ) THEN
    RAISE EXCEPTION 'Published knowledge content is immutable; create a new version';
  END IF;
  RETURN NEW;
END $$;

-- Remove the disposable records. current_version_id is cleared first so the
-- entry stops referencing a version we are about to delete.
DO $$
DECLARE
  doomed UUID[];
BEGIN
  SELECT COALESCE(array_agg(id), '{}') INTO doomed
    FROM ocg_knowledge_entries
   WHERE starts_with(title, '__KREAD_SMOKE_')
     AND tags @> ARRAY['smoke']::TEXT[]
     AND tags @> ARRAY['disposable']::TEXT[];

  IF array_length(doomed, 1) IS NULL THEN
    RETURN; -- already clean
  END IF;

  UPDATE ocg_knowledge_entries SET current_version_id = NULL WHERE id = ANY(doomed);
  UPDATE ocg_knowledge_versions SET supersedes_version_id = NULL
   WHERE supersedes_version_id IN (SELECT id FROM ocg_knowledge_versions WHERE entry_id = ANY(doomed));
  DELETE FROM ocg_knowledge_versions WHERE entry_id = ANY(doomed);
  DELETE FROM ocg_knowledge_entries WHERE id = ANY(doomed);

  RAISE NOTICE 'Removed % disposable Knowledge smoke record(s).', array_length(doomed, 1);
END $$;

-- ─── 6. RLS + GRANTS ────────────────────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ocg_operating_system_manuals', 'ocg_operating_system_versions'
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

COMMIT;
