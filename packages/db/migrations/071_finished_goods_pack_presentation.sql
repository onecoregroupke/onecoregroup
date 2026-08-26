-- Migration 071: finished-goods pack presentation, inventory taxonomy metadata,
-- and normalized packaging compatibility groups.
--
-- SAFETY: this migration does not update inventory_items.quantity, does not
-- update/insert inventory_movements, and does not replay the 1 July stocktake.
-- Finished goods remain canonical piece balances; cartons are presentation only.

BEGIN;

-- ─── 1. CANONICAL PACKAGING ROLE METADATA ──────────────────────────────────
-- category identifies the broad store section. packaging_role supplies the
-- reusable subcategory/functional role used by Manufacturing, Stock Cards and
-- BOM compatibility. Unknown future values stay visible as unclassified.
ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS packaging_role TEXT NOT NULL DEFAULT '';

ALTER TABLE inventory_items
  DROP CONSTRAINT IF EXISTS inventory_items_packaging_role_check;
ALTER TABLE inventory_items
  ADD CONSTRAINT inventory_items_packaging_role_check CHECK (packaging_role IN (
    '', 'bottle', 'cap', 'cork', 'inserter', 'pump', 'trigger_pump', 'spray',
    'flip_top', 'clip_top', 'front_label', 'back_label', 'cap_inserter_set',
    'other_packaging'
  ));

CREATE INDEX IF NOT EXISTS idx_inventory_items_packaging_role
  ON inventory_items (packaging_role) WHERE item_type = 'packaging';

UPDATE inventory_items
SET packaging_role = CASE
  WHEN category = 'Packaging - Bottles' THEN 'bottle'
  WHEN category = 'Packaging - Stickers' AND canonical_name ~* '^Sticker[[:space:]]+Front[[:space:]]*-' THEN 'front_label'
  WHEN category = 'Packaging - Stickers' AND canonical_name ~* '^Sticker[[:space:]]+Back[[:space:]]*-' THEN 'back_label'
  WHEN category = 'Packaging - Closures' AND canonical_name ~* 'caps?[[:space:]]*&[[:space:]]*inserters?' THEN 'cap_inserter_set'
  WHEN category = 'Packaging - Closures' AND canonical_name ~* 'trigger[[:space:]]*pumps?' THEN 'trigger_pump'
  WHEN category = 'Packaging - Closures' AND canonical_name ~* 'flip[[:space:]]*top' THEN 'flip_top'
  WHEN category = 'Packaging - Closures' AND canonical_name ~* 'clip[[:space:]]*top' THEN 'clip_top'
  WHEN category = 'Packaging - Closures' AND canonical_name ~* 'inserters?' THEN 'inserter'
  WHEN category = 'Packaging - Closures' AND canonical_name ~* 'pumps?' THEN 'pump'
  WHEN category = 'Packaging - Closures' AND canonical_name ~* 'sprays?' THEN 'spray'
  WHEN category = 'Packaging - Closures' AND canonical_name ~* 'corks?' THEN 'cork'
  WHEN category = 'Packaging - Closures' AND canonical_name ~* 'caps?' THEN 'cap'
  ELSE packaging_role
END
WHERE item_type = 'packaging'
  AND packaging_role = '';

-- ─── 2. FINISHED-GOODS PACK METADATA ONLY ──────────────────────────────────
-- The first integer in package_config is the authoritative pieces per carton.
-- 4x5L is deliberately excluded: management confirmed the canonical identity
-- is 1x5L, so a surviving 4x5L row must be reported as a data-quality problem.
UPDATE inventory_items i
SET pack_size = substring(i.package_config FROM '^[[:space:]]*([0-9]+)[[:space:]]*[xX×]')::numeric
FROM brands b
WHERE b.id = i.brand_id
  AND b.slug = 'glitz-n-glim'
  AND i.is_active
  AND i.item_type = 'finished_good'
  AND i.package_config ~ '^[[:space:]]*[0-9]+[[:space:]]*[xX×]'
  AND i.package_config !~* '^[[:space:]]*4[[:space:]]*[xX×][[:space:]]*5[[:space:]]*l';

