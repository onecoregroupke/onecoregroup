-- Migration 001: Core tables
-- Run in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── BRANDS ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  instagram_handle TEXT,
  instagram_account_id TEXT,
  youtube_channel_id TEXT,
  tiktok_handle TEXT,
  facebook_page_id TEXT,
  whatsapp_number TEXT,
  color_hex TEXT DEFAULT '#1a1a2e',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── DAILY_METRICS ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
  metric_date DATE NOT NULL,
  feed_posts_count INTEGER DEFAULT 0,
  stories_count INTEGER DEFAULT 0,
  reach INTEGER DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  engagement INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  dm_inquiries INTEGER DEFAULT 0,
  follower_count INTEGER DEFAULT 0,
  follower_change INTEGER DEFAULT 0,
  youtube_views INTEGER DEFAULT 0,
  youtube_subscribers INTEGER DEFAULT 0,
  source TEXT DEFAULT 'api',
  team_notes TEXT,
  challenges TEXT,
  plan_tomorrow TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(brand_id, metric_date)
);

-- ─── COMPLIANCE_LOG ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS compliance_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  days_posted INTEGER DEFAULT 0,
  target_days INTEGER DEFAULT 5,
  compliance_pct DECIMAL(5,2) GENERATED ALWAYS AS
    (ROUND((days_posted::DECIMAL / 6) * 100, 2)) STORED,
  stories_days INTEGER DEFAULT 0,
  status TEXT DEFAULT 'on_track',
  escalated BOOLEAN DEFAULT false,
  escalation_note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(brand_id, week_start)
);

-- ─── WEEKLY_SUMMARIES ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS weekly_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  total_reach INTEGER DEFAULT 0,
  total_engagement INTEGER DEFAULT 0,
  total_posts INTEGER DEFAULT 0,
  total_stories INTEGER DEFAULT 0,
  total_dm_inquiries INTEGER DEFAULT 0,
  follower_start INTEGER DEFAULT 0,
  follower_end INTEGER DEFAULT 0,
  follower_change INTEGER DEFAULT 0,
  reach_wow_pct DECIMAL(8,2),
  engagement_wow_pct DECIMAL(8,2),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(brand_id, week_start)
);

-- ─── REPORTS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  title TEXT NOT NULL,
  content_html TEXT,
  content_json JSONB,
  ai_narrative TEXT,
  status TEXT DEFAULT 'draft',
  sent_at TIMESTAMPTZ,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── ROW LEVEL SECURITY ───────────────────────────────────────────────────────
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- Brands: public read
CREATE POLICY "brands_public_read" ON brands FOR SELECT USING (true);
-- Metrics/compliance/reports: authenticated only
CREATE POLICY "daily_metrics_auth" ON daily_metrics USING (auth.role() = 'authenticated');
CREATE POLICY "compliance_log_auth" ON compliance_log USING (auth.role() = 'authenticated');
CREATE POLICY "weekly_summaries_auth" ON weekly_summaries USING (auth.role() = 'authenticated');
CREATE POLICY "reports_auth" ON reports USING (auth.role() = 'authenticated');
-- Service role can do everything (for API routes using service key)
CREATE POLICY "daily_metrics_service" ON daily_metrics USING (auth.role() = 'service_role') WITH CHECK (true);
CREATE POLICY "compliance_log_service" ON compliance_log USING (auth.role() = 'service_role') WITH CHECK (true);
CREATE POLICY "reports_service" ON reports USING (auth.role() = 'service_role') WITH CHECK (true);
