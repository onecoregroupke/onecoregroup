-- Migration 020: Marketing — per-content metrics & digests (Workstream C)
-- Brand-day metrics already exist (daily_metrics, migration 001). This adds
-- per-content performance snapshots so a post's reach/engagement can be tracked
-- over time, plus rollup views for the dashboard + executive report.
-- Run after 019. Idempotent — safe to re-run.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── marketing_content_metrics ───────────────────────────────────────────────
-- One snapshot per (content, captured_at). source: manual | api | import
CREATE TABLE IF NOT EXISTS marketing_content_metrics (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id    UUID NOT NULL REFERENCES marketing_content(id) ON DELETE CASCADE,
  brand_id      UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  captured_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  reach         INTEGER NOT NULL DEFAULT 0,
  impressions   INTEGER NOT NULL DEFAULT 0,
  likes         INTEGER NOT NULL DEFAULT 0,
  comments      INTEGER NOT NULL DEFAULT 0,
  shares        INTEGER NOT NULL DEFAULT 0,
  saves         INTEGER NOT NULL DEFAULT 0,
  clicks        INTEGER NOT NULL DEFAULT 0,
  video_views   INTEGER NOT NULL DEFAULT 0,
  followers_delta INTEGER NOT NULL DEFAULT 0,
  source        TEXT NOT NULL DEFAULT 'manual',
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketing_content_metrics_content
  ON marketing_content_metrics(content_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_content_metrics_brand_time
  ON marketing_content_metrics(brand_id, captured_at DESC);

ALTER TABLE marketing_content_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "marketing_content_metrics_auth"    ON marketing_content_metrics FOR SELECT TO authenticated USING (true);
CREATE POLICY "marketing_content_metrics_service" ON marketing_content_metrics USING (auth.role() = 'service_role') WITH CHECK (true);
GRANT ALL ON TABLE marketing_content_metrics TO service_role;

-- ─── view: latest metric per content ─────────────────────────────────────────
CREATE OR REPLACE VIEW marketing_content_latest_metrics AS
SELECT DISTINCT ON (content_id)
  content_id, brand_id, captured_at, reach, impressions, likes, comments,
  shares, saves, clicks, video_views, followers_delta,
  (likes + comments + shares + saves)::INT AS engagement
FROM marketing_content_metrics
ORDER BY content_id, captured_at DESC;

GRANT SELECT ON marketing_content_latest_metrics TO service_role;

-- ─── view: 30-day brand performance rollup (for dashboard + reports) ─────────
CREATE OR REPLACE VIEW marketing_brand_performance_30d AS
SELECT
  b.id   AS brand_id,
  b.slug AS brand_slug,
  b.name AS brand_name,
  COUNT(DISTINCT m.content_id)::INT AS posts_measured,
  COALESCE(SUM(m.reach), 0)::BIGINT        AS total_reach,
  COALESCE(SUM(m.impressions), 0)::BIGINT  AS total_impressions,
  COALESCE(SUM(m.likes + m.comments + m.shares + m.saves), 0)::BIGINT AS total_engagement,
  COALESCE(SUM(m.clicks), 0)::BIGINT       AS total_clicks
FROM brands b
LEFT JOIN marketing_content_latest_metrics m
  ON m.brand_id = b.id AND m.captured_at >= now() - INTERVAL '30 days'
GROUP BY b.id, b.slug, b.name;

GRANT SELECT ON marketing_brand_performance_30d TO service_role;
