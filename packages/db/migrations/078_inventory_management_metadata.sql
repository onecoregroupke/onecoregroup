-- Migration 078: inventory display metadata and price-write idempotency.
--
-- Reference configuration only. No barcode values, stock quantities, document
-- history or opening balances are inserted or changed.
-- Apply manually in the Supabase SQL editor after review.

BEGIN;

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS display_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS size_ml INTEGER,
  ADD COLUMN IF NOT EXISTS packaging_component TEXT NOT NULL DEFAULT '';

ALTER TABLE inventory_items DROP CONSTRAINT IF EXISTS inventory_items_size_ml_check;
ALTER TABLE inventory_items ADD CONSTRAINT inventory_items_size_ml_check
  CHECK (size_ml IS NULL OR size_ml > 0) NOT VALID;
ALTER TABLE inventory_items DROP CONSTRAINT IF EXISTS inventory_items_packaging_component_check;
ALTER TABLE inventory_items ADD CONSTRAINT inventory_items_packaging_component_check
  CHECK (packaging_component IN (
    '','bottle','container','closure','cork','cap','pump','front_sticker','back_sticker','other'
  )) NOT VALID;

CREATE INDEX IF NOT EXISTS idx_inventory_items_management_order
  ON inventory_items (brand_id, item_type, sort_order, size_ml, name);
CREATE INDEX IF NOT EXISTS idx_inventory_items_packaging_navigation
  ON inventory_items (brand_id, product_family, size_ml, packaging_component)
  WHERE item_type='packaging';

CREATE TABLE IF NOT EXISTS inventory_product_family_order (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name  TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  sort_order      INTEGER NOT NULL,
  shared_packaging BOOLEAN NOT NULL DEFAULT false,
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (normalized_name),
  UNIQUE (sort_order)
);

INSERT INTO inventory_product_family_order (canonical_name,normalized_name,sort_order,shared_packaging) VALUES
  ('Multi Surface Cleaner','multi surface cleaner',1,false),
  ('Dishwashing Liquid','dishwashing liquid',2,false),
  ('Fabric Softener','fabric softener',3,false),
  ('Handwash','handwash',4,false),
  ('Toilet Cleaner','toilet cleaner',5,false),
  ('Bleach','bleach',6,false),
  ('Glass Cleaner','glass cleaner',7,false),
  ('Shower Gel','shower gel',8,false),
  ('Multipurpose Cleaner','multipurpose cleaner',9,false),
  ('Shampoo','shampoo',10,false),
  ('Hand Sanitizer Gel','hand sanitizer gel',11,false),
  ('Hand Sanitizer Mist','hand sanitizer mist',12,false),
  ('General / Shared','general shared',13,true)
ON CONFLICT (normalized_name) DO UPDATE SET
  canonical_name=EXCLUDED.canonical_name,
  sort_order=EXCLUDED.sort_order,
  shared_packaging=EXCLUDED.shared_packaging,
  active=true;

ALTER TABLE inventory_price_history
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_price_history_idempotency
  ON inventory_price_history (idempotency_key) WHERE idempotency_key<>'';

CREATE OR REPLACE FUNCTION prevent_append_only_ledger_change()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; post a reversal or correcting event instead', TG_TABLE_NAME;
END $$;
DROP TRIGGER IF EXISTS trg_inventory_price_history_append_only ON inventory_price_history;
CREATE TRIGGER trg_inventory_price_history_append_only BEFORE UPDATE OR DELETE ON inventory_price_history
  FOR EACH ROW EXECUTE FUNCTION prevent_append_only_ledger_change();

CREATE OR REPLACE FUNCTION record_inventory_price(
  p_item_id UUID,
  p_price_type TEXT,
  p_amount_ksh NUMERIC,
  p_effective_date DATE,
  p_supplier_name TEXT DEFAULT '',
  p_source_description TEXT DEFAULT '',
  p_source_reference TEXT DEFAULT '',
  p_notes TEXT DEFAULT '',
  p_created_by TEXT DEFAULT '',
  p_idempotency_key TEXT DEFAULT ''
)
RETURNS inventory_price_history
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item inventory_items%ROWTYPE;
  v_history inventory_price_history%ROWTYPE;
BEGIN
  IF p_price_type NOT IN ('supplier_reference_cost','retail_selling_price','wholesale_selling_price') THEN
    RAISE EXCEPTION 'Unsupported inventory price type';
  END IF;
  IF p_amount_ksh < 0 OR p_effective_date IS NULL THEN
    RAISE EXCEPTION 'Price and effective date are required';
  END IF;

  IF COALESCE(p_idempotency_key, '') <> '' THEN
    SELECT * INTO v_history FROM inventory_price_history WHERE idempotency_key=p_idempotency_key;
    IF FOUND THEN RETURN v_history; END IF;
  END IF;

  SELECT * INTO v_item FROM inventory_items WHERE id=p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inventory item not found'; END IF;

  INSERT INTO inventory_price_history (
    brand_id,inventory_item_id,price_type,amount_ksh,effective_date,
    supplier_name,source_description,source_reference,base_unit,notes,created_by,idempotency_key
  ) VALUES (
    v_item.brand_id,p_item_id,p_price_type,p_amount_ksh,p_effective_date,
    COALESCE(p_supplier_name,''),COALESCE(p_source_description,''),COALESCE(p_source_reference,''),
    COALESCE(NULLIF(v_item.base_unit,''),v_item.unit),COALESCE(p_notes,''),COALESCE(p_created_by,''),COALESCE(p_idempotency_key,'')
  ) RETURNING * INTO v_history;

  UPDATE inventory_items SET
    unit_value_ksh = CASE WHEN p_price_type='supplier_reference_cost' THEN p_amount_ksh ELSE unit_value_ksh END,
    selling_price_ksh = CASE WHEN p_price_type='retail_selling_price' THEN p_amount_ksh ELSE selling_price_ksh END,
    wholesale_price_ksh = CASE WHEN p_price_type='wholesale_selling_price' THEN p_amount_ksh ELSE wholesale_price_ksh END,
    updated_at=now()
  WHERE id=p_item_id;

  RETURN v_history;
EXCEPTION WHEN unique_violation THEN
  IF COALESCE(p_idempotency_key, '') <> '' THEN
    SELECT * INTO v_history FROM inventory_price_history WHERE idempotency_key=p_idempotency_key;
    IF FOUND THEN RETURN v_history; END IF;
  END IF;
  RAISE;
END
$$;
REVOKE ALL ON FUNCTION record_inventory_price(UUID,TEXT,NUMERIC,DATE,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_inventory_price(UUID,TEXT,NUMERIC,DATE,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO service_role;

ALTER TABLE inventory_product_family_order ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inventory_product_family_order_service ON inventory_product_family_order;
CREATE POLICY inventory_product_family_order_service ON inventory_product_family_order
  FOR ALL TO service_role USING (true) WITH CHECK (true);
GRANT ALL ON TABLE inventory_product_family_order TO service_role;

COMMIT;
