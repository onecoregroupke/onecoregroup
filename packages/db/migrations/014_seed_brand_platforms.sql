-- Migration 014: Brand sort order + marketing platforms seed
-- Derived from Jan/Feb/Mar 2026 monthly social-media reports — covers the
-- platforms each brand actually operates on (rows where follower_count > 0).
-- monthly_post_target values follow the 120-day campaign plan cadence
-- (see marketing-plans/generate.js SHARED.outputTargets):
--   Primary IG / TikTok: ~16 feed posts/mo  (3 reels/wk + 1–2 statics/wk)
--   Facebook: 8/mo       X: 16/mo (3–5x/wk)       YouTube: 4/mo
-- Idempotent — safe to re-run. Handles default to NULL so the team can fill
-- them in the Platforms admin page when ready.

-- ─── PREREQUISITE GUARDS ──────────────────────────────────────────────────────
-- Make this migration self-contained: if earlier migrations haven't been
-- applied yet, the columns / tables it needs are created on the fly. All
-- idempotent — safe to re-run after 008 + 009 have already landed.
ALTER TABLE brands ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_brands_sort_order ON brands(sort_order);

DO $check_platforms$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'marketing_platforms'
  ) THEN
    RAISE EXCEPTION 'marketing_platforms table is missing — run migration 008_marketing.sql first.';
  END IF;
END
$check_platforms$;

-- ─── BRAND DISPLAY ORDER ──────────────────────────────────────────────────────
-- Matches the order used in the hub sidebar and input portal.
UPDATE brands SET sort_order = 10 WHERE slug = 'nairobi-piano-technicians';
UPDATE brands SET sort_order = 20 WHERE slug = 'glitz-n-glim';
UPDATE brands SET sort_order = 30 WHERE slug = 'nuuranest-stays';
UPDATE brands SET sort_order = 40 WHERE slug = 'ar-rayyan-playhouse';
UPDATE brands SET sort_order = 50 WHERE slug = 'rhythms-college';
UPDATE brands SET sort_order = 60 WHERE slug = 'darul-swafa';

-- ─── MARKETING PLATFORMS ──────────────────────────────────────────────────────
-- Each row is a (brand, platform, handle) the team actively posts on. The
-- UNIQUE (brand_id, platform, handle) constraint with NULL handles means a
-- brand has at most one "default account" per platform until handles are set.
INSERT INTO marketing_platforms (brand_id, platform, handle, monthly_post_target, is_active)
SELECT b.id, v.platform, v.handle, v.target, true
FROM brands b
JOIN (
  VALUES
    -- Nairobi Piano Technicians — full stack, IG/TikTok primary
    ('nairobi-piano-technicians', 'instagram', NULL, 16),
    ('nairobi-piano-technicians', 'tiktok',    NULL, 12),
    ('nairobi-piano-technicians', 'facebook',  NULL,  8),
    ('nairobi-piano-technicians', 'x',         NULL, 16),
    ('nairobi-piano-technicians', 'youtube',   NULL,  4),

    -- Glitz N' Glim — IG/TikTok primary, FB + X for reach, YouTube light
    ('glitz-n-glim',              'instagram', NULL, 16),
    ('glitz-n-glim',              'tiktok',    NULL, 12),
    ('glitz-n-glim',              'facebook',  NULL,  8),
    ('glitz-n-glim',              'x',         NULL, 12),
    ('glitz-n-glim',              'youtube',   NULL,  4),

    -- Nuuranest Stays — IG/TikTok primary, X light
    ('nuuranest-stays',           'instagram', NULL, 16),
    ('nuuranest-stays',           'tiktok',    NULL, 12),
    ('nuuranest-stays',           'x',         NULL,  8),

    -- Ar-Rayyan Playhouse — IG/TikTok primary, occasional FB/YT/X
    ('ar-rayyan-playhouse',       'instagram', NULL, 16),
    ('ar-rayyan-playhouse',       'tiktok',    NULL, 12),
    ('ar-rayyan-playhouse',       'facebook',  NULL,  4),
    ('ar-rayyan-playhouse',       'x',         NULL,  4),
    ('ar-rayyan-playhouse',       'youtube',   NULL,  2),

    -- Rhythms College — IG/TikTok primary, X + YouTube light
    ('rhythms-college',           'instagram', NULL, 16),
    ('rhythms-college',           'tiktok',    NULL, 12),
    ('rhythms-college',           'x',         NULL,  8),
    ('rhythms-college',           'youtube',   NULL,  4),

    -- Darul Swafa — IG/TikTok primary, X + YouTube light
    ('darul-swafa',               'instagram', NULL, 16),
    ('darul-swafa',               'tiktok',    NULL, 12),
    ('darul-swafa',               'x',         NULL,  8),
    ('darul-swafa',               'youtube',   NULL,  4)
) AS v(slug, platform, handle, target) ON v.slug = b.slug
ON CONFLICT (brand_id, platform, handle) DO UPDATE SET
  monthly_post_target = EXCLUDED.monthly_post_target,
  is_active           = EXCLUDED.is_active,
  updated_at          = now();