-- ─── 3. REQUIRED VERSUS ALTERNATIVE BOM SEMANTICS ─────────────────────────
-- Existing active lines remain all_required. one_of lines in the same group are
-- compatible alternatives, not several materials that must all be issued.
ALTER TABLE production_bom_lines
  ADD COLUMN IF NOT EXISTS requirement_group TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS selection_mode TEXT NOT NULL DEFAULT 'all_required',
  ADD COLUMN IF NOT EXISTS compatibility_status TEXT NOT NULL DEFAULT 'compatible';

UPDATE production_bom_lines
SET requirement_group = 'legacy-' || id::text
WHERE requirement_group = '';

ALTER TABLE production_bom_lines
  DROP CONSTRAINT IF EXISTS production_bom_selection_mode_check;
ALTER TABLE production_bom_lines
  ADD CONSTRAINT production_bom_selection_mode_check
  CHECK (selection_mode IN ('all_required', 'one_of'));

ALTER TABLE production_bom_lines
  DROP CONSTRAINT IF EXISTS production_bom_compatibility_status_check;
ALTER TABLE production_bom_lines
  ADD CONSTRAINT production_bom_compatibility_status_check
  CHECK (compatibility_status IN ('compatible', 'preferred', 'approved_alternative'));

CREATE INDEX IF NOT EXISTS idx_bom_requirement_group
  ON production_bom_lines (product_item_id, requirement_group) WHERE active;

-- One idempotent seeding primitive. It joins existing canonical master rows and
-- never creates an inventory item or stock movement. Wildcards are used only
-- for known product-family variants (Handwash / Toilet Cleaner / general 5L).
CREATE OR REPLACE FUNCTION pg_temp.seed_packaging_requirement(
  family_pattern TEXT,
  pack_pattern TEXT,
  component_canonical_name TEXT,
  group_key TEXT,
  mode TEXT,
  mapping_note TEXT
) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO production_bom_lines (
    product_item_id, component_item_id, quantity_per_unit, unit,
    wastage_percent, notes, active, requirement_group, selection_mode,
    compatibility_status
  )
  SELECT
    product.id, component.id, 1,
    COALESCE(NULLIF(component.base_unit, ''), NULLIF(component.unit, ''), 'pcs'),
    0, mapping_note, true, group_key, mode, 'compatible'
  FROM inventory_items product
  JOIN brands brand ON brand.id = product.brand_id AND brand.slug = 'glitz-n-glim'
  JOIN inventory_items component
    ON component.brand_id = product.brand_id
   AND component.item_type = 'packaging'
   AND component.is_active
   AND lower(COALESCE(NULLIF(component.canonical_name, ''), component.name)) = lower(component_canonical_name)
  WHERE product.item_type = 'finished_good'
    AND product.is_active
    AND (family_pattern = '*' OR lower(product.product_family) LIKE lower(family_pattern))
    AND lower(product.package_config) LIKE lower(pack_pattern)
  ON CONFLICT (product_item_id, component_item_id) WHERE active
  DO UPDATE SET
    requirement_group = EXCLUDED.requirement_group,
    selection_mode = EXCLUDED.selection_mode,
    compatibility_status = EXCLUDED.compatibility_status,
    notes = CASE
      WHEN production_bom_lines.notes = '' THEN EXCLUDED.notes
      WHEN production_bom_lines.notes ILIKE '%' || EXCLUDED.notes || '%' THEN production_bom_lines.notes
      ELSE production_bom_lines.notes || E'\n' || EXCLUDED.notes
    END;
END $$;

-- Najma's current closure/cork/cap compatibility guidance.
SELECT pg_temp.seed_packaging_requirement('Multi Surface Cleaner', '12x500ml', 'Closure - white triggerpumps', 'closure-trigger-pump', 'all_required', 'Najma compatibility: white trigger pump.');
SELECT pg_temp.seed_packaging_requirement('Glass Cleaner', '12x500ml', 'Closure - white triggerpumps', 'closure-trigger-pump', 'all_required', 'Najma compatibility: white trigger pump.');
SELECT pg_temp.seed_packaging_requirement('Dishwashing Liquid', '12x500ml', 'Closure - cap yellow', 'closure-cap', 'all_required', 'Najma compatibility: yellow cap.');

