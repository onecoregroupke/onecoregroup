-- Migration 067: production readiness — people, knowledge, record access and
-- controlled historical-import governance.
--
-- ADDITIVE ONLY. Existing operational, inventory and finance history is not
-- rewritten. Legacy columns remain available for backward compatibility while
-- new writes can carry explicit entity, unit, lineage and idempotency metadata.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── 1. RECORD-LEVEL ACCESS VOCABULARY ─────────────────────────────────────
-- Module permissions answer "may this user enter this area?". record_access
-- answers "how far inside that area may they see?". Missing keys remain
-- deliberately conservative in the application (own for new people/knowledge
-- surfaces); founding admins remain the only implicit group administrators.
ALTER TABLE user_permissions
  ADD COLUMN IF NOT EXISTS record_access JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS operational_record_access (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id         UUID REFERENCES brands(id) ON DELETE CASCADE,
  record_type      TEXT NOT NULL,
  record_id        UUID NOT NULL,
  principal_kind   TEXT NOT NULL DEFAULT 'member', -- member|department|team|role
  principal_value  TEXT NOT NULL,
  access_level     TEXT NOT NULL DEFAULT 'view',   -- view|edit|review|approve
  granted_by       TEXT NOT NULL DEFAULT '',
  reason           TEXT NOT NULL DEFAULT '',
  expires_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT operational_record_access_principal_check
    CHECK (principal_kind IN ('member','department','team','role')),
  CONSTRAINT operational_record_access_level_check
    CHECK (access_level IN ('view','edit','review','approve'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_record_access_once
  ON operational_record_access (record_type, record_id, principal_kind, principal_value, access_level);
CREATE INDEX IF NOT EXISTS idx_record_access_brand ON operational_record_access (brand_id, record_type);
CREATE INDEX IF NOT EXISTS idx_record_access_principal ON operational_record_access (principal_kind, principal_value);

-- Human-readable document timeline. Detailed before/after data continues to
-- live in ocg_audit_events and record_versions.
CREATE TABLE IF NOT EXISTS operational_document_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id          UUID REFERENCES brands(id) ON DELETE SET NULL,
  record_type       TEXT NOT NULL,
  record_id         UUID NOT NULL,
  event_type        TEXT NOT NULL,
  summary           TEXT NOT NULL,
  actor_user_id     UUID,
  actor_name        TEXT NOT NULL DEFAULT '',
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_record_type TEXT NOT NULL DEFAULT '',
  source_record_id  UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_document_events_record
  ON operational_document_events (record_type, record_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_events_brand
  ON operational_document_events (brand_id, created_at DESC);

-- ─── 2. STRUCTURED PEOPLE / ROLE / CAPABILITY MODEL ────────────────────────
ALTER TABLE ops_team_members
  ADD COLUMN IF NOT EXISTS user_id UUID,
  ADD COLUMN IF NOT EXISTS primary_brand_id UUID REFERENCES brands(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reporting_manager_id UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS employment_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS job_description TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS idx_team_members_user
  ON ops_team_members (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_team_members_primary_brand ON ops_team_members (primary_brand_id, active);
CREATE INDEX IF NOT EXISTS idx_team_members_manager ON ops_team_members (reporting_manager_id, active);

CREATE TABLE IF NOT EXISTS employee_entity_assignments (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id            UUID NOT NULL REFERENCES ops_team_members(id) ON DELETE CASCADE,
  brand_id             UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  department           TEXT NOT NULL DEFAULT '',
  operational_area     TEXT NOT NULL DEFAULT '',
  role_title           TEXT NOT NULL DEFAULT '',
  assignment_kind      TEXT NOT NULL DEFAULT 'additional', -- primary|additional|temporary
  is_primary           BOOLEAN NOT NULL DEFAULT false,
  reporting_manager_id UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,
  effective_from       DATE,
  effective_until      DATE,
  active               BOOLEAN NOT NULL DEFAULT true,
  created_by           TEXT NOT NULL DEFAULT '',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT employee_assignment_kind_check
    CHECK (assignment_kind IN ('primary','additional','temporary')),
  CONSTRAINT employee_assignment_dates_check
    CHECK (effective_until IS NULL OR effective_from IS NULL OR effective_until >= effective_from)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_assignment_active_once
  ON employee_entity_assignments (member_id, brand_id, department, operational_area, role_title)
  WHERE active;
CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_assignment_one_primary
  ON employee_entity_assignments (member_id) WHERE active AND is_primary;
CREATE INDEX IF NOT EXISTS idx_employee_assignment_brand
  ON employee_entity_assignments (brand_id, active, department);
CREATE INDEX IF NOT EXISTS idx_employee_assignment_member
  ON employee_entity_assignments (member_id, active);

CREATE TABLE IF NOT EXISTS employee_responsibilities (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id           UUID NOT NULL REFERENCES ops_team_members(id) ON DELETE CASCADE,
  assignment_id       UUID REFERENCES employee_entity_assignments(id) ON DELETE SET NULL,
  brand_id            UUID REFERENCES brands(id) ON DELETE CASCADE,
  title               TEXT NOT NULL,
  description         TEXT NOT NULL DEFAULT '',
  responsibility_type TEXT NOT NULL DEFAULT 'formal', -- formal|routine|resource|control
  cadence             TEXT NOT NULL DEFAULT '',
  criticality         TEXT NOT NULL DEFAULT 'normal',
  active              BOOLEAN NOT NULL DEFAULT true,
  effective_from      DATE,
  effective_until     DATE,
  created_by          TEXT NOT NULL DEFAULT '',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT employee_responsibility_type_check
    CHECK (responsibility_type IN ('formal','routine','resource','control'))
);
CREATE INDEX IF NOT EXISTS idx_employee_responsibility_member
  ON employee_responsibilities (member_id, active);
CREATE INDEX IF NOT EXISTS idx_employee_responsibility_brand
  ON employee_responsibilities (brand_id, active);

CREATE TABLE IF NOT EXISTS employee_capabilities (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code              TEXT NOT NULL,
  title             TEXT NOT NULL,
  description       TEXT NOT NULL DEFAULT '',
  operational_area  TEXT NOT NULL DEFAULT '',
  brand_id          UUID REFERENCES brands(id) ON DELETE CASCADE,
  active            BOOLEAN NOT NULL DEFAULT true,
  created_by        TEXT NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_capability_code_scope
  ON employee_capabilities (lower(code), COALESCE(brand_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX IF NOT EXISTS idx_employee_capability_area
  ON employee_capabilities (operational_area, active);

CREATE TABLE IF NOT EXISTS employee_capability_assignments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id        UUID NOT NULL REFERENCES ops_team_members(id) ON DELETE CASCADE,
  capability_id    UUID NOT NULL REFERENCES employee_capabilities(id) ON DELETE RESTRICT,
  proficiency      TEXT NOT NULL DEFAULT 'working', -- awareness|working|proficient|expert
  evidence_notes   TEXT NOT NULL DEFAULT '',
  verified_by      TEXT NOT NULL DEFAULT '',
  verified_at      TIMESTAMPTZ,
  expires_at       DATE,
  active           BOOLEAN NOT NULL DEFAULT true,
  created_by       TEXT NOT NULL DEFAULT '',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT employee_capability_proficiency_check
    CHECK (proficiency IN ('awareness','working','proficient','expert'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_capability_assignment_once
  ON employee_capability_assignments (member_id, capability_id) WHERE active;
CREATE INDEX IF NOT EXISTS idx_employee_capability_member
  ON employee_capability_assignments (member_id, active);

-- Authority is intentionally independent of capability. No trigger or view
-- derives one from the other.
CREATE TABLE IF NOT EXISTS employee_authorities (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id         UUID NOT NULL REFERENCES ops_team_members(id) ON DELETE CASCADE,
  brand_id          UUID REFERENCES brands(id) ON DELETE CASCADE,
  operational_area  TEXT NOT NULL DEFAULT '',
  resource_type     TEXT NOT NULL DEFAULT '',
  authority_action  TEXT NOT NULL, -- prepare|submit|review|approve|authorise|post|adjust|reverse
  authority_scope   TEXT NOT NULL DEFAULT 'own', -- own|department|entity|group
  limit_amount_ksh  NUMERIC(14,2),
  granted_by        TEXT NOT NULL,
  grant_reason      TEXT NOT NULL DEFAULT '',
  effective_from    DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_until   DATE,
  active            BOOLEAN NOT NULL DEFAULT true,
  revoked_by        TEXT NOT NULL DEFAULT '',
  revoked_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT employee_authority_action_check
    CHECK (authority_action IN ('prepare','submit','review','approve','authorise','post','adjust','reverse')),
  CONSTRAINT employee_authority_scope_check
    CHECK (authority_scope IN ('own','department','entity','group')),
  CONSTRAINT employee_authority_dates_check
    CHECK (effective_until IS NULL OR effective_until >= effective_from)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_authority_active_once
  ON employee_authorities (
    member_id,
    COALESCE(brand_id, '00000000-0000-0000-0000-000000000000'::uuid),
    operational_area, resource_type, authority_action, authority_scope
  ) WHERE active;
CREATE INDEX IF NOT EXISTS idx_employee_authority_member
  ON employee_authorities (member_id, active);
CREATE INDEX IF NOT EXISTS idx_employee_authority_brand
  ON employee_authorities (brand_id, operational_area, active);

CREATE TABLE IF NOT EXISTS employee_cover_assignments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  covered_member_id     UUID NOT NULL REFERENCES ops_team_members(id) ON DELETE CASCADE,
  cover_member_id       UUID NOT NULL REFERENCES ops_team_members(id) ON DELETE CASCADE,
  capability_id         UUID REFERENCES employee_capabilities(id) ON DELETE SET NULL,
  brand_id              UUID REFERENCES brands(id) ON DELETE CASCADE,
  process_name          TEXT NOT NULL DEFAULT '',
  cover_type            TEXT NOT NULL DEFAULT 'primary', -- primary|secondary|emergency
  reason                TEXT NOT NULL DEFAULT '',
  effective_from        DATE,
  effective_until       DATE,
  active                BOOLEAN NOT NULL DEFAULT true,
  approved_by           TEXT NOT NULL DEFAULT '',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT employee_cover_not_self CHECK (covered_member_id <> cover_member_id),
  CONSTRAINT employee_cover_type_check CHECK (cover_type IN ('primary','secondary','emergency'))
);
CREATE INDEX IF NOT EXISTS idx_employee_cover_covered ON employee_cover_assignments (covered_member_id, active);
CREATE INDEX IF NOT EXISTS idx_employee_cover_substitute ON employee_cover_assignments (cover_member_id, active);

CREATE TABLE IF NOT EXISTS employee_resource_assignments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id          UUID NOT NULL REFERENCES ops_team_members(id) ON DELETE CASCADE,
  brand_id           UUID REFERENCES brands(id) ON DELETE CASCADE,
  resource_type      TEXT NOT NULL, -- store|stock|equipment|classroom|register|vehicle|production_area|system
  resource_name      TEXT NOT NULL,
  resource_reference TEXT NOT NULL DEFAULT '',
  responsibility     TEXT NOT NULL DEFAULT '',
  effective_from     DATE,
  effective_until    DATE,
  active             BOOLEAN NOT NULL DEFAULT true,
  created_by         TEXT NOT NULL DEFAULT '',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_employee_resource_member ON employee_resource_assignments (member_id, active);
CREATE INDEX IF NOT EXISTS idx_employee_resource_brand ON employee_resource_assignments (brand_id, resource_type, active);

CREATE TABLE IF NOT EXISTS employee_qualifications (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id         UUID NOT NULL REFERENCES ops_team_members(id) ON DELETE CASCADE,
  qualification_type TEXT NOT NULL DEFAULT 'training', -- skill|qualification|training|certification
  title             TEXT NOT NULL,
  provider          TEXT NOT NULL DEFAULT '',
  completed_on      DATE,
  expires_on        DATE,
  evidence_url      TEXT NOT NULL DEFAULT '',
  status            TEXT NOT NULL DEFAULT 'current',
  notes             TEXT NOT NULL DEFAULT '',
  created_by        TEXT NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT employee_qualification_type_check
    CHECK (qualification_type IN ('skill','qualification','training','certification'))
);
CREATE INDEX IF NOT EXISTS idx_employee_qualification_member
  ON employee_qualifications (member_id, status);

CREATE TABLE IF NOT EXISTS employee_activity_history (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id         UUID NOT NULL REFERENCES ops_team_members(id) ON DELETE CASCADE,
  brand_id          UUID REFERENCES brands(id) ON DELETE SET NULL,
  activity_type     TEXT NOT NULL,
  activity_date     TIMESTAMPTZ NOT NULL DEFAULT now(),
  record_type       TEXT NOT NULL DEFAULT '',
  record_id         TEXT NOT NULL DEFAULT '',
  summary           TEXT NOT NULL,
  outcome           TEXT NOT NULL DEFAULT '',
  source            TEXT NOT NULL DEFAULT 'system',
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_employee_activity_member
  ON employee_activity_history (member_id, activity_date DESC);
CREATE INDEX IF NOT EXISTS idx_employee_activity_brand
  ON employee_activity_history (brand_id, activity_date DESC);

-- ─── 3. VERSIONED GROUP KNOWLEDGE ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ocg_knowledge_entries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title             TEXT NOT NULL,
  brand_id          UUID REFERENCES brands(id) ON DELETE CASCADE,
  department        TEXT NOT NULL DEFAULT '',
  operational_area  TEXT NOT NULL DEFAULT '',
  knowledge_type    TEXT NOT NULL DEFAULT 'reference_material',
  owner_member_id   UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,
  visibility_scope  TEXT NOT NULL DEFAULT 'management', -- own|department|management|group
  tags              TEXT[] NOT NULL DEFAULT '{}',
  current_version_id UUID,
  created_by        TEXT NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ocg_knowledge_type_check CHECK (knowledge_type IN (
    'policy','sop','procedure','job_description','operational_routine','checklist',
    'control','rule','company_information','product_service_knowledge','training',
    'historical_legacy_system','reference_material'
  )),
  CONSTRAINT ocg_knowledge_visibility_check
    CHECK (visibility_scope IN ('own','department','management','group'))
);
CREATE INDEX IF NOT EXISTS idx_knowledge_entry_entity
  ON ocg_knowledge_entries (brand_id, knowledge_type);
CREATE INDEX IF NOT EXISTS idx_knowledge_entry_department
  ON ocg_knowledge_entries (department, operational_area);
CREATE INDEX IF NOT EXISTS idx_knowledge_entry_tags ON ocg_knowledge_entries USING GIN (tags);

CREATE TABLE IF NOT EXISTS ocg_knowledge_versions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id            UUID NOT NULL REFERENCES ocg_knowledge_entries(id) ON DELETE RESTRICT,
  version_no          INTEGER NOT NULL,
  status              TEXT NOT NULL DEFAULT 'draft', -- draft|current|legacy|superseded|archived
  content_body        TEXT NOT NULL DEFAULT '',
  file_url            TEXT NOT NULL DEFAULT '',
  file_hash           TEXT NOT NULL DEFAULT '',
  source_title        TEXT NOT NULL DEFAULT '',
  source_type         TEXT NOT NULL DEFAULT '',
  source_date         DATE,
  source_reference    TEXT NOT NULL DEFAULT '',
  effective_from      DATE,
  effective_until     DATE,
  review_date         DATE,
  approved_by         TEXT NOT NULL DEFAULT '',
  approved_at         TIMESTAMPTZ,
  change_summary      TEXT NOT NULL DEFAULT '',
  supersedes_version_id UUID REFERENCES ocg_knowledge_versions(id) ON DELETE SET NULL,
  created_by          TEXT NOT NULL DEFAULT '',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ocg_knowledge_version_status_check
    CHECK (status IN ('draft','current','legacy','superseded','archived')),
  CONSTRAINT ocg_knowledge_current_approved_check
    CHECK (status <> 'current' OR (approved_by <> '' AND approved_at IS NOT NULL)),
  CONSTRAINT ocg_knowledge_effective_dates_check
    CHECK (effective_until IS NULL OR effective_from IS NULL OR effective_until >= effective_from),
  UNIQUE (entry_id, version_no)
);
CREATE INDEX IF NOT EXISTS idx_knowledge_version_entry
  ON ocg_knowledge_versions (entry_id, version_no DESC);
CREATE INDEX IF NOT EXISTS idx_knowledge_version_status
  ON ocg_knowledge_versions (status, review_date);
CREATE INDEX IF NOT EXISTS idx_knowledge_version_source_hash
  ON ocg_knowledge_versions (file_hash) WHERE file_hash <> '';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ocg_knowledge_current_version_fk') THEN
    ALTER TABLE ocg_knowledge_entries
      ADD CONSTRAINT ocg_knowledge_current_version_fk
      FOREIGN KEY (current_version_id) REFERENCES ocg_knowledge_versions(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Existing read-all policies pre-date the server-enforced record-scope model.
-- Remove those bypasses now that people, duty, and import UIs all read through
-- authenticated route handlers. An authenticated browser must not be able to
-- select another employee's profile, all duty logs, or another brand's import
-- receipts directly from PostgREST.
DROP POLICY IF EXISTS "ops_team_auth" ON ops_team_members;
DROP POLICY IF EXISTS "ocg_daily_duties_auth" ON ocg_daily_duties;
DROP POLICY IF EXISTS "ocg_duty_logs_auth" ON ocg_daily_duty_logs;
DROP POLICY IF EXISTS "data_imports_auth" ON data_imports;

REVOKE ALL ON TABLE ops_team_members FROM anon, authenticated;
REVOKE ALL ON TABLE ocg_daily_duties FROM anon, authenticated;
REVOKE ALL ON TABLE ocg_daily_duty_logs FROM anon, authenticated;
REVOKE ALL ON TABLE data_imports FROM anon, authenticated;
REVOKE ALL ON TABLE data_import_rows FROM anon, authenticated;

CREATE OR REPLACE FUNCTION prevent_published_knowledge_rewrite()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Knowledge versions are append-only; archive or supersede instead';
  END IF;
  IF OLD.status <> 'draft' AND (
    NEW.content_body IS DISTINCT FROM OLD.content_body OR
    NEW.file_url IS DISTINCT FROM OLD.file_url OR
    NEW.file_hash IS DISTINCT FROM OLD.file_hash OR
    NEW.source_title IS DISTINCT FROM OLD.source_title OR
    NEW.source_type IS DISTINCT FROM OLD.source_type OR
    NEW.source_date IS DISTINCT FROM OLD.source_date OR
    NEW.source_reference IS DISTINCT FROM OLD.source_reference OR
    NEW.version_no IS DISTINCT FROM OLD.version_no
  ) THEN
    RAISE EXCEPTION 'Published knowledge content is immutable; create a new version';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_knowledge_version_immutable ON ocg_knowledge_versions;
CREATE TRIGGER trg_knowledge_version_immutable
  BEFORE UPDATE OR DELETE ON ocg_knowledge_versions
  FOR EACH ROW EXECUTE FUNCTION prevent_published_knowledge_rewrite();

CREATE OR REPLACE FUNCTION publish_knowledge_version(p_version_id UUID, p_approved_by TEXT)
RETURNS ocg_knowledge_versions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  candidate ocg_knowledge_versions;
  prior_id UUID;
BEGIN
  SELECT * INTO candidate FROM ocg_knowledge_versions WHERE id = p_version_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Knowledge version not found'; END IF;
  IF candidate.status <> 'draft' THEN
    RAISE EXCEPTION 'Only a reviewed draft can be published as current knowledge';
  END IF;
  IF candidate.created_by = p_approved_by THEN
    RAISE EXCEPTION 'Knowledge authors cannot approve their own version';
  END IF;
  SELECT current_version_id INTO prior_id FROM ocg_knowledge_entries
    WHERE id = candidate.entry_id FOR UPDATE;
  IF prior_id IS NOT NULL THEN
    UPDATE ocg_knowledge_versions SET status = 'superseded' WHERE id = prior_id;
  END IF;
  UPDATE ocg_knowledge_versions
    SET status = 'current', approved_by = p_approved_by, approved_at = now(),
        supersedes_version_id = COALESCE(supersedes_version_id, prior_id)
    WHERE id = p_version_id RETURNING * INTO candidate;
  UPDATE ocg_knowledge_entries SET current_version_id = p_version_id, updated_at = now()
    WHERE id = candidate.entry_id;
  RETURN candidate;
END $$;
REVOKE ALL ON FUNCTION publish_knowledge_version(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION publish_knowledge_version(UUID, TEXT) TO service_role;

-- ─── 4. HISTORICAL SOURCE / BATCH / PERIOD GOVERNANCE ──────────────────────
CREATE TABLE IF NOT EXISTS historical_import_sources (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_ref        TEXT NOT NULL,
  title             TEXT NOT NULL,
  filename          TEXT NOT NULL DEFAULT '',
  source_type       TEXT NOT NULL,
  evidence_class    INTEGER NOT NULL, -- 1 master, 2 transaction, 3 snapshot, 4 report, 5 knowledge
  brand_id          UUID REFERENCES brands(id) ON DELETE SET NULL,
  period_start      DATE,
  period_end        DATE,
  received_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  description       TEXT NOT NULL DEFAULT '',
  storage_bucket    TEXT NOT NULL DEFAULT '',
  storage_path      TEXT NOT NULL DEFAULT '',
  checksum_sha256   TEXT NOT NULL DEFAULT '',
  source_date       DATE,
  notes             TEXT NOT NULL DEFAULT '',
  registered_by     TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT historical_source_class_check CHECK (evidence_class BETWEEN 1 AND 5),
  CONSTRAINT historical_source_period_check
    CHECK (period_end IS NULL OR period_start IS NULL OR period_end >= period_start)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_historical_source_ref ON historical_import_sources (source_ref);
CREATE UNIQUE INDEX IF NOT EXISTS idx_historical_source_checksum
  ON historical_import_sources (COALESCE(brand_id, '00000000-0000-0000-0000-000000000000'::uuid), checksum_sha256)
  WHERE checksum_sha256 <> '';
CREATE INDEX IF NOT EXISTS idx_historical_source_entity_date
  ON historical_import_sources (brand_id, period_start, period_end);

CREATE TABLE IF NOT EXISTS historical_import_periods (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id          UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  target_domain     TEXT NOT NULL,
  period_start      DATE NOT NULL,
  period_end        DATE NOT NULL,
  status            TEXT NOT NULL DEFAULT 'not_started', -- not_started|staging|under_review|reconciled|locked
  reconciled_by     TEXT NOT NULL DEFAULT '',
  reconciled_at     TIMESTAMPTZ,
  locked_by         TEXT NOT NULL DEFAULT '',
  locked_at         TIMESTAMPTZ,
  lock_reason       TEXT NOT NULL DEFAULT '',
  created_by        TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT historical_period_status_check
    CHECK (status IN ('not_started','staging','under_review','reconciled','locked')),
  CONSTRAINT historical_period_dates_check CHECK (period_end >= period_start),
  UNIQUE (brand_id, target_domain, period_start, period_end)
);
CREATE INDEX IF NOT EXISTS idx_historical_period_entity
  ON historical_import_periods (brand_id, target_domain, status);

ALTER TABLE data_imports
  ADD COLUMN IF NOT EXISTS source_id UUID REFERENCES historical_import_sources(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS period_id UUID REFERENCES historical_import_periods(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS evidence_class INTEGER,
  ADD COLUMN IF NOT EXISTS target_domain TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS period_start DATE,
  ADD COLUMN IF NOT EXISTS period_end DATE,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS validation_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS reviewed_by TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS posted_by TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reconciled_by TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_by TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;

ALTER TABLE data_imports DROP CONSTRAINT IF EXISTS data_imports_status_check;
ALTER TABLE data_imports ADD CONSTRAINT data_imports_status_check CHECK (status IN (
  -- legacy framework states retained
  'uploaded','parsed','validated','committed','partially_committed','failed','rolled_back',
  -- governed historical workflow states
  'mapping_required','validation_failed','ready_for_review','approved','posted',
  'reconciled','locked','cancelled'
));
ALTER TABLE data_imports DROP CONSTRAINT IF EXISTS data_imports_evidence_class_check;
ALTER TABLE data_imports ADD CONSTRAINT data_imports_evidence_class_check
  CHECK (evidence_class IS NULL OR evidence_class BETWEEN 1 AND 5);
CREATE UNIQUE INDEX IF NOT EXISTS idx_data_imports_idempotency
  ON data_imports (idempotency_key) WHERE idempotency_key <> '';
CREATE INDEX IF NOT EXISTS idx_data_imports_source ON data_imports (source_id);
CREATE INDEX IF NOT EXISTS idx_data_imports_period ON data_imports (period_id, status);
CREATE INDEX IF NOT EXISTS idx_data_imports_entity_period
  ON data_imports (brand_id, period_start, period_end, status);

ALTER TABLE data_import_rows
  ADD COLUMN IF NOT EXISTS proposed_brand_id UUID REFERENCES brands(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS proposed_mappings JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS validation_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS exception_status TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS reviewer_decision TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS reviewed_by TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_import_row_source_coordinate
  ON data_import_rows (import_id, sheet_name, source_row, record_kind);
CREATE UNIQUE INDEX IF NOT EXISTS idx_import_row_idempotency
  ON data_import_rows (idempotency_key) WHERE idempotency_key <> '';
CREATE INDEX IF NOT EXISTS idx_import_row_exception
  ON data_import_rows (import_id, exception_status, validation_status);

CREATE TABLE IF NOT EXISTS historical_import_source_links (
  import_id UUID NOT NULL REFERENCES data_imports(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES historical_import_sources(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (import_id, source_id)
);

CREATE TABLE IF NOT EXISTS historical_import_mappings (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id           UUID REFERENCES brands(id) ON DELETE CASCADE,
  target_domain      TEXT NOT NULL,
  source_field       TEXT NOT NULL,
  original_value     TEXT NOT NULL,
  normalized_value   TEXT NOT NULL DEFAULT '',
  target_type        TEXT NOT NULL,
  target_id          UUID,
  status             TEXT NOT NULL DEFAULT 'proposed', -- proposed|approved|rejected|retired
  context            JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_id          UUID REFERENCES historical_import_sources(id) ON DELETE SET NULL,
  reviewed_by        TEXT NOT NULL DEFAULT '',
  reviewed_at        TIMESTAMPTZ,
  created_by         TEXT NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT historical_mapping_status_check
    CHECK (status IN ('proposed','approved','rejected','retired'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_historical_mapping_value
  ON historical_import_mappings (
    COALESCE(brand_id, '00000000-0000-0000-0000-000000000000'::uuid),
    target_domain, source_field, lower(original_value), target_type
  ) WHERE status IN ('proposed','approved');
CREATE INDEX IF NOT EXISTS idx_historical_mapping_status
  ON historical_import_mappings (target_domain, status);

CREATE TABLE IF NOT EXISTS historical_import_exceptions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id        UUID NOT NULL REFERENCES data_imports(id) ON DELETE CASCADE,
  import_row_id    UUID REFERENCES data_import_rows(id) ON DELETE CASCADE,
  exception_code   TEXT NOT NULL,
  severity         TEXT NOT NULL DEFAULT 'error', -- warning|error|fatal
  source_value     JSONB NOT NULL DEFAULT 'null'::jsonb,
  message          TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'open', -- open|resolved|accepted|rejected
  resolution       TEXT NOT NULL DEFAULT '',
  resolved_by      TEXT NOT NULL DEFAULT '',
  resolved_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT historical_exception_severity_check CHECK (severity IN ('warning','error','fatal')),
  CONSTRAINT historical_exception_status_check CHECK (status IN ('open','resolved','accepted','rejected'))
);
CREATE INDEX IF NOT EXISTS idx_historical_exception_batch
  ON historical_import_exceptions (import_id, status, severity);

CREATE TABLE IF NOT EXISTS historical_import_reconciliations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id          UUID NOT NULL REFERENCES data_imports(id) ON DELETE CASCADE,
  reconciliation_type TEXT NOT NULL, -- finance|stock|sales|procurement|control_total
  control_name       TEXT NOT NULL,
  source_total       NUMERIC(18,4),
  posted_total       NUMERIC(18,4),
  variance           NUMERIC(18,4),
  result             TEXT NOT NULL DEFAULT 'pending', -- pending|matched|explained|failed
  notes              TEXT NOT NULL DEFAULT '',
  reconciled_by      TEXT NOT NULL DEFAULT '',
  reconciled_at      TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT historical_reconciliation_result_check
    CHECK (result IN ('pending','matched','explained','failed'))
);
CREATE INDEX IF NOT EXISTS idx_historical_reconciliation_batch
  ON historical_import_reconciliations (import_id, result);

CREATE TABLE IF NOT EXISTS historical_import_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id        UUID NOT NULL REFERENCES data_imports(id) ON DELETE CASCADE,
  event_type       TEXT NOT NULL,
  from_status      TEXT NOT NULL DEFAULT '',
  to_status        TEXT NOT NULL DEFAULT '',
  summary          TEXT NOT NULL,
  actor_user_id    UUID,
  actor_name       TEXT NOT NULL DEFAULT '',
  metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_historical_import_events
  ON historical_import_events (import_id, created_at DESC);

-- ─── 5. DUTY RESPONSIBILITY / COVER HISTORY ────────────────────────────────
ALTER TABLE ocg_daily_duties
  ADD COLUMN IF NOT EXISTS responsible_role TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS required_capability_id UUID REFERENCES employee_capabilities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS completion_window_minutes INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS evidence_requirement TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS escalation_rule JSONB NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS idx_duties_required_capability
  ON ocg_daily_duties (required_capability_id) WHERE required_capability_id IS NOT NULL;

ALTER TABLE ocg_daily_duty_logs
  ADD COLUMN IF NOT EXISTS original_assignee_id UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS substitute_assignee_id UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reassignment_reason TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS not_completed_reason TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS ocg_duty_assignment_events (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  duty_id               UUID NOT NULL REFERENCES ocg_daily_duties(id) ON DELETE CASCADE,
  duty_log_id           UUID REFERENCES ocg_daily_duty_logs(id) ON DELETE SET NULL,
  duty_date             DATE NOT NULL,
  original_assignee_id  UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,
  substitute_assignee_id UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,
  reason                TEXT NOT NULL,
  event_type            TEXT NOT NULL DEFAULT 'cover', -- cover|reassign|return
  changed_by            TEXT NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT duty_assignment_event_type_check CHECK (event_type IN ('cover','reassign','return'))
);
CREATE INDEX IF NOT EXISTS idx_duty_assignment_event_duty
  ON ocg_duty_assignment_events (duty_id, duty_date DESC);
CREATE INDEX IF NOT EXISTS idx_duty_assignment_event_person
  ON ocg_duty_assignment_events (substitute_assignee_id, duty_date DESC);

-- ─── 6. CANONICAL INVENTORY IDENTITY, UNITS AND SOURCE LINEAGE ─────────────
ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS canonical_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS base_unit TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS pack_size NUMERIC(14,5) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS purchasable BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS producible BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sellable BOOLEAN NOT NULL DEFAULT false;
UPDATE inventory_items SET canonical_name = name WHERE canonical_name = '';
UPDATE inventory_items SET base_unit = unit WHERE base_unit = '';
ALTER TABLE inventory_items DROP CONSTRAINT IF EXISTS inventory_items_pack_size_positive;
ALTER TABLE inventory_items ADD CONSTRAINT inventory_items_pack_size_positive CHECK (pack_size > 0);
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_item_canonical_sku
  ON inventory_items (brand_id, lower(sku)) WHERE sku <> '';
CREATE INDEX IF NOT EXISTS idx_inventory_item_canonical_name
  ON inventory_items (brand_id, lower(canonical_name));

CREATE TABLE IF NOT EXISTS inventory_item_aliases (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id        UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  brand_id       UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  alias          TEXT NOT NULL,
  alias_type     TEXT NOT NULL DEFAULT 'legacy', -- legacy|supplier|barcode|import
  source_id      UUID REFERENCES historical_import_sources(id) ON DELETE SET NULL,
  notes          TEXT NOT NULL DEFAULT '',
  active         BOOLEAN NOT NULL DEFAULT true,
  created_by     TEXT NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_alias_scope
  ON inventory_item_aliases (brand_id, lower(alias)) WHERE active;
CREATE INDEX IF NOT EXISTS idx_inventory_alias_item ON inventory_item_aliases (item_id, active);

ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS movement_unit TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS conversion_rate NUMERIC(14,5) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS base_quantity NUMERIC(14,5),
  ADD COLUMN IF NOT EXISTS effective_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_table TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS source_record_id TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS approved_by TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS reversal_of_id UUID REFERENCES inventory_movements(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS import_id UUID REFERENCES data_imports(id) ON DELETE RESTRICT;
UPDATE inventory_movements m
SET movement_unit = COALESCE(NULLIF(i.unit, ''), 'unit'),
    base_quantity = m.quantity,
    effective_at = COALESCE(m.movement_date::timestamptz, m.created_at)
FROM inventory_items i
WHERE i.id = m.item_id
  AND (m.movement_unit = '' OR m.base_quantity IS NULL OR m.effective_at IS NULL);
ALTER TABLE inventory_movements ALTER COLUMN base_quantity SET NOT NULL;
ALTER TABLE inventory_movements ALTER COLUMN effective_at SET NOT NULL;
ALTER TABLE inventory_movements DROP CONSTRAINT IF EXISTS inventory_movement_conversion_positive;
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movement_conversion_positive
  CHECK (conversion_rate > 0 AND base_quantity > 0 AND movement_unit <> '');
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_movement_idempotency
  ON inventory_movements (idempotency_key) WHERE idempotency_key <> '';
CREATE INDEX IF NOT EXISTS idx_inventory_movement_source
  ON inventory_movements (source_table, source_record_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movement_entity_effective
  ON inventory_movements (brand_id, effective_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_movement_reversal
  ON inventory_movements (reversal_of_id) WHERE reversal_of_id IS NOT NULL;

CREATE OR REPLACE VIEW inventory_stock_cards AS
  SELECT
    m.id AS movement_id, m.item_id, i.name AS item_name, i.sku,
    i.base_unit AS unit, i.item_type, m.brand_id, m.store_id, m.batch_number,
    m.movement_date, m.created_at, m.direction,
    CASE WHEN m.direction = 'in' THEN m.base_quantity ELSE 0 END AS quantity_in,
    CASE WHEN m.direction = 'out' THEN m.base_quantity ELSE 0 END AS quantity_out,
    m.quantity_after AS recorded_balance,
    SUM(CASE WHEN m.direction = 'in' THEN m.base_quantity ELSE -m.base_quantity END)
      OVER (PARTITION BY m.item_id ORDER BY m.effective_at, m.created_at, m.id
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_balance,
    m.reason, m.reference, m.source,
    CASE
      WHEN m.goods_receipt_id IS NOT NULL THEN 'Goods Received Note'
      WHEN m.goods_issue_id IS NOT NULL THEN 'Goods Issue Note'
      WHEN m.fg_transfer_id IS NOT NULL THEN 'Finished Goods Transfer'
      WHEN m.purchase_id IS NOT NULL THEN 'Purchase'
      ELSE COALESCE(NULLIF(m.source_table, ''), 'Manual')
    END AS source_document_type,
    COALESCE(m.goods_receipt_id, m.goods_issue_id, m.fg_transfer_id, m.purchase_id) AS source_document_id,
    m.production_run_id, m.recorded_by AS actioned_by, m.notes,
    m.quantity AS entered_quantity, m.movement_unit, m.conversion_rate, m.base_quantity,
    m.effective_at, m.idempotency_key, m.reversal_of_id, m.import_id, m.source_record_id
  FROM inventory_movements m
  JOIN inventory_items i ON i.id = m.item_id;
GRANT SELECT ON inventory_stock_cards TO service_role;

-- ─── 7. FINANCE SOURCE / POSTING / IDEMPOTENCY FOUNDATION ──────────────────
ALTER TABLE finance_transactions
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_id TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS source_reference TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS posting_status TEXT NOT NULL DEFAULT 'posted',
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS approved_by TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversed_by_id UUID REFERENCES finance_transactions(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS import_id UUID REFERENCES data_imports(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_transaction_idempotency
  ON finance_transactions (idempotency_key) WHERE idempotency_key <> '';
CREATE INDEX IF NOT EXISTS idx_finance_transaction_source
  ON finance_transactions (source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_finance_transaction_entity_date
  ON finance_transactions (brand_id, transaction_date DESC, posting_status);

CREATE TABLE IF NOT EXISTS finance_journals (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id          UUID NOT NULL REFERENCES brands(id) ON DELETE RESTRICT,
  journal_ref       TEXT NOT NULL,
  effective_date    DATE NOT NULL,
  source_type       TEXT NOT NULL,
  source_id         TEXT NOT NULL,
  source_reference  TEXT NOT NULL DEFAULT '',
  posting_status    TEXT NOT NULL DEFAULT 'draft', -- draft|submitted|approved|posted|reversed
  idempotency_key   TEXT NOT NULL,
  description       TEXT NOT NULL DEFAULT '',
  created_by        TEXT NOT NULL,
  approved_by       TEXT NOT NULL DEFAULT '',
  approved_at       TIMESTAMPTZ,
  posted_by         TEXT NOT NULL DEFAULT '',
  posted_at         TIMESTAMPTZ,
  reversal_of_id    UUID REFERENCES finance_journals(id) ON DELETE RESTRICT,
  import_id         UUID REFERENCES data_imports(id) ON DELETE RESTRICT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT finance_journal_status_check
    CHECK (posting_status IN ('draft','submitted','approved','posted','reversed')),
  UNIQUE (brand_id, journal_ref),
  UNIQUE (idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_finance_journal_source
  ON finance_journals (source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_finance_journal_entity_date
  ON finance_journals (brand_id, effective_date DESC, posting_status);

CREATE TABLE IF NOT EXISTS finance_journal_lines (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_id     UUID NOT NULL REFERENCES finance_journals(id) ON DELETE RESTRICT,
  line_no        INTEGER NOT NULL,
  account_id     UUID REFERENCES finance_accounts(id) ON DELETE RESTRICT,
  account_code   TEXT NOT NULL DEFAULT '',
  description    TEXT NOT NULL DEFAULT '',
  debit_ksh      NUMERIC(14,2) NOT NULL DEFAULT 0,
  credit_ksh     NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT finance_journal_line_one_side CHECK (
    (debit_ksh > 0 AND credit_ksh = 0) OR (credit_ksh > 0 AND debit_ksh = 0)
  ),
  UNIQUE (journal_id, line_no)
);
CREATE INDEX IF NOT EXISTS idx_finance_journal_line_journal ON finance_journal_lines (journal_id);

-- A posting function makes balance validation and state transition one atomic
-- database operation. Replays return the already-posted journal unchanged.
CREATE OR REPLACE FUNCTION post_finance_journal(p_journal_id UUID, p_posted_by TEXT)
RETURNS finance_journals LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  j finance_journals;
  total_debit NUMERIC(14,2);
  total_credit NUMERIC(14,2);
BEGIN
  SELECT * INTO j FROM finance_journals WHERE id = p_journal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Journal not found'; END IF;
  IF j.posting_status = 'posted' THEN RETURN j; END IF;
  IF j.posting_status NOT IN ('approved','submitted') THEN
    RAISE EXCEPTION 'Journal must be submitted or approved before posting';
  END IF;
  SELECT COALESCE(SUM(debit_ksh),0), COALESCE(SUM(credit_ksh),0)
    INTO total_debit, total_credit FROM finance_journal_lines WHERE journal_id = p_journal_id;
  IF total_debit <= 0 OR total_debit <> total_credit THEN
    RAISE EXCEPTION 'Journal is not balanced (debit %, credit %)', total_debit, total_credit;
  END IF;
  UPDATE finance_journals SET posting_status='posted', posted_by=p_posted_by,
    posted_at=now(), updated_at=now() WHERE id=p_journal_id RETURNING * INTO j;
  RETURN j;
END $$;
REVOKE ALL ON FUNCTION post_finance_journal(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION post_finance_journal(UUID, TEXT) TO service_role;

-- Locked historical periods are immutable. Corrections must be separate
-- reversal/adjustment records in an open period.
CREATE OR REPLACE FUNCTION prevent_locked_import_history_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  import_value UUID;
  locked BOOLEAN;
BEGIN
  import_value := NULLIF((to_jsonb(OLD)->>TG_ARGV[0]), '')::uuid;
  IF import_value IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT EXISTS (
    SELECT 1 FROM data_imports i
    LEFT JOIN historical_import_periods p ON p.id = i.period_id
    WHERE i.id = import_value AND (i.status = 'locked' OR p.status = 'locked')
  ) INTO locked;
  IF locked THEN
    RAISE EXCEPTION 'Locked imported history cannot be changed; create a correction or reversal';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_locked_finance_history ON finance_transactions;
CREATE TRIGGER trg_locked_finance_history BEFORE UPDATE OR DELETE ON finance_transactions
  FOR EACH ROW EXECUTE FUNCTION prevent_locked_import_history_change('import_id');
DROP TRIGGER IF EXISTS trg_locked_inventory_history ON inventory_movements;
CREATE TRIGGER trg_locked_inventory_history BEFORE UPDATE OR DELETE ON inventory_movements
  FOR EACH ROW EXECUTE FUNCTION prevent_locked_import_history_change('import_id');

-- ─── 8. RLS / SERVICE ROLE ─────────────────────────────────────────────────
-- New sensitive tables are never directly readable by authenticated clients.
-- Route handlers use the service role only after verified, server-side section,
-- brand and record-scope checks.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'operational_record_access','operational_document_events',
    'employee_entity_assignments','employee_responsibilities','employee_capabilities',
    'employee_capability_assignments','employee_authorities','employee_cover_assignments',
    'employee_resource_assignments','employee_qualifications','employee_activity_history',
    'ocg_knowledge_entries','ocg_knowledge_versions',
    'historical_import_sources','historical_import_periods','historical_import_source_links',
    'historical_import_mappings','historical_import_exceptions',
    'historical_import_reconciliations','historical_import_events',
    'ocg_duty_assignment_events','inventory_item_aliases',
    'finance_journals','finance_journal_lines'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_service', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      t || '_service', t
    );
    EXECUTE format('GRANT ALL ON TABLE %I TO service_role', t);
  END LOOP;
END $$;
