-- Migration 076: bounded recurrence occurrences and retry-safe reminders.
-- Additive only. No historical tasks/events are expanded or rewritten.
-- Apply manually in the Supabase SQL editor after review.

BEGIN;

CREATE TABLE IF NOT EXISTS ocg_schedule_rules (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type       TEXT NOT NULL,
  entity_id         TEXT NOT NULL,
  timezone          TEXT NOT NULL DEFAULT 'Africa/Nairobi',
  frequency         TEXT NOT NULL,
  interval_count    INTEGER NOT NULL DEFAULT 1,
  weekdays          INTEGER[] NOT NULL DEFAULT '{}',
  day_of_month      INTEGER,
  starts_on         DATE NOT NULL,
  ends_on           DATE,
  occurrence_limit  INTEGER,
  active            BOOLEAN NOT NULL DEFAULT true,
  created_by        TEXT NOT NULL DEFAULT '',
  created_by_id     UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ocg_schedule_rule_entity_check CHECK (entity_type IN ('task','event')),
  CONSTRAINT ocg_schedule_rule_frequency_check CHECK (
    frequency IN ('daily','weekdays','selected_weekdays','weekly','monthly','interval_days','interval_weeks')
  ),
  CONSTRAINT ocg_schedule_rule_interval_check CHECK (interval_count BETWEEN 1 AND 365),
  CONSTRAINT ocg_schedule_rule_limit_check CHECK (occurrence_limit IS NULL OR occurrence_limit BETWEEN 1 AND 500),
  CONSTRAINT ocg_schedule_rule_range_check CHECK (ends_on IS NULL OR ends_on >= starts_on),
  CONSTRAINT ocg_schedule_rule_end_check CHECK (ends_on IS NOT NULL OR occurrence_limit IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_schedule_rule_entity_active
  ON ocg_schedule_rules (entity_type, entity_id) WHERE active;
CREATE INDEX IF NOT EXISTS idx_schedule_rule_horizon ON ocg_schedule_rules (active, starts_on, ends_on);

CREATE TABLE IF NOT EXISTS ocg_schedule_occurrences (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id             UUID NOT NULL REFERENCES ocg_schedule_rules(id) ON DELETE CASCADE,
  occurrence_number   INTEGER NOT NULL,
  starts_at           TIMESTAMPTZ NOT NULL,
  ends_at             TIMESTAMPTZ,
  source_task_id      TEXT REFERENCES ops_tasks(task_id) ON DELETE CASCADE,
  source_event_id     UUID REFERENCES ocg_calendar_events(id) ON DELETE CASCADE,
  assignee_id         UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,
  status              TEXT NOT NULL DEFAULT 'pending',
  completed_at        TIMESTAMPTZ,
  completed_by        TEXT NOT NULL DEFAULT '',
  completion_note     TEXT NOT NULL DEFAULT '',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ocg_schedule_occurrence_status_check CHECK (
    status IN ('pending','in_progress','completed','skipped','cancelled')
  ),
  CONSTRAINT ocg_schedule_occurrence_source_check CHECK (
    (source_task_id IS NOT NULL AND source_event_id IS NULL)
    OR (source_task_id IS NULL AND source_event_id IS NOT NULL)
  ),
  CONSTRAINT ocg_schedule_occurrence_range_check CHECK (ends_at IS NULL OR ends_at >= starts_at),
  UNIQUE (rule_id, occurrence_number),
  UNIQUE (rule_id, starts_at)
);
CREATE INDEX IF NOT EXISTS idx_schedule_occurrence_window ON ocg_schedule_occurrences (starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_schedule_occurrence_task ON ocg_schedule_occurrences (source_task_id, starts_at)
  WHERE source_task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_schedule_occurrence_event ON ocg_schedule_occurrences (source_event_id, starts_at)
  WHERE source_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_schedule_occurrence_assignee ON ocg_schedule_occurrences (assignee_id, starts_at)
  WHERE assignee_id IS NOT NULL;

ALTER TABLE ops_tasks
  ADD COLUMN IF NOT EXISTS schedule_rule_id UUID REFERENCES ocg_schedule_rules(id) ON DELETE SET NULL;
ALTER TABLE ocg_calendar_events
  ADD COLUMN IF NOT EXISTS schedule_rule_id UUID REFERENCES ocg_schedule_rules(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS ocg_reminder_rules (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type       TEXT NOT NULL,
  entity_id         TEXT NOT NULL,
  schedule_rule_id  UUID REFERENCES ocg_schedule_rules(id) ON DELETE CASCADE,
  offset_minutes    INTEGER NOT NULL,
  channel           TEXT NOT NULL,
  recipient_id      UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,
  recipient_email   TEXT NOT NULL DEFAULT '',
  active            BOOLEAN NOT NULL DEFAULT true,
  created_by        TEXT NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ocg_reminder_entity_check CHECK (entity_type IN ('task','event','schedule_occurrence')),
  CONSTRAINT ocg_reminder_channel_check CHECK (channel IN ('email','in_app')),
  CONSTRAINT ocg_reminder_offset_check CHECK (offset_minutes BETWEEN 0 AND 525600),
  CONSTRAINT ocg_reminder_recipient_check CHECK (recipient_id IS NOT NULL OR recipient_email <> '')
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reminder_rule_once
  ON ocg_reminder_rules (
    entity_type, entity_id, COALESCE(schedule_rule_id,'00000000-0000-0000-0000-000000000000'::uuid),
    offset_minutes, channel, COALESCE(recipient_id,'00000000-0000-0000-0000-000000000000'::uuid), recipient_email
  ) WHERE active;
CREATE INDEX IF NOT EXISTS idx_reminder_rule_entity ON ocg_reminder_rules (entity_type, entity_id, active);

CREATE TABLE IF NOT EXISTS ocg_reminder_deliveries (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reminder_rule_id    UUID NOT NULL REFERENCES ocg_reminder_rules(id) ON DELETE CASCADE,
  occurrence_id       UUID REFERENCES ocg_schedule_occurrences(id) ON DELETE CASCADE,
  occurrence_starts_at TIMESTAMPTZ NOT NULL,
  due_at              TIMESTAMPTZ NOT NULL,
  recipient_email     TEXT NOT NULL DEFAULT '',
  channel             TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending',
  attempt_count       INTEGER NOT NULL DEFAULT 0,
  last_attempt_at     TIMESTAMPTZ,
  sent_at             TIMESTAMPTZ,
  provider_message_id TEXT NOT NULL DEFAULT '',
  error_message       TEXT NOT NULL DEFAULT '',
  idempotency_key     TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ocg_reminder_delivery_channel_check CHECK (channel IN ('email','in_app')),
  CONSTRAINT ocg_reminder_delivery_status_check CHECK (status IN ('pending','processing','sent','failed','cancelled'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reminder_delivery_idempotency
  ON ocg_reminder_deliveries (idempotency_key);
CREATE INDEX IF NOT EXISTS idx_reminder_delivery_due
  ON ocg_reminder_deliveries (status, due_at) WHERE status IN ('pending','failed');

ALTER TABLE ocg_notifications
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_ocg_notifications_idempotency
  ON ocg_notifications (idempotency_key) WHERE idempotency_key<>'';

-- Rule creation, finite occurrence materialisation, and the canonical entity
-- link are one transaction. A failed occurrence can never strand an active
-- rule or leave a task/event pointing at only half a schedule.
CREATE OR REPLACE FUNCTION create_ocg_schedule(
  p_entity_type TEXT,
  p_entity_id TEXT,
  p_starts_at TIMESTAMPTZ,
  p_ends_at TIMESTAMPTZ,
  p_assignee_id UUID,
  p_frequency TEXT,
  p_interval_count INTEGER,
  p_weekdays INTEGER[],
  p_ends_on DATE,
  p_occurrence_limit INTEGER,
  p_created_by TEXT,
  p_created_by_id UUID,
  p_occurrences JSONB
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_rule ocg_schedule_rules;
  occurrence_rows JSONB;
BEGIN
  IF p_entity_type NOT IN ('task','event') THEN RAISE EXCEPTION 'Unsupported schedule entity'; END IF;
  IF jsonb_typeof(p_occurrences)<>'array' OR jsonb_array_length(p_occurrences)=0 OR jsonb_array_length(p_occurrences)>500 THEN
    RAISE EXCEPTION 'A bounded occurrence list of 1 to 500 rows is required';
  END IF;
  IF p_entity_type='task' AND NOT EXISTS (SELECT 1 FROM ops_tasks WHERE task_id=p_entity_id) THEN
    RAISE EXCEPTION 'Scheduled task not found';
  END IF;
  IF p_entity_type='event' AND NOT EXISTS (SELECT 1 FROM ocg_calendar_events WHERE id=p_entity_id::uuid) THEN
    RAISE EXCEPTION 'Scheduled event not found';
  END IF;

  INSERT INTO ocg_schedule_rules (
    entity_type,entity_id,timezone,frequency,interval_count,weekdays,day_of_month,
    starts_on,ends_on,occurrence_limit,created_by,created_by_id
  ) VALUES (
    p_entity_type,p_entity_id,'Africa/Nairobi',p_frequency,GREATEST(1,p_interval_count),
    COALESCE(p_weekdays,'{}'),CASE WHEN p_frequency='monthly' THEN EXTRACT(DAY FROM p_starts_at AT TIME ZONE 'Africa/Nairobi')::integer ELSE NULL END,
    (p_starts_at AT TIME ZONE 'Africa/Nairobi')::date,p_ends_on,p_occurrence_limit,
    COALESCE(p_created_by,''),p_created_by_id
  ) RETURNING * INTO new_rule;

  WITH inserted AS (
    INSERT INTO ocg_schedule_occurrences (
      rule_id,occurrence_number,starts_at,ends_at,source_task_id,source_event_id,assignee_id
    )
    SELECT new_rule.id,x.occurrence_number,x.starts_at,
      x.ends_at,p_entity_id::text,
      NULL::uuid,p_assignee_id
      FROM jsonb_to_recordset(p_occurrences) AS x(occurrence_number INTEGER,starts_at TIMESTAMPTZ,ends_at TIMESTAMPTZ)
     WHERE p_entity_type='task'
    UNION ALL
    SELECT new_rule.id,x.occurrence_number,x.starts_at,
      x.ends_at,NULL::text,p_entity_id::uuid,p_assignee_id
      FROM jsonb_to_recordset(p_occurrences) AS x(occurrence_number INTEGER,starts_at TIMESTAMPTZ,ends_at TIMESTAMPTZ)
     WHERE p_entity_type='event'
    RETURNING *
  ) SELECT COALESCE(jsonb_agg(to_jsonb(inserted) ORDER BY occurrence_number),'[]'::jsonb)
      INTO occurrence_rows FROM inserted;

  IF p_entity_type='task' THEN
    UPDATE ops_tasks SET schedule_rule_id=new_rule.id,updated_at=now() WHERE task_id=p_entity_id;
  ELSE
    UPDATE ocg_calendar_events SET schedule_rule_id=new_rule.id,updated_at=now() WHERE id=p_entity_id::uuid;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'Could not link the canonical schedule entity'; END IF;
  RETURN jsonb_build_object('rule',to_jsonb(new_rule),'occurrences',occurrence_rows);
END $$;
REVOKE ALL ON FUNCTION create_ocg_schedule(TEXT,TEXT,TIMESTAMPTZ,TIMESTAMPTZ,UUID,TEXT,INTEGER,INTEGER[],DATE,INTEGER,TEXT,UUID,JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_ocg_schedule(TEXT,TEXT,TIMESTAMPTZ,TIMESTAMPTZ,UUID,TEXT,INTEGER,INTEGER[],DATE,INTEGER,TEXT,UUID,JSONB) TO service_role;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ocg_schedule_rules','ocg_schedule_occurrences','ocg_reminder_rules','ocg_reminder_deliveries'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_service', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)', t || '_service', t);
    EXECUTE format('GRANT ALL ON TABLE %I TO service_role', t);
  END LOOP;
END $$;

COMMIT;