SELECT pg_temp.seed_packaging_requirement('Fabric Softener', '12x250ml', 'Closure - white caps', 'closure-colour-option', 'one_of', 'Najma compatibility: approved cap-colour option; no preference recorded.');
SELECT pg_temp.seed_packaging_requirement('Fabric Softener', '12x250ml', 'Closure - GREEN CAPS', 'closure-colour-option', 'one_of', 'Najma compatibility: approved cap-colour option; no preference recorded.');
SELECT pg_temp.seed_packaging_requirement('Fabric Softener', '12x250ml', 'Closure - PINK CAPS', 'closure-colour-option', 'one_of', 'Najma compatibility: approved cap-colour option; no preference recorded.');
SELECT pg_temp.seed_packaging_requirement('Shampoo', '12x250ml', 'Closure - white caps', 'closure-colour-option', 'one_of', 'Najma compatibility: approved cap-colour option; no preference recorded.');
SELECT pg_temp.seed_packaging_requirement('Shampoo', '12x250ml', 'Closure - GREEN CAPS', 'closure-colour-option', 'one_of', 'Najma compatibility: approved cap-colour option; no preference recorded.');
SELECT pg_temp.seed_packaging_requirement('Shampoo', '12x250ml', 'Closure - PINK CAPS', 'closure-colour-option', 'one_of', 'Najma compatibility: approved cap-colour option; no preference recorded.');

SELECT pg_temp.seed_packaging_requirement('Fabric Softener', '12x500ml', 'Closure - white caps', 'closure-cap', 'all_required', 'Najma compatibility: white cap.');
SELECT pg_temp.seed_packaging_requirement('Shampoo', '12x500ml', 'Closure - white caps', 'closure-cap', 'all_required', 'Najma compatibility: white cap.');
SELECT pg_temp.seed_packaging_requirement('Fabric Softener', '6x1ltr', 'Closure - white caps', 'closure-cap', 'all_required', 'Najma compatibility: white cap required.');
SELECT pg_temp.seed_packaging_requirement('Fabric Softener', '6x1ltr', 'Closure - inserters', 'closure-inserter', 'all_required', 'Najma compatibility: inserter required in addition to cap.');
SELECT pg_temp.seed_packaging_requirement('Fabric Softener', '6x2ltrs', 'Closure - white caps', 'closure-cap', 'all_required', 'Najma compatibility: white cap required.');
SELECT pg_temp.seed_packaging_requirement('Fabric Softener', '6x2ltrs', 'Closure - inserters', 'closure-inserter', 'all_required', 'Najma compatibility: inserter required in addition to cap.');

SELECT pg_temp.seed_packaging_requirement('Handwash%', '12x500ml', 'Closure - white pumps', 'closure-pump', 'all_required', 'Najma compatibility: white pump.');
SELECT pg_temp.seed_packaging_requirement('Toilet Cleaner%', '12x500ml', 'Closure - red caps & inserters', 'closure-cap-inserter-set', 'all_required', 'Najma compatibility: imported stock pool combines the required red cap and inserter; controlled master split still to be confirmed.');
SELECT pg_temp.seed_packaging_requirement('Toilet Cleaner%', '12x750ml', 'Closure - red caps & inserters', 'closure-cap-inserter-set', 'all_required', 'Najma compatibility: imported stock pool combines the required red cap and inserter; controlled master split still to be confirmed.');

SELECT pg_temp.seed_packaging_requirement('Bleach', '48x70ml', 'Closure - blue corks', 'closure-blue-cork-consolidated', 'all_required', 'Najma compatibility: blue cork. Opening stock is a consolidated 1,660-piece pool pending controlled physical-spec reconciliation.');
SELECT pg_temp.seed_packaging_requirement('Bleach', '12x250ml', 'Closure - blue corks', 'closure-blue-cork-consolidated', 'all_required', 'Najma compatibility: blue cork. Opening stock is a consolidated 1,660-piece pool pending controlled physical-spec reconciliation.');
SELECT pg_temp.seed_packaging_requirement('Bleach', '12x500ml', 'Closure - blue corks', 'closure-blue-cork-consolidated', 'all_required', 'Najma compatibility: blue cork. Opening stock is a consolidated 1,660-piece pool pending controlled physical-spec reconciliation.');
SELECT pg_temp.seed_packaging_requirement('Bleach', '12x1ltr', 'Closure - blue corks', 'closure-blue-cork-consolidated', 'all_required', 'Najma compatibility: blue cork. Opening stock is a consolidated 1,660-piece pool pending controlled physical-spec reconciliation.');

