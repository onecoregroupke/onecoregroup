-- Migration 074: authoritative stock-document governance.
--
-- SAFETY: additive/idempotent. This migration does not import, rewrite or infer
-- historical GINs, GTNs, production issues, opening stock or field-sales
-- custody. Legacy production-run and production_fg_transfers rows remain in
-- place for audit. Run manually in the Supabase SQL editor after review.

BEGIN;

-- Production is execution/reconciliation. Accepted output is recorded on the
-- run, but no inventory movement is created from this field.
ALTER TABLE production_runs
  ADD COLUMN IF NOT EXISTS accepted_quantity NUMERIC(14, 3) NOT NULL DEFAULT 0;

ALTER TABLE production_runs
  DROP CONSTRAINT IF EXISTS production_runs_output_quantities_check;
ALTER TABLE production_runs
  ADD CONSTRAINT production_runs_output_quantities_check
  CHECK (
    accepted_quantity >= 0
    AND accepted_quantity + rejected_quantity <= actual_quantity
  ) NOT VALID;

-- MRF -> GIN -> run and run -> GTN links. Existing rows remain unlinked unless
-- a real source document is explicitly associated later; nothing is inferred.
ALTER TABLE procurement_requisitions
  ADD COLUMN IF NOT EXISTS production_run_id UUID REFERENCES production_runs(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_requisitions_production_run
  ON procurement_requisitions (production_run_id) WHERE production_run_id IS NOT NULL;

ALTER TABLE procurement_goods_issues
  ADD COLUMN IF NOT EXISTS production_run_id UUID REFERENCES production_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS document_number TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS exception_reason TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS requested_by TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS requested_by_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS approved_by TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS approved_by_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS prepared_by TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS handed_over_by TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_goods_issues_production_run
  ON procurement_goods_issues (production_run_id, kind, status)
  WHERE production_run_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_goods_issues_document_number
  ON procurement_goods_issues (brand_id, kind, document_number)
  WHERE document_number <> '';

-- New non-MRF issues must be explicit exceptions. NOT VALID preserves legacy
-- rows while enforcing the rule for new/updated records.
ALTER TABLE procurement_goods_issues
  DROP CONSTRAINT IF EXISTS procurement_goods_issues_explicit_exception;
ALTER TABLE procurement_goods_issues
  ADD CONSTRAINT procurement_goods_issues_explicit_exception
  CHECK (
    kind <> 'issue'
    OR requisition_id IS NOT NULL
    OR (
      issued_to_type = 'other'
      AND exception_reason <> ''
      AND requested_by <> ''
      AND approved_by <> ''
      AND issued_to_label <> ''
      AND purpose <> ''
    )
  ) NOT VALID;

-- One production-material reconciliation row per posted GIN line. Partial GINs
-- remain separate rows and can therefore be traced back line by line.
CREATE UNIQUE INDEX IF NOT EXISTS idx_run_material_issue_item_once
  ON production_run_materials (issue_item_id) WHERE issue_item_id IS NOT NULL;

-- Custody events get the same retry-safe source identity as inventory events.
ALTER TABLE field_sales_custody_movements
  ADD COLUMN IF NOT EXISTS daily_return_item_id UUID REFERENCES field_sales_daily_return_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sales_invoice_id UUID REFERENCES sales_invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sales_invoice_item_id UUID REFERENCES sales_invoice_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_fs_custody_idempotency
  ON field_sales_custody_movements (idempotency_key) WHERE idempotency_key <> '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_fs_custody_invoice_item_once
  ON field_sales_custody_movements (sales_invoice_item_id)
  WHERE sales_invoice_item_id IS NOT NULL;

-- Business-language daily activity may contain several customer/payment lines.
ALTER TABLE field_sales_daily_return_items
  ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS payment_reference TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS amount_received_ksh NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit_amount_ksh NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS on_hand_reported BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE field_sales_return_notes
  ADD COLUMN IF NOT EXISTS requested_by TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS posted_by TEXT NOT NULL DEFAULT '';

ALTER TABLE field_sales_return_notes
  DROP CONSTRAINT IF EXISTS field_sales_return_notes_status_check;
ALTER TABLE field_sales_return_notes
  ADD CONSTRAINT field_sales_return_notes_status_check
  CHECK (status IN ('draft', 'submitted', 'received', 'posted', 'disputed', 'reversed')) NOT VALID;

-- Refresh the derived stock card. The authoritative operational document is
-- the source label; production_run_id remains contextual only.
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
      WHEN m.goods_receipt_id IS NOT NULL THEN 'GRN · Goods Received Note'
      WHEN m.goods_issue_id IS NOT NULL AND gi.kind = 'transfer' THEN 'GTN · Goods Transfer Note'
      WHEN m.goods_issue_id IS NOT NULL THEN 'GIN · Goods / Raw Material Issue Note'
      WHEN m.allocation_item_id IS NOT NULL THEN 'Field Sales Delivery Note'
      WHEN m.return_note_item_id IS NOT NULL THEN 'Field Sales Return'
      WHEN m.sales_invoice_item_id IS NOT NULL THEN 'Sales Invoice'
      WHEN m.fg_transfer_id IS NOT NULL THEN 'Legacy Production Transfer'
      WHEN m.production_run_id IS NOT NULL AND m.direction = 'out' THEN 'Legacy Production Issue'
      WHEN m.production_run_id IS NOT NULL AND m.direction = 'in' THEN 'Legacy Production Output'
      WHEN m.purchase_id IS NOT NULL THEN 'Purchase'
      ELSE COALESCE(NULLIF(m.source_table, ''), 'Manual')
    END AS source_document_type,
    COALESCE(
      m.stock_count_id, m.goods_receipt_id, m.goods_issue_id, m.allocation_id,
      rni.return_note_id, m.sales_invoice_id, m.fg_transfer_id, m.purchase_id
    ) AS source_document_id,
    m.production_run_id, m.recorded_by AS actioned_by, m.notes,
    m.quantity AS entered_quantity, m.movement_unit, m.conversion_rate, m.base_quantity,
    m.effective_at, m.idempotency_key, m.reversal_of_id, m.import_id, m.source_record_id,
    m.stock_count_id, m.stock_count_item_id
  FROM inventory_movements m
  JOIN inventory_items i ON i.id = m.item_id
  LEFT JOIN procurement_goods_issues gi ON gi.id = m.goods_issue_id
  LEFT JOIN field_sales_return_note_items rni ON rni.id = m.return_note_item_id;

GRANT SELECT ON inventory_stock_cards TO service_role;

COMMIT;
