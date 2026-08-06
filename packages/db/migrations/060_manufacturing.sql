-- Migration 060: Iceland (Glitz N' Glim) manufacturing inventory (§§19–28, §32).
--
-- SCOPE NOTE: "Iceland" is not a seventh brand. Iceland Geyser Ltd owns the
-- Glitz N' Glim brand, so everything here attaches to brand_id = glitz-n-glim.
-- No brand row is created.
--
-- The existing inventory_movements table is ALREADY the stock ledger §20 asks
-- for: it stores quantity_after per line, keeps inventory_items.quantity in
-- sync, and carries source-document FKs with partial unique indexes that make
-- double-posting impossible. This migration therefore does NOT build a second
-- ledger. It adds:
--
--   1. Item CLASSIFICATION (raw / packaging / WIP / finished / …) and stores.
--   2. Production runs, and the material issue -> output -> transfer chain.
--   3. Stock counts with an approval gate.
--   4. A stock-card VIEW derived from the ledger, never hand-maintained.

-- ─── 1. ITEM CLASSIFICATION + STORES (§19) ──────────────────────────────────
ALTER TABLE inventory_items
  -- raw_material | packaging | work_in_progress | finished_good
  -- | damaged | returned | sample | consumable
  ADD COLUMN IF NOT EXISTS item_type       TEXT NOT NULL DEFAULT 'consumable',
  ADD COLUMN IF NOT EXISTS store_id        UUID,
  ADD COLUMN IF NOT EXISTS product_family  TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS size_label      TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS package_config  TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS barcode         TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS selling_price_ksh NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS minimum_stock   NUMERIC(14, 3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS maximum_stock   NUMERIC(14, 3),
  ADD COLUMN IF NOT EXISTS production_threshold NUMERIC(14, 3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shelf_life_days INTEGER;

ALTER TABLE inventory_items
  DROP CONSTRAINT IF EXISTS inventory_items_type_check;
ALTER TABLE inventory_items
  ADD CONSTRAINT inventory_items_type_check
  CHECK (item_type IN (
    'raw_material', 'packaging', 'work_in_progress', 'finished_good',
    'damaged', 'returned', 'sample', 'consumable'
  ));

CREATE INDEX IF NOT EXISTS idx_inventory_items_type  ON inventory_items (item_type);
CREATE INDEX IF NOT EXISTS idx_inventory_items_store ON inventory_items (store_id);

-- Physical/logical stores. Raw materials, packaging and finished goods are kept
-- apart (§19, §25) so a "total stock" figure can never silently mix them.
CREATE TABLE IF NOT EXISTS inventory_stores (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id    UUID REFERENCES brands(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  code        TEXT NOT NULL DEFAULT '',
  -- raw | packaging | production | finished_goods | quarantine | field_sales | general
  store_type  TEXT NOT NULL DEFAULT 'general',
  location    TEXT NOT NULL DEFAULT '',
  keeper_id   UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,
  active      BOOLEAN NOT NULL DEFAULT true,
  notes       TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_stores_brand_name ON inventory_stores (brand_id, lower(name));
CREATE INDEX IF NOT EXISTS idx_stores_type ON inventory_stores (store_type);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_items_store_fk') THEN
    ALTER TABLE inventory_items
      ADD CONSTRAINT inventory_items_store_fk
      FOREIGN KEY (store_id) REFERENCES inventory_stores(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── 2. BILL OF MATERIALS (§26 "Raw-material formula ... where later supported") ──
CREATE TABLE IF NOT EXISTS production_bom_lines (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  component_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  quantity_per_unit NUMERIC(14, 5) NOT NULL,
  unit           TEXT NOT NULL DEFAULT '',
  wastage_percent NUMERIC(6, 3) NOT NULL DEFAULT 0,
  notes          TEXT NOT NULL DEFAULT '',
  active         BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bom_line_once
  ON production_bom_lines (product_item_id, component_item_id) WHERE active;
-- A product cannot be a component of itself.
ALTER TABLE production_bom_lines
  DROP CONSTRAINT IF EXISTS production_bom_no_self_reference;
ALTER TABLE production_bom_lines
  ADD CONSTRAINT production_bom_no_self_reference
  CHECK (product_item_id <> component_item_id);

-- ─── 3. PRODUCTION RUNS (§24) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS production_runs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_ref            TEXT NOT NULL,
  batch_number       TEXT NOT NULL DEFAULT '',
  brand_id           UUID REFERENCES brands(id) ON DELETE SET NULL,
  product_item_id    UUID REFERENCES inventory_items(id) ON DELETE SET NULL,
  planned_quantity   NUMERIC(14, 3) NOT NULL DEFAULT 0,
  actual_quantity    NUMERIC(14, 3) NOT NULL DEFAULT 0,
  rejected_quantity  NUMERIC(14, 3) NOT NULL DEFAULT 0,
  waste_quantity     NUMERIC(14, 3) NOT NULL DEFAULT 0,
  unit               TEXT NOT NULL DEFAULT 'pcs',
  started_at         TIMESTAMPTZ,
  completed_at       TIMESTAMPTZ,
  supervisor_id      UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,
  production_team    TEXT NOT NULL DEFAULT '',
  -- planned | materials_requested | materials_issued | in_production
  -- | awaiting_quality | completed | partially_completed | rejected | closed | cancelled
  status             TEXT NOT NULL DEFAULT 'planned',
  quality_result     TEXT NOT NULL DEFAULT '',
  quality_approved_by TEXT NOT NULL DEFAULT '',
  quality_approved_at TIMESTAMPTZ,
  expiry_date        DATE,
  notes              TEXT NOT NULL DEFAULT '',
  -- Set when a manager approves a suggested plan into a real run (§28).
  approved_by        TEXT NOT NULL DEFAULT '',
  approved_at        TIMESTAMPTZ,
  created_by         TEXT NOT NULL DEFAULT '',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_production_run_ref ON production_runs (run_ref);
CREATE UNIQUE INDEX IF NOT EXISTS idx_production_batch
  ON production_runs (brand_id, batch_number) WHERE batch_number <> '';

ALTER TABLE production_runs
  DROP CONSTRAINT IF EXISTS production_runs_status_check;
ALTER TABLE production_runs
  ADD CONSTRAINT production_runs_status_check
  CHECK (status IN (
    'planned', 'materials_requested', 'materials_issued', 'in_production',
    'awaiting_quality', 'completed', 'partially_completed', 'rejected', 'closed', 'cancelled'
  ));

ALTER TABLE production_runs
  DROP CONSTRAINT IF EXISTS production_runs_quantities_check;
ALTER TABLE production_runs
  ADD CONSTRAINT production_runs_quantities_check
  CHECK (planned_quantity >= 0 AND actual_quantity >= 0
     AND rejected_quantity >= 0 AND waste_quantity >= 0);

CREATE INDEX IF NOT EXISTS idx_production_runs_brand  ON production_runs (brand_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_production_runs_status ON production_runs (status);

-- Materials actually consumed by a run (§23 "expected versus actual", §25).
-- Rows are created when an issue is FINALISED, never at approval time.
CREATE TABLE IF NOT EXISTS production_run_materials (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id            UUID NOT NULL REFERENCES production_runs(id) ON DELETE CASCADE,
  item_id           UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  goods_issue_id    UUID REFERENCES procurement_goods_issues(id) ON DELETE SET NULL,
  issue_item_id     UUID REFERENCES procurement_goods_issue_items(id) ON DELETE SET NULL,
  expected_quantity NUMERIC(14, 3) NOT NULL DEFAULT 0,
  issued_quantity   NUMERIC(14, 3) NOT NULL DEFAULT 0,
  returned_quantity NUMERIC(14, 3) NOT NULL DEFAULT 0,
  consumed_quantity NUMERIC(14, 3) NOT NULL DEFAULT 0,
  waste_quantity    NUMERIC(14, 3) NOT NULL DEFAULT 0,
  unit              TEXT NOT NULL DEFAULT '',
  -- Consumed = issued - returned - waste, so variance is derived, never typed.
  variance_quantity NUMERIC(14, 3) GENERATED ALWAYS AS
    (issued_quantity - returned_quantity - consumed_quantity - waste_quantity) STORED,
  notes             TEXT NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_run_materials_run  ON production_run_materials (run_id);
CREATE INDEX IF NOT EXISTS idx_run_materials_item ON production_run_materials (item_id);

-- ─── 4. FINISHED GOODS TRANSFER (§26) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS production_fg_transfers (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_ref       TEXT NOT NULL,
  run_id             UUID REFERENCES production_runs(id) ON DELETE SET NULL,
  brand_id           UUID REFERENCES brands(id) ON DELETE SET NULL,
  item_id            UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  batch_number       TEXT NOT NULL DEFAULT '',
  produced_quantity  NUMERIC(14, 3) NOT NULL DEFAULT 0,
  accepted_quantity  NUMERIC(14, 3) NOT NULL DEFAULT 0,
  rejected_quantity  NUMERIC(14, 3) NOT NULL DEFAULT 0,
  transferred_quantity NUMERIC(14, 3) NOT NULL DEFAULT 0,
  unit               TEXT NOT NULL DEFAULT 'pcs',
  source_store_id    UUID REFERENCES inventory_stores(id) ON DELETE SET NULL,
  destination_store_id UUID REFERENCES inventory_stores(id) ON DELETE SET NULL,
  supervisor         TEXT NOT NULL DEFAULT '',
  receiver           TEXT NOT NULL DEFAULT '',
  quality_approved_by TEXT NOT NULL DEFAULT '',
  production_date    DATE,
  expiry_date        DATE,
  status             TEXT NOT NULL DEFAULT 'draft',  -- draft | posted | reversed
  posted_by          TEXT NOT NULL DEFAULT '',
  posted_at          TIMESTAMPTZ,
  remarks            TEXT NOT NULL DEFAULT '',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fg_transfer_ref ON production_fg_transfers (transfer_ref);

-- §26: "Update available stock only for accepted finished goods." Rejected units
-- can never exceed what was produced, and only accepted units may transfer.
ALTER TABLE production_fg_transfers
  DROP CONSTRAINT IF EXISTS production_fg_transfers_quantities_check;
ALTER TABLE production_fg_transfers
  ADD CONSTRAINT production_fg_transfers_quantities_check
  CHECK (
    produced_quantity >= 0 AND accepted_quantity >= 0 AND rejected_quantity >= 0
    AND accepted_quantity + rejected_quantity <= produced_quantity
    AND transferred_quantity <= accepted_quantity
  );

CREATE INDEX IF NOT EXISTS idx_fg_transfers_run  ON production_fg_transfers (run_id);
CREATE INDEX IF NOT EXISTS idx_fg_transfers_item ON production_fg_transfers (item_id, posted_at DESC);

-- Link a movement back to its production source document, and make each
-- transfer postable exactly once — the same guarantee 054 gave receipts/issues.
ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS production_run_id UUID REFERENCES production_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fg_transfer_id    UUID REFERENCES production_fg_transfers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS batch_number      TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS store_id          UUID REFERENCES inventory_stores(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_inv_movements_fg_transfer_once
  ON inventory_movements (fg_transfer_id) WHERE fg_transfer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inv_movements_run ON inventory_movements (production_run_id);

-- ─── 5. STOCK COUNTS (§31) ──────────────────────────────────────────────────
-- "Do not let a stock-count user directly change the ledger balance without
-- approval." A count NEVER writes stock; an approved adjustment does.
CREATE TABLE IF NOT EXISTS inventory_stock_counts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  count_ref     TEXT NOT NULL,
  brand_id      UUID REFERENCES brands(id) ON DELETE SET NULL,
  store_id      UUID REFERENCES inventory_stores(id) ON DELETE SET NULL,
  location      TEXT NOT NULL DEFAULT '',
  scope_note    TEXT NOT NULL DEFAULT '',
  -- draft | counting | variance_review | approved | posted | cancelled
  status        TEXT NOT NULL DEFAULT 'draft',
  frozen_at     TIMESTAMPTZ,
  counted_by    TEXT NOT NULL DEFAULT '',
  reviewed_by   TEXT NOT NULL DEFAULT '',
  approved_by   TEXT NOT NULL DEFAULT '',
  approved_at   TIMESTAMPTZ,
  posted_at     TIMESTAMPTZ,
  notes         TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_count_ref ON inventory_stock_counts (count_ref);

ALTER TABLE inventory_stock_counts
  DROP CONSTRAINT IF EXISTS inventory_stock_counts_status_check;
ALTER TABLE inventory_stock_counts
  ADD CONSTRAINT inventory_stock_counts_status_check
  CHECK (status IN ('draft', 'counting', 'variance_review', 'approved', 'posted', 'cancelled'));

CREATE TABLE IF NOT EXISTS inventory_stock_count_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  count_id          UUID NOT NULL REFERENCES inventory_stock_counts(id) ON DELETE CASCADE,
  item_id           UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  -- Snapshot taken when the count is frozen, so a concurrent movement cannot
  -- change what the counter was counting against.
  expected_quantity NUMERIC(14, 3) NOT NULL DEFAULT 0,
  counted_quantity  NUMERIC(14, 3),
  variance_quantity NUMERIC(14, 3) GENERATED ALWAYS AS
    (COALESCE(counted_quantity, 0) - expected_quantity) STORED,
  reason            TEXT NOT NULL DEFAULT '',
  counted_by        TEXT NOT NULL DEFAULT '',
  reviewed_by       TEXT NOT NULL DEFAULT '',
  approved          BOOLEAN NOT NULL DEFAULT false,
  movement_id       UUID REFERENCES inventory_movements(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_count_item_once ON inventory_stock_count_items (count_id, item_id);
-- One adjustment movement per counted line, ever.
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_count_movement_once
  ON inventory_stock_count_items (movement_id) WHERE movement_id IS NOT NULL;

-- A variance may only be posted once it has an explanation (§31 "Require
-- explanations").
ALTER TABLE inventory_stock_count_items
  DROP CONSTRAINT IF EXISTS inventory_stock_count_reason_required;
ALTER TABLE inventory_stock_count_items
  ADD CONSTRAINT inventory_stock_count_reason_required
  CHECK (movement_id IS NULL OR variance_quantity = 0 OR reason <> '');

-- ─── 6. STOCK CARD (§30) ────────────────────────────────────────────────────
-- "The system-generated stock card should be treated as derived from finalized
-- ledger movements." A VIEW, so it cannot be hand-edited and cannot drift from
-- the ledger. running_balance is recomputed from the movement sequence rather
-- than trusting the stored quantity_after, which makes the two cross-checkable.
CREATE OR REPLACE VIEW inventory_stock_cards AS
  SELECT
    m.id                AS movement_id,
    m.item_id,
    i.name              AS item_name,
    i.sku,
    i.unit,
    i.item_type,
    m.brand_id,
    m.store_id,
    m.batch_number,
    m.movement_date,
    m.created_at,
    m.direction,
    CASE WHEN m.direction = 'in'  THEN m.quantity ELSE 0 END AS quantity_in,
    CASE WHEN m.direction = 'out' THEN m.quantity ELSE 0 END AS quantity_out,
    m.quantity_after    AS recorded_balance,
    SUM(CASE WHEN m.direction = 'in' THEN m.quantity ELSE -m.quantity END)
      OVER (PARTITION BY m.item_id ORDER BY m.movement_date, m.created_at, m.id
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_balance,
    m.reason,
    m.reference,
    m.source,
    CASE
      WHEN m.goods_receipt_id IS NOT NULL THEN 'Goods Received Note'
      WHEN m.goods_issue_id   IS NOT NULL THEN 'Goods Issue Note'
      WHEN m.fg_transfer_id   IS NOT NULL THEN 'Finished Goods Transfer'
      WHEN m.purchase_id      IS NOT NULL THEN 'Purchase'
      ELSE 'Manual'
    END                 AS source_document_type,
    COALESCE(m.goods_receipt_id, m.goods_issue_id, m.fg_transfer_id, m.purchase_id) AS source_document_id,
    m.production_run_id,
    m.recorded_by       AS actioned_by,
    m.notes
  FROM inventory_movements m
  JOIN inventory_items i ON i.id = m.item_id;

GRANT SELECT ON inventory_stock_cards TO service_role;

-- ─── 7. REFERENCE SEQUENCES ─────────────────────────────────────────────────
INSERT INTO ops_id_sequences (name, current_val) VALUES
  ('production_run', 0), ('fg_transfer', 0), ('stock_count', 0)
ON CONFLICT (name) DO NOTHING;

-- ─── 8. RLS + GRANTS ────────────────────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'inventory_stores', 'production_bom_lines', 'production_runs',
    'production_run_materials', 'production_fg_transfers',
    'inventory_stock_counts', 'inventory_stock_count_items'
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
