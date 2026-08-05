-- Migration 053: Phase 2 — NPT instrument intake, repair lifecycle, workshop
-- planning and instrument movement.
-- Additive only. Idempotent — safe to re-run. Run in the Supabase SQL editor.
--
-- Digitises four paper records:
--   • INSTRUMENT REPAIR RECEIVING FORM  → npt_intakes + npt_intake_items
--   • technician repair notebook         → npt_repair_activities
--   • DAILY JOB ALLOCATION / PLANNER     → npt_workshop_plans + rows
--   • piano movement log                 → npt_movements
--
-- Deliberately NOT created: a separate "instruments" table, an "institutions"
-- table, or a "technicians" table. npt_pianos, npt_customers and
-- ops_team_members are generalised instead, so an instrument keeps one identity
-- and one owner across service visits, workshop repairs and movements.
--
-- npt_service_jobs (025) models a technician going OUT to an instrument.
-- npt_repair_cases models an instrument coming IN to the workshop. They are
-- different shapes and both are kept; a repair case can reference the service
-- job that produced it.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── 1. GENERALISE THE INSTRUMENT ───────────────────────────────────────────
-- npt_pianos was piano-shaped. The receiving form accepts keyboards,
-- saxophones, guitars, flutes, clarinets and "other", so the same row must be
-- able to represent any of them without abusing piano_type.

ALTER TABLE npt_pianos
  ADD COLUMN IF NOT EXISTS instrument_category  TEXT NOT NULL DEFAULT 'piano',
  -- piano | keyboard | saxophone | guitar | flute | clarinet | other
  ADD COLUMN IF NOT EXISTS instrument_type_other TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS colour_finish         TEXT NOT NULL DEFAULT '',
  -- Where the instrument physically is right now; updated by movements.
  ADD COLUMN IF NOT EXISTS current_location      TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS current_status        TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS current_repair_case_id UUID;

CREATE INDEX IF NOT EXISTS idx_npt_pianos_category ON npt_pianos (instrument_category);
CREATE INDEX IF NOT EXISTS idx_npt_pianos_serial   ON npt_pianos (serial_number);

-- Existing rows are all pianos; make that explicit rather than implicit.
UPDATE npt_pianos SET instrument_category = 'piano' WHERE COALESCE(instrument_category, '') = '';
-- Seed current_location from the location already recorded against the piano.
UPDATE npt_pianos SET current_location = location WHERE current_location = '' AND location <> '';

-- ─── 2. INSTITUTION CUSTOMERS ───────────────────────────────────────────────
-- The receiving form branches personal vs institute. npt_customers already has
-- customer_type and company_name, so an institution is a customer with
-- customer_type='institution' — no second customer vocabulary.

ALTER TABLE npt_customers
  ADD COLUMN IF NOT EXISTS contact_person        TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS billing_contact_name  TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS billing_contact_phone TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS billing_contact_email TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN npt_customers.customer_type IS
  'home | institution | dealer | other. "institution" pairs with company_name + contact_person.';

-- ─── 3. INTAKE (INSTRUMENT REPAIR RECEIVING FORM) ───────────────────────────

CREATE TABLE IF NOT EXISTS npt_intakes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference         TEXT UNIQUE,                 -- INT-0001, minted by ocg_next_reference
  brand_id          UUID REFERENCES brands(id) ON DELETE SET NULL,
  date_received     DATE NOT NULL DEFAULT CURRENT_DATE,
  time_received     TEXT NOT NULL DEFAULT '',    -- 'HH:MM' as written on the pad
  received_by       TEXT NOT NULL DEFAULT '',    -- defaults to the logged-in user
  received_by_email TEXT NOT NULL DEFAULT '',
  brought_in_by     TEXT NOT NULL DEFAULT '',
  reception_location TEXT NOT NULL DEFAULT '',
  intake_channel    TEXT NOT NULL DEFAULT 'walk_in', -- walk_in | pickup | delivery | transfer | other
  ownership_type    TEXT NOT NULL DEFAULT 'personal', -- personal | institution
  customer_id       UUID REFERENCES npt_customers(id) ON DELETE SET NULL,
  -- Free-text fallbacks captured at the counter before a customer row exists.
  customer_name     TEXT NOT NULL DEFAULT '',
  customer_phone    TEXT NOT NULL DEFAULT '',
  customer_email    TEXT NOT NULL DEFAULT '',
  customer_location TEXT NOT NULL DEFAULT '',
  alternative_contact TEXT NOT NULL DEFAULT '',
  preferred_channel TEXT NOT NULL DEFAULT '',
  institution_name  TEXT NOT NULL DEFAULT '',
  institution_contact_person TEXT NOT NULL DEFAULT '',
  institution_phone TEXT NOT NULL DEFAULT '',
  institution_email TEXT NOT NULL DEFAULT '',
  institution_location TEXT NOT NULL DEFAULT '',
  -- draft while the counter form is being filled; received once acknowledged.
  status            TEXT NOT NULL DEFAULT 'draft', -- draft | received | cancelled
  notes             TEXT NOT NULL DEFAULT '',
  acknowledged_at   TIMESTAMPTZ,
  created_by        TEXT NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_npt_intakes_date     ON npt_intakes (date_received DESC);
