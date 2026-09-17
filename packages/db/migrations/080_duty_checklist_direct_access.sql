-- Migration 080: close the last direct-table path to duty checklists.
--
-- 067 revoked anon/authenticated privileges on ocg_daily_duties and
-- ocg_daily_duty_logs, so nobody can read another person's duties straight from
-- PostgREST. The two checklist tables created in 055 kept Supabase's default
-- grants. Their RLS (a service-role-only policy) already returns no rows to
-- those roles, but TRUNCATE is not governed by RLS, and a table's safety should
-- not rest on a policy alone.
--
-- Nothing is taken away from employees: they read their OWN duty checklist
-- through the Ops Hub server (My Work, the Calendar duty drawer,
-- /api/duties/occurrence, /api/duties/checklist), which checks that the duty
-- targets their ops_team_members record. No client queries these tables with a
-- user token. Management keeps working through the service role.
--
-- No data changes. Idempotent.

BEGIN;

REVOKE ALL ON TABLE ocg_duty_checklist_items   FROM anon, authenticated;
REVOKE ALL ON TABLE ocg_duty_checklist_results FROM anon, authenticated;

GRANT ALL ON TABLE ocg_duty_checklist_items   TO service_role;
GRANT ALL ON TABLE ocg_duty_checklist_results TO service_role;

COMMIT;
