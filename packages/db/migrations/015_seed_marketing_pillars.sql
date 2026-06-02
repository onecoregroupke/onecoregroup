-- Migration 015: Marketing pillars seed (One Core 120-day framework)
-- Replaces the generic "Brand Story / Product / Community" placeholders
-- (seeded by 008) with the four KPI-aligned pillars used in the campaign
-- plan. See marketing-plans/generate.js SHARED.kpis for the source taxonomy.
-- Each pillar carries a target share % of weekly output so the team can
-- balance the mix at a glance in the Pillars admin page.

INSERT INTO marketing_pillars (slug, name, description, color_hex, target_share_pct, sort_order, is_active)
VALUES
  ('visibility',
   'Visibility',
   'Reach-driven content — reels, trends, hooks, share-bait. Goal: profile visits, follower growth, search appearances.',
   '#0ea5e9', 35, 10, true),
  ('engagement',
   'Engagement',
   'Conversation-starting content — polls, questions, community posts, behind-the-scenes. Goal: saves, shares, comments, DMs.',
   '#16a34a', 25, 20, true),
  ('conversion',
   'Conversion',
   'Offer-led content — product features, promotions, testimonials, clear CTA to WhatsApp / form / booking.',
   '#b07a00', 25, 30, true),
  ('authority',
   'Authority',
   'Educational and proof content — how-tos, customer stories, expertise demonstrations, before/after.',
   '#9a2a2a', 15, 40, true)
ON CONFLICT (slug) DO UPDATE SET
  name             = EXCLUDED.name,
  description      = EXCLUDED.description,
  color_hex        = EXCLUDED.color_hex,
  target_share_pct = EXCLUDED.target_share_pct,
  sort_order       = EXCLUDED.sort_order,
  is_active        = EXCLUDED.is_active,
  updated_at       = now();

-- Retire the three placeholder pillars from migration 008 (idempotent).
UPDATE marketing_pillars
   SET is_active = false, updated_at = now()
 WHERE slug IN ('brand-story', 'product', 'community')
   AND NOT EXISTS (
     SELECT 1 FROM marketing_content_pillars cp WHERE cp.pillar_id = marketing_pillars.id
   );
