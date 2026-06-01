-- Migration 023: Ops task source linkage
-- Lets an Ops task remember where it came from (e.g. a marketing content row) so
-- the approval webhook can return the deliverable to the right place.
-- Run after 017/018. Idempotent.

ALTER TABLE ops_tasks ADD COLUMN IF NOT EXISTS source_kind TEXT;   -- e.g. 'marketing_content'
ALTER TABLE ops_tasks ADD COLUMN IF NOT EXISTS source_ref  TEXT;   -- the source row id

CREATE INDEX IF NOT EXISTS idx_ops_tasks_source
  ON ops_tasks(source_kind, source_ref) WHERE source_ref IS NOT NULL;
