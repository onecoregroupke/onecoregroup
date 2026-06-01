-- Migration 018: Ops Hub — agent orchestration, delivery & context
-- Ported from WM Task Ops' agent stack (agent-orchestrator + hermes phases),
-- adapted to One Core Group. Runtime routing:
--   internal — run inline with Groq (fast analysis-shaped work)
--   hermes   — queue into ops_agent_jobs for a worker/skill to execute
--   none     — manual review only
-- Run AFTER 017_ops_core.sql. Idempotent — safe to re-run.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── OPS AGENT RUNS ──────────────────────────────────────────────────────────
-- A top-level orchestrator run. One run can fan out into many jobs.
CREATE TABLE IF NOT EXISTS ops_agent_runs (
  id                   TEXT PRIMARY KEY,
  mode                 TEXT NOT NULL DEFAULT 'execute_all',
  requested_agent_type TEXT,
  brand_id             UUID REFERENCES brands(id) ON DELETE SET NULL,
  project_id           TEXT,
  task_ids             TEXT[] NOT NULL DEFAULT '{}',
  status               TEXT NOT NULL DEFAULT 'running'
                         CHECK (status IN ('running','completed','completed_with_errors','error')),
  started_by           TEXT,
  started_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at         TIMESTAMPTZ,
  summary              JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_ops_agent_runs_started ON ops_agent_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_ops_agent_runs_status  ON ops_agent_runs (status);

-- ─── OPS AGENT JOBS ──────────────────────────────────────────────────────────
-- One specialist execution against one task.
CREATE TABLE IF NOT EXISTS ops_agent_jobs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id              TEXT NOT NULL,
  task_id             TEXT NOT NULL,
  task_name           TEXT NOT NULL,
  task_type           TEXT NOT NULL,            -- specialist type
  brand_id            UUID REFERENCES brands(id) ON DELETE SET NULL,
  project_id          TEXT,
  client_id           TEXT,
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','running','done','draft_ready','waiting_input','responded','error','skipped')),
  runtime             TEXT NOT NULL DEFAULT 'internal',   -- internal | hermes | none
  output              TEXT,
  input_needed        TEXT,
  input_provided      TEXT,
  respond_token       TEXT UNIQUE,
  error_message       TEXT,
  assigned_agent      TEXT,
  classification      JSONB,
  payload_json        JSONB,
  output_artifacts    JSONB NOT NULL DEFAULT '[]'::jsonb,
  delivery_status     TEXT NOT NULL DEFAULT 'draft_only',
  review_status       TEXT NOT NULL DEFAULT 'pending_review',
  approval_required   BOOLEAN NOT NULL DEFAULT true,
  claimed_by          TEXT,
  claimed_at          TIMESTAMPTZ,
  started_at          TIMESTAMPTZ,
  failed_at           TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ops_agent_jobs_run_id  ON ops_agent_jobs (run_id);
CREATE INDEX IF NOT EXISTS idx_ops_agent_jobs_task_id ON ops_agent_jobs (task_id);
CREATE INDEX IF NOT EXISTS idx_ops_agent_jobs_status  ON ops_agent_jobs (status);
CREATE INDEX IF NOT EXISTS idx_ops_agent_jobs_brand   ON ops_agent_jobs (brand_id);
CREATE INDEX IF NOT EXISTS idx_ops_agent_jobs_created ON ops_agent_jobs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ops_agent_jobs_respond ON ops_agent_jobs (respond_token) WHERE respond_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ops_agent_jobs_hermes_pending
  ON ops_agent_jobs (created_at ASC) WHERE runtime = 'hermes' AND status = 'pending';

-- ─── OPS AGENT ARTIFACTS ─────────────────────────────────────────────────────
-- Drafts/plans/briefs produced by specialists, plus their Drive delivery info.
CREATE TABLE IF NOT EXISTS ops_agent_artifacts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        TEXT NOT NULL,
  job_id        UUID REFERENCES ops_agent_jobs(id) ON DELETE CASCADE,
  task_id       TEXT NOT NULL,
  artifact_type TEXT NOT NULL,
  title         TEXT NOT NULL,
  content       TEXT,
  url           TEXT,
  delivery      JSONB,                  -- {doc_id, docx_id, web_view_link, ...}
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ops_agent_artifacts_run  ON ops_agent_artifacts (run_id);
CREATE INDEX IF NOT EXISTS idx_ops_agent_artifacts_job  ON ops_agent_artifacts (job_id);
CREATE INDEX IF NOT EXISTS idx_ops_agent_artifacts_task ON ops_agent_artifacts (task_id);

-- ─── OPS AGENT CONTEXT SOURCES ───────────────────────────────────────────────
-- Links/notes the agent can use as project/task/client context.
CREATE TABLE IF NOT EXISTS ops_agent_context_sources (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type       TEXT NOT NULL DEFAULT 'project'
                     CHECK (scope_type IN ('project','task','client','brand')),
  project_id       TEXT,
  task_id          TEXT,
  client_id        TEXT,
  brand_id         UUID,
  title            TEXT NOT NULL,
  source_type      TEXT NOT NULL DEFAULT 'link'
                     CHECK (source_type IN ('drive_folder','drive_file','doc','sheet','repo','url','email_thread','crm_record','finance_record','note','other')),
  url              TEXT,
  notes            TEXT,
  include_in_agent BOOLEAN NOT NULL DEFAULT true,
  created_by       TEXT NOT NULL DEFAULT 'admin',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ops_ctx_sources_project ON ops_agent_context_sources (project_id);
CREATE INDEX IF NOT EXISTS idx_ops_ctx_sources_task    ON ops_agent_context_sources (task_id);
CREATE INDEX IF NOT EXISTS idx_ops_ctx_sources_brand   ON ops_agent_context_sources (brand_id);
CREATE INDEX IF NOT EXISTS idx_ops_ctx_sources_include ON ops_agent_context_sources (include_in_agent);

-- ─── OPS AGENT ARTIFACT DESTINATIONS ─────────────────────────────────────────
-- Routing/review instructions per specialist. Agents never send external comms.
CREATE TABLE IF NOT EXISTS ops_agent_artifact_destinations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_type          TEXT NOT NULL,
  artifact_type       TEXT,
  destination_label   TEXT NOT NULL,
  destination_type    TEXT NOT NULL DEFAULT 'manual_review'
                        CHECK (destination_type IN ('manual_review','drive_folder','email_draft_inbox','repo_path','canva','calendar','other')),
  destination_ref     TEXT,
  instructions        TEXT,
  active              BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ops_artifact_dest_agent  ON ops_agent_artifact_destinations (agent_type);
CREATE INDEX IF NOT EXISTS idx_ops_artifact_dest_active ON ops_agent_artifact_destinations (active);

INSERT INTO ops_agent_artifact_destinations (agent_type, artifact_type, destination_label, destination_type, destination_ref, instructions) VALUES
  ('proposal', 'proposal_draft', 'Proposal Review', 'manual_review', '/agents/artifacts', 'Review proposal draft, then move approved copy to the brand/project proposal folder.'),
  ('content', 'content_draft', 'Content Review', 'calendar', 'marketing_calendar', 'Review content and push approved copy into the marketing calendar as a draft content row.'),
  ('video_clipping', 'clip_plan', 'Video Editing Handoff', 'drive_folder', 'project_video_assets_folder', 'Use as the edit brief. Confirm source footage, transcript, export sizes, and delivery folder.'),
  ('client_communication', 'client_message_draft', 'Client Draft Review', 'email_draft_inbox', 'ops@onecoregroup.com', 'Review and send manually from the approved mailbox.'),
  ('design_deck', 'deck_outline', 'Deck Review', 'canva', 'canva_or_drive_deck_folder', 'Use as outline/design brief before creating the deck.'),
  ('report', 'report', 'Report Review', 'manual_review', '/agents/artifacts', 'Review the report draft before circulating.'),
  ('project_admin', 'project_admin_brief', 'Project Admin Review', 'manual_review', '/agents/artifacts', 'Use as tracker/update instructions. Human confirms before applying changes.')
ON CONFLICT DO NOTHING;

-- ─── OPS REVIEW QUEUE ────────────────────────────────────────────────────────
-- AI-extracted task proposals (from text/audio/message intake) awaiting approval.
CREATE TABLE IF NOT EXISTS ops_review_queue (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source           TEXT NOT NULL,
  source_detail    TEXT NOT NULL DEFAULT '',
  brand_id         UUID,
  inquiry_type     TEXT NOT NULL DEFAULT 'ambiguous',
  status           TEXT NOT NULL DEFAULT 'pending',
  proposed_fields  JSONB NOT NULL DEFAULT '{}'::jsonb,
  original_content TEXT NOT NULL DEFAULT '',
  reviewed_by      TEXT,
  reviewed_at      TIMESTAMPTZ,
  rejection_note   TEXT,
  message_id       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ops_review_queue_status  ON ops_review_queue (status);
CREATE INDEX IF NOT EXISTS idx_ops_review_queue_created ON ops_review_queue (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ops_review_queue_msgid   ON ops_review_queue (message_id) WHERE message_id IS NOT NULL;

-- ─── OPS REPORT LOGS ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ops_report_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type   TEXT NOT NULL,
  subject       TEXT NOT NULL,
  html          TEXT NOT NULL,
  recipient     TEXT NOT NULL DEFAULT '',
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  triggered_by  TEXT NOT NULL DEFAULT 'system'
);

CREATE INDEX IF NOT EXISTS idx_ops_report_logs_generated ON ops_report_logs (generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ops_report_logs_type      ON ops_report_logs (report_type);

-- ─── ROW LEVEL SECURITY ──────────────────────────────────────────────────────
ALTER TABLE ops_agent_runs                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_agent_jobs                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_agent_artifacts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_agent_context_sources       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_agent_artifact_destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_review_queue                ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_report_logs                 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ops_agent_runs_auth"      ON ops_agent_runs                  FOR SELECT TO authenticated USING (true);
CREATE POLICY "ops_agent_jobs_auth"      ON ops_agent_jobs                  FOR SELECT TO authenticated USING (true);
CREATE POLICY "ops_agent_artifacts_auth" ON ops_agent_artifacts             FOR SELECT TO authenticated USING (true);
CREATE POLICY "ops_ctx_sources_auth"     ON ops_agent_context_sources       FOR SELECT TO authenticated USING (true);
CREATE POLICY "ops_artifact_dest_auth"   ON ops_agent_artifact_destinations FOR SELECT TO authenticated USING (true);
CREATE POLICY "ops_review_queue_auth"    ON ops_review_queue                FOR SELECT TO authenticated USING (true);
CREATE POLICY "ops_report_logs_auth"     ON ops_report_logs                 FOR SELECT TO authenticated USING (true);

CREATE POLICY "ops_agent_runs_service"      ON ops_agent_runs                  USING (auth.role() = 'service_role') WITH CHECK (true);
CREATE POLICY "ops_agent_jobs_service"      ON ops_agent_jobs                  USING (auth.role() = 'service_role') WITH CHECK (true);
CREATE POLICY "ops_agent_artifacts_service" ON ops_agent_artifacts             USING (auth.role() = 'service_role') WITH CHECK (true);
CREATE POLICY "ops_ctx_sources_service"     ON ops_agent_context_sources       USING (auth.role() = 'service_role') WITH CHECK (true);
CREATE POLICY "ops_artifact_dest_service"   ON ops_agent_artifact_destinations USING (auth.role() = 'service_role') WITH CHECK (true);
CREATE POLICY "ops_review_queue_service"    ON ops_review_queue                USING (auth.role() = 'service_role') WITH CHECK (true);
CREATE POLICY "ops_report_logs_service"     ON ops_report_logs                 USING (auth.role() = 'service_role') WITH CHECK (true);

-- ─── GRANTS ──────────────────────────────────────────────────────────────────
GRANT ALL ON TABLE ops_agent_runs                  TO service_role;
GRANT ALL ON TABLE ops_agent_jobs                  TO service_role;
GRANT ALL ON TABLE ops_agent_artifacts             TO service_role;
GRANT ALL ON TABLE ops_agent_context_sources       TO service_role;
GRANT ALL ON TABLE ops_agent_artifact_destinations TO service_role;
GRANT ALL ON TABLE ops_review_queue                TO service_role;
GRANT ALL ON TABLE ops_report_logs                 TO service_role;
