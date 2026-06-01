-- Migration 017: Ops Hub — task delivery & assignment core
-- Ported from WM Task Ops (tasks.wallacemecha.com) and adapted to One Core Group:
--   * Brand-aware: projects + tasks carry a nullable brand_id → brands(id),
--     so the 6 OCG brands are first-class work streams alongside external clients.
--   * A project must belong to EITHER an external client OR a brand (CHECK).
--   * Identity/permissions come from Supabase Auth + user_permissions (the
--     'ops' / 'ops_agents' sections), NOT NextAuth/Google.
-- Run in Supabase SQL Editor. Idempotent — safe to re-run.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── ID SEQUENCES — atomic sequential ID counters ────────────────────────────
-- CLIENT-XXX / PROJ-XXX / TASK-XXXX human-readable IDs are minted here so two
-- concurrent inserts can never collide.
CREATE TABLE IF NOT EXISTS ops_id_sequences (
  name        TEXT PRIMARY KEY,
  current_val INTEGER NOT NULL DEFAULT 0
);

INSERT INTO ops_id_sequences (name, current_val) VALUES
  ('task', 0), ('project', 0), ('client', 0)
ON CONFLICT (name) DO NOTHING;

-- Atomic increment — always returns the NEW value. Call inside the same
-- statement that builds the ID to guarantee uniqueness.
CREATE OR REPLACE FUNCTION ops_next_sequence_val(seq_name TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE v INTEGER;
BEGIN
  UPDATE ops_id_sequences
     SET current_val = current_val + 1
   WHERE name = seq_name
   RETURNING current_val INTO v;
  IF v IS NULL THEN
    RAISE EXCEPTION 'Sequence "%" not found', seq_name;
  END IF;
  RETURN v;
END;
$$;

-- ─── OPS CLIENTS ─────────────────────────────────────────────────────────────
-- External client relationships. Internal brand work does not need a client row;
-- it hangs off brand_id on the project instead.
CREATE TABLE IF NOT EXISTS ops_clients (
  client_id           TEXT PRIMARY KEY,           -- CLIENT-XXX
  client_name         TEXT NOT NULL,
  industry            TEXT NOT NULL DEFAULT '',
  country_city        TEXT NOT NULL DEFAULT '',
  relationship_status TEXT NOT NULL DEFAULT 'Active Client',
  drive_folder_id     TEXT,
  folder_status       TEXT NOT NULL DEFAULT 'done',  -- 'pending' | 'done'
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ops_clients_name   ON ops_clients (client_name);
CREATE INDEX IF NOT EXISTS idx_ops_clients_status ON ops_clients (relationship_status);

-- ─── OPS PROJECTS ────────────────────────────────────────────────────────────
-- A bounded engagement. Belongs to a brand (internal) and/or an external client.
CREATE TABLE IF NOT EXISTS ops_projects (
  project_id      TEXT PRIMARY KEY,               -- PROJ-XXX
  project_name    TEXT NOT NULL,
  brand_id        UUID REFERENCES brands(id) ON DELETE SET NULL,
  client_id       TEXT REFERENCES ops_clients(client_id) ON DELETE SET NULL,
  client_name     TEXT NOT NULL DEFAULT '',
  service_line    TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'Active',
  start_date      TEXT NOT NULL DEFAULT '',
  notes           TEXT NOT NULL DEFAULT '',
  drive_folder_id TEXT,
  folder_status   TEXT NOT NULL DEFAULT 'done',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ops_projects_owner_chk CHECK (brand_id IS NOT NULL OR client_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_ops_projects_brand  ON ops_projects (brand_id);
CREATE INDEX IF NOT EXISTS idx_ops_projects_client ON ops_projects (client_id);
CREATE INDEX IF NOT EXISTS idx_ops_projects_status ON ops_projects (status);

-- ─── OPS TEAM MEMBERS ────────────────────────────────────────────────────────
-- Assignable people. email links to a Supabase auth user (by email) when they
-- have a login; assignment + completion still work for people without one.
CREATE TABLE IF NOT EXISTS ops_team_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  email      TEXT,
  role       TEXT NOT NULL DEFAULT 'team',  -- 'admin' | 'lead' | 'team'
  brand_ids  UUID[] NOT NULL DEFAULT '{}',  -- brands this person works across
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ops_team_members_email ON ops_team_members (email);
CREATE INDEX IF NOT EXISTS idx_ops_team_members_name  ON ops_team_members (name);

-- ─── OPS TASKS ───────────────────────────────────────────────────────────────
-- The unit of assignment + delivery. Status machine:
--   Not Started → Ongoing → AI Draft Ready → (Approved | Edit Requested) → Completed
--   (+ Blocked, Partially Completed)
CREATE TABLE IF NOT EXISTS ops_tasks (
  task_id              TEXT PRIMARY KEY,          -- TASK-XXXX
  dropdown_label       TEXT NOT NULL DEFAULT '',
  project_id           TEXT NOT NULL REFERENCES ops_projects(project_id) ON DELETE CASCADE,
  project_name         TEXT NOT NULL DEFAULT '',
  brand_id             UUID REFERENCES brands(id) ON DELETE SET NULL,
  client_id            TEXT NOT NULL DEFAULT '',
  task_name            TEXT NOT NULL,
  task_description     TEXT NOT NULL DEFAULT '',
  assigned_to          TEXT NOT NULL DEFAULT '',
  category             TEXT NOT NULL DEFAULT 'Operations',
  priority             TEXT NOT NULL DEFAULT 'Medium',
  start_date           TEXT NOT NULL DEFAULT '',
  target_date          TEXT NOT NULL DEFAULT '',
  current_status       TEXT NOT NULL DEFAULT 'Not Started',
  last_updated_by      TEXT NOT NULL DEFAULT '',
  last_updated_date    TEXT NOT NULL DEFAULT '',
  latest_work_comment  TEXT NOT NULL DEFAULT '',
  active               TEXT NOT NULL DEFAULT 'Yes',
  notes                TEXT NOT NULL DEFAULT '',
  hmac_token           TEXT,
  agent_eligible       TEXT NOT NULL DEFAULT 'Yes',   -- 'Yes' | 'No'
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ops_tasks_project  ON ops_tasks (project_id);
CREATE INDEX IF NOT EXISTS idx_ops_tasks_brand    ON ops_tasks (brand_id);
CREATE INDEX IF NOT EXISTS idx_ops_tasks_assigned ON ops_tasks (assigned_to);
CREATE INDEX IF NOT EXISTS idx_ops_tasks_status   ON ops_tasks (current_status);
CREATE INDEX IF NOT EXISTS idx_ops_tasks_active   ON ops_tasks (active);
CREATE INDEX IF NOT EXISTS idx_ops_tasks_created  ON ops_tasks (created_at DESC);

-- ─── OPS PROJECT CONTEXT ─────────────────────────────────────────────────────
-- Living context doc per project, consumed by the agent specialists.
CREATE TABLE IF NOT EXISTS ops_project_context (
  project_id TEXT PRIMARY KEY REFERENCES ops_projects(project_id) ON DELETE CASCADE,
  content    TEXT NOT NULL DEFAULT '',
  updated_by TEXT NOT NULL DEFAULT 'admin',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── COMPLETION RECORDS ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ops_completion_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         TEXT NOT NULL,
  completion_date DATE NOT NULL,
  status          TEXT NOT NULL DEFAULT 'Completed',
  summary         TEXT NOT NULL DEFAULT '',
  outcome         TEXT NOT NULL DEFAULT '',
  blockers_notes  TEXT NOT NULL DEFAULT '',
  file_urls       TEXT[] NOT NULL DEFAULT '{}',
  submitted_by    TEXT NOT NULL DEFAULT '',
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ops_completion_task_id   ON ops_completion_records (task_id);
CREATE INDEX IF NOT EXISTS idx_ops_completion_submitted ON ops_completion_records (submitted_at DESC);

-- ─── ROW LEVEL SECURITY ──────────────────────────────────────────────────────
-- Project convention: authenticated users read; the service role (used by the
-- /api/* routes with the service key) does everything.
ALTER TABLE ops_clients            ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_projects           ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_team_members       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_tasks              ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_project_context    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_completion_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ops_clients_auth"     ON ops_clients            FOR SELECT TO authenticated USING (true);
CREATE POLICY "ops_projects_auth"    ON ops_projects           FOR SELECT TO authenticated USING (true);
CREATE POLICY "ops_team_auth"        ON ops_team_members       FOR SELECT TO authenticated USING (true);
CREATE POLICY "ops_tasks_auth"       ON ops_tasks              FOR SELECT TO authenticated USING (true);
CREATE POLICY "ops_project_ctx_auth" ON ops_project_context    FOR SELECT TO authenticated USING (true);
CREATE POLICY "ops_completion_auth"  ON ops_completion_records FOR SELECT TO authenticated USING (true);

CREATE POLICY "ops_clients_service"     ON ops_clients            USING (auth.role() = 'service_role') WITH CHECK (true);
CREATE POLICY "ops_projects_service"    ON ops_projects           USING (auth.role() = 'service_role') WITH CHECK (true);
CREATE POLICY "ops_team_service"        ON ops_team_members       USING (auth.role() = 'service_role') WITH CHECK (true);
CREATE POLICY "ops_tasks_service"       ON ops_tasks              USING (auth.role() = 'service_role') WITH CHECK (true);
CREATE POLICY "ops_project_ctx_service" ON ops_project_context    USING (auth.role() = 'service_role') WITH CHECK (true);
CREATE POLICY "ops_completion_service"  ON ops_completion_records USING (auth.role() = 'service_role') WITH CHECK (true);

-- ─── GRANTS — service_role needs table grants for tables made via SQL editor ──
GRANT ALL ON TABLE ops_clients            TO service_role;
GRANT ALL ON TABLE ops_projects           TO service_role;
GRANT ALL ON TABLE ops_team_members       TO service_role;
GRANT ALL ON TABLE ops_tasks              TO service_role;
GRANT ALL ON TABLE ops_project_context    TO service_role;
GRANT ALL ON TABLE ops_completion_records TO service_role;
GRANT ALL ON TABLE ops_id_sequences       TO service_role;
GRANT EXECUTE ON FUNCTION ops_next_sequence_val(TEXT) TO service_role;
