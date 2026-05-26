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
CREATE POLICY "marketing_exec_reports_auth"    ON marketing_executive_reports FOR SELECT TO authenticated USING (true);
CREATE POLICY "marketing_exec_reports_service" ON marketing_executive_reports USING (auth.role() = 'service_role') WITH CHECK (true);
