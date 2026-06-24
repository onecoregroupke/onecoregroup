-- =============================================================================
-- One Core Group — Marketing Hub state inspection
-- =============================================================================
-- Paste this whole file into the Supabase SQL Editor and run. Each block
-- returns a separate result table. Copy the rows you need into your Cowork
-- prompt so the agent has the exact UUIDs it must reference.
--
-- 1. brands              — which brand slugs/IDs exist
-- 2. marketing_platforms — which channels each brand is set up for
-- 3. marketing_pillars   — content taxonomy (active only)
-- 4. marketing_campaigns — existing campaigns (so you don't duplicate)
-- 5. marketing_content   — what's already planned/scheduled/published
-- 6. daily_metrics       — historical coverage per brand
-- 7. cross-brand assets  — properties, piano catalogue, products (for content
--                          references — pricing, photos, descriptions)
-- =============================================================================

-- 1. BRANDS ─────────────────────────────────────────────────────────────────
SELECT
  id,
  slug,
  short_name,
  name,
  color_hex,
  sort_order,
  is_active
FROM brands
ORDER BY sort_order, name;

-- 2. MARKETING PLATFORMS ────────────────────────────────────────────────────
-- Each row is (brand, channel, handle) — the calendar shows one column per row.
SELECT
  p.id           AS platform_id,
  b.short_name   AS brand,
  b.slug         AS brand_slug,
  p.platform,
  p.handle,
  p.monthly_post_target AS target_per_month,
  p.current_health,
  p.posting_mode,
  p.is_active
FROM marketing_platforms p
JOIN brands b ON b.id = p.brand_id
ORDER BY b.sort_order, p.platform;

-- 3. MARKETING PILLARS (active) ─────────────────────────────────────────────
SELECT
  id,
  slug,
  name,
  color_hex,
  target_share_pct AS target_share,
  sort_order
FROM marketing_pillars
WHERE is_active = true
ORDER BY sort_order;

-- 4. EXISTING CAMPAIGNS ─────────────────────────────────────────────────────
SELECT
  c.id,
  c.slug,
  b.short_name AS brand,
  c.name,
  c.status,
  c.start_date,
  c.end_date,
  c.primary_channel,
  c.target_leads,
  c.budget_ksh
FROM marketing_campaigns c
JOIN brands b ON b.id = c.brand_id
ORDER BY c.start_date DESC NULLS LAST, c.created_at DESC;

-- 5. EXISTING CONTENT — counts by brand × status (so you see the gaps) ──────
SELECT
  b.short_name AS brand,
  c.status,
  COUNT(*)     AS rows
FROM marketing_content c
JOIN brands b ON b.id = c.brand_id
GROUP BY b.short_name, c.status
ORDER BY b.short_name, c.status;

-- 6. HISTORICAL DAILY METRICS COVERAGE ──────────────────────────────────────
SELECT
  b.short_name AS brand,
  MIN(dm.metric_date) AS first_day,
  MAX(dm.metric_date) AS last_day,
  COUNT(*)            AS days_logged,
  SUM(dm.feed_posts_count) AS total_posts,
  SUM(dm.reach)            AS total_reach,
  SUM(dm.engagement)       AS total_engagement,
  SUM(dm.dm_inquiries)     AS total_dms
FROM daily_metrics dm
JOIN brands b ON b.id = dm.brand_id
GROUP BY b.short_name
ORDER BY b.short_name;

-- 7a. NUURANEST PROPERTIES (for property-led content) ───────────────────────
SELECT
  slug, name, neighbourhood,
  bedrooms, max_guests,
  price_per_night_ksh,
  is_featured, is_active
FROM properties
WHERE is_active = true
ORDER BY sort_order;

-- 7b. NPT PIANO CATALOGUE (for catalogue-led content) ───────────────────────
SELECT
  slug, name, model, category, status, price, featured
FROM piano_catalogue
WHERE is_active = true
ORDER BY sort_order;

-- 7c. GLITZ PRODUCTS (for product-led content) ──────────────────────────────
SELECT
  slug, name, variant, category_display_name,
  jsonb_array_length(sizes::jsonb) AS size_count,
  is_in_stock, is_featured
FROM products
WHERE is_active = true
ORDER BY sort_order;

-- =============================================================================
-- BONUS: single-blob version for Cowork
-- =============================================================================
-- Run this last query on its own when you're ready to brief Cowork. It returns
-- ONE JSON document with brands + platforms + pillars (the IDs Cowork needs).
-- Click the cell to copy and paste it into the Cowork prompt.

SELECT jsonb_pretty(jsonb_build_object(
  'brands', (
    SELECT jsonb_agg(jsonb_build_object(
      'id', id, 'slug', slug, 'short_name', short_name, 'name', name
    ) ORDER BY sort_order)
    FROM brands WHERE is_active = true
  ),
  'platforms', (
    SELECT jsonb_agg(jsonb_build_object(
      'id', p.id,
      'brand_slug', b.slug,
      'platform', p.platform,
      'handle', p.handle,
      'monthly_target', p.monthly_post_target
    ) ORDER BY b.sort_order, p.platform)
    FROM marketing_platforms p
    JOIN brands b ON b.id = p.brand_id
    WHERE p.is_active = true
  ),
  'pillars', (
    SELECT jsonb_agg(jsonb_build_object(
      'id', id, 'slug', slug, 'name', name, 'target_share_pct', target_share_pct
    ) ORDER BY sort_order)
    FROM marketing_pillars WHERE is_active = true
  )
)) AS hub_state;
