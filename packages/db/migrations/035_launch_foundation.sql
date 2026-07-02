-- Migration 035: Official-launch foundation
-- Adds everything needed to run One Core Group day-to-day on the Ops Hub:
--   1. Brand-scoped access control (per-brand finance/inventory/procurement users)
--   2. Team member profile fields (phone, job title, department, start date)
--   3. Sub-projects (a project can nest under a parent project within its brand)
--   4. Meetings upgrade: scheduling fields, series linking, AI prep brief,
--      and per-meeting action items that can become ops tasks
--   5. Finance voteheads + transaction votehead / running balance / recorded_by
--   6. Inventory per brand (items + in/out movements)
--   7. Procurement (vendors, purchases, purchase line items → inventory)
--   8. Internal chat (conversations / members / messages) + public forum
--   9. Day close register (end-of-day verification + master report)
--  10. RLS tightening: finance tables stop being readable by every
--      authenticated user; all new sensitive tables are service-role only.
-- Run in Supabase SQL Editor. Idempotent — safe to re-run.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── 1. BRAND-SCOPED ACCESS ──────────────────────────────────────────────────
-- JSONB map of section → array of brand UUIDs the user is limited to.
-- Missing key or empty array = no brand restriction for that section.
-- e.g. {"finance": ["<glitz-uuid>"]} → a Glitz-only accountant. Only the
-- founding admin / users with an unscoped grant get the full-brand view.
ALTER TABLE user_permissions
  ADD COLUMN IF NOT EXISTS brand_access JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ─── 2. TEAM MEMBER PROFILE FIELDS ───────────────────────────────────────────
ALTER TABLE ops_team_members ADD COLUMN IF NOT EXISTS phone      TEXT NOT NULL DEFAULT '';
ALTER TABLE ops_team_members ADD COLUMN IF NOT EXISTS job_title  TEXT NOT NULL DEFAULT '';
ALTER TABLE ops_team_members ADD COLUMN IF NOT EXISTS department TEXT NOT NULL DEFAULT '';
ALTER TABLE ops_team_members ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE ops_team_members ADD COLUMN IF NOT EXISTS notes      TEXT NOT NULL DEFAULT '';

