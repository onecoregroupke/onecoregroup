-- Migration 008: Marketing Hub — content scheduling system
-- Ported from the WM & Co marketing hub, adapted to One Core Group:
--   * brand_id references the existing `brands` table (no separate brand model)
--   * episodes are intentionally omitted (no episode_id, no episodes table)
--   * extra publisher columns (whatsapp_flow_id, meta_ad_campaign_id,
--     audience_query, needs_publishing) are deferred to a later phase
-- Run in Supabase SQL Editor. Idempotent — safe to re-run.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── PLATFORMS ────────────────────────────────────────────────────────────────
-- One row per (brand, platform, handle). The cadence target lives here, so a
-- brand's LinkedIn and Instagram can carry different monthly_post_target values.
--   platform: linkedin | instagram | x | threads | tiktok | youtube
--             whatsapp_status | whatsapp_channel | email | blog | podcast
--   posting_mode: remind_only | api_publish (only remind_only is wired today)
CREATE TABLE IF NOT EXISTS marketing_platforms (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id             UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  platform             TEXT NOT NULL,
  handle               TEXT,
  external_id          TEXT,
  monthly_post_target  INTEGER NOT NULL DEFAULT 0,
  current_health       TEXT NOT NULL DEFAULT 'healthy',
  posting_mode         TEXT NOT NULL DEFAULT 'remind_only',
  is_active            BOOLEAN NOT NULL DEFAULT true,
  metadata             JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (brand_id, platform, handle)
);

CREATE INDEX IF NOT EXISTS idx_marketing_platforms_brand_active
  ON marketing_platforms(brand_id, is_active);
CREATE INDEX IF NOT EXISTS idx_marketing_platforms_platform
  ON marketing_platforms(platform);

