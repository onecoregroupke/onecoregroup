-- Migration 012: WhatsApp flows
-- Authored conversation flows (records the operator references; no runtime).
-- Run after 008_marketing.sql. Idempotent.

CREATE TABLE IF NOT EXISTS marketing_whatsapp_flows (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id            UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  slug                TEXT NOT NULL,
  name                TEXT NOT NULL,
  description         TEXT,
  trigger_keywords    TEXT[] NOT NULL DEFAULT '{}'::text[],
  trigger_type        TEXT NOT NULL DEFAULT 'keyword',
  trigger_config      JSONB NOT NULL DEFAULT '{}'::jsonb,
  flow_definition     JSONB NOT NULL DEFAULT '{}'::jsonb,
  status              TEXT NOT NULL DEFAULT 'drafting',
  last_triggered_at   TIMESTAMPTZ,
  triggered_count     INTEGER NOT NULL DEFAULT 0,
  owner_email         TEXT,
  notes               TEXT,
  created_by_email    TEXT,
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT marketing_whatsapp_flows_status_chk CHECK (
    status IN ('drafting', 'active', 'paused', 'archived')
  ),
  CONSTRAINT marketing_whatsapp_flows_trigger_chk CHECK (
    trigger_type IN ('keyword', 'new_contact', 'manual_broadcast', 'webhook')
  ),
  UNIQUE (brand_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_marketing_whatsapp_flows_brand
  ON marketing_whatsapp_flows(brand_id, status);

ALTER TABLE marketing_whatsapp_flows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "marketing_whatsapp_flows_auth"    ON marketing_whatsapp_flows FOR SELECT TO authenticated USING (true);
CREATE POLICY "marketing_whatsapp_flows_service" ON marketing_whatsapp_flows USING (auth.role() = 'service_role') WITH CHECK (true);
