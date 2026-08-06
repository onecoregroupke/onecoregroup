-- Migration 056: company and personal calendars (§§5–7).
--
-- The calendar is a VIEW over work that already exists — tasks, duty
-- occurrences, meetings, inspections, leave — plus one genuinely new record
-- type: the calendar event (company meeting, training, stock count, public
-- holiday, maintenance day, campaign, production deadline).
--
-- Nothing here duplicates a task or a duty. Creating "a task from a calendar
-- slot" (§7) writes an ops_task; the calendar simply reads it back. That is what
-- keeps one occurrence from becoming two records when it is shown in two places.

-- ─── 1. CALENDAR EVENTS ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ocg_calendar_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  event_kind    TEXT NOT NULL DEFAULT 'event',
  brand_id      UUID REFERENCES brands(id) ON DELETE CASCADE,

  -- Timing. all_day events carry dates with no meaningful time component; the
  -- start/end instants are still stored so one query serves every view.
  starts_at     TIMESTAMPTZ NOT NULL,
  ends_at       TIMESTAMPTZ,
  all_day       BOOLEAN NOT NULL DEFAULT false,
  timezone      TEXT NOT NULL DEFAULT 'Africa/Nairobi',
  location      TEXT NOT NULL DEFAULT '',

  -- Visibility (§6). Deliberately explicit rather than derived: a calendar is
  -- exactly the place where an over-broad default leaks someone's schedule.
  --   private    — creator only
  --   users      — the listed users
  --   team       — visibility_team
  --   department — visibility_department
  --   brand      — brand_id
  --   company    — everyone
  visibility        TEXT NOT NULL DEFAULT 'private',
  visibility_team       TEXT NOT NULL DEFAULT '',
  visibility_department TEXT NOT NULL DEFAULT '',
  visibility_user_ids   UUID[] NOT NULL DEFAULT '{}',

  created_by_id UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,
  created_by    TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'confirmed',   -- confirmed | tentative | cancelled
  notes         TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ocg_calendar_events
  DROP CONSTRAINT IF EXISTS ocg_calendar_events_visibility_check;
ALTER TABLE ocg_calendar_events
  ADD CONSTRAINT ocg_calendar_events_visibility_check
  CHECK (visibility IN ('private', 'users', 'team', 'department', 'brand', 'company'));

ALTER TABLE ocg_calendar_events
  DROP CONSTRAINT IF EXISTS ocg_calendar_events_kind_check;
ALTER TABLE ocg_calendar_events
  ADD CONSTRAINT ocg_calendar_events_kind_check
  CHECK (event_kind IN (
    'event', 'meeting', 'training', 'stock_count', 'holiday',
    'maintenance', 'campaign', 'production_deadline', 'leave', 'reminder'
  ));

-- A brand-scoped event must name its brand, or "brand visibility" means nothing.
ALTER TABLE ocg_calendar_events
  DROP CONSTRAINT IF EXISTS ocg_calendar_events_brand_required;
ALTER TABLE ocg_calendar_events
  ADD CONSTRAINT ocg_calendar_events_brand_required
  CHECK (visibility <> 'brand' OR brand_id IS NOT NULL);

-- An event cannot end before it starts.
ALTER TABLE ocg_calendar_events
  DROP CONSTRAINT IF EXISTS ocg_calendar_events_range_check;
ALTER TABLE ocg_calendar_events
  ADD CONSTRAINT ocg_calendar_events_range_check
  CHECK (ends_at IS NULL OR ends_at >= starts_at);