CREATE INDEX IF NOT EXISTS idx_npt_intakes_customer ON npt_intakes (customer_id);
CREATE INDEX IF NOT EXISTS idx_npt_intakes_status   ON npt_intakes (status);

-- One row per instrument on the receipt — the pad allows several.
CREATE TABLE IF NOT EXISTS npt_intake_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intake_id             UUID NOT NULL REFERENCES npt_intakes(id) ON DELETE CASCADE,
  piano_id              UUID REFERENCES npt_pianos(id) ON DELETE SET NULL, -- existing asset, or created on receipt
  instrument_category   TEXT NOT NULL DEFAULT 'piano',
  instrument_type_other TEXT NOT NULL DEFAULT '',
  quantity              INTEGER NOT NULL DEFAULT 1,   -- "No of PCS" on the pad
  brand_make            TEXT NOT NULL DEFAULT '',
  model                 TEXT NOT NULL DEFAULT '',
  serial_number         TEXT NOT NULL DEFAULT '',
  colour_finish         TEXT NOT NULL DEFAULT '',
  -- The pad prints "Accessories Received" twice; that is a printing artefact,
  -- not two data points. One structured list here, condition kept separate.
  accessories           TEXT[] NOT NULL DEFAULT '{}',
  accessories_notes     TEXT NOT NULL DEFAULT '',
  condition_at_receipt  TEXT NOT NULL DEFAULT '',
  reported_issue        TEXT NOT NULL DEFAULT '',
  work_requested        TEXT NOT NULL DEFAULT '',
  urgency               TEXT NOT NULL DEFAULT 'Normal',  -- Low | Normal | High | Urgent
  sort_order            INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_npt_intake_items_intake ON npt_intake_items (intake_id);
CREATE INDEX IF NOT EXISTS idx_npt_intake_items_piano  ON npt_intake_items (piano_id);

-- ─── 4. REPAIR CASES ────────────────────────────────────────────────────────
-- A received instrument is NOT a confirmed repair job. It starts at 'received'
-- and only becomes billable work after assessment and customer approval.

