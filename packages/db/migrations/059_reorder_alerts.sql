-- Migration 059: reorder alert lifecycle (§8, §35).
--
-- inventory_items.reorder_level already existed but was INERT — nothing read it.
-- This makes it operational without creating alert fatigue.
--
-- The central rule (§8): "Do not create a new alert every day if an unresolved
-- alert already exists for the same item and location." That is enforced by a
-- partial unique index, not by application logic, so no code path can produce a
-- second open alert for the same item+location.

CREATE TABLE IF NOT EXISTS inventory_reorder_alerts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id             UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  brand_id            UUID REFERENCES brands(id) ON DELETE SET NULL,
  location            TEXT NOT NULL DEFAULT '',

  -- Snapshot at trigger time. Kept on the alert so the record explains WHY it
  -- fired even after stock later moves.
  quantity_at_trigger NUMERIC(14, 3) NOT NULL DEFAULT 0,
  reserved_quantity   NUMERIC(14, 3) NOT NULL DEFAULT 0,
  usable_quantity     NUMERIC(14, 3) NOT NULL DEFAULT 0,
  reorder_level       NUMERIC(14, 3) NOT NULL DEFAULT 0,
  suggested_quantity  NUMERIC(14, 3) NOT NULL DEFAULT 0,
  average_daily_usage NUMERIC(14, 3) NOT NULL DEFAULT 0,
  days_of_stock       NUMERIC(8, 2),

  -- new | acknowledged | procurement_initiated | order_placed
  -- | partially_replenished | resolved | dismissed
  state               TEXT NOT NULL DEFAULT 'new',
  severity            TEXT NOT NULL DEFAULT 'low',   -- low | medium | high | critical

  -- Existing open procurement, so the alert can show what is already in flight
  -- rather than prompting a duplicate order (§8 alert contents).
  requisition_id      UUID REFERENCES procurement_requisitions(id) ON DELETE SET NULL,
  purchase_id         UUID REFERENCES procurement_purchases(id) ON DELETE SET NULL,

  acknowledged_by     TEXT NOT NULL DEFAULT '',
  acknowledged_at     TIMESTAMPTZ,
  resolved_by         TEXT NOT NULL DEFAULT '',
  resolved_at         TIMESTAMPTZ,
  resolution_note     TEXT NOT NULL DEFAULT '',
  dismissed_reason    TEXT NOT NULL DEFAULT '',

  -- Notification bookkeeping (§8: "Avoid sending repeated duplicate emails").
  notified_at         TIMESTAMPTZ,
  notified_count      INTEGER NOT NULL DEFAULT 0,
  last_escalated_at   TIMESTAMPTZ,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE inventory_reorder_alerts
  DROP CONSTRAINT IF EXISTS inventory_reorder_alerts_state_check;
ALTER TABLE inventory_reorder_alerts
  ADD CONSTRAINT inventory_reorder_alerts_state_check
  CHECK (state IN (
    'new', 'acknowledged', 'procurement_initiated', 'order_placed',
    'partially_replenished', 'resolved', 'dismissed'
  ));

ALTER TABLE inventory_reorder_alerts
  DROP CONSTRAINT IF EXISTS inventory_reorder_alerts_severity_check;
ALTER TABLE inventory_reorder_alerts
  ADD CONSTRAINT inventory_reorder_alerts_severity_check
  CHECK (severity IN ('low', 'medium', 'high', 'critical'));

-- Dismissing requires a reason (§8 "Dismissed with reason").
ALTER TABLE inventory_reorder_alerts
  DROP CONSTRAINT IF EXISTS inventory_reorder_alerts_dismiss_reason;
ALTER TABLE inventory_reorder_alerts
  ADD CONSTRAINT inventory_reorder_alerts_dismiss_reason
  CHECK (state <> 'dismissed' OR dismissed_reason <> '');

-- THE dedupe guarantee: at most one UNRESOLVED alert per item+location, ever.
-- Enforced in the database so no code path can produce a daily re-alert storm.
-- A new alert becomes possible again only once the previous one is resolved or
-- dismissed (§8 "Create a new alert only when the previous alert was resolved
-- and the item later drops below the threshold again").
CREATE UNIQUE INDEX IF NOT EXISTS idx_reorder_alert_open_once
  ON inventory_reorder_alerts (item_id, location)
  WHERE state NOT IN ('resolved', 'dismissed');

CREATE INDEX IF NOT EXISTS idx_reorder_alerts_brand ON inventory_reorder_alerts (brand_id, state);
CREATE INDEX IF NOT EXISTS idx_reorder_alerts_state ON inventory_reorder_alerts (state);
CREATE INDEX IF NOT EXISTS idx_reorder_alerts_when  ON inventory_reorder_alerts (created_at DESC);

-- State transition history, so "who acknowledged this and when" survives.
CREATE TABLE IF NOT EXISTS inventory_reorder_alert_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id    UUID NOT NULL REFERENCES inventory_reorder_alerts(id) ON DELETE CASCADE,
  from_state  TEXT NOT NULL DEFAULT '',
  to_state    TEXT NOT NULL,
  note        TEXT NOT NULL DEFAULT '',
  actor       TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reorder_alert_events ON inventory_reorder_alert_events (alert_id, created_at);

-- Who to notify (§8 "Send an email to the configured responsible users").
-- brand_id NULL = group-wide recipient.
CREATE TABLE IF NOT EXISTS inventory_alert_recipients (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id       UUID REFERENCES brands(id) ON DELETE CASCADE,
  location       TEXT NOT NULL DEFAULT '',
  team_member_id UUID REFERENCES ops_team_members(id) ON DELETE CASCADE,
  email          TEXT NOT NULL DEFAULT '',
  min_severity   TEXT NOT NULL DEFAULT 'low',
  active         BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alert_recipients_brand ON inventory_alert_recipients (brand_id) WHERE active;

-- Reserved stock, needed for "usable quantity" (§8) and for the sales-order
-- reservation policy in §29.
ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS reserved_quantity  NUMERIC(14, 3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS suggested_reorder_quantity NUMERIC(14, 3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lead_time_days     INTEGER NOT NULL DEFAULT 0;

-- ─── RLS + GRANTS ───────────────────────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'inventory_reorder_alerts', 'inventory_reorder_alert_events', 'inventory_alert_recipients'
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
