-- Migration 061: field-sales stock custody (addendum §§15–22, §29).
--
-- THE RULE THIS MIGRATION EXISTS TO ENFORCE (addendum §19):
--
--   Main store -> sales-team custody   via the weekly delivery note
--   Sales custody -> sold              via the daily invoice
--
--   "Do not deduct sold stock twice from the main store."
--
-- So a weekly allocation moves stock OUT of the finished-goods store and INTO a
-- custody balance; total company-owned stock is unchanged and NO revenue is
-- created. A daily invoice then reduces CUSTODY only — it never touches the main
-- store again. Custody is its own ledger, structured exactly like the stock
-- ledger so the same reconciliation reasoning applies.

-- ─── 1. WEEKLY ALLOCATION (delivery note) — §16 ─────────────────────────────
CREATE TABLE IF NOT EXISTS field_sales_allocations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  allocation_ref    TEXT NOT NULL,
  delivery_note_no  TEXT NOT NULL DEFAULT '',
  brand_id          UUID REFERENCES brands(id) ON DELETE SET NULL,
  week_start        DATE NOT NULL,
  week_end          DATE NOT NULL,
  sales_team        TEXT NOT NULL DEFAULT '',
  salesperson_id    UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,
  vehicle_route     TEXT NOT NULL DEFAULT '',
  source_store_id   UUID REFERENCES inventory_stores(id) ON DELETE SET NULL,
  custody_location  TEXT NOT NULL DEFAULT '',
  issued_by         TEXT NOT NULL DEFAULT '',
  issued_by_id      UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,
  issued_at         TIMESTAMPTZ,
  received_by       TEXT NOT NULL DEFAULT '',
  received_at       TIMESTAMPTZ,
  -- draft | prepared | issued | active | partially_reconciled | awaiting_returns
  -- | reconciled | closed | variance_under_review | cancelled
  status            TEXT NOT NULL DEFAULT 'draft',
  variance_approved_by TEXT NOT NULL DEFAULT '',
  variance_reason   TEXT NOT NULL DEFAULT '',
  closed_by         TEXT NOT NULL DEFAULT '',
  closed_at         TIMESTAMPTZ,
  notes             TEXT NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fs_allocation_ref ON field_sales_allocations (allocation_ref);
-- A delivery-note number is a physical document number: unique per brand.
CREATE UNIQUE INDEX IF NOT EXISTS idx_fs_allocation_dn
  ON field_sales_allocations (brand_id, delivery_note_no) WHERE delivery_note_no <> '';

ALTER TABLE field_sales_allocations
  DROP CONSTRAINT IF EXISTS field_sales_allocations_status_check;
ALTER TABLE field_sales_allocations
  ADD CONSTRAINT field_sales_allocations_status_check
  CHECK (status IN (
    'draft', 'prepared', 'issued', 'active', 'partially_reconciled',
    'awaiting_returns', 'reconciled', 'closed', 'variance_under_review', 'cancelled'
  ));

ALTER TABLE field_sales_allocations
  DROP CONSTRAINT IF EXISTS field_sales_allocations_week_check;
ALTER TABLE field_sales_allocations
  ADD CONSTRAINT field_sales_allocations_week_check CHECK (week_end >= week_start);

-- §21: "Do not allow a weekly allocation to close with unexplained variance
-- unless an authorized manager approves it with a reason."
ALTER TABLE field_sales_allocations
  DROP CONSTRAINT IF EXISTS field_sales_allocations_variance_reason;
ALTER TABLE field_sales_allocations
  ADD CONSTRAINT field_sales_allocations_variance_reason
  CHECK (status <> 'variance_under_review' OR variance_reason <> '');

CREATE INDEX IF NOT EXISTS idx_fs_allocations_week   ON field_sales_allocations (week_start DESC);
CREATE INDEX IF NOT EXISTS idx_fs_allocations_person ON field_sales_allocations (salesperson_id, week_start DESC);
CREATE INDEX IF NOT EXISTS idx_fs_allocations_status ON field_sales_allocations (status);

