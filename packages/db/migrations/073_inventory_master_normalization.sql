-- Migration 073: Glitz inventory master normalization before historical MRF / GIN import.
--
-- SCOPE:
--   * canonicalize Caustic Soda / NAOH without deleting ledger evidence;
--   * convert active Perfume balances from litres to millilitres, including
--     base-ledger and stock-count snapshots, while preserving valuation;
--   * correct active Colour unit semantics from the mislabeled litres to kg
--     without changing any physical quantity;
--   * add the active zero-opening LAVENDER perfume and canonical APPLE GREEN;
--   * seed the existing inventory_item_aliases table and expose deterministic
--     alias/unit normalization helpers for the later historical import.
--
-- This migration does NOT create an MRF, Issue Note, stock movement, supplier
-- invoice, finished-goods price, or usable balance from expired/quarantined
-- evidence. It is transactional and safe to re-run.

BEGIN;

-- ─── 1. CONTROLLED NORMALIZATION HELPERS ───────────────────────────────────

CREATE OR REPLACE FUNCTION inventory_normalize_alias(value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT trim(regexp_replace(lower(trim(COALESCE(value, ''))), '[^[:alnum:]]+', ' ', 'g'))
$$;

CREATE OR REPLACE FUNCTION inventory_normalize_unit(value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE inventory_normalize_alias(value)
    WHEN 'l' THEN 'ltrs'
    WHEN 'lt' THEN 'ltrs'
    WHEN 'ltr' THEN 'ltrs'
    WHEN 'ltrs' THEN 'ltrs'
    WHEN 'litre' THEN 'ltrs'
    WHEN 'litres' THEN 'ltrs'
    WHEN 'liter' THEN 'ltrs'
    WHEN 'liters' THEN 'ltrs'
    WHEN 'ml' THEN 'ml'
    WHEN 'millilitre' THEN 'ml'
    WHEN 'millilitres' THEN 'ml'
    WHEN 'milliliter' THEN 'ml'
    WHEN 'milliliters' THEN 'ml'
    WHEN 'kg' THEN 'kg'
    WHEN 'kgs' THEN 'kg'
    WHEN 'kilogram' THEN 'kg'
    WHEN 'kilograms' THEN 'kg'
    ELSE inventory_normalize_alias(value)
  END
$$;

GRANT EXECUTE ON FUNCTION inventory_normalize_alias(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION inventory_normalize_unit(TEXT) TO service_role;

-- Preserve small per-ml values exactly enough for valuation reconciliation.
-- This widens reference-cost precision only; no finished-goods price changes
-- are made by this migration.
ALTER TABLE inventory_items
  ALTER COLUMN unit_value_ksh TYPE NUMERIC(18, 6);
ALTER TABLE inventory_movements
  ALTER COLUMN unit_value_ksh TYPE NUMERIC(18, 6);
ALTER TABLE inventory_price_history
  ALTER COLUMN amount_ksh TYPE NUMERIC(18, 6);
ALTER TABLE inventory_stock_count_items
  ALTER COLUMN expected_unit_value_ksh TYPE NUMERIC(18, 6),
  ALTER COLUMN expected_retail_price_ksh TYPE NUMERIC(18, 6),
  ALTER COLUMN expected_wholesale_price_ksh TYPE NUMERIC(18, 6);

CREATE TEMP TABLE _073_brand ON COMMIT DROP AS
SELECT id AS brand_id
FROM brands
WHERE slug = 'glitz-n-glim';

DO $$
BEGIN
  IF (SELECT count(*) FROM _073_brand) <> 1 THEN
    RAISE EXCEPTION 'Migration 073 expected exactly one glitz-n-glim brand row';
  END IF;
END $$;

-- Snapshot the exact rows being converted. A re-run sees already-normalized
-- ml/kg rows and therefore cannot multiply the same quantities twice.
CREATE TEMP TABLE _073_perfume_before ON COMMIT DROP AS
SELECT
  i.id,
  i.quantity AS old_quantity,
  i.unit_value_ksh AS old_unit_value_ksh,
  i.quantity * i.unit_value_ksh AS old_valuation_ksh
FROM inventory_items i
JOIN _073_brand b ON b.brand_id = i.brand_id
WHERE i.is_active
  AND lower(trim(i.category)) = 'perfume'
  AND inventory_normalize_unit(COALESCE(NULLIF(i.base_unit, ''), i.unit)) = 'ltrs';

CREATE TEMP TABLE _073_colour_before ON COMMIT DROP AS
SELECT
  i.id,
  i.quantity AS old_quantity,
  i.unit_value_ksh AS old_unit_value_ksh,
  i.quantity * i.unit_value_ksh AS old_valuation_ksh
FROM inventory_items i
JOIN _073_brand b ON b.brand_id = i.brand_id
WHERE i.is_active
  AND lower(trim(i.category)) IN ('colour', 'color')
  AND inventory_normalize_unit(COALESCE(NULLIF(i.base_unit, ''), i.unit)) = 'ltrs';

-- Fail closed if an active target category has an unexpected third unit, or if
-- the live quantity cache already disagrees with the authoritative ledger.
DO $$
DECLARE
  bad_name TEXT;
BEGIN
  SELECT i.name INTO bad_name
  FROM inventory_items i
  JOIN _073_brand b ON b.brand_id = i.brand_id
  WHERE i.is_active
    AND lower(trim(i.category)) = 'perfume'
    AND inventory_normalize_unit(COALESCE(NULLIF(i.base_unit, ''), i.unit)) NOT IN ('ltrs', 'ml')
  LIMIT 1;
  IF bad_name IS NOT NULL THEN
    RAISE EXCEPTION 'Migration 073 found Perfume item % with an unexpected unit', bad_name;
  END IF;

  SELECT i.name INTO bad_name
  FROM inventory_items i
  JOIN _073_brand b ON b.brand_id = i.brand_id
  WHERE i.is_active
    AND lower(trim(i.category)) IN ('colour', 'color')
    AND inventory_normalize_unit(COALESCE(NULLIF(i.base_unit, ''), i.unit)) NOT IN ('ltrs', 'kg')
  LIMIT 1;
  IF bad_name IS NOT NULL THEN
    RAISE EXCEPTION 'Migration 073 found Colour item % with an unexpected unit', bad_name;
  END IF;

  SELECT i.name INTO bad_name
  FROM inventory_items i
  WHERE i.id IN (SELECT id FROM _073_perfume_before UNION SELECT id FROM _073_colour_before)
    AND abs(i.quantity - COALESCE((
      SELECT sum(CASE WHEN m.direction = 'in' THEN m.base_quantity ELSE -m.base_quantity END)
      FROM inventory_movements m
      WHERE m.item_id = i.id
    ), 0)) > 0.00001
  LIMIT 1;
  IF bad_name IS NOT NULL THEN
    RAISE EXCEPTION 'Migration 073 refused to normalize % because its cache and ledger differ', bad_name;
  END IF;

  SELECT i.name INTO bad_name
  FROM inventory_items i
  WHERE i.id IN (SELECT id FROM _073_perfume_before)
    AND EXISTS (
      SELECT 1 FROM inventory_movements m
      WHERE m.item_id = i.id
        AND abs(m.base_quantity - (m.quantity * m.conversion_rate)) > 0.00001
    )
  LIMIT 1;
  IF bad_name IS NOT NULL THEN
    RAISE EXCEPTION 'Migration 073 found an inconsistent movement conversion for %', bad_name;
  END IF;

  SELECT i.name INTO bad_name
  FROM inventory_items i
  WHERE i.id IN (SELECT id FROM _073_colour_before)
    AND EXISTS (
      SELECT 1 FROM inventory_movements m
      WHERE m.item_id = i.id AND abs(m.conversion_rate - 1) > 0.00001
    )
  LIMIT 1;
  IF bad_name IS NOT NULL THEN
    RAISE EXCEPTION 'Migration 073 found a non-1 Colour conversion rate for %', bad_name;
  END IF;
END $$;

-- ─── 2. PERFUME: LITRES → MILLILITRES ─────────────────────────────────────
-- inventory_movements.quantity remains the original entered quantity. Its
-- movement_unit remains the normalized entered unit, while conversion_rate,
-- base_quantity and quantity_after are changed to the new ml base. This keeps
-- source evidence and the canonical ledger simultaneously truthful.

UPDATE inventory_movements m
SET movement_unit = inventory_normalize_unit(m.movement_unit),
    conversion_rate = m.conversion_rate * 1000,
    base_quantity = m.base_quantity * 1000,
    quantity_after = CASE WHEN m.quantity_after IS NULL THEN NULL ELSE m.quantity_after * 1000 END,
    unit_value_ksh = m.unit_value_ksh / 1000
WHERE m.item_id IN (SELECT id FROM _073_perfume_before);

UPDATE inventory_stock_count_items s
SET expected_quantity = s.expected_quantity * 1000,
    counted_quantity = CASE WHEN s.counted_quantity IS NULL THEN NULL ELSE s.counted_quantity * 1000 END,
    expected_unit_value_ksh = s.expected_unit_value_ksh / 1000,
    expected_retail_price_ksh = s.expected_retail_price_ksh / 1000,
    expected_wholesale_price_ksh = s.expected_wholesale_price_ksh / 1000,
    notes = CASE
      WHEN s.notes ILIKE '%Migration 073: litres converted to ml.%' THEN s.notes
      ELSE concat_ws(E'\n', NULLIF(s.notes, ''), 'Migration 073: litres converted to ml; physical quantity and valuation preserved.')
    END,
    updated_at = now()
WHERE s.item_id IN (SELECT id FROM _073_perfume_before);

UPDATE inventory_price_history p
SET amount_ksh = CASE
      WHEN inventory_normalize_unit(p.base_unit) IN ('', 'ltrs') THEN p.amount_ksh / 1000
      ELSE p.amount_ksh
    END,
    base_unit = 'ml',
    notes = CASE
      WHEN p.notes ILIKE '%Migration 073: normalized to price per ml.%' THEN p.notes
      ELSE concat_ws(E'\n', NULLIF(p.notes, ''), 'Migration 073: normalized to price per ml; total valuation preserved.')
    END
WHERE p.inventory_item_id IN (SELECT id FROM _073_perfume_before)
  AND inventory_normalize_unit(p.base_unit) IN ('', 'ltrs', 'ml');

UPDATE inventory_reorder_alerts r
SET quantity_at_trigger = r.quantity_at_trigger * 1000,
    reserved_quantity = r.reserved_quantity * 1000,
    usable_quantity = r.usable_quantity * 1000,
    reorder_level = r.reorder_level * 1000,
    suggested_quantity = r.suggested_quantity * 1000,
    average_daily_usage = r.average_daily_usage * 1000,
    updated_at = now()
WHERE r.item_id IN (SELECT id FROM _073_perfume_before);

UPDATE procurement_purchase_items p
SET quantity = CASE WHEN inventory_normalize_unit(p.unit) = 'ltrs' THEN p.quantity * 1000 ELSE p.quantity END,
    unit_cost_ksh = CASE WHEN inventory_normalize_unit(p.unit) = 'ltrs' THEN p.unit_cost_ksh / 1000 ELSE p.unit_cost_ksh END,
    unit = 'ml'
WHERE p.inventory_item_id IN (SELECT id FROM _073_perfume_before)
  AND inventory_normalize_unit(p.unit) IN ('ltrs', 'ml');

UPDATE procurement_requisition_items r
SET quantity_requested = CASE WHEN inventory_normalize_unit(r.unit) = 'ltrs' THEN r.quantity_requested * 1000 ELSE r.quantity_requested END,
    stock_at_request = CASE WHEN r.stock_at_request IS NULL THEN NULL WHEN inventory_normalize_unit(r.unit) = 'ltrs' THEN r.stock_at_request * 1000 ELSE r.stock_at_request END,
    quantity_approved = CASE WHEN inventory_normalize_unit(r.unit) = 'ltrs' THEN r.quantity_approved * 1000 ELSE r.quantity_approved END,
    quantity_issued = CASE WHEN inventory_normalize_unit(r.unit) = 'ltrs' THEN r.quantity_issued * 1000 ELSE r.quantity_issued END,
    unit = 'ml'
WHERE r.inventory_item_id IN (SELECT id FROM _073_perfume_before)
  AND inventory_normalize_unit(r.unit) IN ('ltrs', 'ml');

UPDATE procurement_goods_receipt_items r
SET quantity_ordered = CASE WHEN inventory_normalize_unit(r.unit) = 'ltrs' THEN r.quantity_ordered * 1000 ELSE r.quantity_ordered END,
    quantity_delivered = CASE WHEN inventory_normalize_unit(r.unit) = 'ltrs' THEN r.quantity_delivered * 1000 ELSE r.quantity_delivered END,
    quantity_accepted = CASE WHEN inventory_normalize_unit(r.unit) = 'ltrs' THEN r.quantity_accepted * 1000 ELSE r.quantity_accepted END,
    quantity_rejected = CASE WHEN inventory_normalize_unit(r.unit) = 'ltrs' THEN r.quantity_rejected * 1000 ELSE r.quantity_rejected END,
    unit_cost_ksh = CASE WHEN inventory_normalize_unit(r.unit) = 'ltrs' THEN r.unit_cost_ksh / 1000 ELSE r.unit_cost_ksh END,
    unit = 'ml'
WHERE r.inventory_item_id IN (SELECT id FROM _073_perfume_before)
  AND inventory_normalize_unit(r.unit) IN ('ltrs', 'ml');

UPDATE procurement_goods_issue_items g
SET quantity_approved = CASE WHEN inventory_normalize_unit(g.unit) = 'ltrs' THEN g.quantity_approved * 1000 ELSE g.quantity_approved END,
    quantity_issued = CASE WHEN inventory_normalize_unit(g.unit) = 'ltrs' THEN g.quantity_issued * 1000 ELSE g.quantity_issued END,
    unit = 'ml'
WHERE g.inventory_item_id IN (SELECT id FROM _073_perfume_before)
  AND inventory_normalize_unit(g.unit) IN ('ltrs', 'ml');

UPDATE production_bom_lines b
SET quantity_per_unit = CASE WHEN inventory_normalize_unit(b.unit) = 'ltrs' THEN b.quantity_per_unit * 1000 ELSE b.quantity_per_unit END,
    unit = 'ml'
WHERE b.component_item_id IN (SELECT id FROM _073_perfume_before)
  AND inventory_normalize_unit(b.unit) IN ('ltrs', 'ml');

UPDATE production_run_materials r
SET expected_quantity = CASE WHEN inventory_normalize_unit(r.unit) = 'ltrs' THEN r.expected_quantity * 1000 ELSE r.expected_quantity END,
    issued_quantity = CASE WHEN inventory_normalize_unit(r.unit) = 'ltrs' THEN r.issued_quantity * 1000 ELSE r.issued_quantity END,
    returned_quantity = CASE WHEN inventory_normalize_unit(r.unit) = 'ltrs' THEN r.returned_quantity * 1000 ELSE r.returned_quantity END,
    consumed_quantity = CASE WHEN inventory_normalize_unit(r.unit) = 'ltrs' THEN r.consumed_quantity * 1000 ELSE r.consumed_quantity END,
    waste_quantity = CASE WHEN inventory_normalize_unit(r.unit) = 'ltrs' THEN r.waste_quantity * 1000 ELSE r.waste_quantity END,
    unit = 'ml'
WHERE r.item_id IN (SELECT id FROM _073_perfume_before)
  AND inventory_normalize_unit(r.unit) IN ('ltrs', 'ml');

UPDATE inventory_items i
SET unit = 'ml',
    base_unit = 'ml',
    quantity = i.quantity * 1000,
    reserved_quantity = i.reserved_quantity * 1000,
    reorder_level = i.reorder_level * 1000,
    minimum_stock = i.minimum_stock * 1000,
    maximum_stock = CASE WHEN i.maximum_stock IS NULL THEN NULL ELSE i.maximum_stock * 1000 END,
    production_threshold = i.production_threshold * 1000,
    suggested_reorder_quantity = i.suggested_reorder_quantity * 1000,
    unit_value_ksh = i.unit_value_ksh / 1000,
    notes = CASE
      WHEN i.notes ILIKE '%Migration 073: base unit converted from litres to ml.%' THEN i.notes
      ELSE concat_ws(E'\n', NULLIF(i.notes, ''), 'Migration 073: base unit converted from litres to ml (1 L = 1000 ml); physical quantity and valuation preserved.')
    END,
    updated_at = now()
WHERE i.id IN (SELECT id FROM _073_perfume_before);

-- ─── 3. COLOURS: WRONG LABEL ltrs → kg, NUMBERS UNCHANGED ─────────────────

UPDATE inventory_movements m
SET movement_unit = 'kg',
    conversion_rate = 1
WHERE m.item_id IN (SELECT id FROM _073_colour_before);

UPDATE inventory_stock_count_items s
SET notes = CASE
      WHEN s.notes ILIKE '%Migration 073: unit label corrected from litres to kg.%' THEN s.notes
      ELSE concat_ws(E'\n', NULLIF(s.notes, ''), 'Migration 073: unit label corrected from litres to kg; numeric physical count unchanged.')
    END,
    updated_at = now()
WHERE s.item_id IN (SELECT id FROM _073_colour_before);

UPDATE inventory_price_history p
SET base_unit = 'kg',
    notes = CASE
      WHEN p.notes ILIKE '%Migration 073: Colour unit label corrected to kg.%' THEN p.notes
      ELSE concat_ws(E'\n', NULLIF(p.notes, ''), 'Migration 073: Colour unit label corrected to kg; numeric price unchanged.')
    END
WHERE p.inventory_item_id IN (SELECT id FROM _073_colour_before);

UPDATE procurement_purchase_items p SET unit = 'kg'
WHERE p.inventory_item_id IN (SELECT id FROM _073_colour_before);
UPDATE procurement_requisition_items r SET unit = 'kg'
WHERE r.inventory_item_id IN (SELECT id FROM _073_colour_before);
UPDATE procurement_goods_receipt_items r SET unit = 'kg'
WHERE r.inventory_item_id IN (SELECT id FROM _073_colour_before);
UPDATE procurement_goods_issue_items g SET unit = 'kg'
WHERE g.inventory_item_id IN (SELECT id FROM _073_colour_before);
UPDATE production_bom_lines b SET unit = 'kg'
WHERE b.component_item_id IN (SELECT id FROM _073_colour_before);
UPDATE production_run_materials r SET unit = 'kg'
WHERE r.item_id IN (SELECT id FROM _073_colour_before);

UPDATE inventory_items i
SET unit = 'kg',
    base_unit = 'kg',
    notes = CASE
      WHEN i.notes ILIKE '%Migration 073: Colour unit corrected from litres to kg.%' THEN i.notes
      ELSE concat_ws(E'\n', NULLIF(i.notes, ''), 'Migration 073: Colour unit corrected from litres to kg; existing numeric quantity is the kg quantity and was not converted.')
    END,
    updated_at = now()
WHERE i.id IN (SELECT id FROM _073_colour_before);

-- HCL is already physically measured in litres; normalize labels only.
DO $$
DECLARE
  hcl_id UUID;
BEGIN
  SELECT i.id INTO hcl_id
  FROM inventory_items i
  JOIN _073_brand b ON b.brand_id = i.brand_id
  WHERE i.is_active
    AND inventory_normalize_alias(COALESCE(NULLIF(i.canonical_name, ''), i.name)) = 'hcl';

  IF hcl_id IS NULL THEN
    RAISE EXCEPTION 'Migration 073 could not find the active Glitz HCL item';
  END IF;

  IF (SELECT count(*) FROM inventory_items i JOIN _073_brand b ON b.brand_id = i.brand_id
      WHERE i.is_active AND inventory_normalize_alias(COALESCE(NULLIF(i.canonical_name, ''), i.name)) = 'hcl') <> 1 THEN
    RAISE EXCEPTION 'Migration 073 found multiple active Glitz HCL items';
  END IF;

  UPDATE inventory_items
  SET unit = 'ltrs', base_unit = 'ltrs', updated_at = now()
  WHERE id = hcl_id;

  UPDATE inventory_movements
  SET movement_unit = 'ltrs'
  WHERE item_id = hcl_id AND inventory_normalize_unit(movement_unit) = 'ltrs';

  UPDATE procurement_purchase_items SET unit = 'ltrs'
  WHERE inventory_item_id = hcl_id AND inventory_normalize_unit(unit) = 'ltrs';
  UPDATE procurement_requisition_items SET unit = 'ltrs'
  WHERE inventory_item_id = hcl_id AND inventory_normalize_unit(unit) = 'ltrs';
  UPDATE procurement_goods_receipt_items SET unit = 'ltrs'
  WHERE inventory_item_id = hcl_id AND inventory_normalize_unit(unit) = 'ltrs';
  UPDATE procurement_goods_issue_items SET unit = 'ltrs'
  WHERE inventory_item_id = hcl_id AND inventory_normalize_unit(unit) = 'ltrs';
END $$;

-- ─── 4. CAUSTIC SODA / NAOH CANONICAL MERGE ───────────────────────────────

CREATE TEMP TABLE _073_caustic_state (
  canonical_id UUID PRIMARY KEY,
  duplicate_ids UUID[] NOT NULL,
  pre_quantity NUMERIC NOT NULL,
  pre_movement_count INTEGER NOT NULL
) ON COMMIT DROP;

DO $$
DECLARE
  canonical_id UUID;
  duplicate_ids UUID[];
  pre_quantity NUMERIC;
  pre_movement_count INTEGER;
  ref RECORD;
BEGIN
  SELECT i.id INTO canonical_id
  FROM inventory_items i
  JOIN _073_brand b ON b.brand_id = i.brand_id
  WHERE i.is_active
    AND inventory_normalize_alias(COALESCE(NULLIF(i.canonical_name, ''), i.name)) IN ('caustic soda', 'caustic soda naoh')
  ORDER BY CASE WHEN inventory_normalize_alias(i.name) = 'caustic soda naoh' THEN 0 ELSE 1 END, i.created_at
  LIMIT 1;

  IF canonical_id IS NULL THEN
    RAISE EXCEPTION 'Migration 073 could not find the canonical Glitz CAUSTIC SODA item';
  END IF;

  IF (SELECT count(*) FROM inventory_items i JOIN _073_brand b ON b.brand_id = i.brand_id
      WHERE i.is_active
        AND inventory_normalize_alias(COALESCE(NULLIF(i.canonical_name, ''), i.name)) IN ('caustic soda', 'caustic soda naoh')) <> 1 THEN
    RAISE EXCEPTION 'Migration 073 found multiple canonical CAUSTIC SODA candidates';
  END IF;

  SELECT COALESCE(array_agg(i.id ORDER BY i.created_at) FILTER (WHERE i.id <> canonical_id), '{}'::UUID[]),
         COALESCE(sum(i.quantity), 0),
         (SELECT count(*) FROM inventory_movements m WHERE m.item_id IN (
           SELECT c.id FROM inventory_items c JOIN _073_brand b2 ON b2.brand_id = c.brand_id
           WHERE inventory_normalize_alias(COALESCE(NULLIF(c.canonical_name, ''), c.name)) IN (
             'caustic', 'caustic soda', 'caustic soda naoh', 'naoh', 'sodium hydroxide',
             'sodium hydroxide flakes', 'sodium hydroxide pearls', 'caustic pearls'
           )
         ))
  INTO duplicate_ids, pre_quantity, pre_movement_count
  FROM inventory_items i
  JOIN _073_brand b ON b.brand_id = i.brand_id
  WHERE inventory_normalize_alias(COALESCE(NULLIF(i.canonical_name, ''), i.name)) IN (
    'caustic', 'caustic soda', 'caustic soda naoh', 'naoh', 'sodium hydroxide',
    'sodium hydroxide flakes', 'sodium hydroxide pearls', 'caustic pearls'
  );

  IF EXISTS (
    SELECT 1
    FROM inventory_items i
    WHERE (i.id = canonical_id OR i.id = ANY(duplicate_ids))
      AND inventory_normalize_unit(COALESCE(NULLIF(i.base_unit, ''), i.unit)) <> 'kg'
  ) THEN
    RAISE EXCEPTION 'Migration 073 found a Caustic/NAOH item that is not measured in kg';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM inventory_items i
    WHERE (i.id = canonical_id OR i.id = ANY(duplicate_ids))
      AND abs(i.quantity - COALESCE((
        SELECT sum(CASE WHEN m.direction = 'in' THEN m.base_quantity ELSE -m.base_quantity END)
        FROM inventory_movements m WHERE m.item_id = i.id
      ), 0)) > 0.00001
  ) THEN
    RAISE EXCEPTION 'Migration 073 refused the Caustic merge because a source cache and ledger differ';
  END IF;

  -- Historical counts may contain both CAUSTIC SODA and NAOH in the same count.
  -- The unique (count_id,item_id) rule means those two source lines cannot both
  -- point to one item. Keep only the conflicting evidence on inactive NAOH and
  -- annotate why; all non-conflicting count references are safely re-pointed.
  UPDATE inventory_stock_count_items d
  SET notes = CASE
        WHEN d.notes ILIKE '%Migration 073: retained on inactive duplicate%' THEN d.notes
        ELSE concat_ws(E'\n', NULLIF(d.notes, ''), 'Migration 073: retained on inactive duplicate solely to preserve the original stock-count line; usable stock is consolidated under ' || canonical_id::TEXT || '.')
      END,
      updated_at = now()
  WHERE d.item_id = ANY(duplicate_ids)
    AND EXISTS (
      SELECT 1 FROM inventory_stock_count_items c
      WHERE c.count_id = d.count_id AND c.item_id = canonical_id
    );

  UPDATE inventory_stock_count_items d
  SET item_id = canonical_id, updated_at = now()
  WHERE d.item_id = ANY(duplicate_ids)
    AND NOT EXISTS (
      SELECT 1 FROM inventory_stock_count_items c
      WHERE c.count_id = d.count_id AND c.item_id = canonical_id
    );

  -- Resolve only duplicate open alerts that would collide with an existing
  -- canonical alert; rows remain as audit evidence and can then be re-pointed.
  UPDATE inventory_reorder_alerts d
  SET state = 'resolved',
      resolved_by = 'migration-073',
      resolved_at = COALESCE(d.resolved_at, now()),
      resolution_note = concat_ws(E'\n', NULLIF(d.resolution_note, ''), 'Resolved during Caustic/NAOH canonical merge; canonical alert retained.'),
      updated_at = now()
  WHERE d.item_id = ANY(duplicate_ids)
    AND d.state NOT IN ('resolved', 'dismissed')
    AND EXISTS (
      SELECT 1 FROM inventory_reorder_alerts c
      WHERE c.item_id = canonical_id
        AND c.location = d.location
        AND c.state NOT IN ('resolved', 'dismissed')
    );
  UPDATE inventory_reorder_alerts SET item_id = canonical_id, updated_at = now()
  WHERE item_id = ANY(duplicate_ids);

  -- Prevent a duplicate active BOM requirement if both old identities were
  -- mapped to the same product, but preserve the duplicate BOM row as inactive.
  UPDATE production_bom_lines d
  SET active = false,
      notes = concat_ws(E'\n', NULLIF(d.notes, ''), 'Migration 073: duplicate Caustic/NAOH BOM mapping deactivated during canonical merge.')
  WHERE d.component_item_id = ANY(duplicate_ids)
    AND d.active
    AND EXISTS (
      SELECT 1 FROM production_bom_lines c
      WHERE c.product_item_id = d.product_item_id
        AND c.component_item_id = canonical_id
        AND c.active
    );
  UPDATE production_bom_lines SET component_item_id = canonical_id
  WHERE component_item_id = ANY(duplicate_ids);

  UPDATE production_bom_lines d
  SET active = false,
      notes = concat_ws(E'\n', NULLIF(d.notes, ''), 'Migration 073: duplicate product mapping deactivated during canonical merge.')
  WHERE d.product_item_id = ANY(duplicate_ids)
    AND d.active
    AND EXISTS (
      SELECT 1 FROM production_bom_lines c
      WHERE c.product_item_id = canonical_id
        AND c.component_item_id = d.component_item_id
        AND c.active
    );
  UPDATE production_bom_lines SET product_item_id = canonical_id
  WHERE product_item_id = ANY(duplicate_ids);

  -- Every remaining single-column FK is safe to re-point. The three tables
  -- with item-based uniqueness were handled explicitly above.
  FOR ref IN
    SELECT * FROM (VALUES
      ('field_sales_allocation_items', 'item_id'),
      ('field_sales_custody_movements', 'item_id'),
      ('field_sales_daily_return_items', 'item_id'),
      ('field_sales_return_note_items', 'item_id'),
      ('inventory_item_aliases', 'item_id'),
      ('inventory_movements', 'item_id'),
      ('inventory_price_history', 'inventory_item_id'),
      ('petty_cash_transactions', 'inventory_item_id'),
      ('procurement_goods_issue_items', 'inventory_item_id'),
      ('procurement_goods_receipt_items', 'inventory_item_id'),
      ('procurement_purchase_items', 'inventory_item_id'),
      ('procurement_requisition_items', 'inventory_item_id'),
      ('production_fg_transfers', 'item_id'),
      ('production_run_materials', 'item_id'),
      ('production_runs', 'product_item_id'),
      ('sales_invoice_items', 'item_id')
    ) AS refs(table_name, column_name)
  LOOP
    EXECUTE format('UPDATE %I SET %I = $1 WHERE %I = ANY($2)', ref.table_name, ref.column_name, ref.column_name)
      USING canonical_id, duplicate_ids;
  END LOOP;

  -- Recompute every stored balance snapshot against the newly combined ledger;
  -- no new movement is inserted and every historical movement id survives.
  WITH running AS (
    SELECT m.id,
      sum(CASE WHEN m.direction = 'in' THEN m.base_quantity ELSE -m.base_quantity END)
        OVER (ORDER BY m.effective_at, m.created_at, m.id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS balance
    FROM inventory_movements m
    WHERE m.item_id = canonical_id
  )
  UPDATE inventory_movements m
  SET quantity_after = running.balance
  FROM running
  WHERE m.id = running.id;

  UPDATE inventory_items i
  SET name = 'CAUSTIC SODA (NaOH)',
      canonical_name = 'CAUSTIC SODA (NaOH)',
      unit = 'kg',
      base_unit = 'kg',
      quantity = COALESCE((
        SELECT sum(CASE WHEN m.direction = 'in' THEN m.base_quantity ELSE -m.base_quantity END)
        FROM inventory_movements m WHERE m.item_id = canonical_id
      ), 0),
      notes = CASE
        WHEN i.notes ILIKE '%Migration 073: canonical Caustic identity.%' THEN i.notes
        ELSE concat_ws(E'\n', NULLIF(i.notes, ''), 'Migration 073: canonical Caustic identity. NAOH and equivalent sodium-hydroxide names resolve here; ledger histories were consolidated without creating movements.')
      END,
      updated_at = now()
  WHERE i.id = canonical_id;

  UPDATE inventory_items i
  SET is_active = false,
      quantity = 0,
      notes = CASE
        WHEN i.notes ILIKE '%Migration 073: merged into canonical item%' THEN i.notes
        ELSE concat_ws(E'\n', NULLIF(i.notes, ''), 'Migration 073: merged into canonical item ' || canonical_id::TEXT || '. Historical source evidence is retained; this row is not usable stock.')
      END,
      updated_at = now()
  WHERE i.id = ANY(duplicate_ids);

  INSERT INTO _073_caustic_state VALUES (canonical_id, duplicate_ids, pre_quantity, pre_movement_count);
END $$;

-- ─── 5. APPLE GREEN + ACTIVE LAVENDER ─────────────────────────────────────

CREATE TEMP TABLE _073_apple_green_state (
  item_id UUID PRIMARY KEY,
  pre_quantity NUMERIC NOT NULL,
  pre_movement_count INTEGER NOT NULL
) ON COMMIT DROP;

DO $$
DECLARE
  apple_id UUID;
BEGIN
  IF (SELECT count(*)
      FROM inventory_items i JOIN _073_brand b ON b.brand_id = i.brand_id
      WHERE i.is_active
        AND lower(trim(i.category)) IN ('colour', 'color')
        AND inventory_normalize_alias(COALESCE(NULLIF(i.canonical_name, ''), i.name)) IN ('apple green', 'apple green h w')) <> 1 THEN
    RAISE EXCEPTION 'Migration 073 expected exactly one active Apple Green colour identity';
  END IF;

  SELECT i.id INTO apple_id
  FROM inventory_items i JOIN _073_brand b ON b.brand_id = i.brand_id
  WHERE i.is_active
    AND lower(trim(i.category)) IN ('colour', 'color')
    AND inventory_normalize_alias(COALESCE(NULLIF(i.canonical_name, ''), i.name)) IN ('apple green', 'apple green h w');

  INSERT INTO _073_apple_green_state
  SELECT apple_id, i.quantity, (SELECT count(*) FROM inventory_movements m WHERE m.item_id = apple_id)
  FROM inventory_items i WHERE i.id = apple_id;

  UPDATE inventory_items i
  SET name = 'APPLE GREEN',
      canonical_name = 'APPLE GREEN',
      unit = 'kg',
      base_unit = 'kg',
      notes = CASE
        WHEN i.notes ILIKE '%Migration 073: canonical Apple Green colour.%' THEN i.notes
        ELSE concat_ws(E'\n', NULLIF(i.notes, ''), 'Migration 073: canonical Apple Green colour. Legacy APPLE GREEN h/w and Glass Cleaner paperwork resolve here; stock and movement history retained.')
      END,
      updated_at = now()
  WHERE i.id = apple_id;
END $$;

CREATE TEMP TABLE _073_lavender_state (
  item_id UUID PRIMARY KEY,
  inserted_now BOOLEAN NOT NULL
) ON COMMIT DROP;

DO $$
DECLARE
  glitz_id UUID := (SELECT brand_id FROM _073_brand);
  lavender_id UUID;
  raw_store_id UUID;
  inserted_now BOOLEAN := false;
BEGIN
  IF (SELECT count(*) FROM inventory_items i
      WHERE i.brand_id = glitz_id
        AND i.is_active
        AND lower(trim(i.category)) = 'perfume'
        AND inventory_normalize_alias(COALESCE(NULLIF(i.canonical_name, ''), i.name)) = 'lavender') > 1 THEN
    RAISE EXCEPTION 'Migration 073 found multiple active LAVENDER perfume items';
  END IF;

  SELECT i.id INTO lavender_id
  FROM inventory_items i
  WHERE i.brand_id = glitz_id
    AND i.is_active
    AND lower(trim(i.category)) = 'perfume'
    AND inventory_normalize_alias(COALESCE(NULLIF(i.canonical_name, ''), i.name)) = 'lavender';

  IF lavender_id IS NULL THEN
    SELECT (array_agg(i.store_id ORDER BY i.created_at) FILTER (WHERE i.store_id IS NOT NULL))[1]
    INTO raw_store_id
    FROM inventory_items i
    WHERE i.brand_id = glitz_id
      AND i.is_active
      AND lower(trim(i.category)) = 'perfume';

    IF raw_store_id IS NULL THEN
      RAISE EXCEPTION 'Migration 073 could not determine the Glitz raw-material store for LAVENDER';
    END IF;

    INSERT INTO inventory_items (
      brand_id, name, canonical_name, category, item_type, unit, base_unit,
      quantity, unit_value_ksh, store_id, purchasable, producible, sellable,
      notes, is_active
    ) VALUES (
      glitz_id, 'LAVENDER', 'LAVENDER', 'Perfume', 'raw_material', 'ml', 'ml',
      0, 0, raw_store_id, true, false, false,
      'Migration 073: active Lavender perfume master created with zero usable opening quantity. Expired/quarantined evidence was deliberately not converted into stock.',
      true
    ) RETURNING id INTO lavender_id;
    inserted_now := true;
  ELSE
    UPDATE inventory_items
    SET name = 'LAVENDER', canonical_name = 'LAVENDER', unit = 'ml', base_unit = 'ml', updated_at = now()
    WHERE id = lavender_id;
  END IF;

  INSERT INTO _073_lavender_state VALUES (lavender_id, inserted_now);
END $$;

-- ─── 6. KNOWN ITEM ALIASES + SQL RESOLVER ─────────────────────────────────

CREATE TEMP TABLE _073_alias_seed (
  item_id UUID NOT NULL,
  alias TEXT NOT NULL,
  notes TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO _073_alias_seed (item_id, alias, notes)
SELECT c.canonical_id, v.alias, 'Confirmed Caustic/Sodium Hydroxide synonym; migration 073.'
FROM _073_caustic_state c
CROSS JOIN (VALUES
  ('Caustic'), ('Caustic Soda'), ('NAOH'), ('Sodium Hydroxide'),
  ('Sodium Hydroxide Flakes'), ('Sodium Hydroxide Pearls'), ('Caustic Pearls')
) AS v(alias);

INSERT INTO _073_alias_seed (item_id, alias, notes)
SELECT i.id, v.alias, 'Confirmed LABSA trade/operational name; migration 073.'
FROM inventory_items i
JOIN _073_brand b ON b.brand_id = i.brand_id
CROSS JOIN (VALUES ('Ufacid'), ('Sulphonic Acid'), ('LABSA'), ('Sulphonic Acid LABSA')) AS v(alias)
WHERE i.is_active
  AND inventory_normalize_alias(COALESCE(NULLIF(i.canonical_name, ''), i.name)) = 'sulphonic acid labsa';

INSERT INTO _073_alias_seed (item_id, alias, notes)
SELECT i.id, v.alias, 'Confirmed SLES trade/operational name; migration 073.'
FROM inventory_items i
JOIN _073_brand b ON b.brand_id = i.brand_id
CROSS JOIN (VALUES ('Ungerol'), ('SLES')) AS v(alias)
WHERE i.is_active
  AND inventory_normalize_alias(COALESCE(NULLIF(i.canonical_name, ''), i.name)) = 'sles';

INSERT INTO _073_alias_seed (item_id, alias, notes)
SELECT a.item_id, v.alias, 'Confirmed Apple Green historical name; migration 073.'
FROM _073_apple_green_state a
CROSS JOIN (VALUES ('Apple Green'), ('APPLE GREEN h/w')) AS v(alias);

INSERT INTO _073_alias_seed (item_id, alias, notes)
SELECT l.item_id, 'Lavender', 'Canonical active Lavender perfume; migration 073.'
FROM _073_lavender_state l;

DO $$
BEGIN
  IF (SELECT count(*) FROM _073_alias_seed WHERE alias IN ('Ufacid', 'Sulphonic Acid', 'LABSA', 'Sulphonic Acid LABSA')) <> 4 THEN
    RAISE EXCEPTION 'Migration 073 expected exactly one active SULPHONIC ACID LABSA item';
  END IF;
  IF (SELECT count(*) FROM _073_alias_seed WHERE alias IN ('Ungerol', 'SLES')) <> 2 THEN
    RAISE EXCEPTION 'Migration 073 expected exactly one active SLES item';
  END IF;
  IF EXISTS (
    SELECT 1 FROM _073_alias_seed
    GROUP BY inventory_normalize_alias(alias)
    HAVING count(DISTINCT item_id) > 1
  ) THEN
    RAISE EXCEPTION 'Migration 073 alias seed contains an ambiguous normalized alias';
  END IF;
END $$;

UPDATE inventory_item_aliases a
SET item_id = s.item_id,
    alias_type = 'import',
    notes = s.notes,
    active = true
FROM _073_alias_seed s, _073_brand b
WHERE a.brand_id = b.brand_id
  AND a.active
  AND lower(trim(a.alias)) = lower(trim(s.alias));

INSERT INTO inventory_item_aliases (
  item_id, brand_id, alias, alias_type, notes, active, created_by
)
SELECT s.item_id, b.brand_id, s.alias, 'import', s.notes, true, 'migration-073'
FROM _073_alias_seed s
CROSS JOIN _073_brand b
WHERE NOT EXISTS (
  SELECT 1 FROM inventory_item_aliases a
  WHERE a.brand_id = b.brand_id
    AND a.active
    AND lower(trim(a.alias)) = lower(trim(s.alias))
);

-- Deliberately returns NULL for zero matches OR multiple matches. Generic
-- "Salt" therefore remains unresolved; it is never guessed to Fine/Rough Salt.
CREATE OR REPLACE FUNCTION resolve_inventory_item_alias(p_brand_id UUID, p_alias TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  WITH wanted AS (
    SELECT inventory_normalize_alias(p_alias) AS value
  ), candidates AS (
    SELECT i.id
    FROM inventory_items i, wanted w
    WHERE i.brand_id = p_brand_id
      AND i.is_active
      AND inventory_normalize_alias(COALESCE(NULLIF(i.canonical_name, ''), i.name)) = w.value
    UNION
    SELECT a.item_id
    FROM inventory_item_aliases a
    JOIN inventory_items i ON i.id = a.item_id AND i.is_active
    CROSS JOIN wanted w
    WHERE a.brand_id = p_brand_id
      AND a.active
      AND inventory_normalize_alias(a.alias) = w.value
  )
  SELECT CASE WHEN count(*) = 1 THEN (array_agg(id))[1] ELSE NULL END
  FROM candidates
$$;

GRANT EXECUTE ON FUNCTION resolve_inventory_item_alias(UUID, TEXT) TO service_role;

-- ─── 7. AUDIT + EXECUTABLE RECONCILIATION ─────────────────────────────────

INSERT INTO ocg_audit_events (
  actor_email, actor_name, action, entity_table, entity_id, entity_label,
  before_data, after_data, changed_fields, request_id
)
SELECT
  'migration-073@onecoregroup.local', 'Migration 073', 'inventory.master_normalize',
  'inventory_items', b.brand_id::TEXT, 'Glitz inventory master normalization',
  jsonb_build_object(
    'caustic_total_kg', c.pre_quantity,
    'caustic_movements', c.pre_movement_count,
    'perfume_litres', COALESCE((SELECT sum(old_quantity) FROM _073_perfume_before), 0),
    'perfume_valuation_ksh', COALESCE((SELECT sum(old_valuation_ksh) FROM _073_perfume_before), 0),
    'colour_numeric_quantity', COALESCE((SELECT sum(old_quantity) FROM _073_colour_before), 0)
  ),
  jsonb_build_object(
    'caustic_item_id', c.canonical_id,
    'perfume_items_converted', (SELECT count(*) FROM _073_perfume_before),
    'colour_items_corrected', (SELECT count(*) FROM _073_colour_before),
    'lavender_item_id', l.item_id,
    'apple_green_item_id', a.item_id,
    'generic_salt_alias_created', false
  ),
  ARRAY['identity', 'unit', 'quantity', 'unit_value_ksh', 'foreign_keys', 'aliases'],
  'migration-073-inventory-master-normalization'
FROM _073_brand b
CROSS JOIN _073_caustic_state c
CROSS JOIN _073_lavender_state l
CROSS JOIN _073_apple_green_state a
WHERE NOT EXISTS (
  SELECT 1 FROM ocg_audit_events e
  WHERE e.request_id = 'migration-073-inventory-master-normalization'
);

DO $$
DECLARE
  glitz_id UUID := (SELECT brand_id FROM _073_brand);
  caustic_id UUID := (SELECT canonical_id FROM _073_caustic_state);
  caustic_duplicate_ids UUID[] := (SELECT duplicate_ids FROM _073_caustic_state);
  apple_id UUID := (SELECT item_id FROM _073_apple_green_state);
  lavender_id UUID := (SELECT item_id FROM _073_lavender_state);
  bad_name TEXT;
BEGIN
  -- Caustic: one active identity, no usable NAOH, stock and movement count kept.
  IF (SELECT count(*) FROM inventory_items i
      WHERE i.brand_id = glitz_id AND i.is_active
        AND inventory_normalize_alias(COALESCE(NULLIF(i.canonical_name, ''), i.name)) IN (
          'caustic', 'caustic soda', 'caustic soda naoh', 'naoh', 'sodium hydroxide',
          'sodium hydroxide flakes', 'sodium hydroxide pearls', 'caustic pearls'
        )) <> 1 THEN
    RAISE EXCEPTION 'Migration 073 verification failed: Caustic active identity count';
  END IF;
  IF abs((SELECT quantity FROM inventory_items WHERE id = caustic_id)
         - (SELECT pre_quantity FROM _073_caustic_state)) > 0.00001 THEN
    RAISE EXCEPTION 'Migration 073 verification failed: Caustic physical stock changed';
  END IF;
  IF (SELECT count(*) FROM inventory_movements WHERE item_id = caustic_id)
       <> (SELECT pre_movement_count FROM _073_caustic_state) THEN
    RAISE EXCEPTION 'Migration 073 verification failed: Caustic movement history count changed';
  END IF;
  IF EXISTS (SELECT 1 FROM inventory_items i
             WHERE i.id = ANY(caustic_duplicate_ids)
               AND (i.is_active OR i.quantity <> 0)) THEN
    RAISE EXCEPTION 'Migration 073 verification failed: duplicate Caustic stock remains usable';
  END IF;

  -- Perfume: old L × 1000 = new ml; ledger and valuation still reconcile.
  SELECT i.name INTO bad_name
  FROM _073_perfume_before old
  JOIN inventory_items i ON i.id = old.id
  WHERE i.base_unit <> 'ml' OR i.unit <> 'ml'
     OR abs(i.quantity - old.old_quantity * 1000) > 0.00001
     OR abs((i.quantity * i.unit_value_ksh) - old.old_valuation_ksh) > 0.00001
     OR abs(i.quantity - COALESCE((
       SELECT sum(CASE WHEN m.direction = 'in' THEN m.base_quantity ELSE -m.base_quantity END)
       FROM inventory_movements m WHERE m.item_id = i.id
     ), 0)) > 0.00001
  LIMIT 1;
  IF bad_name IS NOT NULL THEN
    RAISE EXCEPTION 'Migration 073 verification failed for Perfume item %', bad_name;
  END IF;
  IF EXISTS (SELECT 1 FROM inventory_items i
             WHERE i.brand_id = glitz_id AND i.is_active AND lower(trim(i.category)) = 'perfume'
               AND i.base_unit <> 'ml') THEN
    RAISE EXCEPTION 'Migration 073 verification failed: an active Perfume is not ml';
  END IF;

  -- Colours: kg semantics, identical numeric stock and valuation.
  SELECT i.name INTO bad_name
  FROM _073_colour_before old
  JOIN inventory_items i ON i.id = old.id
  WHERE i.base_unit <> 'kg' OR i.unit <> 'kg'
     OR abs(i.quantity - old.old_quantity) > 0.00001
     OR abs((i.quantity * i.unit_value_ksh) - old.old_valuation_ksh) > 0.00001
     OR abs(i.quantity - COALESCE((
       SELECT sum(CASE WHEN m.direction = 'in' THEN m.base_quantity ELSE -m.base_quantity END)
       FROM inventory_movements m WHERE m.item_id = i.id
     ), 0)) > 0.00001
  LIMIT 1;
  IF bad_name IS NOT NULL THEN
    RAISE EXCEPTION 'Migration 073 verification failed for Colour item %', bad_name;
  END IF;

  -- Lavender is active/ml; this migration never fabricated an opening movement.
  IF NOT EXISTS (SELECT 1 FROM inventory_items i
                 WHERE i.id = lavender_id AND i.is_active AND i.base_unit = 'ml' AND i.unit = 'ml') THEN
    RAISE EXCEPTION 'Migration 073 verification failed: active ml Lavender missing';
  END IF;
  IF (SELECT inserted_now FROM _073_lavender_state)
     AND (SELECT quantity FROM inventory_items WHERE id = lavender_id) <> 0 THEN
    RAISE EXCEPTION 'Migration 073 verification failed: new Lavender did not start at zero';
  END IF;
  IF EXISTS (SELECT 1 FROM inventory_movements m
             WHERE m.item_id = lavender_id
               AND m.recorded_by = 'migration-073') THEN
    RAISE EXCEPTION 'Migration 073 verification failed: Lavender opening movement was fabricated';
  END IF;

  -- Apple Green is one kg identity and its ledger/cache/movement count survived.
  IF (SELECT count(*) FROM inventory_items i
      WHERE i.brand_id = glitz_id AND i.is_active
        AND lower(trim(i.category)) IN ('colour', 'color')
        AND inventory_normalize_alias(COALESCE(NULLIF(i.canonical_name, ''), i.name)) = 'apple green') <> 1 THEN
    RAISE EXCEPTION 'Migration 073 verification failed: Apple Green identity count';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM inventory_items WHERE id = apple_id AND unit = 'kg' AND base_unit = 'kg')
     OR abs((SELECT quantity FROM inventory_items WHERE id = apple_id)
            - (SELECT pre_quantity FROM _073_apple_green_state)) > 0.00001
     OR (SELECT count(*) FROM inventory_movements WHERE item_id = apple_id)
        <> (SELECT pre_movement_count FROM _073_apple_green_state) THEN
    RAISE EXCEPTION 'Migration 073 verification failed: Apple Green stock/history changed';
  END IF;

  -- Confirmed aliases resolve uniquely. Generic Salt intentionally does not.
  IF resolve_inventory_item_alias(glitz_id, 'NAOH') <> caustic_id
     OR resolve_inventory_item_alias(glitz_id, 'Caustic') <> caustic_id
     OR resolve_inventory_item_alias(glitz_id, 'Ufacid') IS NULL
     OR resolve_inventory_item_alias(glitz_id, 'Ungerol') IS NULL
     OR resolve_inventory_item_alias(glitz_id, 'APPLE GREEN h/w') <> apple_id
     OR resolve_inventory_item_alias(glitz_id, 'Salt') IS NOT NULL THEN
    RAISE EXCEPTION 'Migration 073 verification failed: alias resolution';
  END IF;

  RAISE NOTICE 'Migration 073 verified: Caustic % kg; % Perfumes converted; % Colours corrected; Lavender %, Apple Green %',
    (SELECT quantity FROM inventory_items WHERE id = caustic_id),
    (SELECT count(*) FROM _073_perfume_before),
    (SELECT count(*) FROM _073_colour_before),
    lavender_id,
    apple_id;
END $$;

COMMIT;
