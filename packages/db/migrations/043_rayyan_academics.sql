-- Migration 043: Ar-Rayyan academics — co-curricular, assessments, history
-- Additive only. Adds per-student academic depth to the Rayyan module:
--   - rayyan_activities + rayyan_student_activities: co-curricular register
--     (seeded with Ballerina, Football, Music, Chess — extensible)
--   - rayyan_assessments: CBC academic tracking per student / term / area,
--     the data source for the printable transcript
--   - rayyan_student_history: enrolment / promotion / award / exit timeline
-- Run in the Supabase SQL editor. Idempotent — safe to re-run.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── Co-curricular activities ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rayyan_activities (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO rayyan_activities (name) VALUES
  ('Ballerina'), ('Football'), ('Music'), ('Chess')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS rayyan_student_activities (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID NOT NULL REFERENCES rayyan_students(id) ON DELETE CASCADE,
  activity_id UUID NOT NULL REFERENCES rayyan_activities(id) ON DELETE CASCADE,
  joined_on   DATE,
  notes       TEXT NOT NULL DEFAULT '',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, activity_id)
);
CREATE INDEX IF NOT EXISTS idx_rayyan_student_activities_student ON rayyan_student_activities (student_id);

-- ─── Academic assessments (CBC) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rayyan_assessments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id        UUID NOT NULL REFERENCES rayyan_students(id) ON DELETE CASCADE,
  academic_year     TEXT NOT NULL DEFAULT '',
  term              TEXT NOT NULL DEFAULT '',    -- Term 1 | Term 2 | Term 3
  learning_area     TEXT NOT NULL,               -- Language, Mathematical, Environmental, Psychomotor, Religious…
  assessment_type   TEXT NOT NULL DEFAULT 'End of term',
  -- CBC performance level: EE | ME | AE | BE (Exceeding/Meeting/Approaching/Below Expectation)
  performance_level TEXT NOT NULL DEFAULT '',
  score             NUMERIC(6, 2),
  remarks           TEXT NOT NULL DEFAULT '',
  assessed_on       DATE,
  teacher           TEXT NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rayyan_assessments_student ON rayyan_assessments (student_id);
CREATE INDEX IF NOT EXISTS idx_rayyan_assessments_term    ON rayyan_assessments (academic_year, term);

-- ─── Student history (enrolment → exit timeline) ─────────────────────────────
CREATE TABLE IF NOT EXISTS rayyan_student_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID NOT NULL REFERENCES rayyan_students(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL DEFAULT 'note',   -- enrollment | promotion | transfer | award | discipline | note | exit
  title       TEXT NOT NULL,
  details     TEXT NOT NULL DEFAULT '',
  occurred_on DATE NOT NULL DEFAULT CURRENT_DATE,
  recorded_by TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rayyan_history_student ON rayyan_student_history (student_id);

-- ─── RLS + grants (repo convention: authenticated read, service_role all) ────
ALTER TABLE rayyan_activities         ENABLE ROW LEVEL SECURITY;
ALTER TABLE rayyan_student_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE rayyan_assessments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE rayyan_student_history    ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['rayyan_activities','rayyan_student_activities','rayyan_assessments','rayyan_student_history'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s_read" ON %I', t, t);
    EXECUTE format('CREATE POLICY "%s_read" ON %I FOR SELECT TO authenticated USING (true)', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_service" ON %I', t, t);
    EXECUTE format('CREATE POLICY "%s_service" ON %I USING (auth.role() = ''service_role'') WITH CHECK (true)', t, t);
    EXECUTE format('GRANT ALL ON TABLE %I TO service_role', t);
  END LOOP;
END $$;
