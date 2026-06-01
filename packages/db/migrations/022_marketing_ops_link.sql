-- Migration 022: Content Calendar ↔ Ops Hub link (push to task agents)
-- Lets a content row be pushed to the Ops Hub as a task; the approved deliverable
-- comes back via webhook and the post auto-schedules. Run after 008–021. Idempotent.

-- Link + production state on content rows.
ALTER TABLE marketing_content ADD COLUMN IF NOT EXISTS ops_task_id TEXT;
ALTER TABLE marketing_content ADD COLUMN IF NOT EXISTS production_status TEXT NOT NULL DEFAULT 'none';
-- production_status: none | briefing (pushed, awaiting draft) | delivered (deliverable returned)
ALTER TABLE marketing_content ADD COLUMN IF NOT EXISTS production_brief TEXT;
ALTER TABLE marketing_content ADD COLUMN IF NOT EXISTS deliverable_url TEXT;

CREATE INDEX IF NOT EXISTS idx_marketing_content_ops_task
  ON marketing_content(ops_task_id) WHERE ops_task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_marketing_content_production
  ON marketing_content(production_status) WHERE production_status <> 'none';

-- One Ops "Content Production" project per brand, created on first push.
CREATE TABLE IF NOT EXISTS marketing_ops_projects (
  brand_id        UUID PRIMARY KEY REFERENCES brands(id) ON DELETE CASCADE,
  ops_project_id  TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE marketing_ops_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "marketing_ops_projects_auth"
  ON marketing_ops_projects FOR SELECT TO authenticated USING (true);
CREATE POLICY "marketing_ops_projects_service"
  ON marketing_ops_projects USING (auth.role() = 'service_role') WITH CHECK (true);
GRANT ALL ON TABLE marketing_ops_projects TO service_role;
