-- =============================================================================
-- ONE CORE GROUP — Marketing Hub bootstrap (migrations 007 → 016)
-- =============================================================================
-- Bundled for a fresh Supabase project that already has migrations 001 – 006
-- applied (core tables, properties, products, leads, piano_catalogue).
-- Every section is idempotent — safe to re-run.
-- 
-- Sections (in order):
--   007  user_permissions          (role-based access control)
--   008  marketing core            (platforms, pillars, content, calendar view)
--   009  brands.sort_order         (display ordering)
--   010  marketing_campaigns       (+ FK from marketing_content.campaign_id)
--   011  marketing CRM             (contacts, deals, activities, promote view)
--   012  marketing_whatsapp_flows  (authored conversation flows)
--   013  marketing_executive_reports (period summary + send log)
--   014  seed brand platforms      (per-brand × active platforms)
--   015  seed marketing pillars    (One Core 4-pillar framework)
--   016  backfill daily_metrics    (Feb 3 – Mar 27 2026 from xlsx reports)
-- =============================================================================

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 007_user_permissions.sql                                                 ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Migration 007: User permissions table for role-based access control
-- Each invited user gets a row. No row = founding admin (full access).

CREATE TABLE IF NOT EXISTS user_permissions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  -- JSONB map of section → 'none' | 'view' | 'edit'
  -- e.g. {"dashboard":"view","glitz":"edit","compliance":"none"}
  permissions  JSONB       NOT NULL DEFAULT '{}'::jsonb,
  is_active    BOOLEAN     NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

-- Authenticated users can read their own row (used by client-side layout)
ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own permissions" ON user_permissions;
CREATE POLICY "Users can read own permissions"
  ON user_permissions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_user_permissions_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_user_permissions_updated_at ON user_permissions;
CREATE TRIGGER trg_user_permissions_updated_at
  BEFORE UPDATE ON user_permissions
  FOR EACH ROW EXECUTE FUNCTION update_user_permissions_updated_at();

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 008_marketing.sql                                                        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
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

DROP POLICY IF EXISTS "marketing_platforms_auth" ON marketing_platforms;
CREATE POLICY "marketing_platforms_auth"  ON marketing_platforms       FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "marketing_pillars_auth" ON marketing_pillars;
CREATE POLICY "marketing_pillars_auth"    ON marketing_pillars         FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "marketing_content_auth" ON marketing_content;
CREATE POLICY "marketing_content_auth"    ON marketing_content         FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "marketing_cpillars_auth" ON marketing_content_pillars;
CREATE POLICY "marketing_cpillars_auth"   ON marketing_content_pillars FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "marketing_platforms_service" ON marketing_platforms;
CREATE POLICY "marketing_platforms_service"  ON marketing_platforms       USING (auth.role() = 'service_role') WITH CHECK (true);
DROP POLICY IF EXISTS "marketing_pillars_service" ON marketing_pillars;
CREATE POLICY "marketing_pillars_service"    ON marketing_pillars         USING (auth.role() = 'service_role') WITH CHECK (true);
DROP POLICY IF EXISTS "marketing_content_service" ON marketing_content;
CREATE POLICY "marketing_content_service"    ON marketing_content         USING (auth.role() = 'service_role') WITH CHECK (true);
DROP POLICY IF EXISTS "marketing_cpillars_service" ON marketing_content_pillars;
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

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 009_brands_sort_order.sql                                                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Migration 009: brand display ordering
-- Additive only. Lets the marketing calendar order its platform columns by a
-- deliberate brand order instead of falling back to alphabetical. Existing
-- rows default to 0; other apps that don't select this column are unaffected.

ALTER TABLE brands ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_brands_sort_order ON brands(sort_order);

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 010_marketing_campaigns.sql                                              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
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
DROP POLICY IF EXISTS "marketing_campaigns_auth" ON marketing_campaigns;
CREATE POLICY "marketing_campaigns_auth"    ON marketing_campaigns FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "marketing_campaigns_service" ON marketing_campaigns;
CREATE POLICY "marketing_campaigns_service" ON marketing_campaigns USING (auth.role() = 'service_role') WITH CHECK (true);

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 011_marketing_crm.sql                                                    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
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

DROP POLICY IF EXISTS "marketing_contacts_auth" ON marketing_contacts;
CREATE POLICY "marketing_contacts_auth"   ON marketing_contacts   FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "marketing_deals_auth" ON marketing_deals;
CREATE POLICY "marketing_deals_auth"      ON marketing_deals      FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "marketing_activities_auth" ON marketing_activities;
CREATE POLICY "marketing_activities_auth" ON marketing_activities FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "marketing_contacts_service" ON marketing_contacts;
CREATE POLICY "marketing_contacts_service"   ON marketing_contacts   USING (auth.role() = 'service_role') WITH CHECK (true);
DROP POLICY IF EXISTS "marketing_deals_service" ON marketing_deals;
CREATE POLICY "marketing_deals_service"      ON marketing_deals      USING (auth.role() = 'service_role') WITH CHECK (true);
DROP POLICY IF EXISTS "marketing_activities_service" ON marketing_activities;
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

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 012_marketing_whatsapp.sql                                               ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
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
DROP POLICY IF EXISTS "marketing_whatsapp_flows_auth" ON marketing_whatsapp_flows;
CREATE POLICY "marketing_whatsapp_flows_auth"    ON marketing_whatsapp_flows FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "marketing_whatsapp_flows_service" ON marketing_whatsapp_flows;
CREATE POLICY "marketing_whatsapp_flows_service" ON marketing_whatsapp_flows USING (auth.role() = 'service_role') WITH CHECK (true);

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 013_marketing_reports.sql                                                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Migration 013: Marketing executive reports
-- Period summary draft + send log. The narrative is generated from aggregated
-- marketing activity (content shipped/scheduled, campaigns, pillar mix) via an
-- LLM (Groq). One Core has no per-post metrics store, so the WM post_metrics
-- table is intentionally omitted.
-- Run after 010_marketing_campaigns.sql. Idempotent.