CREATE TABLE IF NOT EXISTS npt_repair_cases (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference          TEXT UNIQUE,                -- REP-0001
  intake_id          UUID REFERENCES npt_intakes(id) ON DELETE SET NULL,
  intake_item_id     UUID REFERENCES npt_intake_items(id) ON DELETE SET NULL,
  piano_id           UUID REFERENCES npt_pianos(id) ON DELETE SET NULL,
  customer_id        UUID REFERENCES npt_customers(id) ON DELETE SET NULL,
  service_job_id     UUID REFERENCES npt_service_jobs(id) ON DELETE SET NULL,
  ops_task_id        TEXT REFERENCES ops_tasks(task_id) ON DELETE SET NULL,
  -- received | awaiting_assessment | assessed | quotation_required |
  -- awaiting_customer_approval | approved | work_scheduled | in_repair |
  -- awaiting_parts | quality_inspection | ready_for_collection | collected |
  -- delivered | closed | cancelled
  status             TEXT NOT NULL DEFAULT 'received',
  priority           TEXT NOT NULL DEFAULT 'Medium',
  assigned_technician_id UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,
  consulting_guide_id    UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,
  reported_issue     TEXT NOT NULL DEFAULT '',
  assessment_summary TEXT NOT NULL DEFAULT '',
  work_completed     TEXT NOT NULL DEFAULT '',
  parts_used         TEXT NOT NULL DEFAULT '',
  quoted_amount_ksh  NUMERIC(12, 2),
  approved_amount_ksh NUMERIC(12, 2),
  current_location   TEXT NOT NULL DEFAULT '',
  opened_on          DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_completion DATE,
  closed_at          TIMESTAMPTZ,
  notes              TEXT NOT NULL DEFAULT '',
  created_by         TEXT NOT NULL DEFAULT '',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_npt_repair_cases_status ON npt_repair_cases (status);
CREATE INDEX IF NOT EXISTS idx_npt_repair_cases_piano  ON npt_repair_cases (piano_id);
CREATE INDEX IF NOT EXISTS idx_npt_repair_cases_tech   ON npt_repair_cases (assigned_technician_id);
CREATE INDEX IF NOT EXISTS idx_npt_repair_cases_intake ON npt_repair_cases (intake_id);

-- Now that repair cases exist, point the instrument at its live case.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'npt_pianos_current_repair_case_fk'
  ) THEN
    ALTER TABLE npt_pianos
      ADD CONSTRAINT npt_pianos_current_repair_case_fk
      FOREIGN KEY (current_repair_case_id) REFERENCES npt_repair_cases(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Every status change is recorded — never a silent overwrite (§6, §32).
CREATE TABLE IF NOT EXISTS npt_repair_case_status_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_case_id  UUID NOT NULL REFERENCES npt_repair_cases(id) ON DELETE CASCADE,
  previous_status TEXT NOT NULL DEFAULT '',
  new_status      TEXT NOT NULL,
  changed_by      TEXT NOT NULL DEFAULT '',
  changed_by_name TEXT NOT NULL DEFAULT '',
  comment         TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_npt_case_history_case
  ON npt_repair_case_status_history (repair_case_id, created_at DESC);

-- ─── 5. REPAIR ACTIVITY LOG (the technician notebook) ───────────────────────
-- Replaces "Date | Day | Piano Working On | Repairs Being Done | Status" with
-- entries bound to a real case, so the notebook is not a free-text island.

CREATE TABLE IF NOT EXISTS npt_repair_activities (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_case_id  UUID NOT NULL REFERENCES npt_repair_cases(id) ON DELETE CASCADE,
  piano_id        UUID REFERENCES npt_pianos(id) ON DELETE SET NULL,
  activity_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  technician_id   UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,
  work_performed  TEXT NOT NULL DEFAULT '',
  parts_used      TEXT NOT NULL DEFAULT '',
  hours_spent     NUMERIC(6, 2),
  -- not_started | in_progress | waiting_for_parts | waiting_for_approval |
  -- completed_for_day | repair_complete | blocked
  progress_status TEXT NOT NULL DEFAULT 'in_progress',
  challenges      TEXT NOT NULL DEFAULT '',
  next_action     TEXT NOT NULL DEFAULT '',
  expected_completion DATE,
  entered_by      TEXT NOT NULL DEFAULT '',
  entered_by_name TEXT NOT NULL DEFAULT '',
  reviewed_by     TEXT NOT NULL DEFAULT '',
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_npt_activities_case ON npt_repair_activities (repair_case_id, activity_date DESC);
CREATE INDEX IF NOT EXISTS idx_npt_activities_tech ON npt_repair_activities (technician_id, activity_date DESC);

-- ─── 6. DAILY WORKSHOP PLANNER ──────────────────────────────────────────────
-- One plan per day. The paper form's three tables share the same four columns,
-- so they are one row shape distinguished by `section`.

CREATE TABLE IF NOT EXISTS npt_workshop_plans (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id            UUID REFERENCES brands(id) ON DELETE SET NULL,
  plan_date           DATE NOT NULL DEFAULT CURRENT_DATE,
  workshop_clean      TEXT NOT NULL DEFAULT '',   -- yes | no | na
  workshop_comment    TEXT NOT NULL DEFAULT '',
  showroom_clean      TEXT NOT NULL DEFAULT '',   -- yes | no | na
  showroom_comment    TEXT NOT NULL DEFAULT '',
  manager_comment     TEXT NOT NULL DEFAULT '',
  manager_ack_by      TEXT NOT NULL DEFAULT '',
  manager_ack_at      TIMESTAMPTZ,
  director_comment    TEXT NOT NULL DEFAULT '',
  director_ack_by     TEXT NOT NULL DEFAULT '',
  director_ack_at     TIMESTAMPTZ,
  status              TEXT NOT NULL DEFAULT 'draft', -- draft | submitted | reviewed
  completed_at        TIMESTAMPTZ,
  created_by          TEXT NOT NULL DEFAULT '',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (brand_id, plan_date)
);
CREATE INDEX IF NOT EXISTS idx_npt_workshop_plans_date ON npt_workshop_plans (plan_date DESC);

CREATE TABLE IF NOT EXISTS npt_workshop_plan_rows (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id             UUID NOT NULL REFERENCES npt_workshop_plans(id) ON DELETE CASCADE,
  -- allocation = today's job · review = yesterday's outcome · challenge = yesterday's blocker
  section             TEXT NOT NULL DEFAULT 'allocation',
  repair_case_id      UUID REFERENCES npt_repair_cases(id) ON DELETE SET NULL,
  piano_id            UUID REFERENCES npt_pianos(id) ON DELETE SET NULL,
  instrument_label    TEXT NOT NULL DEFAULT '',   -- free text when no case exists yet
  technician_id       UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,
  consulting_guide_id UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,
  target_plan         TEXT NOT NULL DEFAULT '',
  priority            TEXT NOT NULL DEFAULT 'Medium',
  expected_result     TEXT NOT NULL DEFAULT '',
  due_at              TEXT NOT NULL DEFAULT '',
  -- review rows
  actual_outcome      TEXT NOT NULL DEFAULT '',
  outcome_status      TEXT NOT NULL DEFAULT '',
  comment             TEXT NOT NULL DEFAULT '',
  -- challenge rows
  challenge           TEXT NOT NULL DEFAULT '',
  required_intervention TEXT NOT NULL DEFAULT '',
  responsible_person_id UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,
  resolution_target   DATE,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_npt_plan_rows_plan ON npt_workshop_plan_rows (plan_id, section, sort_order);
CREATE INDEX IF NOT EXISTS idx_npt_plan_rows_case ON npt_workshop_plan_rows (repair_case_id);

-- ─── 7. INSTRUMENT MOVEMENTS ────────────────────────────────────────────────
-- From the July movement log: date, client, from→to, instrument, crew, paid.

CREATE TABLE IF NOT EXISTS npt_movements (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference           TEXT UNIQUE,                -- MOV-0001
  brand_id            UUID REFERENCES brands(id) ON DELETE SET NULL,
  movement_type       TEXT NOT NULL DEFAULT 'customer_delivery',
  -- customer_pickup | customer_delivery | internal_transfer | workshop_return |
  -- event_movement | storage_movement | other
  customer_id         UUID REFERENCES npt_customers(id) ON DELETE SET NULL,
  customer_label      TEXT NOT NULL DEFAULT '',
  piano_id            UUID REFERENCES npt_pianos(id) ON DELETE SET NULL,
  repair_case_id      UUID REFERENCES npt_repair_cases(id) ON DELETE SET NULL,
  instrument_category TEXT NOT NULL DEFAULT 'piano',
  instrument_label    TEXT NOT NULL DEFAULT '',   -- "Grand piano", "Yamaha U3 (up)"
  serial_number       TEXT NOT NULL DEFAULT '',
  quantity            INTEGER NOT NULL DEFAULT 1,
  origin              TEXT NOT NULL DEFAULT '',
  destination         TEXT NOT NULL DEFAULT '',
  scheduled_at        TIMESTAMPTZ,
  departed_at         TIMESTAMPTZ,
  arrived_at          TIMESTAMPTZ,
  crew                TEXT[] NOT NULL DEFAULT '{}',
  crew_member_ids     UUID[] NOT NULL DEFAULT '{}',
  vehicle             TEXT NOT NULL DEFAULT '',
  transport_provider  TEXT NOT NULL DEFAULT '',
  origin_contact      TEXT NOT NULL DEFAULT '',
  destination_contact TEXT NOT NULL DEFAULT '',
  fee_ksh             NUMERIC(12, 2),
  payment_status      TEXT NOT NULL DEFAULT 'unpaid',  -- unpaid | partial | paid | not_billable
  payment_reference   TEXT NOT NULL DEFAULT '',
  condition_before    TEXT NOT NULL DEFAULT '',
  condition_after     TEXT NOT NULL DEFAULT '',
  accessories_moved   TEXT[] NOT NULL DEFAULT '{}',
  special_handling    TEXT NOT NULL DEFAULT '',
  customer_ack_name   TEXT NOT NULL DEFAULT '',
  customer_ack_at     TIMESTAMPTZ,
  staff_ack_name      TEXT NOT NULL DEFAULT '',
  staff_ack_at        TIMESTAMPTZ,
  -- requested | scheduled | crew_assigned | in_transit | delivered |
  -- confirmed_received | completed | cancelled | incident_reported
  status              TEXT NOT NULL DEFAULT 'requested',
  incident_note       TEXT NOT NULL DEFAULT '',
  notes               TEXT NOT NULL DEFAULT '',
  created_by          TEXT NOT NULL DEFAULT '',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_npt_movements_status   ON npt_movements (status);
CREATE INDEX IF NOT EXISTS idx_npt_movements_piano    ON npt_movements (piano_id);
CREATE INDEX IF NOT EXISTS idx_npt_movements_customer ON npt_movements (customer_id);
CREATE INDEX IF NOT EXISTS idx_npt_movements_date     ON npt_movements (scheduled_at DESC);

-- ─── 8. TRAINING LOGBOOK (§10) ──────────────────────────────────────────────
-- NOTE: no photograph of the Piano Technician Daily Class Logbook was supplied.
-- Fields below come from the written brief only and are UNVERIFIED against the
-- physical book — confirm before relying on them operationally.

CREATE TABLE IF NOT EXISTS npt_training_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference         TEXT UNIQUE,                  -- TRN-0001
  brand_id          UUID REFERENCES brands(id) ON DELETE SET NULL,
  session_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  instructor_id     UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,
  instructor_name   TEXT NOT NULL DEFAULT '',
  class_group       TEXT NOT NULL DEFAULT '',
  training_location TEXT NOT NULL DEFAULT '',
  objective         TEXT NOT NULL DEFAULT '',
  topic             TEXT NOT NULL DEFAULT '',
  subtopics         TEXT NOT NULL DEFAULT '',
  practical_work    TEXT NOT NULL DEFAULT '',
  learning_review   TEXT NOT NULL DEFAULT '',
  questions_asked   TEXT NOT NULL DEFAULT '',
  instructor_signed_by TEXT NOT NULL DEFAULT '',
  instructor_signed_at TIMESTAMPTZ,
  manager_reviewed_by  TEXT NOT NULL DEFAULT '',
  manager_reviewed_at  TIMESTAMPTZ,
  status            TEXT NOT NULL DEFAULT 'draft', -- draft | submitted | reviewed
  created_by        TEXT NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_npt_training_date ON npt_training_sessions (session_date DESC);

CREATE TABLE IF NOT EXISTS npt_training_attendance (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID NOT NULL REFERENCES npt_training_sessions(id) ON DELETE CASCADE,
  trainee_id   UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,
  trainee_name TEXT NOT NULL DEFAULT '',
  present      BOOLEAN NOT NULL DEFAULT true,
  absence_reason TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_npt_training_attendance_session
  ON npt_training_attendance (session_id);

-- ─── 9. REFERENCE SEQUENCES ─────────────────────────────────────────────────
INSERT INTO ops_id_sequences (name, current_val) VALUES
  ('npt_intake', 0), ('npt_repair_case', 0), ('npt_movement', 0), ('npt_training', 0)
ON CONFLICT (name) DO NOTHING;

-- ─── 10. RLS + GRANTS ───────────────────────────────────────────────────────
ALTER TABLE npt_intakes                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE npt_intake_items               ENABLE ROW LEVEL SECURITY;
ALTER TABLE npt_repair_cases               ENABLE ROW LEVEL SECURITY;
ALTER TABLE npt_repair_case_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE npt_repair_activities          ENABLE ROW LEVEL SECURITY;
ALTER TABLE npt_workshop_plans             ENABLE ROW LEVEL SECURITY;
ALTER TABLE npt_workshop_plan_rows         ENABLE ROW LEVEL SECURITY;
ALTER TABLE npt_movements                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE npt_training_sessions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE npt_training_attendance        ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'npt_intakes', 'npt_intake_items', 'npt_repair_cases', 'npt_repair_case_status_history',
    'npt_repair_activities', 'npt_workshop_plans', 'npt_workshop_plan_rows', 'npt_movements',
    'npt_training_sessions', 'npt_training_attendance'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_service', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (auth.role() = ''service_role'') WITH CHECK (true)',
      t || '_service', t
    );
    EXECUTE format('GRANT ALL ON TABLE %I TO service_role', t);
  END LOOP;
END $$;