-- ─── PILLARS ──────────────────────────────────────────────────────────────────
-- Content taxonomy, global across brands. The calendar colours each content
-- chip by its first pillar (sort_order ascending).
CREATE TABLE IF NOT EXISTS marketing_pillars (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              TEXT UNIQUE NOT NULL,
  name              TEXT NOT NULL,
  description       TEXT,
  color_hex         TEXT NOT NULL DEFAULT '#1a1a2e',
  target_share_pct  INTEGER,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketing_pillars_active
  ON marketing_pillars(is_active, sort_order);

-- ─── CONTENT ──────────────────────────────────────────────────────────────────
-- The hub's primary entity. Every planned, scheduled, or published post on any
-- platform is one row here.
--   status: idea | draft | review | approved | scheduled | published
--           | reported | archived | publish_failed
--   content_type: post | story | reel | short | video | thread
--           | channel_message | status | ad | newsletter_issue | blog_post
--   posted_via: manual | buffer | api
-- campaign_id is a bare UUID column for now (no FK); the FK lands when the
-- campaigns table is added in Phase 2.
CREATE TABLE IF NOT EXISTS marketing_content (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id           UUID NOT NULL REFERENCES brands(id) ON DELETE RESTRICT,
  platform_id        UUID REFERENCES marketing_platforms(id) ON DELETE SET NULL,
  campaign_id        UUID,
  campaign_label     TEXT,
  content_type       TEXT NOT NULL DEFAULT 'post',
  status             TEXT NOT NULL DEFAULT 'idea',
  posted_via         TEXT NOT NULL DEFAULT 'manual',
  title              TEXT,
  hook               TEXT,
  body_markdown      TEXT NOT NULL DEFAULT '',
  hashtags           TEXT,
  asset_urls         JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes              TEXT,
  scheduled_at       TIMESTAMPTZ,
  published_at       TIMESTAMPTZ,
  external_url       TEXT,
  external_post_id   TEXT,
  publish_error      TEXT,
  owner_email        TEXT,
  created_by_email   TEXT,
  approved_by_email  TEXT,
  metadata           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT marketing_content_status_chk CHECK (
    status IN (
      'idea', 'draft', 'review', 'approved',
      'scheduled', 'published', 'reported', 'archived', 'publish_failed'
    )
  ),
  CONSTRAINT marketing_content_posted_via_chk CHECK (
    posted_via IN ('manual', 'buffer', 'api')
  )
);

CREATE INDEX IF NOT EXISTS idx_marketing_content_brand_status_time
  ON marketing_content(brand_id, status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_marketing_content_platform_time
  ON marketing_content(platform_id, scheduled_at)
  WHERE platform_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_marketing_content_scheduled_due
  ON marketing_content(scheduled_at)
  WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_marketing_content_campaign
  ON marketing_content(campaign_id)
  WHERE campaign_id IS NOT NULL;

-- ─── CONTENT ↔ PILLARS (M:M) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS marketing_content_pillars (
  content_id  UUID NOT NULL REFERENCES marketing_content(id) ON DELETE CASCADE,
  pillar_id   UUID NOT NULL REFERENCES marketing_pillars(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (content_id, pillar_id)
);

CREATE INDEX IF NOT EXISTS idx_marketing_content_pillars_pillar
  ON marketing_content_pillars(pillar_id);

-- ─── ROW LEVEL SECURITY ───────────────────────────────────────────────────────
-- Mirrors the project convention: authenticated users can read, the service
-- role (used by the /api/marketing/* routes) can do everything.
ALTER TABLE marketing_platforms        ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_pillars          ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_content          ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_content_pillars  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "marketing_platforms_auth"  ON marketing_platforms       FOR SELECT TO authenticated USING (true);
CREATE POLICY "marketing_pillars_auth"    ON marketing_pillars         FOR SELECT TO authenticated USING (true);
CREATE POLICY "marketing_content_auth"    ON marketing_content         FOR SELECT TO authenticated USING (true);
CREATE POLICY "marketing_cpillars_auth"   ON marketing_content_pillars FOR SELECT TO authenticated USING (true);

CREATE POLICY "marketing_platforms_service"  ON marketing_platforms       USING (auth.role() = 'service_role') WITH CHECK (true);
CREATE POLICY "marketing_pillars_service"    ON marketing_pillars         USING (auth.role() = 'service_role') WITH CHECK (true);
CREATE POLICY "marketing_content_service"    ON marketing_content         USING (auth.role() = 'service_role') WITH CHECK (true);
CREATE POLICY "marketing_cpillars_service"   ON marketing_content_pillars USING (auth.role() = 'service_role') WITH CHECK (true);

-- ─── CALENDAR FEED VIEW ─────────────────────────────────────────────────────
-- Convenience read for dashboard widgets: every non-archived scheduled content
-- row in the next ~30 days with its brand, platform, and first pillar (colour).
CREATE OR REPLACE VIEW marketing_calendar_30d AS
SELECT
  c.id,
  c.brand_id,
  b.slug                      AS brand_slug,
  b.name                      AS brand_name,
  b.color_hex                 AS brand_color,
  c.platform_id,
  p.platform,
  p.handle                    AS platform_handle,
  c.content_type,
  c.status,
  c.posted_via,
  c.title,
  c.hook,
  c.scheduled_at,
  c.published_at,
  c.external_url,
  (
    SELECT pl.id
    FROM marketing_content_pillars cp
    JOIN marketing_pillars pl ON pl.id = cp.pillar_id
    WHERE cp.content_id = c.id
    ORDER BY pl.sort_order
    LIMIT 1
  )                           AS primary_pillar_id,
  (
    SELECT pl.color_hex
    FROM marketing_content_pillars cp
    JOIN marketing_pillars pl ON pl.id = cp.pillar_id
    WHERE cp.content_id = c.id
    ORDER BY pl.sort_order
    LIMIT 1
  )                           AS primary_pillar_color
FROM marketing_content c
JOIN brands b ON b.id = c.brand_id
LEFT JOIN marketing_platforms p ON p.id = c.platform_id
WHERE c.status <> 'archived'
  AND c.scheduled_at IS NOT NULL
  AND c.scheduled_at >= now() - INTERVAL '1 day'
  AND c.scheduled_at <  now() + INTERVAL '31 days';

-- ─── SEED: starter pillars ──────────────────────────────────────────────────
-- Three neutral pillars so the calendar legend isn't empty. Edit or replace
-- them in the Pillars admin page.
INSERT INTO marketing_pillars (slug, name, description, color_hex, sort_order)
VALUES
  ('brand-story',  'Brand Story',  'Who we are, what we stand for, behind-the-scenes.', '#1a1a2e', 10),
  ('product',      'Product',      'Listings, offers, features, and product education.', '#b07a00', 20),
  ('community',    'Community',     'Customer stories, testimonials, and engagement.',   '#1a6b42', 30)
ON CONFLICT (slug) DO NOTHING;
