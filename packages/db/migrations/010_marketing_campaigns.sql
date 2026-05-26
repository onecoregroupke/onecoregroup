-- Migration 010: Marketing campaigns
-- Bounded units of work — goal, audience, window, optional UTM. Content rows
-- attach via marketing_content.campaign_id (the FK is added here).
-- Run after 008_marketing.sql. Idempotent — safe to re-run.
--
-- Status machine:
--   planning → live → paused → live → completed
--                       └→ cancelled

CREATE TABLE IF NOT EXISTS marketing_campaigns (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id             UUID NOT NULL REFERENCES brands(id) ON DELETE RESTRICT,
  slug                 TEXT UNIQUE NOT NULL,
  name                 TEXT NOT NULL,
  goal                 TEXT,
  audience_summary     TEXT,
  primary_channel      TEXT,
  secondary_channels   TEXT[] NOT NULL DEFAULT '{}'::text[],
  start_date           DATE,
  end_date             DATE,
  status               TEXT NOT NULL DEFAULT 'planning',
  utm_campaign         TEXT,
  budget_ksh           NUMERIC,
  target_leads         INTEGER,
  target_revenue_ksh   NUMERIC,
  kpis                 JSONB NOT NULL DEFAULT '{}'::jsonb,
  owner_email          TEXT,
  notes                TEXT,
  created_by_email     TEXT,
  metadata             JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT marketing_campaigns_status_chk CHECK (
    status IN ('planning', 'live', 'paused', 'completed', 'cancelled')
  )
);

CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_brand_status
  ON marketing_campaigns(brand_id, status, start_date DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_dates
  ON marketing_campaigns(start_date, end_date)
  WHERE status IN ('planning', 'live', 'paused');

-- ── FK from marketing_content.campaign_id ────────────────────────────────
-- The column already exists (migration 008). Add the constraint now.
DO $add_campaign_fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'marketing_content_campaign_fk'
  ) THEN
    ALTER TABLE marketing_content
      ADD CONSTRAINT marketing_content_campaign_fk
      FOREIGN KEY (campaign_id) REFERENCES marketing_campaigns(id)
      ON DELETE SET NULL;
  END IF;
END
$add_campaign_fk$;

-- ── RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE marketing_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "marketing_campaigns_auth"    ON marketing_campaigns FOR SELECT TO authenticated USING (true);
CREATE POLICY "marketing_campaigns_service" ON marketing_campaigns USING (auth.role() = 'service_role') WITH CHECK (true);