CREATE TABLE IF NOT EXISTS marketing_executive_reports (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start        DATE NOT NULL,
  period_end          DATE NOT NULL,
  subject             TEXT NOT NULL,
  preheader           TEXT,
  body_markdown       TEXT NOT NULL DEFAULT '',
  ai_narrative        TEXT,
  metrics_json        JSONB NOT NULL DEFAULT '{}'::jsonb,
  status              TEXT NOT NULL DEFAULT 'drafting',
  scheduled_for       TIMESTAMPTZ,
  sent_at             TIMESTAMPTZ,
  sent_count          INTEGER NOT NULL DEFAULT 0,
  failed_count        INTEGER NOT NULL DEFAULT 0,
  recipients          TEXT[] NOT NULL DEFAULT '{}'::text[],
  created_by_email    TEXT,
  approved_by_email   TEXT,
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT marketing_executive_reports_status_chk CHECK (
    status IN ('drafting', 'approved', 'sending', 'sent', 'cancelled')
  ),
  UNIQUE (period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_marketing_executive_reports_period
  ON marketing_executive_reports(period_start DESC, period_end DESC);

ALTER TABLE marketing_executive_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "marketing_exec_reports_auth" ON marketing_executive_reports;
CREATE POLICY "marketing_exec_reports_auth"    ON marketing_executive_reports FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "marketing_exec_reports_service" ON marketing_executive_reports;
CREATE POLICY "marketing_exec_reports_service" ON marketing_executive_reports USING (auth.role() = 'service_role') WITH CHECK (true);

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 014_seed_brand_platforms.sql                                             ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
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

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 015_seed_marketing_pillars.sql                                           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
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

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 016_seed_historical_metrics.sql                                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Migration 016: Historical daily_metrics backfill (Feb 3 – Mar 27, 2026)
-- Source: monthly Google-Form social-media reports, deduped to one row per
--         (brand, date) — latest submission wins. follower_count = sum across
--         all platforms reported; reach = sum of IG reach + TikTok views + FB
--         reach for that day. source = 'historical_import' so these rows are
--         distinguishable from manually-entered ones in the input portal.
-- Idempotent — ON CONFLICT (brand_id, metric_date) DO UPDATE.

INSERT INTO daily_metrics (
  brand_id, metric_date, feed_posts_count, stories_count, reach, impressions,
  engagement, likes, comments, dm_inquiries, follower_count, follower_change,
  youtube_views, youtube_subscribers, source, team_notes, challenges, plan_tomorrow
) VALUES
  ((SELECT id FROM brands WHERE slug = 'ar-rayyan-playhouse'), '2026-02-04', 0, 0, 189, 0, 18, 0, 0, 1, 63, 0, 0, 0, 'historical_import', NULL, NULL, NULL),
  ((SELECT id FROM brands WHERE slug = 'ar-rayyan-playhouse'), '2026-02-08', 0, 0, 0, 0, 0, 0, 0, 0, 70, 7, 0, 0, 'historical_import', NULL, NULL, NULL),
  ((SELECT id FROM brands WHERE slug = 'ar-rayyan-playhouse'), '2026-02-09', 3, 0, 388, 0, 36, 0, 0, 3, 73, 3, 0, 0, 'historical_import', 'none', 'none', 'none'),
  ((SELECT id FROM brands WHERE slug = 'ar-rayyan-playhouse'), '2026-02-10', 2, 3, 379, 0, 15, 0, 0, 1, 76, 3, 0, 0, 'historical_import', 'none', 'none', 'none'),
  ((SELECT id FROM brands WHERE slug = 'ar-rayyan-playhouse'), '2026-02-13', 0, 0, 0, 0, 0, 0, 0, 0, 80, 4, 0, 0, 'historical_import', NULL, NULL, NULL),
  ((SELECT id FROM brands WHERE slug = 'ar-rayyan-playhouse'), '2026-02-15', 3, 1, 418, 0, 19, 0, 0, 1, 91, 11, 0, 0, 'historical_import', 'none', 'none', 'In Shaa Allah'),
  ((SELECT id FROM brands WHERE slug = 'ar-rayyan-playhouse'), '2026-02-16', 2, 3, 977, 0, 26, 0, 0, 0, 91, 0, 0, 0, 'historical_import', 'None ', 'No challenge ', 'Shooting '),
  ((SELECT id FROM brands WHERE slug = 'ar-rayyan-playhouse'), '2026-02-17', 2, 3, 1300, 0, 40, 0, 0, 0, 118, 27, 0, 0, 'historical_import', 'None', 'None ', 'insha''Allah '),
  ((SELECT id FROM brands WHERE slug = 'ar-rayyan-playhouse'), '2026-02-18', 2, 3, 2252, 0, 166, 0, 0, 2, 120, 2, 0, 0, 'historical_import', 'None ', 'None ', 'insha''Allah '),
  ((SELECT id FROM brands WHERE slug = 'ar-rayyan-playhouse'), '2026-02-19', 2, 3, 3087, 0, 152, 0, 0, 0, 123, 3, 0, 0, 'historical_import', 'None ', 'None ', 'insha''Allah '),
  ((SELECT id FROM brands WHERE slug = 'ar-rayyan-playhouse'), '2026-02-20', 0, 0, 0, 0, 0, 0, 0, 0, 110, -13, 0, 0, 'historical_import', NULL, NULL, NULL),
  ((SELECT id FROM brands WHERE slug = 'ar-rayyan-playhouse'), '2026-02-22', 2, 3, 894, 0, 33, 0, 0, 0, 131, 21, 0, 0, 'historical_import', 'None ', 'None ', 'insha''Allah '),
  ((SELECT id FROM brands WHERE slug = 'ar-rayyan-playhouse'), '2026-02-23', 2, 3, 835, 0, 34, 0, 0, 2, 133, 2, 0, 0, 'historical_import', 'None ', 'None ', 'insha''Allah '),
  ((SELECT id FROM brands WHERE slug = 'ar-rayyan-playhouse'), '2026-02-24', 2, 3, 1410, 0, 62, 0, 0, 0, 137, 4, 0, 0, 'historical_import', 'None ', 'None ', 'insha''Allah '),
  ((SELECT id FROM brands WHERE slug = 'ar-rayyan-playhouse'), '2026-02-25', 2, 3, 2025, 0, 132, 0, 0, 1, 138, 1, 0, 0, 'historical_import', 'None ', 'None ', 'insha''Allah '),
  ((SELECT id FROM brands WHERE slug = 'ar-rayyan-playhouse'), '2026-02-26', 0, 3, 749, 0, 356, 0, 0, 0, 138, 0, 0, 0, 'historical_import', 'None ', 0, 'insha''Allah '),
  ((SELECT id FROM brands WHERE slug = 'ar-rayyan-playhouse'), '2026-02-27', 0, 3, 935, 0, 564, 0, 0, 0, 140, 2, 0, 0, 'historical_import', 'None ', 'None', 'insha''Allah '),
  ((SELECT id FROM brands WHERE slug = 'ar-rayyan-playhouse'), '2026-03-01', 2, 3, 171, 0, 18, 0, 0, 0, 142, 2, 0, 0, 'historical_import', 'None ', 'None ', 'insha''Allah '),
  ((SELECT id FROM brands WHERE slug = 'ar-rayyan-playhouse'), '2026-03-02', 1, 3, 284, 0, 26, 0, 0, 2, 142, 0, 0, 0, 'historical_import', 'None ', 'None', 'insha''Allah '),
  ((SELECT id FROM brands WHERE slug = 'ar-rayyan-playhouse'), '2026-03-03', 2, 3, 320, 0, 28, 0, 0, 0, 149, 7, 0, 0, 'historical_import', 'None ', 'None ', 'insha''Allah '),
  ((SELECT id FROM brands WHERE slug = 'ar-rayyan-playhouse'), '2026-03-04', 2, 3, 405, 0, 28, 0, 0, 1, 153, 4, 0, 0, 'historical_import', 'None ', 'None', 'insha''Allah '),
  ((SELECT id FROM brands WHERE slug = 'ar-rayyan-playhouse'), '2026-03-05', 0, 3, 1293, 0, 67, 0, 0, 0, 156, 3, 0, 0, 'historical_import', 'None ', 'None ', 'insha''Allah '),
  ((SELECT id FROM brands WHERE slug = 'ar-rayyan-playhouse'), '2026-03-06', 5, 2, 2118, 0, 128, 0, 0, 2, 6108, 5952, 0, 51, 'historical_import', 'None', 'None', 'Thinking '),
  ((SELECT id FROM brands WHERE slug = 'ar-rayyan-playhouse'), '2026-03-08', 2, 3, 693, 0, 44, 0, 0, 0, 165, -5943, 0, 0, 'historical_import', 'None', 'None ', 'insha''Allah '),
  ((SELECT id FROM brands WHERE slug = 'ar-rayyan-playhouse'), '2026-03-10', 2, 3, 868, 0, 56, 0, 0, 0, 167, 2, 0, 0, 'historical_import', 'None ', 'None ', 'insha''Allah '),
  ((SELECT id FROM brands WHERE slug = 'ar-rayyan-playhouse'), '2026-03-11', 2, 3, 885, 0, 43, 0, 0, 1, 170, 3, 0, 0, 'historical_import', 'None ', 'None', 'insha''Allah '),
  ((SELECT id FROM brands WHERE slug = 'ar-rayyan-playhouse'), '2026-03-15', 2, 3, 388, 0, 12, 0, 0, 0, 172, 2, 0, 0, 'historical_import', 'None ', 'None ', 'insha''Allah '),
  ((SELECT id FROM brands WHERE slug = 'darul-swafa'), '2026-02-08', 0, 0, 0, 0, 0, 0, 0, 0, 168, 0, 0, 15, 'historical_import', NULL, NULL, NULL),
  ((SELECT id FROM brands WHERE slug = 'darul-swafa'), '2026-02-10', 3, 0, 199, 0, 20, 0, 0, 0, 181, 13, 0, 24, 'historical_import', NULL, NULL, NULL),
  ((SELECT id FROM brands WHERE slug = 'darul-swafa'), '2026-02-11', 2, 0, 111, 0, 41, 0, 0, 0, 157, -24, 0, 0, 'historical_import', NULL, NULL, NULL),
  ((SELECT id FROM brands WHERE slug = 'darul-swafa'), '2026-02-13', 0, 1, 168, 0, 0, 0, 0, 0, 179, 22, 0, 26, 'historical_import', 'Am working on some poster ...I''ll be done by tomorrow so that I can post ', NULL, NULL),
  ((SELECT id FROM brands WHERE slug = 'darul-swafa'), '2026-02-15', 0, 1, 64, 0, 0, 0, 0, 0, 180, 1, 0, 26, 'historical_import', NULL, NULL, NULL),
  ((SELECT id FROM brands WHERE slug = 'darul-swafa'), '2026-02-16', 3, 1, 0, 0, 98, 0, 0, 0, 185, 5, 0, 25, 'historical_import', NULL, NULL, NULL),
  ((SELECT id FROM brands WHERE slug = 'darul-swafa'), '2026-02-20', 0, 0, 0, 0, 0, 0, 0, 0, 184, -1, 0, 18, 'historical_import', NULL, NULL, NULL),
  ((SELECT id FROM brands WHERE slug = 'darul-swafa'), '2026-02-22', 0, 1, 622, 0, 88, 0, 0, 0, 195, 11, 0, 26, 'historical_import', NULL, NULL, NULL),
  ((SELECT id FROM brands WHERE slug = 'darul-swafa'), '2026-02-24', 3, 1, 641, 0, 100, 0, 0, 0, 193, -2, 0, 26, 'historical_import', NULL, NULL, NULL),
  ((SELECT id FROM brands WHERE slug = 'darul-swafa'), '2026-02-25', 3, 1, 354, 0, 88, 0, 0, 0, 197, 4, 0, 26, 'historical_import', NULL, NULL, NULL),
  ((SELECT id FROM brands WHERE slug = 'darul-swafa'), '2026-02-26', 4, 1, 276, 0, 37, 0, 0, 0, 201, 4, 0, 26, 'historical_import', NULL, NULL, NULL),
  ((SELECT id FROM brands WHERE slug = 'darul-swafa'), '2026-02-27', 3, 1, 628, 0, 141, 0, 0, 0, 208, 7, 0, 26, 'historical_import', NULL, NULL, NULL),
  ((SELECT id FROM brands WHERE slug = 'darul-swafa'), '2026-03-01', 3, 1, 495, 0, 13, 0, 0, 0, 213, 5, 0, 27, 'historical_import', NULL, NULL, NULL),
  ((SELECT id FROM brands WHERE slug = 'darul-swafa'), '2026-03-02', 4, 1, 489, 0, 10, 0, 0, 0, 212, -1, 0, 26, 'historical_import', NULL, NULL, NULL),
  ((SELECT id FROM brands WHERE slug = 'darul-swafa'), '2026-03-03', 3, 1, 333, 0, 20, 0, 0, 0, 213, 1, 0, 26, 'historical_import', NULL, NULL, NULL),
  ((SELECT id FROM brands WHERE slug = 'darul-swafa'), '2026-03-04', 3, 0, 307, 0, 30, 0, 0, 0, 215, 2, 0, 26, 'historical_import', NULL, NULL, NULL),
  ((SELECT id FROM brands WHERE slug = 'darul-swafa'), '2026-03-08', 3, 1, 608, 0, 30, 0, 0, 0, 193, -22, 0, 0, 'historical_import', NULL, NULL, NULL),
  ((SELECT id FROM brands WHERE slug = 'darul-swafa'), '2026-03-09', 3, 1, 613, 0, 100, 0, 0, 0, 193, 0, 0, 0, 'historical_import', NULL, NULL, NULL),
  ((SELECT id FROM brands WHERE slug = 'darul-swafa'), '2026-03-10', 3, 1, 344, 0, 32, 0, 0, 0, 193, 0, 0, 0, 'historical_import', NULL, NULL, NULL),
  ((SELECT id FROM brands WHERE slug = 'glitz-n-glim'), '2026-02-04', 0, 0, 376, 0, 27, 0, 0, 0, 38, 0, 0, 1, 'historical_import', NULL, 'Not yet ', 'We are going to do a video shoot for toilet cleaner'),
  ((SELECT id FROM brands WHERE slug = 'glitz-n-glim'), '2026-02-08', 0, 0, 0, 0, 0, 0, 0, 0, 30, -8, 0, 1, 'historical_import', NULL, NULL, NULL),
  ((SELECT id FROM brands WHERE slug = 'glitz-n-glim'), '2026-02-10', 4, 3, 59, 0, 7, 0, 0, 0, 45, 15, 0, 1, 'historical_import', NULL, 'not yet', 'we are going to shoot videos for next week'),
  ((SELECT id FROM brands WHERE slug = 'glitz-n-glim'), '2026-02-11', 3, 3, 35, 0, 24, 0, 0, 0, 58, 13, 0, 1, 'historical_import', NULL, 'Not yet', 'We are going to post each and every product'),
  ((SELECT id FROM brands WHERE slug = 'glitz-n-glim'), '2026-02-12', 2, 0, 9, 0, 54, 0, 0, 0, 69, 11, 0, 1, 'historical_import', NULL, 'Not yet', 'We are going to video shoot'),
  ((SELECT id FROM brands WHERE slug = 'glitz-n-glim'), '2026-02-13', 0, 0, 15, 0, 54, 0, 0, 0, 45, -24, 0, 1, 'historical_import', NULL, 'Not yet', 'We are going to video shoot'),
  ((SELECT id FROM brands WHERE slug = 'glitz-n-glim'), '2026-02-15', 4, 3, 68, 0, 66, 0, 0, 0, 51, 6, 0, 1, 'historical_import', NULL, 'Not yet', 'We are going to video shoot a video cocerning handsanitizer'),
  ((SELECT id FROM brands WHERE slug = 'glitz-n-glim'), '2026-02-16', 5, 3, 26, 0, 46, 0, 0, 0, 70, 19, 0, 1, 'historical_import', NULL, 'Not yet', 'We are going to video shoot'),
  ((SELECT id FROM brands WHERE slug = 'glitz-n-glim'), '2026-02-17', 4, 1, 46, 0, 66, 0, 0, 0, 54, -16, 0, 1, 'historical_import', NULL, 'Not yet', 'We are going through videos posted '),
  ((SELECT id FROM brands WHERE slug = 'glitz-n-glim'), '2026-02-18', 4, 3, 32, 0, 44, 0, 0, 0, 46, -8, 0, 1, 'historical_import', NULL, 'Not yet', 'We are going to yo video shoot'),
  ((SELECT id FROM brands WHERE slug = 'glitz-n-glim'), '2026-02-19', 4, 3, 47, 0, 36, 0, 0, 0, 47, 1, 0, 1, 'historical_import', NULL, 'Not yet', 'We are going to video shoot'),
  ((SELECT id FROM brands WHERE slug = 'glitz-n-glim'), '2026-02-20', 6, 0, 36, 0, 54, 0, 0, 0, 52, 5, 0, 1, 'historical_import', NULL, 'Not yet', ' We are Going to anaylse  our data'),
  ((SELECT id FROM brands WHERE slug = 'glitz-n-glim'), '2026-02-22', 5, 3, 184, 0, 122, 0, 0, 0, 59, 7, 0, 1, 'historical_import', NULL, 'Not yet', 'Going to video shoot'),
  ((SELECT id FROM brands WHERE slug = 'glitz-n-glim'), '2026-02-23', 5, 3, 288, 0, 300, 0, 0, 0, 47, -12, 0, 1, 'historical_import', NULL, 'Not yet', 'We are going to shoot'),
  ((SELECT id FROM brands WHERE slug = 'glitz-n-glim'), '2026-02-25', 4, 1, 216, 0, 222, 0, 0, 0, 47, 0, 0, 1, 'historical_import', NULL, 'Not yet', 'We are going to video shoot'),
  ((SELECT id FROM brands WHERE slug = 'glitz-n-glim'), '2026-02-27', 0, 0, 0, 0, 0, 0, 0, 0, 56, 9, 0, 2, 'historical_import', NULL, NULL, NULL),
  ((SELECT id FROM brands WHERE slug = 'glitz-n-glim'), '2026-03-01', 5, 3, 185, 0, 230, 0, 0, 0, 69, 13, 0, 1, 'historical_import', NULL, 'Not yet', 'We are going to shoot '),
  ((SELECT id FROM brands WHERE slug = 'glitz-n-glim'), '2026-03-02', 6, 3, 74, 0, 122, 0, 0, 0, 67, -2, 0, 1, 'historical_import', NULL, 'Not yet', 'We are going to shoot'),
  ((SELECT id FROM brands WHERE slug = 'glitz-n-glim'), '2026-03-03', 5, 3, 60, 0, 123, 0, 0, 0, 65, -2, 0, 1, 'historical_import', NULL, 'Not yet', 'We are going to shoot'),
  ((SELECT id FROM brands WHERE slug = 'glitz-n-glim'), '2026-03-04', 5, 3, 40, 0, 222, 0, 0, 0, 65, 0, 0, 1, 'historical_import', NULL, 'Not yet', 'We are going to make sanitizer video'),
  ((SELECT id FROM brands WHERE slug = 'glitz-n-glim'), '2026-03-05', 4, 1, 645, 0, 37, 0, 0, 0, 90, 25, 0, 0, 'historical_import', 'None', 'None', 'Thinking '),
  ((SELECT id FROM brands WHERE slug = 'glitz-n-glim'), '2026-03-06', 4, 1, 648, 0, 40, 0, 0, 0, 69, -21, 0, 0, 'historical_import', 'None', 'None', 'Thinking '),
  ((SELECT id FROM brands WHERE slug = 'glitz-n-glim'), '2026-03-08', 4, 1, 168, 0, 7, 0, 0, 0, 69, 0, 0, 0, 'historical_import', 'None', 'None', 'Thinking '),
  ((SELECT id FROM brands WHERE slug = 'glitz-n-glim'), '2026-03-09', 4, 1, 42, 0, 5, 0, 0, 0, 69, 0, 0, 0, 'historical_import', 'None', 0, 'Thinking '),
  ((SELECT id FROM brands WHERE slug = 'glitz-n-glim'), '2026-03-10', 4, 1, 38, 0, 6, 0, 0, 0, 69, 0, 0, 0, 'historical_import', 'None ', 'None ', 'Thinking '),
  ((SELECT id FROM brands WHERE slug = 'glitz-n-glim'), '2026-03-11', 4, 1, 206, 0, 32, 0, 0, 0, 69, 0, 0, 0, 'historical_import', 'None', 'None ', 'Thinking '),
  ((SELECT id FROM brands WHERE slug = 'glitz-n-glim'), '2026-03-12', 0, 0, 0, 0, 0, 0, 0, 0, 69, 0, 0, 0, 'historical_import', 'None', 'None', 'Thinking '),
  ((SELECT id FROM brands WHERE slug = 'glitz-n-glim'), '2026-03-13', 0, 0, 0, 0, 0, 0, 0, 0, 69, 0, 0, 0, 'historical_import', NULL, 'None', NULL),
  ((SELECT id FROM brands WHERE slug = 'nairobi-piano-technicians'), '2026-02-08', 5, 2, 1699, 0, 89, 0, 0, 2, 6005, 0, 0, 40, 'historical_import', 'None at the moment', 'No challenge', 'In Sha Allah'),
  ((SELECT id FROM brands WHERE slug = 'nairobi-piano-technicians'), '2026-02-09', 4, 2, 1713, 0, 226, 0, 0, 1, 3285, -2720, 0, 40, 'historical_import', 'none', 'none', 'still thinking'),
  ((SELECT id FROM brands WHERE slug = 'nairobi-piano-technicians'), '2026-02-10', 4, 3, 2659, 0, 100, 0, 0, 3, 20310, 17025, 0, 41, 'historical_import', 'none', 'none', 'In Shaa Allah'),
  ((SELECT id FROM brands WHERE slug = 'nairobi-piano-technicians'), '2026-02-11', 5, 2, 19296, 0, 91, 0, 0, 2, 3328, -16982, 0, 41, 'historical_import', 'none', 'none', 'in shaa Allah'),
  ((SELECT id FROM brands WHERE slug = 'nairobi-piano-technicians'), '2026-02-12', 5, 2, 1906, 0, 106, 0, 0, 2, 3326, -2, 0, 41, 'historical_import', 'none', 'none', 'In Shaa Allah'),
  ((SELECT id FROM brands WHERE slug = 'nairobi-piano-technicians'), '2026-02-13', 0, 0, 2051, 0, 124, 0, 0, 3, 3339, 13, 0, 41, 'historical_import', 'none', 'none', 'none'),
  ((SELECT id FROM brands WHERE slug = 'nairobi-piano-technicians'), '2026-02-15', 5, 2, 4413, 0, 111, 0, 0, 1, 6030, 2691, 0, 41, 'historical_import', 'none', 'none', 'In Shaa Allah'),
  ((SELECT id FROM brands WHERE slug = 'nairobi-piano-technicians'), '2026-02-16', 5, 3, 830, 0, 24, 0, 0, 1, 6031, 1, 0, 41, 'historical_import', 'none', 'none', 'In  Shaa Allah'),
  ((SELECT id FROM brands WHERE slug = 'nairobi-piano-technicians'), '2026-02-17', 5, 2, 7086, 0, 254, 0, 0, 1, 6035, 4, 0, 41, 'historical_import', 'none', 'none', 'In Shaa Allah'),
  ((SELECT id FROM brands WHERE slug = 'nairobi-piano-technicians'), '2026-02-18', 5, 2, 3826, 0, 68, 0, 0, 2, 6038, 3, 0, 41, 'historical_import', 'none', 'none', 'all post'),
  ((SELECT id FROM brands WHERE slug = 'nairobi-piano-technicians'), '2026-02-19', 5, 2, 4381, 0, 126, 0, 0, 1, 6043, 5, 0, 44, 'historical_import', 'none', 'none', 'still thinking'),
  ((SELECT id FROM brands WHERE slug = 'nairobi-piano-technicians'), '2026-02-20', 0, 3, 3898, 0, 102, 0, 0, 2, 6044, 1, 0, 41, 'historical_import', 'None', 'None', 'In Shaa Allah hi'),
  ((SELECT id FROM brands WHERE slug = 'nairobi-piano-technicians'), '2026-02-22', 5, 4, 6139, 0, 107, 0, 0, 1, 6094, 50, 0, 47, 'historical_import', 'None', 'None', 'Still Looking'),
  ((SELECT id FROM brands WHERE slug = 'nairobi-piano-technicians'), '2026-02-23', 5, 4, 6078, 0, 152, 0, 0, 3, 6060, -34, 0, 47, 'historical_import', 'none', 'none', 'still thinking'),
  ((SELECT id FROM brands WHERE slug = 'nairobi-piano-technicians'), '2026-02-24', 5, 4, 5261, 0, 126, 0, 0, 2, 6096, 36, 0, 47, 'historical_import', 'non', 'none', 'preparing'),
  ((SELECT id FROM brands WHERE slug = 'nairobi-piano-technicians'), '2026-02-25', 5, 3, 4859, 0, 124, 0, 0, 1, 6098, 2, 0, 47, 'historical_import', 'none', 'none', 'still preparing'),
  ((SELECT id FROM brands WHERE slug = 'nairobi-piano-technicians'), '2026-02-26', 5, 4, 4631, 0, 137, 0, 0, 4, 6101, 3, 0, 47, 'historical_import', 'none', 'none', 'planning'),
  ((SELECT id FROM brands WHERE slug = 'nairobi-piano-technicians'), '2026-02-27', 5, 4, 4802, 0, 142, 0, 0, 1, 6101, 0, 0, 47, 'historical_import', 'None', 'None', 'Planning'),
  ((SELECT id FROM brands WHERE slug = 'nairobi-piano-technicians'), '2026-03-01', 5, 4, 1278, 0, 84, 0, 0, 2, 6102, 1, 0, 47, 'historical_import', 'none', 'none', 'woking on it'),
  ((SELECT id FROM brands WHERE slug = 'nairobi-piano-technicians'), '2026-03-02', 5, 3, 1465, 0, 86, 0, 0, 1, 6104, 2, 0, 47, 'historical_import', 'none', 'none', 'none'),
  ((SELECT id FROM brands WHERE slug = 'nairobi-piano-technicians'), '2026-03-03', 5, 3, 1546, 0, 91, 0, 0, 2, 6107, 3, 0, 50, 'historical_import', 'none', 'none', 'still planning'),
  ((SELECT id FROM brands WHERE slug = 'nairobi-piano-technicians'), '2026-03-04', 5, 3, 1171, 0, 60, 0, 0, 2, 6106, -1, 0, 50, 'historical_import', 'none', 'none', 'planning'),
  ((SELECT id FROM brands WHERE slug = 'nairobi-piano-technicians'), '2026-03-05', 5, 0, 2449, 0, 142, 0, 0, 2, 6106, 0, 0, 51, 'historical_import', 'None', 'None', 'Thinking '),
  ((SELECT id FROM brands WHERE slug = 'nairobi-piano-technicians'), '2026-03-08', 5, 2, 1476, 0, 69, 0, 0, 2, 6109, 3, 0, 52, 'historical_import', 'none', 'none', 'thinking'),
  ((SELECT id FROM brands WHERE slug = 'nairobi-piano-technicians'), '2026-03-09', 5, 4, 1191, 0, 80, 0, 0, 0, 6112, 3, 0, 52, 'historical_import', 'None', 'None', 'Still planning'),
  ((SELECT id FROM brands WHERE slug = 'nairobi-piano-technicians'), '2026-03-10', 5, 4, 1479, 0, 76, 0, 0, 4, 6112, 0, 0, 53, 'historical_import', 'none', 'none', 'thinking'),
  ((SELECT id FROM brands WHERE slug = 'nairobi-piano-technicians'), '2026-03-11', 5, 2, 1446, 0, 63, 0, 0, 2, 6118, 6, 0, 54, 'historical_import', 'None', 'None', 'Planning '),
  ((SELECT id FROM brands WHERE slug = 'nairobi-piano-technicians'), '2026-03-12', 5, 2, 1836, 0, 93, 0, 0, 4, 6117, -1, 0, 56, 'historical_import', 'None', 'None', 'Thinking '),
  ((SELECT id FROM brands WHERE slug = 'nairobi-piano-technicians'), '2026-03-13', 0, 0, 4557, 0, 110, 0, 0, 1, 6117, 0, 0, 56, 'historical_import', 'Nonr', 'None', 'Thinking '),
  ((SELECT id FROM brands WHERE slug = 'nairobi-piano-technicians'), '2026-03-15', 5, 4, 788, 0, 25, 0, 0, 0, 6119, 2, 0, 56, 'historical_import', 'None', 'None', 'Thinking '),
  ((SELECT id FROM brands WHERE slug = 'nairobi-piano-technicians'), '2026-03-16', 5, 3, 2092, 0, 58, 0, 0, 2, 6122, 3, 0, 57, 'historical_import', 'None', 'None', 'Thinking '),
  ((SELECT id FROM brands WHERE slug = 'nairobi-piano-technicians'), '2026-03-17', 5, 3, 3440, 0, 174, 0, 0, 2, 6124, 2, 0, 57, 'historical_import', 'none', 'none', 'still '),
  ((SELECT id FROM brands WHERE slug = 'nairobi-piano-technicians'), '2026-03-19', 0, 0, 1201, 0, 90, 0, 0, 1, 6125, 1, 0, 58, 'historical_import', 'None', 'None', 'Thinking '),
  ((SELECT id FROM brands WHERE slug = 'nairobi-piano-technicians'), '2026-03-20', 0, 2, 939, 0, 0, 0, 0, 87, 6134, 9, 0, 68, 'historical_import', 'None', 'None', 'Thinking '),
  ((SELECT id FROM brands WHERE slug = 'nairobi-piano-technicians'), '2026-03-22', 5, 3, 551, 0, 17, 0, 0, 0, 6124, -10, 0, 58, 'historical_import', 'None', 'None', 'Thinking '),
  ((SELECT id FROM brands WHERE slug = 'nairobi-piano-technicians'), '2026-03-23', 5, 3, 587, 0, 18, 0, 0, 1, 6125, 1, 0, 58, 'historical_import', 'None', 'None', 'Thinking '),
  ((SELECT id FROM brands WHERE slug = 'nairobi-piano-technicians'), '2026-03-24', 5, 0, 1471, 0, 20, 0, 0, 1, 6127, 2, 0, 58, 'historical_import', 'None', 'None', 'Thinking '),
  ((SELECT id FROM brands WHERE slug = 'nairobi-piano-technicians'), '2026-03-25', 5, 6, 1187, 0, 69, 0, 0, 1, 6129, 2, 0, 58, 'historical_import', 'None', 'None', 'Thinking '),
  ((SELECT id FROM brands WHERE slug = 'nairobi-piano-technicians'), '2026-03-26', 5, 3, 1036, 0, 53, 0, 0, 2, 6133, 4, 0, 59, 'historical_import', 'None', 'None', 'Looking forward to '),
  ((SELECT id FROM brands WHERE slug = 'nairobi-piano-technicians'), '2026-03-27', 0, 0, 2186, 0, 125, 0, 0, 0, 6138, 5, 0, 58, 'historical_import', 'None', 'None', NULL),
  ((SELECT id FROM brands WHERE slug = 'nuuranest-stays'), '2026-02-03', 3, 2, 310, 0, 208, 0, 0, 0, 43, 0, 0, 0, 'historical_import', NULL, 'None', 'Continue posting '),
  ((SELECT id FROM brands WHERE slug = 'nuuranest-stays'), '2026-02-04', 7, 3, 378, 0, 140, 0, 0, 1, 43, 0, 0, 0, 'historical_import', NULL, 'None', 'Edit a few content for next week and continue posting '),
  ((SELECT id FROM brands WHERE slug = 'nuuranest-stays'), '2026-02-08', 3, 2, 80, 0, 3, 0, 0, 0, 47, 4, 0, 0, 'historical_import', NULL, 'none encountered', 'post carousel'),
  ((SELECT id FROM brands WHERE slug = 'nuuranest-stays'), '2026-02-09', 3, 4, 59, 0, 6, 0, 0, 0, 48, 1, 0, 0, 'historical_import', NULL, 'None encountered ', 'Post more content '),
  ((SELECT id FROM brands WHERE slug = 'nuuranest-stays'), '2026-02-10', 3, 3, 284, 0, 29, 0, 0, 0, 49, 1, 0, 0, 'historical_import', NULL, 'None encountered ', 'Post carousel on all platforms '),
  ((SELECT id FROM brands WHERE slug = 'nuuranest-stays'), '2026-02-11', 3, 4, 405, 0, 26, 0, 0, 0, 50, 1, 0, 0, 'historical_import', NULL, 'none', 'post carousel'),
  ((SELECT id FROM brands WHERE slug = 'nuuranest-stays'), '2026-02-12', 2, 3, 223, 0, 16, 0, 0, 0, 51, 1, 0, 0, 'historical_import', NULL, 'None', 'Post content Insha''allah '),
  ((SELECT id FROM brands WHERE slug = 'nuuranest-stays'), '2026-02-13', 1, 2, 70, 0, 10, 0, 0, 1, 51, 0, 0, 0, 'historical_import', NULL, 'None ', 'Post a story '),
  ((SELECT id FROM brands WHERE slug = 'nuuranest-stays'), '2026-02-15', 2, 4, 103, 0, 20, 0, 0, 0, 52, 1, 0, 0, 'historical_import', NULL, 'None', 'Post more content '),
  ((SELECT id FROM brands WHERE slug = 'nuuranest-stays'), '2026-02-16', 3, 3, 130, 0, 20, 0, 0, 0, 54, 2, 0, 0, 'historical_import', NULL, 'None', 'Post photo content specifically entertainment '),
  ((SELECT id FROM brands WHERE slug = 'nuuranest-stays'), '2026-02-17', 3, 3, 325, 0, 54, 0, 0, 1, 55, 1, 0, 0, 'historical_import', NULL, 'None', 'Post more content Insha''allah'),
  ((SELECT id FROM brands WHERE slug = 'nuuranest-stays'), '2026-02-18', 2, 2, 430, 0, 57, 0, 0, 2, 55, 0, 0, 0, 'historical_import', NULL, 'None', 'Post testimonial '),
  ((SELECT id FROM brands WHERE slug = 'nuuranest-stays'), '2026-02-19', 3, 4, 336, 0, 34, 0, 0, 1, 56, 1, 0, 0, 'historical_import', NULL, 'None', 'Post random content '),
  ((SELECT id FROM brands WHERE slug = 'nuuranest-stays'), '2026-02-20', 0, 0, 0, 0, 0, 0, 0, 0, 55, -1, 0, 0, 'historical_import', NULL, NULL, NULL),
  ((SELECT id FROM brands WHERE slug = 'nuuranest-stays'), '2026-02-22', 3, 3, 222, 0, 23, 0, 0, 0, 56, 1, 0, 0, 'historical_import', NULL, 'None ', 'Post more content '),
  ((SELECT id FROM brands WHERE slug = 'nuuranest-stays'), '2026-02-23', 3, 3, 218, 0, 20, 0, 0, 0, 57, 1, 0, 0, 'historical_import', NULL, 'None', 'Post more content '),
  ((SELECT id FROM brands WHERE slug = 'nuuranest-stays'), '2026-02-27', 0, 0, 0, 0, 0, 0, 0, 0, 58, 1, 0, 0, 'historical_import', NULL, NULL, NULL),
  ((SELECT id FROM brands WHERE slug = 'nuuranest-stays'), '2026-03-03', 2, 3, 25, 0, 13, 0, 0, 0, 59, 1, 0, 0, 'historical_import', NULL, 'None', 'Post more content '),
  ((SELECT id FROM brands WHERE slug = 'rhythms-college'), '2026-02-03', 2, 1, 385, 0, 50, 0, 0, 0, 71, 0, 0, 1, 'historical_import', NULL, NULL, 'Post'),
  ((SELECT id FROM brands WHERE slug = 'rhythms-college'), '2026-02-08', 0, 0, 0, 0, 0, 0, 0, 0, 68, -3, 0, 1, 'historical_import', NULL, NULL, NULL),
  ((SELECT id FROM brands WHERE slug = 'rhythms-college'), '2026-02-10', 4, 1, 39, 0, 54, 0, 0, 1, 69, 1, 0, 1, 'historical_import', NULL, NULL, NULL),
  ((SELECT id FROM brands WHERE slug = 'rhythms-college'), '2026-02-11', 3, 1, 200, 0, 89, 0, 0, 1, 74, 5, 0, 2, 'historical_import', NULL, NULL, NULL),
  ((SELECT id FROM brands WHERE slug = 'rhythms-college'), '2026-02-13', 0, 1, 25, 0, 0, 0, 0, 1, 74, 0, 0, 2, 'historical_import', NULL, 'The video only came out as an audio with no visuals ', NULL),
  ((SELECT id FROM brands WHERE slug = 'rhythms-college'), '2026-02-15', 2, 1, 158, 0, 56, 0, 0, 0, 89, 15, 0, 2, 'historical_import', NULL, NULL, NULL),
  ((SELECT id FROM brands WHERE slug = 'rhythms-college'), '2026-02-16', 3, 1, 205, 0, 0, 0, 0, 3, 90, 1, 0, 2, 'historical_import', 'The inquiry from one person was due to our posts of certificate ', NULL, NULL),
  ((SELECT id FROM brands WHERE slug = 'rhythms-college'), '2026-02-20', 0, 0, 0, 0, 0, 0, 0, 0, 86, -4, 0, 1, 'historical_import', NULL, NULL, NULL),
  ((SELECT id FROM brands WHERE slug = 'rhythms-college'), '2026-02-22', 3, 1, 536, 0, 392, 0, 0, 0, 97, 11, 0, 2, 'historical_import', NULL, NULL, NULL),
  ((SELECT id FROM brands WHERE slug = 'rhythms-college'), '2026-02-24', 3, 1, 198, 0, 70, 0, 0, 0, 97, 0, 0, 2, 'historical_import', NULL, NULL, NULL),
  ((SELECT id FROM brands WHERE slug = 'rhythms-college'), '2026-02-25', 3, 1, 224, 0, 101, 0, 0, 0, 95, -2, 0, 2, 'historical_import', NULL, NULL, NULL),
  ((SELECT id FROM brands WHERE slug = 'rhythms-college'), '2026-02-26', 4, 2, 183, 0, 78, 0, 0, 0, 99, 4, 0, 2, 'historical_import', NULL, NULL, NULL),
  ((SELECT id FROM brands WHERE slug = 'rhythms-college'), '2026-02-27', 1, 1, 471, 0, 328, 0, 0, 0, 100, 1, 0, 2, 'historical_import', NULL, NULL, NULL),
  ((SELECT id FROM brands WHERE slug = 'rhythms-college'), '2026-03-01', 3, 1, 351, 0, 201, 0, 0, 0, 99, -1, 0, 0, 'historical_import', NULL, NULL, NULL),
  ((SELECT id FROM brands WHERE slug = 'rhythms-college'), '2026-03-02', 1, 1, 434, 0, 45, 0, 0, 0, 100, 1, 0, 2, 'historical_import', NULL, NULL, NULL),
  ((SELECT id FROM brands WHERE slug = 'rhythms-college'), '2026-03-03', 3, 1, 355, 0, 30, 0, 0, 0, 101, 1, 0, 0, 'historical_import', NULL, NULL, NULL),
  ((SELECT id FROM brands WHERE slug = 'rhythms-college'), '2026-03-04', 3, 0, 110, 0, 33, 0, 0, 0, 104, 3, 0, 2, 'historical_import', NULL, NULL, NULL),
  ((SELECT id FROM brands WHERE slug = 'rhythms-college'), '2026-03-08', 3, 1, 144, 0, 35, 0, 0, 0, 102, -2, 0, 0, 'historical_import', NULL, NULL, NULL),
  ((SELECT id FROM brands WHERE slug = 'rhythms-college'), '2026-03-09', 4, 0, 237, 0, 34, 0, 0, 0, 102, 0, 0, 0, 'historical_import', NULL, NULL, NULL),
  ((SELECT id FROM brands WHERE slug = 'rhythms-college'), '2026-03-10', 3, 0, 53, 0, 120, 0, 0, 0, 102, 0, 0, 0, 'historical_import', NULL, NULL, NULL)
ON CONFLICT (brand_id, metric_date) DO UPDATE SET
  feed_posts_count = EXCLUDED.feed_posts_count,
  stories_count    = EXCLUDED.stories_count,
  reach            = EXCLUDED.reach,
  engagement       = EXCLUDED.engagement,
  dm_inquiries     = EXCLUDED.dm_inquiries,
  follower_count   = EXCLUDED.follower_count,
  follower_change  = EXCLUDED.follower_change,
  youtube_subscribers = EXCLUDED.youtube_subscribers,
  source           = EXCLUDED.source,
  team_notes       = EXCLUDED.team_notes,
  challenges       = EXCLUDED.challenges,
  plan_tomorrow    = EXCLUDED.plan_tomorrow,
  updated_at       = now();

-- ─── COMPLIANCE BACKFILL ────────────────────────────────────────────────
-- Recompute compliance_log for every Mon-Sat week touched by the import.
-- Idempotent — recomputes from the now-current daily_metrics rows.
INSERT INTO compliance_log (brand_id, week_start, week_end, days_posted, target_days, stories_days, status, escalated)
SELECT
  dm.brand_id,
  (DATE_TRUNC('week', dm.metric_date)::date) AS week_start,
  (DATE_TRUNC('week', dm.metric_date)::date + 5) AS week_end,
  SUM(CASE WHEN dm.feed_posts_count > 0 THEN 1 ELSE 0 END)::int AS days_posted,
  5 AS target_days,
  SUM(CASE WHEN dm.stories_count > 0 THEN 1 ELSE 0 END)::int AS stories_days,
  CASE
    WHEN SUM(CASE WHEN dm.feed_posts_count > 0 THEN 1 ELSE 0 END) >= 5 THEN 'complete'
    WHEN SUM(CASE WHEN dm.feed_posts_count > 0 THEN 1 ELSE 0 END) >= 3 THEN 'on_track'
    ELSE 'behind'
  END AS status,
  false AS escalated
FROM daily_metrics dm
WHERE dm.source = 'historical_import'
GROUP BY dm.brand_id, DATE_TRUNC('week', dm.metric_date)
ON CONFLICT (brand_id, week_start) DO UPDATE SET
  days_posted   = EXCLUDED.days_posted,
  stories_days  = EXCLUDED.stories_days,
  status        = EXCLUDED.status;
