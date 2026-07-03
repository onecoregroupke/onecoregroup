-- Migration 037: allow shared / joint Ops projects
-- Projects may now be internal brand, external client, sub-projects, or shared
-- operating work that is not tied to a specific brand/client.

ALTER TABLE ops_projects
  DROP CONSTRAINT IF EXISTS ops_projects_owner_chk;
