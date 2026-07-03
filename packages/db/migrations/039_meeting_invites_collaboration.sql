-- Migration 039: meeting attendee invites, portal scoping, and notes metadata
-- Additive. Keeps legacy attendee-name arrays while adding email/member-id
-- fields that notifications, chat, and per-user portal views can rely on.

ALTER TABLE ocg_meetings
  ADD COLUMN IF NOT EXISTS attendee_emails TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE ocg_meetings
  ADD COLUMN IF NOT EXISTS attendee_member_ids UUID[] NOT NULL DEFAULT '{}';

ALTER TABLE ocg_meetings
  ADD COLUMN IF NOT EXISTS chat_conversation_id UUID REFERENCES ocg_conversations(id) ON DELETE SET NULL;

ALTER TABLE ocg_meetings
  ADD COLUMN IF NOT EXISTS notes_updated_by TEXT NOT NULL DEFAULT '';

ALTER TABLE ocg_meetings
  ADD COLUMN IF NOT EXISTS notes_updated_at TIMESTAMPTZ;

ALTER TABLE ocg_meetings
  ADD COLUMN IF NOT EXISTS meeting_mode TEXT NOT NULL DEFAULT 'in_person';

ALTER TABLE ocg_meetings
  ADD COLUMN IF NOT EXISTS meeting_url TEXT NOT NULL DEFAULT '';

ALTER TABLE ocg_meetings
  ADD COLUMN IF NOT EXISTS google_calendar_event_id TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_ocg_meetings_attendee_emails ON ocg_meetings USING GIN (attendee_emails);
CREATE INDEX IF NOT EXISTS idx_ocg_meetings_chat_conversation ON ocg_meetings (chat_conversation_id);

CREATE TABLE IF NOT EXISTS ocg_meeting_templates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title               TEXT NOT NULL,
  brand_id            UUID REFERENCES brands(id) ON DELETE SET NULL,
  project_id          TEXT REFERENCES ops_projects(project_id) ON DELETE SET NULL,
  location            TEXT NOT NULL DEFAULT '',
  agenda              TEXT NOT NULL DEFAULT '',
  attendees           TEXT[] NOT NULL DEFAULT '{}',
  attendee_emails     TEXT[] NOT NULL DEFAULT '{}',
  attendee_member_ids UUID[] NOT NULL DEFAULT '{}',
  meeting_mode        TEXT NOT NULL DEFAULT 'in_person',
  meeting_url         TEXT NOT NULL DEFAULT '',
  series_key          TEXT NOT NULL DEFAULT '',
  created_by          TEXT NOT NULL DEFAULT '',
  created_by_email    TEXT NOT NULL DEFAULT '',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ocg_meeting_templates_created_by ON ocg_meeting_templates (created_by_email);
CREATE INDEX IF NOT EXISTS idx_ocg_meeting_templates_attendee_emails ON ocg_meeting_templates USING GIN (attendee_emails);

ALTER TABLE ocg_meeting_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ocg_meeting_templates_service" ON ocg_meeting_templates;
CREATE POLICY "ocg_meeting_templates_service" ON ocg_meeting_templates
  USING (auth.role() = 'service_role') WITH CHECK (true);
GRANT ALL ON TABLE ocg_meeting_templates TO service_role;
