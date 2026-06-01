-- Migration 019: Marketing — episodes & clipping (Workstream C)
-- Ported from the wallacemecha board. An "episode" is a long-form anchor
-- (YouTube + podcast) that spawns short-form clip content rows across platforms.
-- Run after 008–016. Idempotent — safe to re-run.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── marketing_episodes ──────────────────────────────────────────────────────
-- Status: idea → recording → editing → scheduled → published → archived
-- edit_status (post-production track): none | in_edit | review | done
CREATE TABLE IF NOT EXISTS marketing_episodes (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id                UUID NOT NULL REFERENCES brands(id) ON DELETE RESTRICT,
  number                  INT,
  slug                    TEXT UNIQUE,
  title                   TEXT NOT NULL,
  hook                    TEXT,
  guest_name              TEXT,
  guest_org               TEXT,
  summary_markdown        TEXT NOT NULL DEFAULT '',
  record_date             DATE,
  publish_date            DATE,
  edit_status             TEXT NOT NULL DEFAULT 'none',
  status                  TEXT NOT NULL DEFAULT 'idea',
  youtube_url             TEXT,
  podcast_url             TEXT,
  transcript_storage_path TEXT,
  cover_storage_path      TEXT,
  duration_seconds        INT,
  campaign_id             UUID REFERENCES marketing_campaigns(id) ON DELETE SET NULL,
  created_by_email        TEXT,
  metadata                JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT marketing_episodes_status_chk CHECK (
    status IN ('idea','recording','editing','scheduled','published','archived')
  ),
  CONSTRAINT marketing_episodes_edit_status_chk CHECK (
    edit_status IN ('none','in_edit','review','done')
  ),
  UNIQUE (brand_id, number)
);

CREATE INDEX IF NOT EXISTS idx_marketing_episodes_brand_status
  ON marketing_episodes(brand_id, status, publish_date DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_episodes_publish_date
  ON marketing_episodes(publish_date) WHERE status IN ('scheduled','published');

-- ─── marketing_episode_clips ─────────────────────────────────────────────────
-- One row per (episode, content) link; clip-specific metadata lives here, the
-- content row carries post copy/schedule/status.
CREATE TABLE IF NOT EXISTS marketing_episode_clips (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id    UUID NOT NULL REFERENCES marketing_episodes(id) ON DELETE CASCADE,
  content_id    UUID NOT NULL REFERENCES marketing_content(id) ON DELETE CASCADE,
  hook          TEXT,
  start_seconds INT,
  end_seconds   INT,
  aspect_ratio  TEXT,
  storage_path  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (content_id)
);

CREATE INDEX IF NOT EXISTS idx_marketing_episode_clips_episode
  ON marketing_episode_clips(episode_id);

-- ─── content.episode_id link ─────────────────────────────────────────────────
ALTER TABLE marketing_content ADD COLUMN IF NOT EXISTS episode_id UUID;
DO $add_episode_fk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'marketing_content_episode_fk') THEN
    ALTER TABLE marketing_content
      ADD CONSTRAINT marketing_content_episode_fk
      FOREIGN KEY (episode_id) REFERENCES marketing_episodes(id) ON DELETE SET NULL;
  END IF;
END
$add_episode_fk$;
CREATE INDEX IF NOT EXISTS idx_marketing_content_episode
  ON marketing_content(episode_id) WHERE episode_id IS NOT NULL;

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE marketing_episodes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_episode_clips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "marketing_episodes_auth"      ON marketing_episodes      FOR SELECT TO authenticated USING (true);
CREATE POLICY "marketing_episode_clips_auth" ON marketing_episode_clips FOR SELECT TO authenticated USING (true);
CREATE POLICY "marketing_episodes_service"      ON marketing_episodes      USING (auth.role() = 'service_role') WITH CHECK (true);
CREATE POLICY "marketing_episode_clips_service" ON marketing_episode_clips USING (auth.role() = 'service_role') WITH CHECK (true);

GRANT ALL ON TABLE marketing_episodes      TO service_role;
GRANT ALL ON TABLE marketing_episode_clips TO service_role;

-- ─── views: calendar banners + clip rollup ───────────────────────────────────
CREATE OR REPLACE VIEW marketing_episode_banners AS
SELECT e.id AS episode_id, e.brand_id, b.slug AS brand_slug, b.short_name AS brand_short_name,
       b.color_hex AS brand_color, e.number, e.title, e.hook, e.publish_date, e.status,
       e.youtube_url, e.podcast_url
FROM marketing_episodes e
JOIN brands b ON b.id = e.brand_id
WHERE e.publish_date IS NOT NULL AND e.status IN ('scheduled','published');

CREATE OR REPLACE VIEW marketing_episode_clip_summary AS
SELECT e.id AS episode_id,
       COUNT(c.id)::INT AS total_clips,
       COUNT(c.id) FILTER (WHERE mc.status IN ('idea','draft','review','approved'))::INT AS in_progress,
       COUNT(c.id) FILTER (WHERE mc.status = 'scheduled')::INT AS scheduled,
       COUNT(c.id) FILTER (WHERE mc.status IN ('published','reported'))::INT AS published
FROM marketing_episodes e
LEFT JOIN marketing_episode_clips c ON c.episode_id = e.id
LEFT JOIN marketing_content mc       ON mc.id = c.content_id
GROUP BY e.id;

GRANT SELECT ON marketing_episode_banners      TO service_role;
GRANT SELECT ON marketing_episode_clip_summary TO service_role;
