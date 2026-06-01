-- Migration 021: Marketing — credentials & publish runner (Workstream C)
-- Enables live API publishing. OAuth tokens are stored encrypted (AES-256-GCM,
-- key derived from MARKETING_CRED_SECRET via scrypt) in encrypted_payload, wire
-- format: v<key_version>:<b64(iv)>:<b64(tag)>:<b64(ciphertext)>. Only the service
-- role touches the credentials table. Run after 020. Idempotent.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── marketing_platform_credentials ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS marketing_platform_credentials (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id          UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  platform_id       UUID REFERENCES marketing_platforms(id) ON DELETE CASCADE,
  platform          TEXT NOT NULL,
  account_handle    TEXT,
  external_user_id  TEXT,
  encrypted_payload TEXT NOT NULL,
  refresh_payload   TEXT,
  key_version       INT NOT NULL DEFAULT 1,
  scopes            TEXT[] NOT NULL DEFAULT '{}'::text[],
  expires_at        TIMESTAMPTZ,
  last_validated_at TIMESTAMPTZ,
  status            TEXT NOT NULL DEFAULT 'active',
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_email  TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT marketing_platform_credentials_status_chk CHECK (
    status IN ('active','expired','revoked','needs_reauth')
  ),
  UNIQUE (brand_id, platform, account_handle)
);

CREATE INDEX IF NOT EXISTS idx_marketing_platform_credentials_brand
  ON marketing_platform_credentials(brand_id, platform, status);
CREATE INDEX IF NOT EXISTS idx_marketing_platform_credentials_expires
  ON marketing_platform_credentials(expires_at) WHERE expires_at IS NOT NULL AND status = 'active';

-- ─── marketing_publish_jobs ──────────────────────────────────────────────────
-- The publish runner's queue. One row per attempt to post a content item via a
-- platform's API. status: pending → running → published | failed (with retries).
CREATE TABLE IF NOT EXISTS marketing_publish_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id    UUID NOT NULL REFERENCES marketing_content(id) ON DELETE CASCADE,
  brand_id      UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  platform      TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',
  attempts      INT NOT NULL DEFAULT 0,
  scheduled_at  TIMESTAMPTZ,
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  external_url      TEXT,
  external_post_id  TEXT,
  error_message TEXT,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT marketing_publish_jobs_status_chk CHECK (
    status IN ('pending','running','published','failed','cancelled')
  )
);

CREATE INDEX IF NOT EXISTS idx_marketing_publish_jobs_due
  ON marketing_publish_jobs(scheduled_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_marketing_publish_jobs_content
  ON marketing_publish_jobs(content_id, created_at DESC);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
-- Credentials are service-role ONLY (no authenticated read — tokens are secret).
ALTER TABLE marketing_platform_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_publish_jobs         ENABLE ROW LEVEL SECURITY;
CREATE POLICY "marketing_platform_credentials_service" ON marketing_platform_credentials USING (auth.role() = 'service_role') WITH CHECK (true);
CREATE POLICY "marketing_publish_jobs_auth"    ON marketing_publish_jobs FOR SELECT TO authenticated USING (true);
CREATE POLICY "marketing_publish_jobs_service" ON marketing_publish_jobs USING (auth.role() = 'service_role') WITH CHECK (true);

GRANT ALL ON TABLE marketing_platform_credentials TO service_role;
GRANT ALL ON TABLE marketing_publish_jobs         TO service_role;