CREATE INDEX IF NOT EXISTS idx_calendar_events_range      ON ocg_calendar_events (starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_calendar_events_brand      ON ocg_calendar_events (brand_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_visibility ON ocg_calendar_events (visibility);
CREATE INDEX IF NOT EXISTS idx_calendar_events_creator    ON ocg_calendar_events (created_by_id);

-- ─── 2. ATTENDEES ───────────────────────────────────────────────────────────
-- An attendee always sees the event regardless of its visibility band.
CREATE TABLE IF NOT EXISTS ocg_calendar_event_attendees (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       UUID NOT NULL REFERENCES ocg_calendar_events(id) ON DELETE CASCADE,
  team_member_id UUID REFERENCES ops_team_members(id) ON DELETE CASCADE,
  email          TEXT NOT NULL DEFAULT '',
  response       TEXT NOT NULL DEFAULT 'invited',  -- invited | accepted | declined | tentative
  responded_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, team_member_id)
);
CREATE INDEX IF NOT EXISTS idx_calendar_attendees_member ON ocg_calendar_event_attendees (team_member_id);

-- ─── 3. RESCHEDULE AUDIT (§7) ───────────────────────────────────────────────
-- "Every reschedule should be audited." Drag-and-drop is the easiest way to
-- silently move someone else's deadline, so each move is recorded with what
-- changed and who changed it, for tasks and events alike.
CREATE TABLE IF NOT EXISTS ocg_calendar_reschedules (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type    TEXT NOT NULL,               -- task | duty | event | meeting
  entity_id      TEXT NOT NULL,
  previous_start TIMESTAMPTZ,
  previous_end   TIMESTAMPTZ,
  new_start      TIMESTAMPTZ,
  new_end        TIMESTAMPTZ,
  previous_date  DATE,
  new_date       DATE,
  reason         TEXT NOT NULL DEFAULT '',
  moved_by       TEXT NOT NULL DEFAULT '',
  moved_by_id    UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,
  source         TEXT NOT NULL DEFAULT 'calendar_drag',  -- calendar_drag | form | api
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_calendar_reschedules_entity ON ocg_calendar_reschedules (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_calendar_reschedules_when   ON ocg_calendar_reschedules (created_at DESC);

-- ─── 4. LEAVE (§6 "Leave", §11 "Approved leave must not reduce the rating") ──
-- Leave is a calendar item AND an attendance/performance input, so it is a
-- first-class record rather than a free-text event.
CREATE TABLE IF NOT EXISTS ocg_leave_requests (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id UUID NOT NULL REFERENCES ops_team_members(id) ON DELETE CASCADE,
  brand_id       UUID REFERENCES brands(id) ON DELETE SET NULL,
  leave_type     TEXT NOT NULL DEFAULT 'annual',  -- annual | sick | compassionate | unpaid | study | maternity | paternity
  start_date     DATE NOT NULL,
  end_date       DATE NOT NULL,
  half_day       BOOLEAN NOT NULL DEFAULT false,
  days_count     NUMERIC(5,2) NOT NULL DEFAULT 0,
  reason         TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'requested', -- requested | approved | rejected | cancelled
  requested_by   TEXT NOT NULL DEFAULT '',
  approved_by    TEXT NOT NULL DEFAULT '',
  approved_at    TIMESTAMPTZ,
  decision_note  TEXT NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ocg_leave_requests
  DROP CONSTRAINT IF EXISTS ocg_leave_requests_range_check;
ALTER TABLE ocg_leave_requests
  ADD CONSTRAINT ocg_leave_requests_range_check CHECK (end_date >= start_date);

CREATE INDEX IF NOT EXISTS idx_leave_member ON ocg_leave_requests (team_member_id, start_date DESC);
CREATE INDEX IF NOT EXISTS idx_leave_status ON ocg_leave_requests (status);
CREATE INDEX IF NOT EXISTS idx_leave_range  ON ocg_leave_requests (start_date, end_date);

-- ─── 5. RLS + GRANTS ────────────────────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ocg_calendar_events', 'ocg_calendar_event_attendees',
    'ocg_calendar_reschedules', 'ocg_leave_requests'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_service', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (auth.role() = ''service_role'') WITH CHECK (true)',
      t || '_service', t
    );
    EXECUTE format('GRANT ALL ON TABLE %I TO service_role', t);
  END LOOP;
END $$;