CREATE TABLE IF NOT EXISTS field_sales_allocation_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  allocation_id   UUID NOT NULL REFERENCES field_sales_allocations(id) ON DELETE CASCADE,
  item_id         UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  batch_number    TEXT NOT NULL DEFAULT '',
  quantity_issued NUMERIC(14, 3) NOT NULL DEFAULT 0,
  unit            TEXT NOT NULL DEFAULT 'pcs',
  selling_price_ksh NUMERIC(14, 2) NOT NULL DEFAULT 0,
  notes           TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fs_allocation_items ON field_sales_allocation_items (allocation_id);

ALTER TABLE field_sales_allocation_items
  DROP CONSTRAINT IF EXISTS field_sales_allocation_items_qty_check;
ALTER TABLE field_sales_allocation_items
  ADD CONSTRAINT field_sales_allocation_items_qty_check CHECK (quantity_issued >= 0);

-- One stock movement per allocation line, ever. Finalising an allocation twice
-- cannot double-deduct the finished-goods store.
ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS allocation_id      UUID REFERENCES field_sales_allocations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS allocation_item_id UUID REFERENCES field_sales_allocation_items(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_inv_movements_allocation_item_once
  ON inventory_movements (allocation_item_id) WHERE allocation_item_id IS NOT NULL;

-- ─── 2. CUSTODY LEDGER (§17) ────────────────────────────────────────────────
-- Custody is its own ledger with the same shape as inventory_movements:
-- direction + quantity + balance_after, one row per event, each pointing at the
-- document that caused it. This is what makes
--   closing custody = opening + issues - invoiced - returns - damage ± adjustments
-- verifiable rather than asserted.
CREATE TABLE IF NOT EXISTS field_sales_custody_movements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id        UUID REFERENCES brands(id) ON DELETE SET NULL,
  salesperson_id  UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,
  sales_team      TEXT NOT NULL DEFAULT '',
  item_id         UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  allocation_id   UUID REFERENCES field_sales_allocations(id) ON DELETE SET NULL,
  batch_number    TEXT NOT NULL DEFAULT '',
  direction       TEXT NOT NULL,          -- in (issued to custody) | out (sold/returned/damaged)
  -- issue | sale | return | damage | sample | promotion | adjustment | reversal
  movement_kind   TEXT NOT NULL,
  quantity        NUMERIC(14, 3) NOT NULL,
  balance_after   NUMERIC(14, 3) NOT NULL DEFAULT 0,
  movement_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  -- Source documents
  allocation_item_id UUID REFERENCES field_sales_allocation_items(id) ON DELETE SET NULL,
  daily_return_id UUID,
  return_note_id  UUID,
  invoice_ref     TEXT NOT NULL DEFAULT '',
  reason          TEXT NOT NULL DEFAULT '',
  recorded_by     TEXT NOT NULL DEFAULT '',
  notes           TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE field_sales_custody_movements
  DROP CONSTRAINT IF EXISTS fs_custody_direction_check;
ALTER TABLE field_sales_custody_movements
  ADD CONSTRAINT fs_custody_direction_check CHECK (direction IN ('in', 'out'));

ALTER TABLE field_sales_custody_movements
  DROP CONSTRAINT IF EXISTS fs_custody_kind_check;
ALTER TABLE field_sales_custody_movements
  ADD CONSTRAINT fs_custody_kind_check
  CHECK (movement_kind IN ('issue', 'sale', 'return', 'damage', 'sample', 'promotion', 'adjustment', 'reversal'));

ALTER TABLE field_sales_custody_movements
  DROP CONSTRAINT IF EXISTS fs_custody_qty_check;
ALTER TABLE field_sales_custody_movements
  ADD CONSTRAINT fs_custody_qty_check CHECK (quantity > 0);

-- §20: "A negative custody balance occurs" is a flagged condition, so the
-- balance may never be written negative in the first place.
ALTER TABLE field_sales_custody_movements
  DROP CONSTRAINT IF EXISTS fs_custody_balance_nonneg;
ALTER TABLE field_sales_custody_movements
  ADD CONSTRAINT fs_custody_balance_nonneg CHECK (balance_after >= 0);

-- One custody movement per allocation line, ever.
CREATE UNIQUE INDEX IF NOT EXISTS idx_fs_custody_allocation_item_once
  ON field_sales_custody_movements (allocation_item_id) WHERE allocation_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fs_custody_person ON field_sales_custody_movements (salesperson_id, item_id, movement_date);
CREATE INDEX IF NOT EXISTS idx_fs_custody_alloc  ON field_sales_custody_movements (allocation_id);

-- ─── 3. DAILY FIELD SALES RETURN (§18) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS field_sales_daily_returns (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_ref        TEXT NOT NULL,
  allocation_id     UUID REFERENCES field_sales_allocations(id) ON DELETE SET NULL,
  brand_id          UUID REFERENCES brands(id) ON DELETE SET NULL,
  return_date       DATE NOT NULL,
  sales_team        TEXT NOT NULL DEFAULT '',
  salesperson_id    UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,
  cash_received_ksh    NUMERIC(14, 2) NOT NULL DEFAULT 0,
  mobile_money_ksh     NUMERIC(14, 2) NOT NULL DEFAULT 0,
  bank_ksh             NUMERIC(14, 2) NOT NULL DEFAULT 0,
  credit_sales_ksh     NUMERIC(14, 2) NOT NULL DEFAULT 0,
  amount_submitted_ksh NUMERIC(14, 2) NOT NULL DEFAULT 0,
  payment_references   TEXT NOT NULL DEFAULT '',
  -- draft | submitted | invoiced | reconciled | disputed
  status            TEXT NOT NULL DEFAULT 'draft',
  submitted_by      TEXT NOT NULL DEFAULT '',
  submitted_at      TIMESTAMPTZ,
  reviewed_by       TEXT NOT NULL DEFAULT '',
  source_upload_id  UUID,
  notes             TEXT NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fs_daily_return_ref ON field_sales_daily_returns (return_ref);
-- One daily return per salesperson per date per allocation.
CREATE UNIQUE INDEX IF NOT EXISTS idx_fs_daily_return_once
  ON field_sales_daily_returns (
    COALESCE(allocation_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(salesperson_id, '00000000-0000-0000-0000-000000000000'::uuid),
    return_date
  );
CREATE INDEX IF NOT EXISTS idx_fs_daily_returns_date ON field_sales_daily_returns (return_date DESC);

CREATE TABLE IF NOT EXISTS field_sales_daily_return_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_return_id   UUID NOT NULL REFERENCES field_sales_daily_returns(id) ON DELETE CASCADE,
  item_id           UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  batch_number      TEXT NOT NULL DEFAULT '',
  quantity_sold     NUMERIC(14, 3) NOT NULL DEFAULT 0,
  quantity_damaged  NUMERIC(14, 3) NOT NULL DEFAULT 0,
  quantity_sample   NUMERIC(14, 3) NOT NULL DEFAULT 0,
  quantity_on_hand  NUMERIC(14, 3) NOT NULL DEFAULT 0,
  selling_price_ksh NUMERIC(14, 2) NOT NULL DEFAULT 0,
  line_total_ksh    NUMERIC(14, 2) GENERATED ALWAYS AS (quantity_sold * selling_price_ksh) STORED,
  customer          TEXT NOT NULL DEFAULT '',
  notes             TEXT NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fs_daily_return_items ON field_sales_daily_return_items (daily_return_id);

ALTER TABLE field_sales_daily_return_items
  DROP CONSTRAINT IF EXISTS fs_daily_return_items_qty_check;
ALTER TABLE field_sales_daily_return_items
  ADD CONSTRAINT fs_daily_return_items_qty_check
  CHECK (quantity_sold >= 0 AND quantity_damaged >= 0 AND quantity_sample >= 0 AND quantity_on_hand >= 0);

-- ─── 4. UNSOLD STOCK RETURN NOTE (§22) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS field_sales_return_notes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_ref          TEXT NOT NULL,
  allocation_id     UUID REFERENCES field_sales_allocations(id) ON DELETE SET NULL,
  brand_id          UUID REFERENCES brands(id) ON DELETE SET NULL,
  salesperson_id    UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,
  return_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  destination_store_id UUID REFERENCES inventory_stores(id) ON DELETE SET NULL,
  received_by       TEXT NOT NULL DEFAULT '',
  status            TEXT NOT NULL DEFAULT 'draft',  -- draft | received | posted | reversed
  posted_at         TIMESTAMPTZ,
  notes             TEXT NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fs_return_note_ref ON field_sales_return_notes (note_ref);

CREATE TABLE IF NOT EXISTS field_sales_return_note_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_note_id    UUID NOT NULL REFERENCES field_sales_return_notes(id) ON DELETE CASCADE,
  item_id           UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  batch_number      TEXT NOT NULL DEFAULT '',
  quantity_returned NUMERIC(14, 3) NOT NULL DEFAULT 0,
  quantity_accepted NUMERIC(14, 3) NOT NULL DEFAULT 0,
  quantity_rejected NUMERIC(14, 3) NOT NULL DEFAULT 0,
  condition_note    TEXT NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fs_return_note_items ON field_sales_return_note_items (return_note_id);

-- §22: "Returned products should only become available stock after the
-- receiving user confirms their quantity and condition." Damaged returns can
-- never be counted as accepted.
ALTER TABLE field_sales_return_note_items
  DROP CONSTRAINT IF EXISTS fs_return_note_items_qty_check;
ALTER TABLE field_sales_return_note_items
  ADD CONSTRAINT fs_return_note_items_qty_check
  CHECK (
    quantity_returned >= 0 AND quantity_accepted >= 0 AND quantity_rejected >= 0
    AND quantity_accepted + quantity_rejected <= quantity_returned
  );

-- One restock movement per return line, ever.
ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS return_note_item_id UUID REFERENCES field_sales_return_note_items(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_inv_movements_return_note_item_once
  ON inventory_movements (return_note_item_id) WHERE return_note_item_id IS NOT NULL;

-- Late FKs now that the referenced tables exist.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fs_custody_daily_return_fk') THEN
    ALTER TABLE field_sales_custody_movements
      ADD CONSTRAINT fs_custody_daily_return_fk
      FOREIGN KEY (daily_return_id) REFERENCES field_sales_daily_returns(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fs_custody_return_note_fk') THEN
    ALTER TABLE field_sales_custody_movements
      ADD CONSTRAINT fs_custody_return_note_fk
      FOREIGN KEY (return_note_id) REFERENCES field_sales_return_notes(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── 5. CUSTODY BALANCE VIEW (§17) ──────────────────────────────────────────
-- Derived from the custody ledger, never stored, so it cannot disagree with it.
CREATE OR REPLACE VIEW field_sales_custody_balances AS
  SELECT
    c.salesperson_id,
    m.name              AS salesperson,
    c.sales_team,
    c.brand_id,
    c.item_id,
    i.name              AS item_name,
    i.sku,
    i.unit,
    SUM(CASE WHEN c.movement_kind = 'issue'  THEN c.quantity ELSE 0 END) AS issued,
    SUM(CASE WHEN c.movement_kind = 'sale'   THEN c.quantity ELSE 0 END) AS sold,
    SUM(CASE WHEN c.movement_kind = 'return' THEN c.quantity ELSE 0 END) AS returned,
    SUM(CASE WHEN c.movement_kind = 'damage' THEN c.quantity ELSE 0 END) AS damaged,
    SUM(CASE WHEN c.movement_kind IN ('sample','promotion') THEN c.quantity ELSE 0 END) AS promotional,
    SUM(CASE WHEN c.direction = 'in' THEN c.quantity ELSE -c.quantity END) AS custody_balance
  FROM field_sales_custody_movements c
  JOIN inventory_items i ON i.id = c.item_id
  LEFT JOIN ops_team_members m ON m.id = c.salesperson_id
  GROUP BY c.salesperson_id, m.name, c.sales_team, c.brand_id, c.item_id, i.name, i.sku, i.unit;

GRANT SELECT ON field_sales_custody_balances TO service_role;

-- ─── 6. REFERENCE SEQUENCES ─────────────────────────────────────────────────
INSERT INTO ops_id_sequences (name, current_val) VALUES
  ('fs_allocation', 0), ('fs_daily_return', 0), ('fs_return_note', 0), ('delivery_note', 0)
ON CONFLICT (name) DO NOTHING;

-- ─── 7. RLS + GRANTS ────────────────────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'field_sales_allocations', 'field_sales_allocation_items',
    'field_sales_custody_movements', 'field_sales_daily_returns',
    'field_sales_daily_return_items', 'field_sales_return_notes',
    'field_sales_return_note_items'
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
