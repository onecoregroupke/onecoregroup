-- Migration 065: a ledger of which migrations have actually been applied.
--
-- ROOT-CAUSE FIX. The Phase 1 audit found that migrations 052, 053 and 054 were
-- committed to the repo but had never been run against Supabase, so 20 tables
-- and two stock-integrity indexes were missing in production while the code that
-- depended on them was merged and believed to be live.
--
-- The cause was structural: "committed" and "applied" were indistinguishable.
-- The repo tracked the .sql file; nothing tracked the execution. This table
-- makes the second fact durable, and scripts/supabase-sql.mjs records into it
-- on every successful --file run.

CREATE TABLE IF NOT EXISTS schema_migrations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- '055_configurable_duties.sql' — the file name, so the ledger reads the same
  -- as the directory listing.
  filename     TEXT NOT NULL,
  -- Leading numeric prefix, for ordering and gap detection.
  version      INTEGER,
  checksum     TEXT NOT NULL DEFAULT '',
  applied_by   TEXT NOT NULL DEFAULT '',
  applied_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes        TEXT NOT NULL DEFAULT ''
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_schema_migrations_file ON schema_migrations (filename);
CREATE INDEX IF NOT EXISTS idx_schema_migrations_version ON schema_migrations (version);

ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS schema_migrations_service ON schema_migrations;
CREATE POLICY schema_migrations_service ON schema_migrations
  USING (auth.role() = 'service_role') WITH CHECK (true);
GRANT ALL ON TABLE schema_migrations TO service_role;

-- Backfill everything known to be applied as of this migration. 001–051 were
-- already live when the audit ran; 052–064 were applied during it. Recorded
-- with a note rather than a checksum, since these ran before the ledger existed.
INSERT INTO schema_migrations (filename, version, applied_by, notes)
SELECT f, (regexp_match(f, '^(\d+)'))[1]::INTEGER, 'backfill',
       'Backfilled by 065. Applied before the ledger existed; no checksum recorded.'
FROM unnest(ARRAY[
  '001_core_tables.sql','002_nuuranest_tables.sql','003_glitz_tables.sql','004_npt_tables.sql',
  '004_seed.sql','005_update_property_names.sql','006_glitz_products_v2.sql','006_update_amenities.sql',
  '007_user_permissions.sql','008_marketing.sql','009_brands_sort_order.sql','010_marketing_campaigns.sql',
  '011_marketing_crm.sql','012_marketing_whatsapp.sql','013_marketing_reports.sql','014_seed_brand_platforms.sql',
  '015_seed_marketing_pillars.sql','016_seed_historical_metrics.sql','017_ops_core.sql','018_ops_agents.sql',
  '019_marketing_episodes.sql','020_marketing_metrics.sql','021_marketing_publishing.sql','022_marketing_ops_link.sql',
  '023_ops_task_source.sql','024_ocean_waves_bamburi_amenities.sql','025_ocg_management_os.sql',
  '026_rhythms_schoolpay_admin.sql','027_darul_swafa_madrassa.sql','028_rhythms_full_admin.sql',
  '029_ops_task_comments.sql','030_ocg_daily_duties.sql','031_ocg_personal_tasks.sql','032_npt_gazelle.sql',
  '033_finance_manual_fees.sql','034_finance_operations.sql','035_launch_foundation.sql',
  '036_audit_inbox_attendance.sql','037_shared_ops_projects.sql','038_finance_statement_imports.sql',
  '039_meeting_invites_collaboration.sql','040_procurement_categories_blacklist.sql','041_npt_comms.sql',
  '042_custom_forms.sql','043_rayyan_academics.sql','044_school_finance_foundation.sql','045_petty_cash.sql',
  '046_imports_and_versions.sql','047_chat_attachments.sql','048_recurring_duties.sql',
  '049_procurement_classification.sql','050_school_fee_aggregates.sql','051_school_assessments.sql',
  '052_forms_lifecycle_print_identity.sql','053_npt_intake_repair_movement.sql','054_procurement_chain.sql',
  '055_configurable_duties.sql','056_calendar.sql','057_task_completion_reports.sql',
  '058_work_schedules_attendance.sql','059_reorder_alerts.sql','060_manufacturing.sql',
  '061_field_sales_custody.sql','062_petty_cash_floats.sql','063_quickbooks_reconciliation.sql',
  '064_performance_metrics.sql','065_schema_migrations_ledger.sql'
]) AS f
ON CONFLICT (filename) DO NOTHING;
