-- Migration 011: Marketing CRM (contacts, deals, activities)
-- Adapted from the WM hub. WM-only bridges (lead_subscriber/entitlement/account/
-- order) are dropped; deals link to marketing_campaigns + brands which exist
-- here. A promote queue is built over One Core's existing `leads` table.
-- Run after 010_marketing_campaigns.sql. Idempotent.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── marketing_contacts ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS marketing_contacts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name          TEXT,
  email              TEXT UNIQUE,
  phone              TEXT,
  company            TEXT,
  role               TEXT,
  linkedin_url       TEXT,
  source             TEXT,
  source_detail      TEXT,
  lifecycle_stage    TEXT NOT NULL DEFAULT 'subscriber',
  owner_email        TEXT,
  tags               TEXT[] NOT NULL DEFAULT '{}'::text[],
  last_contact_at    TIMESTAMPTZ,
  next_contact_at    TIMESTAMPTZ,
  notes              TEXT,
  lead_id            UUID REFERENCES leads(id) ON DELETE SET NULL,
  metadata           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_email   TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT marketing_contacts_lifecycle_chk CHECK (
    lifecycle_stage IN ('subscriber', 'lead', 'prospect', 'client', 'alumni')
  )
);

CREATE INDEX IF NOT EXISTS idx_marketing_contacts_email
  ON marketing_contacts(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_marketing_contacts_lifecycle
  ON marketing_contacts(lifecycle_stage, last_contact_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_marketing_contacts_owner
  ON marketing_contacts(owner_email, next_contact_at) WHERE next_contact_at IS NOT NULL;

-- ── marketing_deals ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS marketing_deals (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id            UUID NOT NULL REFERENCES marketing_contacts(id) ON DELETE CASCADE,
  campaign_id           UUID REFERENCES marketing_campaigns(id) ON DELETE SET NULL,
  brand_id              UUID REFERENCES brands(id) ON DELETE SET NULL,
  name                  TEXT NOT NULL,
  value_ksh             NUMERIC,
  stage                 TEXT NOT NULL DEFAULT 'new',
  expected_close_date   DATE,
  closed_at             TIMESTAMPTZ,
  lost_reason           TEXT,
  order_id              UUID REFERENCES orders(id) ON DELETE SET NULL,
  owner_email           TEXT,
  notes                 TEXT,
  created_by_email      TEXT,
  metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT marketing_deals_stage_chk CHECK (
    stage IN ('new', 'qualified', 'proposal', 'negotiation', 'won', 'lost')
  )
);

CREATE INDEX IF NOT EXISTS idx_marketing_deals_stage
  ON marketing_deals(stage, expected_close_date NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_marketing_deals_contact ON marketing_deals(contact_id);
CREATE INDEX IF NOT EXISTS idx_marketing_deals_campaign
  ON marketing_deals(campaign_id) WHERE campaign_id IS NOT NULL;

-- ── marketing_activities ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS marketing_activities (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id    UUID NOT NULL REFERENCES marketing_contacts(id) ON DELETE CASCADE,
  deal_id       UUID REFERENCES marketing_deals(id) ON DELETE SET NULL,
  kind          TEXT NOT NULL,
  subject       TEXT,
  body          TEXT,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  by_email      TEXT,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT marketing_activities_kind_chk CHECK (
    kind IN ('call', 'email', 'dm', 'meeting', 'podcast_invite',
             'guide_sent', 'newsletter_sent', 'note', 'system')
  )
);

CREATE INDEX IF NOT EXISTS idx_marketing_activities_contact_time
  ON marketing_activities(contact_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_activities_deal_time
  ON marketing_activities(deal_id, occurred_at DESC) WHERE deal_id IS NOT NULL;

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE marketing_contacts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_deals      ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "marketing_contacts_auth"   ON marketing_contacts   FOR SELECT TO authenticated USING (true);
CREATE POLICY "marketing_deals_auth"      ON marketing_deals      FOR SELECT TO authenticated USING (true);
CREATE POLICY "marketing_activities_auth" ON marketing_activities FOR SELECT TO authenticated USING (true);
CREATE POLICY "marketing_contacts_service"   ON marketing_contacts   USING (auth.role() = 'service_role') WITH CHECK (true);
CREATE POLICY "marketing_deals_service"      ON marketing_deals      USING (auth.role() = 'service_role') WITH CHECK (true);
CREATE POLICY "marketing_activities_service" ON marketing_activities USING (auth.role() = 'service_role') WITH CHECK (true);

-- ── view: leads without a matching contact (promote queue) ──────────────────
CREATE OR REPLACE VIEW marketing_leads_to_promote AS
SELECT
  l.id            AS lead_id,
  l.name,
  l.email,
  l.phone,
  l.source,
  l.brand_slug,
  l.interest,
  l.status        AS lead_status,
  l.created_at    AS captured_at
FROM leads l
LEFT JOIN marketing_contacts c
  ON (l.email IS NOT NULL AND LOWER(c.email) = LOWER(l.email))
   OR c.lead_id = l.id
WHERE c.id IS NULL;

-- ── view: open deal pipeline (dashboard) ────────────────────────────────────
CREATE OR REPLACE VIEW marketing_deal_pipeline AS
SELECT
  stage,
  COUNT(*)::INT                                            AS deal_count,
  COALESCE(SUM(value_ksh), 0)::NUMERIC                     AS total_value_ksh,
  COUNT(*) FILTER (WHERE expected_close_date < now())::INT AS overdue_count
FROM marketing_deals
WHERE stage IN ('new', 'qualified', 'proposal', 'negotiation')
GROUP BY stage;
