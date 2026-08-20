-- OCG production readiness follow-up: make store-to-store transfer identity
-- explicit and give each transfer line a once-only destination movement.
BEGIN;

ALTER TABLE procurement_goods_issues
  ADD COLUMN IF NOT EXISTS source_store_id UUID REFERENCES inventory_stores(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS destination_store_id UUID REFERENCES inventory_stores(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS department TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS stock_card_number TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS entered_by TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_goods_issues_source_store
  ON procurement_goods_issues (source_store_id, issue_date DESC);
CREATE INDEX IF NOT EXISTS idx_goods_issues_destination_store
  ON procurement_goods_issues (destination_store_id, issue_date DESC);

-- The source leg is protected by issue_item_id. The destination leg uses this
-- stable idempotency key, allowing a retry to return the existing movement.
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_transfer_destination_once
  ON inventory_movements (idempotency_key)
  WHERE idempotency_key LIKE 'goods-transfer-destination:%';

COMMIT;
