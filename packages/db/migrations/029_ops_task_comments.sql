-- Migration 029: Ops task comments / progress updates
-- Additive only. Captures a thread of work comments per task — including progress
-- notes a team member logs from their portal WITHOUT changing the task status —
-- so the end-of-day report can surface ongoing work even when status is unchanged.
-- Run in the Supabase SQL editor. Idempotent — safe to re-run.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS ops_task_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     TEXT NOT NULL REFERENCES ops_tasks(task_id) ON DELETE CASCADE,
  author      TEXT NOT NULL DEFAULT '',
  body        TEXT NOT NULL,
  -- 'progress' = portal/work update (no status change); 'status' = note attached
  -- to a status change; 'system' = automated.
  kind        TEXT NOT NULL DEFAULT 'progress',
  status_at   TEXT NOT NULL DEFAULT '',  -- task status at time of comment
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ops_task_comments_task ON ops_task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_ops_task_comments_created ON ops_task_comments(created_at DESC);

ALTER TABLE ops_task_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ops_task_comments_auth" ON ops_task_comments;
CREATE POLICY "ops_task_comments_auth" ON ops_task_comments FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "ops_task_comments_service" ON ops_task_comments;
CREATE POLICY "ops_task_comments_service" ON ops_task_comments USING (auth.role() = 'service_role') WITH CHECK (true);

GRANT ALL ON TABLE ops_task_comments TO service_role;