SELECT pg_temp.seed_packaging_requirement('Shower Gel', '12x400ml', 'Closure - white caps', 'closure-cap', 'all_required', 'Najma compatibility: white cap.');
SELECT pg_temp.seed_packaging_requirement('Shower Gel', '12x750ml', 'Closure - white caps', 'closure-cap', 'all_required', 'Najma compatibility: white cap.');
SELECT pg_temp.seed_packaging_requirement('Multipurpose Cleaner', '12x500ml', 'Closure - light green caps', 'closure-green-option', 'one_of', 'Najma compatibility: compatible green-cap option; no preference recorded.');
SELECT pg_temp.seed_packaging_requirement('Multipurpose Cleaner', '12x500ml', 'Closure - dark green caps', 'closure-green-option', 'one_of', 'Najma compatibility: compatible green-cap option; no preference recorded.');
SELECT pg_temp.seed_packaging_requirement('Multipurpose Cleaner', '12x1ltr', 'Closure - light green caps', 'closure-green-option', 'one_of', 'Najma compatibility: compatible green-cap option; no preference recorded.');
SELECT pg_temp.seed_packaging_requirement('Multipurpose Cleaner', '12x1ltr', 'Closure - dark green caps', 'closure-green-option', 'one_of', 'Najma compatibility: compatible green-cap option; no preference recorded.');

-- Exact canonical source mapping: 112x65ml Gel uses black flip top. A 30ml
-- bottle exists but no 30ml Finished Good exists, so no product is fabricated.
SELECT pg_temp.seed_packaging_requirement('Hand Sanitizer Gel', '112x65ml', 'Closure - FLIP TOP BLACK', 'closure-flip-top', 'all_required', 'Existing cork master: 112x65ml Hand Sanitizer Gel uses black flip top.');

-- General container corks are shared physical stock pools.
SELECT pg_temp.seed_packaging_requirement('*', '1x5ltrs', 'Closure - 5L BOTTLES - corks', 'closure-5l-cork', 'all_required', 'Najma compatibility: shared 5L bottle cork.');
SELECT pg_temp.seed_packaging_requirement('*', '1x20ltr%', 'Closure - 20LTR BOTTLES - corks', 'closure-20l-cork', 'all_required', 'Najma compatibility: shared 20L bottle cork.');
SELECT pg_temp.seed_packaging_requirement('*', '1x20lr%', 'Closure - 20LTR BOTTLES - corks', 'closure-20l-cork', 'all_required', 'Najma compatibility: shared 20L bottle cork.');

-- Front and Back labels are two independent all_required components, joined by
-- structured product_family + package_config. Spelling mismatches remain in the
-- diagnostic rather than being guessed into a relationship.
INSERT INTO production_bom_lines (
  product_item_id, component_item_id, quantity_per_unit, unit,
  wastage_percent, notes, active, requirement_group, selection_mode,
  compatibility_status
)
SELECT
  product.id, label.id, 1,
  COALESCE(NULLIF(label.base_unit, ''), NULLIF(label.unit, ''), 'pcs'),
  0, 'Matched from canonical product_family and package_config.', true,
  CASE label.packaging_role WHEN 'front_label' THEN 'front-label' ELSE 'back-label' END,
  'all_required', 'compatible'
FROM inventory_items product
JOIN brands brand ON brand.id = product.brand_id AND brand.slug = 'glitz-n-glim'
JOIN inventory_items label
  ON label.brand_id = product.brand_id
 AND label.item_type = 'packaging'
 AND label.is_active
 AND label.packaging_role IN ('front_label', 'back_label')
 AND lower(label.product_family) = lower(product.product_family)
 AND lower(label.package_config) = lower(product.package_config)
