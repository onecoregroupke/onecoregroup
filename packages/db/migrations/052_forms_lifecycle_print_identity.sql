-- Migration 052: Phase 1 foundations — form lifecycle + branded document identity
-- Additive only. Idempotent — safe to re-run. Run in the Supabase SQL editor.
--
-- Three things, all prerequisites for the NPT / Iceland operational forms:
--
--   1. A reusable reference-number minter (ocg_next_reference) built on the same
--      atomic ops_id_sequences row-lock that mints TASK-/PROJ-/CLIENT- ids. Every
--      operational document from here on (GRN, GIN, GTN, requisition, intake,
--      movement, invoice) draws its number from this one place.
--
--   2. Brand print identity — the legal identity printed on generated documents,
--      kept SEPARATE from the marketing `brands` row. Iceland Geyser Ltd is the
--      company; Glitz N' Glim is its product brand; they share one brand row, so
--      the printed identity cannot be derived from brands.name. Also lets NPT
--      print its own letterhead. Per-document-scope override supported.
--
--   3. Form lifecycle. The existing engine (042) has correct designer/respondent
--      permissions already, but a submission is immediate and final: no draft, no
--      correction, no review, no reference, no attachment, no record linkage, and
--      no way for a historical submission to remember the field set it was filled
--      against. This adds all of that without changing how existing templates or
--      submissions behave (defaults keep them 'published' and 'submitted').

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── 1. REFERENCE NUMBER MINTER ─────────────────────────────────────────────
-- Self-registering companion to ops_next_sequence_val: creates the sequence row
-- on first use instead of raising. The UPDATE ... RETURNING takes a row lock, so
-- concurrent callers can never receive the same number.