-- ─── 3. SUB-PROJECTS ─────────────────────────────────────────────────────────
-- A project may nest under a parent project (one level is the intended use:
-- brand → project → sub-project → tasks). The child inherits the brand.
ALTER TABLE ops_projects
  ADD COLUMN IF NOT EXISTS parent_project_id TEXT REFERENCES ops_projects(project_id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_ops_projects_parent ON ops_projects (parent_project_id);

-- ─── 4. MEETINGS UPGRADE ─────────────────────────────────────────────────────
ALTER TABLE ocg_meetings ADD COLUMN IF NOT EXISTS project_id        TEXT REFERENCES ops_projects(project_id) ON DELETE SET NULL;
ALTER TABLE ocg_meetings ADD COLUMN IF NOT EXISTS status            TEXT NOT NULL DEFAULT 'scheduled'; -- scheduled | held | cancelled
ALTER TABLE ocg_meetings ADD COLUMN IF NOT EXISTS location          TEXT NOT NULL DEFAULT '';
ALTER TABLE ocg_meetings ADD COLUMN IF NOT EXISTS agenda            TEXT NOT NULL DEFAULT '';
-- Meetings with the same series_key are one recurring series (e.g. weekly
-- management standup). The smart-prep brief pulls context from the most recent
-- held meeting in the same series.
ALTER TABLE ocg_meetings ADD COLUMN IF NOT EXISTS series_key        TEXT NOT NULL DEFAULT '';
ALTER TABLE ocg_meetings ADD COLUMN IF NOT EXISTS prep_brief        TEXT NOT NULL DEFAULT '';
ALTER TABLE ocg_meetings ADD COLUMN IF NOT EXISTS prep_generated_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_ocg_meetings_series ON ocg_meetings (series_key);
CREATE INDEX IF NOT EXISTS idx_ocg_meetings_status ON ocg_meetings (status);

CREATE TABLE IF NOT EXISTS ocg_meeting_action_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id  UUID NOT NULL REFERENCES ocg_meetings(id) ON DELETE CASCADE,
  brand_id    UUID REFERENCES brands(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  owner       TEXT NOT NULL DEFAULT '',              -- team-member name (matches ops_tasks.assigned_to)
  due_date    DATE,
  status      TEXT NOT NULL DEFAULT 'open',          -- open | done | carried_over | dropped
  ops_task_id TEXT REFERENCES ops_tasks(task_id) ON DELETE SET NULL,
  notes       TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ocg_action_items_meeting ON ocg_meeting_action_items (meeting_id);
CREATE INDEX IF NOT EXISTS idx_ocg_action_items_status  ON ocg_meeting_action_items (status);
CREATE INDEX IF NOT EXISTS idx_ocg_action_items_owner   ON ocg_meeting_action_items (owner);

-- ─── 5. FINANCE VOTEHEADS + TRANSACTION FIELDS ───────────────────────────────
-- Voteheads are the brand-specific budget lines income/expenses are booked to
-- (e.g. Rhythms: "Tuition fees", "Teacher salaries"; Glitz: "Product sales").
CREATE TABLE IF NOT EXISTS finance_voteheads (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id    UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'expense',       -- income | expense | both
  description TEXT NOT NULL DEFAULT '',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (brand_id, name)
);
CREATE INDEX IF NOT EXISTS idx_finance_voteheads_brand ON finance_voteheads (brand_id);

ALTER TABLE finance_transactions ADD COLUMN IF NOT EXISTS votehead_id       UUID REFERENCES finance_voteheads(id) ON DELETE SET NULL;
-- Account balance immediately after this transaction was applied ("new balance").
ALTER TABLE finance_transactions ADD COLUMN IF NOT EXISTS balance_after_ksh NUMERIC(14, 2);
ALTER TABLE finance_transactions ADD COLUMN IF NOT EXISTS recorded_by       TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_finance_transactions_votehead ON finance_transactions (votehead_id);

-- ─── 6. INVENTORY ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id       UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  sku            TEXT NOT NULL DEFAULT '',
  category       TEXT NOT NULL DEFAULT '',
  unit           TEXT NOT NULL DEFAULT 'pcs',
  quantity       NUMERIC(14, 2) NOT NULL DEFAULT 0,
  unit_value_ksh NUMERIC(14, 2) NOT NULL DEFAULT 0,
  reorder_level  NUMERIC(14, 2) NOT NULL DEFAULT 0,
  location       TEXT NOT NULL DEFAULT '',
  notes          TEXT NOT NULL DEFAULT '',
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inventory_items_brand    ON inventory_items (brand_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_category ON inventory_items (category);
CREATE INDEX IF NOT EXISTS idx_inventory_items_active   ON inventory_items (is_active);

-- ─── 7. PROCUREMENT ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS procurement_vendors (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  contact_person TEXT NOT NULL DEFAULT '',
  phone          TEXT NOT NULL DEFAULT '',
  email          TEXT NOT NULL DEFAULT '',
  brand_id       UUID REFERENCES brands(id) ON DELETE SET NULL, -- primary brand served; NULL = group-wide
  payment_terms  TEXT NOT NULL DEFAULT '',
  notes          TEXT NOT NULL DEFAULT '',
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_procurement_vendors_brand ON procurement_vendors (brand_id);
CREATE INDEX IF NOT EXISTS idx_procurement_vendors_name  ON procurement_vendors (name);

CREATE TABLE IF NOT EXISTS procurement_purchases (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id               UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  vendor_id              UUID REFERENCES procurement_vendors(id) ON DELETE SET NULL,
  purchase_date          DATE NOT NULL DEFAULT CURRENT_DATE,
  reference              TEXT NOT NULL DEFAULT '',   -- LPO / invoice / M-Pesa code
  receipt_url            TEXT NOT NULL DEFAULT '',
  status                 TEXT NOT NULL DEFAULT 'ordered', -- ordered | received | cancelled
  payment_status         TEXT NOT NULL DEFAULT 'unpaid',  -- unpaid | partial | paid
  total_cost_ksh         NUMERIC(14, 2) NOT NULL DEFAULT 0,
  finance_transaction_id UUID REFERENCES finance_transactions(id) ON DELETE SET NULL,
  received_at            TIMESTAMPTZ,
  recorded_by            TEXT NOT NULL DEFAULT '',
  notes                  TEXT NOT NULL DEFAULT '',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_procurement_purchases_brand  ON procurement_purchases (brand_id);
CREATE INDEX IF NOT EXISTS idx_procurement_purchases_vendor ON procurement_purchases (vendor_id);
CREATE INDEX IF NOT EXISTS idx_procurement_purchases_status ON procurement_purchases (status);
CREATE INDEX IF NOT EXISTS idx_procurement_purchases_date   ON procurement_purchases (purchase_date DESC);

CREATE TABLE IF NOT EXISTS procurement_purchase_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id       UUID NOT NULL REFERENCES procurement_purchases(id) ON DELETE CASCADE,
  inventory_item_id UUID REFERENCES inventory_items(id) ON DELETE SET NULL,
  description       TEXT NOT NULL,
  quantity          NUMERIC(14, 2) NOT NULL DEFAULT 1,
  unit              TEXT NOT NULL DEFAULT 'pcs',
  unit_cost_ksh     NUMERIC(14, 2) NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_procurement_items_purchase ON procurement_purchase_items (purchase_id);
CREATE INDEX IF NOT EXISTS idx_procurement_items_item     ON procurement_purchase_items (inventory_item_id);

-- Movements are defined after procurement so they can reference purchases.
CREATE TABLE IF NOT EXISTS inventory_movements (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id        UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  brand_id       UUID REFERENCES brands(id) ON DELETE SET NULL,
  direction      TEXT NOT NULL DEFAULT 'in',          -- in | out
  quantity       NUMERIC(14, 2) NOT NULL DEFAULT 0,
  unit_value_ksh NUMERIC(14, 2) NOT NULL DEFAULT 0,
  movement_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  reason         TEXT NOT NULL DEFAULT '',
  reference      TEXT NOT NULL DEFAULT '',
  source         TEXT NOT NULL DEFAULT 'manual',      -- manual | purchase | adjustment
  purchase_id    UUID REFERENCES procurement_purchases(id) ON DELETE SET NULL,
  -- Item quantity immediately after this movement was applied.
  quantity_after NUMERIC(14, 2),
  recorded_by    TEXT NOT NULL DEFAULT '',
  notes          TEXT NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_item  ON inventory_movements (item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_brand ON inventory_movements (brand_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_date  ON inventory_movements (movement_date DESC);

-- ─── 8. CHAT + FORUM ─────────────────────────────────────────────────────────
-- Identity is the portal login email (stable even if display names change).
CREATE TABLE IF NOT EXISTS ocg_conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type            TEXT NOT NULL DEFAULT 'dm',        -- dm | group
  name            TEXT NOT NULL DEFAULT '',          -- group name; blank for DMs
  created_by      TEXT NOT NULL DEFAULT '',          -- creator email
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ocg_conversations_last ON ocg_conversations (last_message_at DESC);

CREATE TABLE IF NOT EXISTS ocg_conversation_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES ocg_conversations(id) ON DELETE CASCADE,
  member_email    TEXT NOT NULL,
  member_name     TEXT NOT NULL DEFAULT '',
  last_read_at    TIMESTAMPTZ,
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, member_email)
);
CREATE INDEX IF NOT EXISTS idx_ocg_conv_members_conv  ON ocg_conversation_members (conversation_id);
CREATE INDEX IF NOT EXISTS idx_ocg_conv_members_email ON ocg_conversation_members (member_email);

CREATE TABLE IF NOT EXISTS ocg_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES ocg_conversations(id) ON DELETE CASCADE,
  sender_email    TEXT NOT NULL,
  sender_name     TEXT NOT NULL DEFAULT '',
  body            TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ocg_messages_conv ON ocg_messages (conversation_id, created_at);

CREATE TABLE IF NOT EXISTS ocg_forum_posts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_email TEXT NOT NULL DEFAULT '',
  author_name  TEXT NOT NULL DEFAULT '',
  title        TEXT NOT NULL,
  body         TEXT NOT NULL DEFAULT '',
  category     TEXT NOT NULL DEFAULT 'general',      -- general | announcements | ideas | questions
  pinned       BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ocg_forum_posts_created ON ocg_forum_posts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ocg_forum_posts_pinned  ON ocg_forum_posts (pinned);

CREATE TABLE IF NOT EXISTS ocg_forum_replies (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id      UUID NOT NULL REFERENCES ocg_forum_posts(id) ON DELETE CASCADE,
  author_email TEXT NOT NULL DEFAULT '',
  author_name  TEXT NOT NULL DEFAULT '',
  body         TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ocg_forum_replies_post ON ocg_forum_replies (post_id, created_at);

-- ─── 9. DAY CLOSE ────────────────────────────────────────────────────────────
-- One row per business day the admin has verified and closed. `summary` keeps
-- the counters snapshot at close time; the master report email is logged in
-- ops_report_logs with report_type 'day_close'.
CREATE TABLE IF NOT EXISTS ocg_day_closes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  close_date  DATE NOT NULL UNIQUE,
  status      TEXT NOT NULL DEFAULT 'closed',        -- closed | reopened
  closed_by   TEXT NOT NULL DEFAULT '',
  summary     JSONB NOT NULL DEFAULT '{}'::jsonb,
  narrative   TEXT NOT NULL DEFAULT '',
  report_sent BOOLEAN NOT NULL DEFAULT false,
  notes       TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ocg_day_closes_date ON ocg_day_closes (close_date DESC);

-- ─── 10. ROW LEVEL SECURITY ──────────────────────────────────────────────────
-- New tables: service-role ONLY. All reads/writes go through the Ops Hub API /
-- server pages, which enforce section permissions AND per-brand scope. No
-- broad `authenticated` SELECT — a signed-in user with the anon key cannot
-- read finance, inventory, chat, or meeting data directly.
ALTER TABLE ocg_meeting_action_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_voteheads           ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items             ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements         ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement_vendors         ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement_purchases       ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement_purchase_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocg_conversations           ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocg_conversation_members    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocg_messages                ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocg_forum_posts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocg_forum_replies           ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocg_day_closes              ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ocg_meeting_action_items', 'finance_voteheads',
    'inventory_items', 'inventory_movements',
    'procurement_vendors', 'procurement_purchases', 'procurement_purchase_items',
    'ocg_conversations', 'ocg_conversation_members', 'ocg_messages',
    'ocg_forum_posts', 'ocg_forum_replies', 'ocg_day_closes'
  ] LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS "%s_service" ON %I', t, t
    );
    EXECUTE format(
      'CREATE POLICY "%s_service" ON %I USING (auth.role() = ''service_role'') WITH CHECK (true)',
      t, t
    );
    EXECUTE format('GRANT ALL ON TABLE %I TO service_role', t);
  END LOOP;
END $$;

-- Tighten migration-034 finance tables: remove the broad authenticated SELECT
-- so brand compartmentalization cannot be bypassed with the anon key. The
-- service-role policies from 034 remain; the Ops Hub API is the only door.
DROP POLICY IF EXISTS "finance_accounts_auth"      ON finance_accounts;
DROP POLICY IF EXISTS "finance_transactions_auth"  ON finance_transactions;
DROP POLICY IF EXISTS "finance_transfers_auth"     ON finance_interbrand_transfers;
DROP POLICY IF EXISTS "finance_recon_batches_auth" ON finance_reconciliation_batches;
DROP POLICY IF EXISTS "finance_recon_matches_auth" ON finance_reconciliation_matches;
DROP POLICY IF EXISTS "finance_exceptions_auth"    ON finance_exceptions;

-- ─── SEED: default voteheads per brand (idempotent) ──────────────────────────
-- Every brand gets a common baseline; school brands get fee/salary lines.
INSERT INTO finance_voteheads (brand_id, name, kind, sort_order)
SELECT b.id, v.name, v.kind, v.sort_order
FROM brands b
CROSS JOIN (VALUES
  ('Sales / service income', 'income',  1),
  ('Other income',           'income',  2),
  ('Salaries & wages',       'expense', 3),
  ('Rent & utilities',       'expense', 4),
  ('Supplies & materials',   'expense', 5),
  ('Transport',              'expense', 6),
  ('Marketing',              'expense', 7),
  ('Repairs & maintenance',  'expense', 8),
  ('Miscellaneous',          'expense', 9)
) AS v(name, kind, sort_order)
ON CONFLICT (brand_id, name) DO NOTHING;

INSERT INTO finance_voteheads (brand_id, name, kind, sort_order)
SELECT b.id, v.name, v.kind, v.sort_order
FROM brands b
CROSS JOIN (VALUES
  ('Tuition / school fees', 'income',  0),
  ('Registration fees',     'income',  1),
  ('Learning materials',    'expense', 5)
) AS v(name, kind, sort_order)
WHERE b.slug IN ('ar-rayyan-playhouse', 'rhythms-college', 'darul-swafa')
ON CONFLICT (brand_id, name) DO NOTHING;
