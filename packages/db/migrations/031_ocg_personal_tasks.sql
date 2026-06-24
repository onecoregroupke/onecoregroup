-- Migration 031: Private personal/home tasks (manager's private module)
-- Additive only. A private space for an admin to track home + personal tasks in
-- the same hub. Rows are scoped to the owner's email; the /api/personal route
-- only ever reads/writes the signed-in user's own rows, so it stays private.
-- Run in the Supabase SQL editor. Idempotent — safe to re-run.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS ocg_personal_tasks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_email TEXT NOT NULL,
  title       TEXT NOT NULL,
  notes       TEXT NOT NULL DEFAULT '',
  category    TEXT NOT NULL DEFAULT 'Personal',  -- Home | Personal | Errand | Finance | Family | …
  priority    TEXT NOT NULL DEFAULT 'Medium',
  status      TEXT NOT NULL DEFAULT 'open',       -- open | done
  due_date    DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ocg_personal_owner ON ocg_personal_tasks(owner_email);
CREATE INDEX IF NOT EXISTS idx_ocg_personal_status ON ocg_personal_tasks(status);
CREATE INDEX IF NOT EXISTS idx_ocg_personal_due ON ocg_personal_tasks(due_date);

ALTER TABLE ocg_personal_tasks ENABLE ROW LEVEL SECURITY;

-- Owner-scoped read for authenticated users (defence in depth; the API also
-- filters by the signed-in email and uses the service role).
DROP POLICY IF EXISTS "ocg_personal_owner_auth" ON ocg_personal_tasks;
CREATE POLICY "ocg_personal_owner_auth" ON ocg_personal_tasks
  FOR SELECT TO authenticated
  USING (owner_email = (auth.jwt() ->> 'email'));

DROP POLICY IF EXISTS "ocg_personal_service" ON ocg_personal_tasks;
CREATE POLICY "ocg_personal_service" ON ocg_personal_tasks
  USING (auth.role() = 'service_role') WITH CHECK (true);

GRANT ALL ON TABLE ocg_personal_tasks TO service_role;
