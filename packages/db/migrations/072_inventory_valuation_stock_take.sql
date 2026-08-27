-- Migration 072: inventory valuation foundations + monthly stock-take posting.
--
-- SAFETY: additive only. This does not import supplier invoices, supplier
-- prices or finished-goods price-list values; it does not alter historical
-- movement values or replay the 1 July opening stock.

BEGIN;

-- Finished-goods wholesale value is separate from retail selling price. The
-- existing unit_value_ksh remains the reference cost/value field.
ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS wholesale_price_ksh NUMERIC(14, 2) NOT NULL DEFAULT 0;

-- Reference price evidence. This is not AP, invoice accounting, FIFO, WAC or a
-- procurement ledger.
CREATE TABLE IF NOT EXISTS inventory_price_history (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id            UUID REFERENCES brands(id) ON DELETE CASCADE,
  inventory_item_id   UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  price_type          TEXT NOT NULL,
  amount_ksh          NUMERIC(14, 4) NOT NULL,
  effective_date      DATE NOT NULL,
  supplier_name       TEXT NOT NULL DEFAULT '',
  source_description  TEXT NOT NULL DEFAULT '',
  source_reference    TEXT NOT NULL DEFAULT '',
  base_unit           TEXT NOT NULL DEFAULT '',
  notes               TEXT NOT NULL DEFAULT '',
  created_by          TEXT NOT NULL DEFAULT '',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT inventory_price_history_type_check
    CHECK (price_type IN ('supplier_reference_cost', 'retail_selling_price', 'wholesale_selling_price')),
  CONSTRAINT inventory_price_history_amount_check CHECK (amount_ksh >= 0)
);
CREATE INDEX IF NOT EXISTS idx_inventory_price_history_item
  ON inventory_price_history (inventory_item_id, price_type, effective_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_price_history_brand
  ON inventory_price_history (brand_id, price_type, effective_date DESC);

-- Stock-count header detail. Existing status vocabulary is retained.
ALTER TABLE inventory_stock_counts
  ADD COLUMN IF NOT EXISTS effective_date DATE,
  ADD COLUMN IF NOT EXISTS submitted_for_review_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS posted_by TEXT NOT NULL DEFAULT '';

UPDATE inventory_stock_counts
SET effective_date = COALESCE(effective_date, frozen_at::date, created_at::date)
WHERE effective_date IS NULL;

ALTER TABLE inventory_stock_counts
  ALTER COLUMN effective_date SET DEFAULT CURRENT_DATE,
  ALTER COLUMN effective_date SET NOT NULL;

-- Snapshot valuation and review metadata per line. Physical zero remains valid:
-- counted_quantity NULL means not counted; counted_quantity = 0 means counted
-- and physically zero.
ALTER TABLE inventory_stock_count_items
  ADD COLUMN IF NOT EXISTS reason_code TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS expected_unit_value_ksh NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expected_retail_price_ksh NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expected_wholesale_price_ksh NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS approved_by TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE inventory_stock_count_items
  DROP CONSTRAINT IF EXISTS inventory_stock_count_item_status_check;
ALTER TABLE inventory_stock_count_items
  ADD CONSTRAINT inventory_stock_count_item_status_check
  CHECK (status IN ('pending', 'counted', 'variance_review', 'approved', 'posted'));

ALTER TABLE inventory_stock_count_items
  DROP CONSTRAINT IF EXISTS inventory_stock_count_reason_code_check;
ALTER TABLE inventory_stock_count_items
  ADD CONSTRAINT inventory_stock_count_reason_code_check
  CHECK (reason_code IN (
    '', 'count_correction', 'damaged_stock', 'expired_stock',
    'production_usage_not_recorded', 'receipt_not_recorded', 'issue_not_recorded',
    'packaging_variance', 'spillage_wastage', 'theft_shrinkage',
    'data_entry_error', 'unit_conversion_issue', 'other'
  ));

CREATE INDEX IF NOT EXISTS idx_stock_count_items_status
  ON inventory_stock_count_items (count_id, status);

-- Explicit ledger linkage for stock-take adjustments. The idempotency key is
-- still populated too; this FK makes the history view and audits straightforward.
ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS stock_count_id UUID REFERENCES inventory_stock_counts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stock_count_item_id UUID REFERENCES inventory_stock_count_items(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_inv_movements_stock_count_item_once
  ON inventory_movements (stock_count_item_id) WHERE stock_count_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inv_movements_stock_count
  ON inventory_movements (stock_count_id) WHERE stock_count_id IS NOT NULL;

-- Refresh the stock-card source label so stock-take adjustments are visible as
-- controlled reconciliation events.
CREATE OR REPLACE VIEW inventory_stock_cards AS
  SELECT
    m.id AS movement_id, m.item_id, i.name AS item_name, i.sku,
    i.base_unit AS unit, i.item_type, m.brand_id, m.store_id, m.batch_number,
    m.movement_date, m.created_at, m.direction,
    CASE WHEN m.direction = 'in' THEN m.base_quantity ELSE 0 END AS quantity_in,
    CASE WHEN m.direction = 'out' THEN m.base_quantity ELSE 0 END AS quantity_out,
    m.quantity_after AS recorded_balance,
    SUM(CASE WHEN m.direction = 'in' THEN m.base_quantity ELSE -m.base_quantity END)
      OVER (PARTITION BY m.item_id ORDER BY m.effective_at, m.created_at, m.id
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_balance,
    m.reason, m.reference, m.source,
    CASE
      WHEN m.stock_count_id IS NOT NULL THEN 'Stock Take Adjustment'
      WHEN m.goods_receipt_id IS NOT NULL THEN 'Goods Received Note'
      WHEN m.goods_issue_id IS NOT NULL THEN 'Goods Issue Note'
      WHEN m.fg_transfer_id IS NOT NULL THEN 'Finished Goods Transfer'
      WHEN m.purchase_id IS NOT NULL THEN 'Purchase'
      ELSE COALESCE(NULLIF(m.source_table, ''), 'Manual')
    END AS source_document_type,
    COALESCE(m.stock_count_id, m.goods_receipt_id, m.goods_issue_id, m.fg_transfer_id, m.purchase_id) AS source_document_id,
    m.production_run_id, m.recorded_by AS actioned_by, m.notes,
    m.quantity AS entered_quantity, m.movement_unit, m.conversion_rate, m.base_quantity,
    m.effective_at, m.idempotency_key, m.reversal_of_id, m.import_id, m.source_record_id,
    m.stock_count_id, m.stock_count_item_id
  FROM inventory_movements m
  JOIN inventory_items i ON i.id = m.item_id;
GRANT SELECT ON inventory_stock_cards TO service_role;

ALTER TABLE inventory_price_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inventory_price_history_service ON inventory_price_history;
CREATE POLICY inventory_price_history_service ON inventory_price_history
  FOR ALL TO service_role USING (true) WITH CHECK (true);
GRANT ALL ON TABLE inventory_price_history TO service_role;

COMMIT;