WHERE product.item_type = 'finished_good'
  AND product.is_active
ON CONFLICT (product_item_id, component_item_id) WHERE active
DO UPDATE SET
  requirement_group = EXCLUDED.requirement_group,
  selection_mode = 'all_required',
  compatibility_status = EXCLUDED.compatibility_status;

-- Bottle relationships with unambiguous canonical identities. The imported
-- bottle rows do not yet carry product_family metadata, so this one-time master
-- mapping uses exact component canonical names; runtime UI never parses names.
SELECT pg_temp.seed_packaging_requirement('Multi Surface Cleaner', '12x500ml', 'Bottle - Multi Surface Cleaner & glass cleaner - 12x500ml', 'bottle', 'all_required', 'Shared 500ml bottle.');
SELECT pg_temp.seed_packaging_requirement('Glass Cleaner', '12x500ml', 'Bottle - Multi Surface Cleaner & glass cleaner - 12x500ml', 'bottle', 'all_required', 'Shared 500ml bottle.');
SELECT pg_temp.seed_packaging_requirement('Dishwashing Liquid', '12x500ml', 'Bottle - Dishwashing Liquid - 12x500ml', 'bottle', 'all_required', 'Canonical bottle compatibility.');
SELECT pg_temp.seed_packaging_requirement('Fabric Softener', '12x250ml', 'Bottle - Fabric Softener& shampoo- 12x250ml', 'bottle', 'all_required', 'Shared 250ml bottle.');
SELECT pg_temp.seed_packaging_requirement('Shampoo', '12x250ml', 'Bottle - Fabric Softener& shampoo- 12x250ml', 'bottle', 'all_required', 'Shared 250ml bottle.');
SELECT pg_temp.seed_packaging_requirement('Shampoo', '12x500ml', 'Bottle - Shaampoo 500ml', 'bottle', 'all_required', 'Canonical source spelling retained; mapped to Shampoo 12x500ml.');
SELECT pg_temp.seed_packaging_requirement('Fabric Softener', '12x500ml', 'Bottle - Fabric Softener 12x500ml', 'bottle', 'all_required', 'Canonical bottle compatibility.');
SELECT pg_temp.seed_packaging_requirement('Fabric Softener', '6x1ltr', 'Bottle - Fabric Softener - 6x1ltr', 'bottle', 'all_required', 'Canonical bottle compatibility.');
SELECT pg_temp.seed_packaging_requirement('Fabric Softener', '6x2ltrs', 'Bottle - Fabric Softener - 6x2ltrs', 'bottle', 'all_required', 'Canonical bottle compatibility.');
SELECT pg_temp.seed_packaging_requirement('Handwash%', '12x500ml', 'Bottle - Handwash - 12x500ml', 'bottle', 'all_required', 'Shared Handwash bottle.');
SELECT pg_temp.seed_packaging_requirement('Toilet Cleaner%', '12x500ml', 'Bottle - Toilet Cleaner - 12x500ml', 'bottle', 'all_required', 'Shared Toilet Cleaner bottle.');
SELECT pg_temp.seed_packaging_requirement('Toilet Cleaner%', '12x750ml', 'Bottle - Toilet Cleaner - 12x750ml', 'bottle', 'all_required', 'Shared Toilet Cleaner bottle.');
SELECT pg_temp.seed_packaging_requirement('Bleach', '48x70ml', 'Bottle - Bleach - 48x70ml', 'bottle', 'all_required', 'Canonical bottle compatibility.');
SELECT pg_temp.seed_packaging_requirement('Bleach', '12x250ml', 'Bottle - Bleach - 12x250ml', 'bottle', 'all_required', 'Canonical bottle compatibility.');
SELECT pg_temp.seed_packaging_requirement('Bleach', '12x500ml', 'Bottle - Bleach - 12x500ml', 'bottle', 'all_required', 'Canonical bottle compatibility.');
SELECT pg_temp.seed_packaging_requirement('Bleach', '12x1ltr', 'Bottle - Bleach - 12x1ltr', 'bottle', 'all_required', 'Canonical bottle compatibility.');
SELECT pg_temp.seed_packaging_requirement('Shower Gel', '12x400ml', 'Bottle - Shower Gel - 12x400ml', 'bottle', 'all_required', 'Canonical bottle compatibility.');
SELECT pg_temp.seed_packaging_requirement('Shower Gel', '12x750ml', 'Bottle - Shower Gel - 12x750ml', 'bottle', 'all_required', 'Canonical bottle compatibility.');
SELECT pg_temp.seed_packaging_requirement('Multipurpose Cleaner', '12x500ml', 'Bottle - Multipurpose Cleaner - 12x500ml new', 'bottle', 'all_required', 'Canonical bottle compatibility.');
SELECT pg_temp.seed_packaging_requirement('Multipurpose Cleaner', '12x1ltr', 'Bottle - Multipurpose Cleaner - 12x1ltr', 'bottle', 'all_required', 'Canonical bottle compatibility.');
SELECT pg_temp.seed_packaging_requirement('Hand Sanitizer Gel', '112x65ml', 'Bottle - Hand Sanitizer Gel - 112x65ml', 'bottle', 'all_required', 'Exact existing Finished Good only.');
SELECT pg_temp.seed_packaging_requirement('Hand Sanitizer Gel', '12x500ml', 'Bottle - Hand Sanitizer Gel - 12x500ml', 'bottle', 'all_required', 'Exact existing Finished Good only.');
SELECT pg_temp.seed_packaging_requirement('*', '1x5ltrs', 'Bottle - 5L BOTTLES', 'bottle', 'all_required', 'Shared general 5L bottle.');
SELECT pg_temp.seed_packaging_requirement('*', '1x20ltr%', 'Bottle - 20LTR BOTTLES', 'bottle', 'all_required', 'Shared general 20L bottle.');
SELECT pg_temp.seed_packaging_requirement('*', '1x20lr%', 'Bottle - 20LTR BOTTLES', 'bottle', 'all_required', 'Shared general 20L bottle.');