CREATE OR REPLACE FUNCTION ocg_next_reference(
  seq_name TEXT,
  prefix   TEXT DEFAULT '',
  width    INTEGER DEFAULT 4
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE v INTEGER;
BEGIN
  INSERT INTO ops_id_sequences (name, current_val)
  VALUES (seq_name, 0)
  ON CONFLICT (name) DO NOTHING;

  UPDATE ops_id_sequences
     SET current_val = current_val + 1
   WHERE name = seq_name
   RETURNING current_val INTO v;

  RETURN prefix || lpad(v::TEXT, GREATEST(width, 1), '0');
END;
$$;

GRANT EXECUTE ON FUNCTION ocg_next_reference(TEXT, TEXT, INTEGER) TO service_role;

-- ─── 2. BRAND PRINT IDENTITY ────────────────────────────────────────────────
-- One 'default' row per brand, plus optional per-document-scope overrides.
-- document_scope: default | invoice | quotation | sales_order | grn | gin | gtn
--                 | requisition | leave | intake | movement | receipt

CREATE TABLE IF NOT EXISTS ocg_brand_print_identities (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id         UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  document_scope   TEXT NOT NULL DEFAULT 'default',
  legal_name       TEXT NOT NULL,
  trading_name     TEXT NOT NULL DEFAULT '',
  postal_address   TEXT NOT NULL DEFAULT '',
  physical_address TEXT NOT NULL DEFAULT '',
  email            TEXT NOT NULL DEFAULT '',
  phone            TEXT NOT NULL DEFAULT '',
  website          TEXT NOT NULL DEFAULT '',
  tax_pin          TEXT NOT NULL DEFAULT '',
  vat_number       TEXT NOT NULL DEFAULT '',
  logo_url         TEXT NOT NULL DEFAULT '',
  accent_hex       TEXT NOT NULL DEFAULT '',
  footer_note      TEXT NOT NULL DEFAULT '',
  -- Free-form extra lines (e.g. "L/LINE: 020-2017737"), rendered under phone.
  extra_lines      TEXT[] NOT NULL DEFAULT '{}',
  is_active        BOOLEAN NOT NULL DEFAULT true,
  updated_by       TEXT NOT NULL DEFAULT '',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_print_identity_brand_scope
  ON ocg_brand_print_identities (brand_id, document_scope);

-- Seed: Iceland Geyser Ltd — the legal entity behind the glitz-n-glim brand row.
-- Identity block confirmed by the operator as the authoritative one (it is the
-- block on the invoice pad currently issued to customers and on the credit
-- facilities application). The company's other stationery shows two further
-- P.O. boxes (2181-00100 on the account-opening form, 47740-00100 on the KEBS
-- letterhead) — deliberately NOT used. Change here, not in code.
INSERT INTO ocg_brand_print_identities
  (brand_id, document_scope, legal_name, trading_name, postal_address, email, phone, tax_pin)
SELECT b.id, 'default',
       'Ice Land Geyser Ltd',
       'Glitz N'' Glim',
       'P. O. Box 8067 - 00100, Nairobi, Kenya',
       'icelandgeyser@gmail.com',
       '0720527579 / 0704547547',
       'P051705964T'
FROM brands b WHERE b.slug = 'glitz-n-glim'
ON CONFLICT (brand_id, document_scope) DO NOTHING;

-- Seed: Nairobi Piano Technicians — from the Instrument Repair Receiving Form.
INSERT INTO ocg_brand_print_identities
  (brand_id, document_scope, legal_name, postal_address, phone, extra_lines)
SELECT b.id, 'default',
       'Nairobi Piano Technicians',
       'P. O. Box 8067 - 00100, Nairobi',
       'Cell: 0736569599 / 0722219775',
       ARRAY['L/LINE: 020-2017737']
FROM brands b WHERE b.slug = 'nairobi-piano-technicians'
ON CONFLICT (brand_id, document_scope) DO NOTHING;

-- Every other brand gets a default identity seeded from its own name so no
-- document can ever fall back to generic One Core Group branding.
INSERT INTO ocg_brand_print_identities (brand_id, document_scope, legal_name, accent_hex)
SELECT b.id, 'default', b.name, b.color_hex
FROM brands b
ON CONFLICT (brand_id, document_scope) DO NOTHING;

-- ─── 3. FORM TEMPLATE LIFECYCLE ─────────────────────────────────────────────
-- Existing templates default to state='published' / version=1 so nothing that
-- staff fill today changes behaviour.

ALTER TABLE ocg_form_templates
  ADD COLUMN IF NOT EXISTS state                TEXT    NOT NULL DEFAULT 'published', -- draft|published|archived
  ADD COLUMN IF NOT EXISTS version              INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS category             TEXT    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS reference_prefix     TEXT    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS requires_approval    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_self_correction BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_signature   BOOLEAN NOT NULL DEFAULT false,
  -- Operational table this form writes into, when it is more than a report book.
  ADD COLUMN IF NOT EXISTS linked_entity_table  TEXT    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS published_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS published_by         TEXT    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS updated_by           TEXT    NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_form_templates_state ON ocg_form_templates (state);

-- Immutable snapshot of the field set at each published version, so a submission
-- filled in March still renders against March's questions after the form is
-- edited in June (§4 audit history, §33 historical checklist versions).
CREATE TABLE IF NOT EXISTS ocg_form_template_versions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES ocg_form_templates(id) ON DELETE CASCADE,
  version     INTEGER NOT NULL,
  name        TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  fields      JSONB NOT NULL DEFAULT '[]',
  published_by TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_form_template_versions_unique
  ON ocg_form_template_versions (template_id, version);

-- Backfill v1 for every template that exists today.
INSERT INTO ocg_form_template_versions (template_id, version, name, description, fields)
SELECT t.id, 1, t.name, t.description, t.fields
FROM ocg_form_templates t
ON CONFLICT (template_id, version) DO NOTHING;

-- ─── 4. FORM SUBMISSION LIFECYCLE ───────────────────────────────────────────
-- status: draft | submitted | under_review | approved | rejected | correction_requested
-- Existing rows become 'submitted' with submitted_at backfilled from created_at.

ALTER TABLE ocg_form_submissions
  ADD COLUMN IF NOT EXISTS status              TEXT    NOT NULL DEFAULT 'submitted',
  ADD COLUMN IF NOT EXISTS template_version    INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS reference           TEXT,
  ADD COLUMN IF NOT EXISTS submitted_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS autosaved_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by         TEXT    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS reviewed_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_comment      TEXT    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS correction_note     TEXT    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS signature_name      TEXT    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS signed_at           TIMESTAMPTZ,
  -- Operational record this submission created or updated.
  ADD COLUMN IF NOT EXISTS linked_entity_table TEXT    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS linked_entity_id    TEXT    NOT NULL DEFAULT '';

UPDATE ocg_form_submissions
   SET submitted_at = created_at
 WHERE submitted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_form_submissions_reference
  ON ocg_form_submissions (reference) WHERE reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_form_submissions_status ON ocg_form_submissions (status);
CREATE INDEX IF NOT EXISTS idx_form_submissions_linked
  ON ocg_form_submissions (linked_entity_table, linked_entity_id);

-- ─── 4b. GENERIC RECORD ATTACHMENTS ─────────────────────────────────────────
-- ONE attachment table for every module (§28), rather than a per-module table
-- for form submissions, intakes, movements, receipts, issue notes, requisitions,
-- inspections and employee documents. `entity_table` + `entity_id` identify the
-- owner; `domain` mirrors the storage path prefix so a signed URL can never be
-- replayed against another module. Files live in the private `ops-attachments`
-- bucket — the path is stored, never a public URL.
CREATE TABLE IF NOT EXISTS ocg_record_attachments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_table TEXT NOT NULL,
  entity_id    TEXT NOT NULL,
  domain       TEXT NOT NULL DEFAULT '',
  brand_id     UUID REFERENCES brands(id) ON DELETE SET NULL,
  storage_path TEXT NOT NULL,              -- private bucket path; never a public URL
  file_name    TEXT NOT NULL DEFAULT '',
  mime_type    TEXT NOT NULL DEFAULT '',
  size_bytes   BIGINT NOT NULL DEFAULT 0,
  caption      TEXT NOT NULL DEFAULT '',
  -- Restricts visibility beyond ordinary module access (§19 confidential HR docs).
  confidentiality TEXT NOT NULL DEFAULT 'normal',  -- normal | restricted | confidential
  uploaded_by  TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_record_attachments_entity
  ON ocg_record_attachments (entity_table, entity_id);
CREATE INDEX IF NOT EXISTS idx_record_attachments_brand
  ON ocg_record_attachments (brand_id);

-- ─── 5. RLS + GRANTS ────────────────────────────────────────────────────────
-- Templates were readable by ANY authenticated user regardless of brand
-- (042 policy `USING (true)`), so brand scoping existed only in the API layer
-- and could be bypassed via PostgREST with a valid session. Every read path in
-- the app goes through lib/forms.ts on the service role, so closing this to
-- service_role only changes no application behaviour.
DROP POLICY IF EXISTS "form_templates_read" ON ocg_form_templates;

ALTER TABLE ocg_brand_print_identities      ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocg_form_template_versions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocg_record_attachments          ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "print_identities_service" ON ocg_brand_print_identities;
CREATE POLICY "print_identities_service" ON ocg_brand_print_identities
  USING (auth.role() = 'service_role') WITH CHECK (true);

DROP POLICY IF EXISTS "form_template_versions_service" ON ocg_form_template_versions;
CREATE POLICY "form_template_versions_service" ON ocg_form_template_versions
  USING (auth.role() = 'service_role') WITH CHECK (true);

DROP POLICY IF EXISTS "record_attachments_service" ON ocg_record_attachments;
CREATE POLICY "record_attachments_service" ON ocg_record_attachments
  USING (auth.role() = 'service_role') WITH CHECK (true);

GRANT ALL ON TABLE ocg_brand_print_identities      TO service_role;
GRANT ALL ON TABLE ocg_form_template_versions      TO service_role;
GRANT ALL ON TABLE ocg_record_attachments          TO service_role;

-- Storage note: the private `ops-attachments` bucket used by these rows is
-- created lazily by lib/opsAttachments.ts on first upload, matching the
-- chat-attachments pattern from 047 — buckets are not provisioned in SQL here.
