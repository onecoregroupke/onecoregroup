-- Migration 046: Reusable import framework + record versioning (Parts 8 & 10).
--
-- Additive. Generalises the migration-038 staging→review→commit pattern into a
-- single import foundation (file → staging rows → validate → commit → rollback)
-- with source-specific adapters implemented in application code. Adds an
-- append-only record-version store powering undo / restore across the portal.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Imports (one row per uploaded workbook / import run) ──────────────────────
CREATE TABLE IF NOT EXISTS data_imports (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_type        TEXT NOT NULL DEFAULT 'school-ledger', -- school-ledger | debtors | petty-cash | completion | payments | students
  brand_id           UUID REFERENCES brands(id) ON DELETE SET NULL,
  school             TEXT NOT NULL DEFAULT '',
  source_filename    TEXT NOT NULL DEFAULT '',
  file_hash          TEXT NOT NULL DEFAULT '',              -- sha256, for duplicate-file detection
  storage_bucket     TEXT NOT NULL DEFAULT '',
  storage_path       TEXT NOT NULL DEFAULT '',              -- private ref to the retained workbook
  sheets_available   JSONB NOT NULL DEFAULT '[]'::jsonb,
  sheets_processed   JSONB NOT NULL DEFAULT '[]'::jsonb,
  field_mappings     JSONB NOT NULL DEFAULT '{}'::jsonb,
  dedupe_strategy    JSONB NOT NULL DEFAULT '{}'::jsonb,
  rows_scanned       INTEGER NOT NULL DEFAULT 0,
  records_created    INTEGER NOT NULL DEFAULT 0,
  records_updated    INTEGER NOT NULL DEFAULT 0,
  records_skipped    INTEGER NOT NULL DEFAULT 0,
  duplicates_found   INTEGER NOT NULL DEFAULT 0,
  warnings_count     INTEGER NOT NULL DEFAULT 0,
  failed_count       INTEGER NOT NULL DEFAULT 0,
  status             TEXT NOT NULL DEFAULT 'uploaded'
                       CHECK (status IN ('uploaded','parsed','validated','committed','partially_committed','failed','rolled_back')),
  rollback_status    TEXT NOT NULL DEFAULT 'none'
                       CHECK (rollback_status IN ('none','partial','complete','blocked')),
  error_report_path  TEXT NOT NULL DEFAULT '',
  uploaded_by        TEXT NOT NULL DEFAULT '',
  committed_by       TEXT NOT NULL DEFAULT '',
  committed_at       TIMESTAMPTZ,
  notes              TEXT NOT NULL DEFAULT '',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_data_imports_brand ON data_imports(brand_id);
CREATE INDEX IF NOT EXISTS idx_data_imports_type ON data_imports(import_type);
CREATE INDEX IF NOT EXISTS idx_data_imports_status ON data_imports(status);
CREATE INDEX IF NOT EXISTS idx_data_imports_hash ON data_imports(file_hash);
CREATE INDEX IF NOT EXISTS idx_data_imports_created ON data_imports(created_at DESC);

-- ── Import staging rows ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS data_import_rows (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id          UUID NOT NULL REFERENCES data_imports(id) ON DELETE CASCADE,
  sheet_name         TEXT NOT NULL DEFAULT '',
  source_row         INTEGER,
  raw_payload        JSONB NOT NULL DEFAULT '{}'::jsonb,    -- original cells
  mapped_payload     JSONB NOT NULL DEFAULT '{}'::jsonb,    -- normalised fields
  record_kind        TEXT NOT NULL DEFAULT '',             -- charge | payment | student | petty-cash | requirement | subtotal | header | blank
  dup_status         TEXT NOT NULL DEFAULT 'new'
                       CHECK (dup_status IN ('exact_duplicate','probable_duplicate','possible_duplicate','new','update_candidate','conflict')),
  dup_target_id      UUID,
  row_state          TEXT NOT NULL DEFAULT 'pending'
                       CHECK (row_state IN ('pending','valid','warning','error','skipped','committed','rolled_back')),
  target_table       TEXT NOT NULL DEFAULT '',
  target_id          UUID,
  messages           JSONB NOT NULL DEFAULT '[]'::jsonb,    -- warnings/errors for review
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_data_import_rows_import ON data_import_rows(import_id);
CREATE INDEX IF NOT EXISTS idx_data_import_rows_state ON data_import_rows(row_state);
CREATE INDEX IF NOT EXISTS idx_data_import_rows_dup ON data_import_rows(dup_status);
CREATE INDEX IF NOT EXISTS idx_data_import_rows_target ON data_import_rows(target_table, target_id);

-- ── Append-only record versions (undo / restore) ─────────────────────────────
CREATE TABLE IF NOT EXISTS record_versions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_type        TEXT NOT NULL,                        -- table name
  record_id          UUID NOT NULL,
  version_no         INTEGER NOT NULL DEFAULT 1,
  action             TEXT NOT NULL DEFAULT 'update'
                       CHECK (action IN ('create','update','delete','reverse','restore','post')),
  snapshot           JSONB NOT NULL DEFAULT '{}'::jsonb,    -- full row snapshot AFTER the action
  previous_snapshot  JSONB,                                -- row BEFORE (for quick diff / undo)
  brand_id           UUID REFERENCES brands(id) ON DELETE SET NULL,
  changed_by         TEXT NOT NULL DEFAULT '',
  reason             TEXT NOT NULL DEFAULT '',
  import_id          UUID REFERENCES data_imports(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_record_versions_record ON record_versions(record_type, record_id);
CREATE INDEX IF NOT EXISTS idx_record_versions_created ON record_versions(created_at DESC);

-- ── Wire import_id FKs added (without FK) in 044/045 ─────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_school_ledger_import') THEN
    ALTER TABLE school_ledger_entries
      ADD CONSTRAINT fk_school_ledger_import FOREIGN KEY (import_id)
      REFERENCES data_imports(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_school_requirements_import') THEN
    ALTER TABLE school_student_requirements
      ADD CONSTRAINT fk_school_requirements_import FOREIGN KEY (import_id)
      REFERENCES data_imports(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_petty_cash_import') THEN
    ALTER TABLE petty_cash_transactions
      ADD CONSTRAINT fk_petty_cash_import FOREIGN KEY (import_id)
      REFERENCES data_imports(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── RLS + grants ─────────────────────────────────────────────────────────────
ALTER TABLE data_imports      ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_import_rows  ENABLE ROW LEVEL SECURITY;
ALTER TABLE record_versions   ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['data_imports','data_import_rows','record_versions'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%1$s_service" ON %1$s;', t);
    EXECUTE format('CREATE POLICY "%1$s_service" ON %1$s USING (auth.role() = ''service_role'') WITH CHECK (true);', t);
    EXECUTE format('GRANT ALL ON TABLE %1$s TO service_role;', t);
  END LOOP;
  -- staging + versions are service-role only (no direct authenticated read);
  -- imports metadata is readable by authenticated users for the receipts UI.
  EXECUTE 'DROP POLICY IF EXISTS "data_imports_auth" ON data_imports;';
  EXECUTE 'CREATE POLICY "data_imports_auth" ON data_imports FOR SELECT TO authenticated USING (true);';
END $$;