-- ─── 4. EXECUTABLE VERIFICATION ────────────────────────────────────────────
DO $$
DECLARE
  bad_pack_count INTEGER;
  bad_single_count INTEGER;
BEGIN
  SELECT count(*) INTO bad_pack_count
  FROM inventory_items i
  JOIN brands b ON b.id = i.brand_id
  WHERE b.slug = 'glitz-n-glim'
    AND i.is_active
    AND i.item_type = 'finished_good'
    AND i.package_config ~ '^[[:space:]]*[0-9]+[[:space:]]*[xX×]'
    AND i.package_config !~* '^[[:space:]]*4[[:space:]]*[xX×][[:space:]]*5[[:space:]]*l'
    AND i.pack_size <> substring(i.package_config FROM '^[[:space:]]*([0-9]+)[[:space:]]*[xX×]')::numeric;
  IF bad_pack_count > 0 THEN
    RAISE EXCEPTION 'Pack-size verification failed for % active Glitz Finished Goods', bad_pack_count;
  END IF;

  SELECT count(*) INTO bad_single_count
  FROM inventory_items i
  JOIN brands b ON b.id = i.brand_id
  WHERE b.slug = 'glitz-n-glim'
    AND i.is_active
    AND i.item_type = 'finished_good'
    AND i.package_config ~* '^1[[:space:]]*[xX×][[:space:]]*(5|20)[[:space:]]*l'
    AND i.pack_size <> 1;
  IF bad_single_count > 0 THEN
    RAISE EXCEPTION '1x5L/1x20L verification failed for % Finished Goods', bad_single_count;
  END IF;
END $$;

-- Useful post-migration diagnostic queries (read-only):
-- SELECT product_family, package_config, pack_size FROM inventory_items
--  WHERE item_type = 'finished_good' AND is_active ORDER BY product_family, package_config;
-- SELECT category, packaging_role, count(*), sum(quantity) FROM inventory_items
--  WHERE item_type = 'packaging' GROUP BY category, packaging_role ORDER BY category, packaging_role;

COMMIT;
