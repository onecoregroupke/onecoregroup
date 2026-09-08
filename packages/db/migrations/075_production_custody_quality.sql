-- Migration 075: first-class Production custody, quality incidents and losses.
--
-- SAFETY
--   * additive and idempotent;
--   * does not import or infer any historical GIN, GTN, run, recall, WIP or loss;
--   * does not alter the 1 July opening stock;
--   * legacy inventory/production rows remain readable and unchanged.
--
-- Apply manually in the Supabase SQL editor after review.

BEGIN;

-- size_ml is physical metadata, not a barcode or stock movement. It permits a
-- 56 x 1L recall and a 5 x 20L output to reconcile as the same 100 litres.
ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS size_ml INTEGER;

-- ---------------------------------------------------------------------------
-- 1. Production execution metadata. A run transforms Production custody; it
--    never represents a store movement by itself.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_quality_incidents (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_ref          TEXT NOT NULL,
  incident_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  brand_id              UUID REFERENCES brands(id) ON DELETE SET NULL,
  item_id               UUID REFERENCES inventory_items(id) ON DELETE SET NULL,
  batch_number          TEXT NOT NULL DEFAULT '',
  custody_type          TEXT NOT NULL DEFAULT 'production',
  custody_store_id      UUID REFERENCES inventory_stores(id) ON DELETE SET NULL,
  salesperson_id        UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,
  affected_quantity     NUMERIC(16, 5) NOT NULL DEFAULT 0,
  unit                  TEXT NOT NULL DEFAULT '',
  equivalent_quantity   NUMERIC(16, 5),
  equivalent_unit       TEXT NOT NULL DEFAULT '',
  reason_category       TEXT NOT NULL,
  description           TEXT NOT NULL DEFAULT '',
  evidence              JSONB NOT NULL DEFAULT '[]'::jsonb,
  status                TEXT NOT NULL DEFAULT 'reported',
  disposition           TEXT NOT NULL DEFAULT '',
  disposition_note      TEXT NOT NULL DEFAULT '',
  reported_by           TEXT NOT NULL DEFAULT '',
  reported_by_id        UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,
  reviewed_by           TEXT NOT NULL DEFAULT '',
  reviewed_by_id        UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,
  reviewed_at           TIMESTAMPTZ,
  disposition_approved_by TEXT NOT NULL DEFAULT '',
  disposition_approved_by_id UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,
  disposition_approved_at TIMESTAMPTZ,
  linked_run_id         UUID REFERENCES production_runs(id) ON DELETE SET NULL,
  source_document_type  TEXT NOT NULL DEFAULT '',
  source_document_id    UUID,
  source_allocation_id  UUID REFERENCES field_sales_allocations(id) ON DELETE SET NULL,
  closed_at             TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT inventory_quality_incident_quantity_check CHECK (affected_quantity > 0),
  CONSTRAINT inventory_quality_incident_status_check CHECK (
    status IN ('reported','under_review','disposition_approved','in_progress','resolved','cancelled')
  ),
  CONSTRAINT inventory_quality_incident_disposition_check CHECK (
    disposition IN ('','release','quarantine','return_to_production','rework','repackage','partial_salvage','dispose')
  ),
  CONSTRAINT inventory_quality_incident_custody_check CHECK (
    custody_type IN ('raw_store','packaging_store','production','finished_goods_store','field_sales','quality_hold')
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_quality_incident_ref ON inventory_quality_incidents (incident_ref);
CREATE INDEX IF NOT EXISTS idx_quality_incident_brand_status
  ON inventory_quality_incidents (brand_id, status, incident_at DESC);
CREATE INDEX IF NOT EXISTS idx_quality_incident_item_batch
  ON inventory_quality_incidents (item_id, batch_number, incident_at DESC);

ALTER TABLE production_runs
  ADD COLUMN IF NOT EXISTS run_type TEXT NOT NULL DEFAULT 'normal_production',
  ADD COLUMN IF NOT EXISTS run_reason TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS source_product_item_id UUID REFERENCES inventory_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_batch_number TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS source_custody TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS output_state TEXT NOT NULL DEFAULT 'packaged_output',
  ADD COLUMN IF NOT EXISTS quality_incident_id UUID REFERENCES inventory_quality_incidents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_by TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS reviewed_by_id UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

ALTER TABLE production_runs DROP CONSTRAINT IF EXISTS production_runs_run_type_check;
ALTER TABLE production_runs ADD CONSTRAINT production_runs_run_type_check
  CHECK (run_type IN ('normal_production','rework','repackaging','quality_recovery')) NOT VALID;
ALTER TABLE production_runs DROP CONSTRAINT IF EXISTS production_runs_output_state_check;
ALTER TABLE production_runs ADD CONSTRAINT production_runs_output_state_check
  CHECK (output_state IN ('bulk_wip','packaged_output','quality_hold','rework')) NOT VALID;
CREATE INDEX IF NOT EXISTS idx_production_runs_quality_incident
  ON production_runs (quality_incident_id) WHERE quality_incident_id IS NOT NULL;

ALTER TABLE production_run_materials
  ADD COLUMN IF NOT EXISTS material_role TEXT NOT NULL DEFAULT 'material',
  ADD COLUMN IF NOT EXISTS production_state TEXT NOT NULL DEFAULT 'materials',
  ADD COLUMN IF NOT EXISTS source_custody_event_id UUID,
  ADD COLUMN IF NOT EXISTS consumption_posted_at TIMESTAMPTZ;
ALTER TABLE production_run_materials DROP CONSTRAINT IF EXISTS production_run_material_role_check;
ALTER TABLE production_run_materials ADD CONSTRAINT production_run_material_role_check
  CHECK (material_role IN ('material','packaging','rework_input','additional_wip','recovered_packaging')) NOT VALID;
CREATE UNIQUE INDEX IF NOT EXISTS idx_run_material_source_custody_once
  ON production_run_materials (source_custody_event_id) WHERE source_custody_event_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Append-only Production custody ledger. balance_after is a cross-check;
--    the balance view always replays signed events.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS production_custody_events (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id              UUID REFERENCES brands(id) ON DELETE SET NULL,
  production_store_id   UUID REFERENCES inventory_stores(id) ON DELETE SET NULL,
  item_id               UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  batch_number          TEXT NOT NULL DEFAULT '',
  custody_state         TEXT NOT NULL,
  direction             TEXT NOT NULL,
  event_kind            TEXT NOT NULL,
  quantity              NUMERIC(16, 5) NOT NULL,
  unit                  TEXT NOT NULL,
  base_quantity         NUMERIC(16, 5) NOT NULL,
  base_unit             TEXT NOT NULL,
  equivalent_quantity   NUMERIC(16, 5),
  equivalent_unit       TEXT NOT NULL DEFAULT '',
  balance_after         NUMERIC(16, 5) NOT NULL,
  source_custody        TEXT NOT NULL DEFAULT '',
  destination_custody   TEXT NOT NULL DEFAULT '',
  source_store_id       UUID REFERENCES inventory_stores(id) ON DELETE SET NULL,
  destination_store_id  UUID REFERENCES inventory_stores(id) ON DELETE SET NULL,
  salesperson_id        UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,
  allocation_id         UUID REFERENCES field_sales_allocations(id) ON DELETE SET NULL,
  production_run_id     UUID REFERENCES production_runs(id) ON DELETE SET NULL,
  quality_incident_id   UUID REFERENCES inventory_quality_incidents(id) ON DELETE SET NULL,
  source_document_type  TEXT NOT NULL DEFAULT '',
  source_document_id    UUID,
  source_document_line_id UUID,
  reason                TEXT NOT NULL DEFAULT '',
  effective_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by           TEXT NOT NULL DEFAULT '',
  recorded_by_id        UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,
  approved_by           TEXT NOT NULL DEFAULT '',
  approved_by_id        UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,
  approved_at           TIMESTAMPTZ,
  idempotency_key       TEXT NOT NULL,
  reversal_of_id        UUID REFERENCES production_custody_events(id) ON DELETE SET NULL,
  metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT production_custody_direction_check CHECK (direction IN ('in','out')),
  CONSTRAINT production_custody_quantity_check CHECK (quantity > 0 AND base_quantity > 0),
  CONSTRAINT production_custody_balance_check CHECK (balance_after >= 0),
  CONSTRAINT production_custody_state_check CHECK (
    custody_state IN ('materials','packaging','recovered_packaging','bulk_wip','packaged_output','quality_hold','rework')
  ),
  CONSTRAINT production_custody_kind_check CHECK (
    event_kind IN (
      'gin_receipt','gtn_receipt','gtn_transfer','sales_quality_recall','material_consumption',
      'packaging_consumption','run_output','rework_input','recovered_packaging',
      'state_transfer','return_to_store','waste','disposal','adjustment','reversal'
    )
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_production_custody_idempotency
  ON production_custody_events (idempotency_key);
CREATE INDEX IF NOT EXISTS idx_production_custody_position
  ON production_custody_events (
    brand_id, production_store_id, item_id, batch_number, custody_state, effective_at, created_at
  );
CREATE INDEX IF NOT EXISTS idx_production_custody_run
  ON production_custody_events (production_run_id, effective_at) WHERE production_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_production_custody_incident
  ON production_custody_events (quality_incident_id, effective_at) WHERE quality_incident_id IS NOT NULL;

-- The cross-ledger pointer is needed by the atomic transfer RPC below. Define
-- it before the function so a freshly applied migration can validate the
-- function body without depending on deferred statement preparation.
ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS production_custody_event_id UUID REFERENCES production_custody_events(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_movement_production_custody
  ON inventory_movements (production_custody_event_id) WHERE production_custody_event_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'production_run_material_source_event_fk') THEN
    ALTER TABLE production_run_materials
      ADD CONSTRAINT production_run_material_source_event_fk
      FOREIGN KEY (source_custody_event_id) REFERENCES production_custody_events(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION post_production_custody_event(
  p_brand_id UUID,
  p_production_store_id UUID,
  p_item_id UUID,
  p_batch_number TEXT,
  p_custody_state TEXT,
  p_direction TEXT,
  p_event_kind TEXT,
  p_quantity NUMERIC,
  p_unit TEXT,
  p_base_quantity NUMERIC,
  p_base_unit TEXT,
  p_equivalent_quantity NUMERIC,
  p_equivalent_unit TEXT,
  p_source_custody TEXT,
  p_destination_custody TEXT,
  p_source_store_id UUID,
  p_destination_store_id UUID,
  p_salesperson_id UUID,
  p_allocation_id UUID,
  p_production_run_id UUID,
  p_quality_incident_id UUID,
  p_source_document_type TEXT,
  p_source_document_id UUID,
  p_source_document_line_id UUID,
  p_reason TEXT,
  p_effective_at TIMESTAMPTZ,
  p_recorded_by TEXT,
  p_recorded_by_id UUID,
  p_approved_by TEXT,
  p_approved_by_id UUID,
  p_idempotency_key TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS production_custody_events
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  existing production_custody_events;
  custody_item inventory_items;
  custody_store inventory_stores;
  current_balance NUMERIC(16, 5);
  next_balance NUMERIC(16, 5);
  posted production_custody_events;
  lock_key TEXT;
BEGIN
  IF COALESCE(p_idempotency_key, '') = '' THEN
    RAISE EXCEPTION 'A Production custody idempotency key is required';
  END IF;
  SELECT * INTO existing FROM production_custody_events WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN RETURN existing; END IF;
  IF p_direction NOT IN ('in','out') OR COALESCE(p_base_quantity, 0) <= 0 THEN
    RAISE EXCEPTION 'Production custody quantity must be positive and direction must be in/out';
  END IF;
  SELECT * INTO custody_item FROM inventory_items WHERE id=p_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inventory item not found'; END IF;
  IF custody_item.brand_id IS DISTINCT FROM p_brand_id THEN
    RAISE EXCEPTION 'Production custody brand does not match the inventory item';
  END IF;
  SELECT * INTO custody_store FROM inventory_stores WHERE id=p_production_store_id AND active=true;
  IF NOT FOUND OR custody_store.store_type<>'production' THEN
    RAISE EXCEPTION 'An active Production store is required';
  END IF;
  IF custody_store.brand_id IS NOT NULL AND custody_store.brand_id IS DISTINCT FROM custody_item.brand_id THEN
    RAISE EXCEPTION 'The Production store and inventory item belong to different brands';
  END IF;

  lock_key := concat_ws(':', p_production_store_id::text, p_item_id::text,
    COALESCE(p_batch_number,''), p_custody_state);
  PERFORM pg_advisory_xact_lock(hashtextextended(lock_key, 0));

  SELECT COALESCE(SUM(CASE WHEN direction = 'in' THEN base_quantity ELSE -base_quantity END), 0)
    INTO current_balance
    FROM production_custody_events
   WHERE item_id = p_item_id
     AND COALESCE(production_store_id, '00000000-0000-0000-0000-000000000000'::uuid)
         = COALESCE(p_production_store_id, '00000000-0000-0000-0000-000000000000'::uuid)
     AND batch_number = COALESCE(p_batch_number, '')
     AND custody_state = p_custody_state;

  next_balance := current_balance + CASE WHEN p_direction = 'in' THEN p_base_quantity ELSE -p_base_quantity END;
  IF next_balance < -0.00001 THEN
    RAISE EXCEPTION 'Insufficient Production custody: available %, requested %', current_balance, p_base_quantity;
  END IF;
  IF abs(next_balance) < 0.00001 THEN next_balance := 0; END IF;

  INSERT INTO production_custody_events (
    brand_id, production_store_id, item_id, batch_number, custody_state, direction, event_kind,
    quantity, unit, base_quantity, base_unit, equivalent_quantity, equivalent_unit, balance_after,
    source_custody, destination_custody, source_store_id, destination_store_id, salesperson_id,
    allocation_id, production_run_id, quality_incident_id, source_document_type, source_document_id,
    source_document_line_id, reason, effective_at, recorded_by, recorded_by_id, approved_by,
    approved_by_id, approved_at, idempotency_key, metadata
  ) VALUES (
    p_brand_id, p_production_store_id, p_item_id, COALESCE(p_batch_number,''), p_custody_state,
    p_direction, p_event_kind, p_quantity, p_unit, p_base_quantity, p_base_unit,
    p_equivalent_quantity, COALESCE(p_equivalent_unit,''), next_balance,
    COALESCE(p_source_custody,''), COALESCE(p_destination_custody,''), p_source_store_id,
    p_destination_store_id, p_salesperson_id, p_allocation_id, p_production_run_id,
    p_quality_incident_id, COALESCE(p_source_document_type,''), p_source_document_id,
    p_source_document_line_id, COALESCE(p_reason,''), COALESCE(p_effective_at, now()),
    COALESCE(p_recorded_by,''), p_recorded_by_id, COALESCE(p_approved_by,''), p_approved_by_id,
    CASE WHEN COALESCE(p_approved_by,'') <> '' OR p_approved_by_id IS NOT NULL THEN now() ELSE NULL END,
    p_idempotency_key, COALESCE(p_metadata, '{}'::jsonb)
  ) RETURNING * INTO posted;
  RETURN posted;
END $$;
REVOKE ALL ON FUNCTION post_production_custody_event(
  UUID,UUID,UUID,TEXT,TEXT,TEXT,TEXT,NUMERIC,TEXT,NUMERIC,TEXT,NUMERIC,TEXT,TEXT,TEXT,
  UUID,UUID,UUID,UUID,UUID,UUID,TEXT,UUID,UUID,TEXT,TIMESTAMPTZ,TEXT,UUID,TEXT,UUID,TEXT,JSONB
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION post_production_custody_event(
  UUID,UUID,UUID,TEXT,TEXT,TEXT,TEXT,NUMERIC,TEXT,NUMERIC,TEXT,NUMERIC,TEXT,TEXT,TEXT,
  UUID,UUID,UUID,UUID,UUID,UUID,TEXT,UUID,UUID,TEXT,TIMESTAMPTZ,TEXT,UUID,TEXT,UUID,TEXT,JSONB
) TO service_role;

-- Atomically post the one store leg and the one Production leg of a GIN/GTN.
-- There is deliberately no inventory movement for the Production side: its
-- authoritative position is production_custody_events.
CREATE OR REPLACE FUNCTION post_store_production_transfer(
  p_item_id UUID,
  p_store_id UUID,
  p_store_direction TEXT,
  p_quantity NUMERIC,
  p_movement_unit TEXT,
  p_conversion_rate NUMERIC,
  p_base_quantity NUMERIC,
  p_effective_at TIMESTAMPTZ,
  p_reason TEXT,
  p_reference TEXT,
  p_source TEXT,
  p_goods_issue_id UUID,
  p_issue_item_id UUID,
  p_production_run_id UUID,
  p_batch_number TEXT,
  p_production_store_id UUID,
  p_production_state TEXT,
  p_production_direction TEXT,
  p_production_event_kind TEXT,
  p_source_custody TEXT,
  p_destination_custody TEXT,
  p_quality_incident_id UUID,
  p_recorded_by TEXT,
  p_recorded_by_id UUID,
  p_idempotency_key TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  item inventory_items;
  store inventory_stores;
  production_store inventory_stores;
  linked_run production_runs;
  existing inventory_movements;
  store_balance NUMERIC(16,5);
  next_store_total NUMERIC(16,5);
  movement inventory_movements;
  custody_event production_custody_events;
  linked_material production_run_materials;
  remaining_return NUMERIC(16,5);
  take_quantity NUMERIC(16,5);
BEGIN
  IF COALESCE(p_idempotency_key,'')='' THEN
    RAISE EXCEPTION 'A Store/Production transfer idempotency key is required';
  END IF;
  SELECT * INTO existing FROM inventory_movements
   WHERE idempotency_key = 'store-production-store:' || p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object('inventory_movement_id', existing.id,
      'production_event_id', existing.production_custody_event_id);
  END IF;
  IF p_store_direction NOT IN ('in','out') OR p_production_direction NOT IN ('in','out')
     OR p_store_direction = p_production_direction THEN
    RAISE EXCEPTION 'Store and Production directions must be opposite';
  END IF;
  IF COALESCE(p_base_quantity,0) <= 0 OR COALESCE(p_quantity,0) <= 0 THEN
    RAISE EXCEPTION 'Transfer quantity must be positive';
  END IF;
  SELECT * INTO item FROM inventory_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inventory item not found'; END IF;
  SELECT * INTO store FROM inventory_stores WHERE id=p_store_id AND active=true;
  IF NOT FOUND OR store.store_type IN ('production','field_sales') THEN
    RAISE EXCEPTION 'The store side must be an active physical Store, not Production or Field Sales';
  END IF;
  SELECT * INTO production_store FROM inventory_stores WHERE id=p_production_store_id AND active=true;
  IF NOT FOUND OR production_store.store_type<>'production' THEN
    RAISE EXCEPTION 'An active Production store is required';
  END IF;
  IF (store.brand_id IS NOT NULL AND store.brand_id IS DISTINCT FROM item.brand_id)
     OR (production_store.brand_id IS NOT NULL AND production_store.brand_id IS DISTINCT FROM item.brand_id) THEN
    RAISE EXCEPTION 'The item, Store and Production store must belong to the same brand';
  END IF;
  IF p_production_run_id IS NOT NULL THEN
    SELECT * INTO linked_run FROM production_runs WHERE id=p_production_run_id FOR UPDATE;
    IF NOT FOUND OR linked_run.brand_id IS DISTINCT FROM item.brand_id THEN
      RAISE EXCEPTION 'The linked Production run was not found in this item brand';
    END IF;
    IF p_production_event_kind='gtn_receipt'
       AND linked_run.run_type NOT IN ('rework','repackaging','quality_recovery') THEN
      RAISE EXCEPTION 'Finished Goods may enter Production only on a rework/repackaging/recovery run';
    END IF;
    IF p_production_event_kind='gtn_receipt' AND linked_run.source_product_item_id IS DISTINCT FROM item.id THEN
      RAISE EXCEPTION 'The incoming rework SKU does not match the linked run source product';
    END IF;
    IF p_production_event_kind='gtn_transfer'
       AND (linked_run.quality_approved_at IS NULL OR COALESCE(linked_run.quality_approved_by,'')='') THEN
      RAISE EXCEPTION 'Quality approval is required before output transfers to Finished Goods';
    END IF;
    IF p_production_event_kind='gtn_transfer' AND linked_run.product_item_id IS DISTINCT FROM item.id THEN
      RAISE EXCEPTION 'The outgoing SKU does not match the linked run output product';
    END IF;
  END IF;
  IF p_source='goods_issue' AND (p_store_direction<>'out' OR store.store_type NOT IN ('raw','packaging','general')) THEN
    RAISE EXCEPTION 'A production GIN must issue from a Raw or Packaging Store';
  END IF;
  IF p_source='goods_transfer' AND p_store_direction='out' AND store.store_type<>'finished_goods' THEN
    RAISE EXCEPTION 'A Store to Production GTN must originate in Finished Goods';
  END IF;
  IF p_source='goods_transfer' AND p_store_direction='in'
     AND store.store_type NOT IN ('raw','packaging','finished_goods','general') THEN
    RAISE EXCEPTION 'This Production to Store GTN destination is not supported';
  END IF;

  IF p_store_direction = 'out' THEN
    SELECT COALESCE(SUM(CASE WHEN direction='in' THEN base_quantity ELSE -base_quantity END),0)
      INTO store_balance FROM inventory_movements
     WHERE item_id=p_item_id AND store_id=p_store_id
       AND (batch_number=COALESCE(p_batch_number,'') OR COALESCE(p_batch_number,'')='');
    IF store_balance + 0.00001 < p_base_quantity THEN
      RAISE EXCEPTION 'Insufficient stock in the selected store: available %, requested %', store_balance, p_base_quantity;
    END IF;
  END IF;

  next_store_total := item.quantity + CASE WHEN p_store_direction='in' THEN p_base_quantity ELSE -p_base_quantity END;
  IF next_store_total < -0.00001 THEN
    RAISE EXCEPTION 'The store-total balance would become negative';
  END IF;
  IF abs(next_store_total)<0.00001 THEN next_store_total:=0; END IF;

  custody_event := post_production_custody_event(
    item.brand_id, p_production_store_id, p_item_id, COALESCE(p_batch_number,''), p_production_state,
    p_production_direction, p_production_event_kind, p_quantity, p_movement_unit,
    p_base_quantity, COALESCE(NULLIF(item.base_unit,''),NULLIF(item.unit,''),p_movement_unit),
    CASE WHEN COALESCE(item.size_ml,0)>0 THEN p_base_quantity*item.size_ml/1000 ELSE NULL END,
    CASE WHEN COALESCE(item.size_ml,0)>0 THEN 'litres' ELSE '' END,
    p_source_custody, p_destination_custody,
    CASE WHEN p_store_direction='out' THEN p_store_id ELSE NULL END,
    CASE WHEN p_store_direction='in' THEN p_store_id ELSE NULL END,
    NULL, NULL, p_production_run_id, p_quality_incident_id,
    CASE WHEN p_source='goods_issue' THEN 'GIN' ELSE 'GTN' END,
    p_goods_issue_id, p_issue_item_id, p_reason, p_effective_at,
    p_recorded_by, p_recorded_by_id, '', NULL,
    'store-production-production:' || p_idempotency_key,
    jsonb_build_object('reference',p_reference)
  );

  INSERT INTO inventory_movements (
    item_id,brand_id,direction,quantity,movement_unit,conversion_rate,base_quantity,
    effective_at,unit_value_ksh,movement_date,reason,reference,source,idempotency_key,
    goods_issue_id,issue_item_id,production_run_id,batch_number,store_id,quantity_after,
    production_custody_event_id,recorded_by
  ) VALUES (
    item.id,item.brand_id,p_store_direction,p_quantity,p_movement_unit,p_conversion_rate,p_base_quantity,
    COALESCE(p_effective_at,now()),item.unit_value_ksh,
    (COALESCE(p_effective_at,now()) AT TIME ZONE 'Africa/Nairobi')::date,
    COALESCE(p_reason,''),COALESCE(p_reference,''),COALESCE(p_source,''),
    'store-production-store:' || p_idempotency_key,p_goods_issue_id,p_issue_item_id,
    p_production_run_id,COALESCE(p_batch_number,''),p_store_id,next_store_total,
    custody_event.id,COALESCE(p_recorded_by,'')
  ) RETURNING * INTO movement;

  IF p_production_event_kind='gin_receipt' AND p_production_run_id IS NOT NULL THEN
    INSERT INTO production_run_materials (
      run_id,item_id,goods_issue_id,issue_item_id,expected_quantity,issued_quantity,
      unit,material_role,production_state,source_custody_event_id,notes
    ) VALUES (
      p_production_run_id,item.id,p_goods_issue_id,p_issue_item_id,
      COALESCE((SELECT SUM(b.quantity_per_unit*linked_run.planned_quantity*(1+COALESCE(b.wastage_percent,0)/100))
                  FROM production_bom_lines b
                 WHERE b.product_item_id=linked_run.product_item_id AND b.component_item_id=item.id AND b.active=true),0),
      p_base_quantity,COALESCE(NULLIF(item.base_unit,''),NULLIF(item.unit,''),p_movement_unit),
      CASE WHEN item.item_type='packaging' THEN 'packaging' ELSE 'material' END,
      CASE WHEN item.item_type='packaging' THEN 'packaging' ELSE 'materials' END,
      custody_event.id,'Posted from '||COALESCE(p_reference,'GIN')
    ) ON CONFLICT (source_custody_event_id) WHERE source_custody_event_id IS NOT NULL DO NOTHING;
  END IF;

  IF p_production_event_kind='gtn_receipt' AND p_production_run_id IS NOT NULL THEN
    INSERT INTO production_run_materials (
      run_id,item_id,goods_issue_id,issue_item_id,expected_quantity,issued_quantity,
      unit,material_role,production_state,source_custody_event_id,notes
    ) VALUES (
      p_production_run_id,item.id,p_goods_issue_id,p_issue_item_id,0,p_base_quantity,
      COALESCE(NULLIF(item.base_unit,''),NULLIF(item.unit,''),p_movement_unit),'rework_input','rework',custody_event.id,
      'Rework input received on '||COALESCE(p_reference,'GTN')
    ) ON CONFLICT (source_custody_event_id) WHERE source_custody_event_id IS NOT NULL DO NOTHING;
  END IF;

  IF p_production_event_kind='return_to_store' AND p_production_run_id IS NOT NULL THEN
    remaining_return := p_base_quantity;
    FOR linked_material IN
      SELECT * FROM production_run_materials
       WHERE run_id=p_production_run_id AND item_id=item.id
       ORDER BY created_at,id FOR UPDATE
    LOOP
      take_quantity := LEAST(remaining_return,
        GREATEST(linked_material.issued_quantity-linked_material.consumed_quantity-linked_material.waste_quantity-linked_material.returned_quantity,0));
      IF take_quantity>0 THEN
        UPDATE production_run_materials
           SET returned_quantity=returned_quantity+take_quantity
         WHERE id=linked_material.id;
        remaining_return := remaining_return-take_quantity;
      END IF;
      EXIT WHEN remaining_return<=0.00001;
    END LOOP;
    IF remaining_return>0.00001 THEN
      RAISE EXCEPTION 'Return exceeds material remaining on the linked Production run';
    END IF;
  END IF;

  UPDATE inventory_items SET quantity=next_store_total,updated_at=now() WHERE id=item.id;
  RETURN jsonb_build_object('inventory_movement_id',movement.id,'production_event_id',custody_event.id);
END $$;
REVOKE ALL ON FUNCTION post_store_production_transfer(
  UUID,UUID,TEXT,NUMERIC,TEXT,NUMERIC,NUMERIC,TIMESTAMPTZ,TEXT,TEXT,TEXT,UUID,UUID,UUID,TEXT,
  UUID,TEXT,TEXT,TEXT,TEXT,TEXT,UUID,TEXT,UUID,TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION post_store_production_transfer(
  UUID,UUID,TEXT,NUMERIC,TEXT,NUMERIC,NUMERIC,TIMESTAMPTZ,TEXT,TEXT,TEXT,UUID,UUID,UUID,TEXT,
  UUID,TEXT,TEXT,TEXT,TEXT,TEXT,UUID,TEXT,UUID,TEXT
) TO service_role;

CREATE OR REPLACE VIEW production_custody_balances AS
SELECT
  e.brand_id, e.production_store_id, e.item_id, i.name AS item_name, i.sku,
  e.batch_number, e.custody_state, i.base_unit AS unit,
  SUM(CASE WHEN e.direction = 'in' THEN e.base_quantity ELSE -e.base_quantity END) AS quantity,
  SUM(CASE WHEN e.direction = 'in' THEN COALESCE(e.equivalent_quantity,0)
           ELSE -COALESCE(e.equivalent_quantity,0) END) AS equivalent_quantity,
  MAX(NULLIF(e.equivalent_unit,'')) AS equivalent_unit,
  MIN(e.effective_at) FILTER (WHERE e.direction = 'in') AS first_received_at,
  MAX(e.effective_at) AS last_event_at,
  -- "latest" means the value carried by the most recent event, not the largest
  -- value. MAX() has no uuid aggregate anyway, and on text it would return the
  -- alphabetically last document type rather than the current one.
  (array_agg(e.production_run_id ORDER BY e.effective_at DESC)
     FILTER (WHERE e.production_run_id IS NOT NULL))[1] AS latest_run_id,
  (array_agg(e.source_document_type ORDER BY e.effective_at DESC)
     FILTER (WHERE e.source_document_type <> ''))[1] AS latest_source_document_type,
  (array_agg(e.source_document_id ORDER BY e.effective_at DESC)
     FILTER (WHERE e.source_document_id IS NOT NULL))[1] AS latest_source_document_id
FROM production_custody_events e
JOIN inventory_items i ON i.id = e.item_id
GROUP BY e.brand_id, e.production_store_id, e.item_id, i.name, i.sku, e.batch_number, e.custody_state, i.base_unit
HAVING abs(SUM(CASE WHEN e.direction = 'in' THEN e.base_quantity ELSE -e.base_quantity END)) > 0.00001;
GRANT SELECT ON production_custody_balances TO service_role;

-- Store positions are replayed independently per store. inventory_items.quantity
-- remains the store-total compatibility balance; it is not used as a location.
CREATE OR REPLACE VIEW inventory_store_balances AS
SELECT
  m.brand_id, m.store_id, s.name AS store_name, s.store_type,
  m.item_id, i.name AS item_name, i.sku, i.base_unit AS unit, m.batch_number,
  SUM(CASE WHEN m.direction = 'in' THEN m.base_quantity ELSE -m.base_quantity END) AS quantity,
  MAX(m.effective_at) AS last_event_at
FROM inventory_movements m
JOIN inventory_items i ON i.id = m.item_id
LEFT JOIN inventory_stores s ON s.id = m.store_id
WHERE m.store_id IS NOT NULL AND COALESCE(s.store_type,'general') NOT IN ('production','field_sales')
GROUP BY m.brand_id, m.store_id, s.name, s.store_type, m.item_id, i.name, i.sku, i.base_unit, m.batch_number
HAVING abs(SUM(CASE WHEN m.direction = 'in' THEN m.base_quantity ELSE -m.base_quantity END)) > 0.00001;
GRANT SELECT ON inventory_store_balances TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Recovered packaging and approved operational losses.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS production_recovered_packaging (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_run_id     UUID NOT NULL REFERENCES production_runs(id) ON DELETE CASCADE,
  quality_incident_id   UUID REFERENCES inventory_quality_incidents(id) ON DELETE SET NULL,
  source_item_id        UUID REFERENCES inventory_items(id) ON DELETE SET NULL,
  source_batch_number   TEXT NOT NULL DEFAULT '',
  component_item_id     UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  component_kind        TEXT NOT NULL DEFAULT 'other',
  quantity              NUMERIC(16, 5) NOT NULL,
  unit                  TEXT NOT NULL DEFAULT 'pcs',
  condition_status      TEXT NOT NULL,
  custody_event_id      UUID REFERENCES production_custody_events(id) ON DELETE SET NULL,
  notes                 TEXT NOT NULL DEFAULT '',
  recorded_by           TEXT NOT NULL DEFAULT '',
  recorded_by_id        UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,
  idempotency_key       TEXT NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT recovered_packaging_quantity_check CHECK (quantity > 0),
  CONSTRAINT recovered_packaging_condition_check CHECK (
    condition_status IN ('reusable','damaged','disposed','quarantined')
  ),
  CONSTRAINT recovered_packaging_component_check CHECK (
    component_kind IN ('bottle','container','closure','cap','pump','front_sticker','back_sticker','other')
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_recovered_packaging_idempotency
  ON production_recovered_packaging (idempotency_key);
CREATE INDEX IF NOT EXISTS idx_recovered_packaging_run
  ON production_recovered_packaging (production_run_id, created_at);

-- Recovered packaging and its Production custody receipt are inseparable. A
-- damaged component remains on quality hold; disposal must use the separately
-- approved disposal workflow so that a valued loss is also written.
CREATE OR REPLACE FUNCTION post_recovered_packaging(
  p_production_run_id UUID,
  p_quality_incident_id UUID,
  p_source_item_id UUID,
  p_source_batch_number TEXT,
  p_component_item_id UUID,
  p_component_kind TEXT,
  p_quantity NUMERIC,
  p_unit TEXT,
  p_condition_status TEXT,
  p_production_store_id UUID,
  p_notes TEXT,
  p_recorded_by TEXT,
  p_recorded_by_id UUID,
  p_idempotency_key TEXT
) RETURNS production_recovered_packaging
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  run production_runs;
  component inventory_items;
  incident inventory_quality_incidents;
  existing production_recovered_packaging;
  custody_event production_custody_events;
  recovered production_recovered_packaging;
  target_state TEXT;
BEGIN
  IF COALESCE(p_idempotency_key,'')='' OR COALESCE(p_quantity,0)<=0 THEN
    RAISE EXCEPTION 'Recovered packaging needs a positive quantity and idempotency key';
  END IF;
  SELECT * INTO existing FROM production_recovered_packaging WHERE idempotency_key=p_idempotency_key;
  IF FOUND THEN RETURN existing; END IF;
  IF p_condition_status='disposed' THEN
    RAISE EXCEPTION 'Use an approved custody disposal so the packaging loss is valued and retained';
  END IF;
  IF p_condition_status NOT IN ('reusable','damaged','quarantined') THEN
    RAISE EXCEPTION 'Unsupported recovered packaging condition';
  END IF;
  SELECT * INTO run FROM production_runs WHERE id=p_production_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Production run not found'; END IF;
  SELECT * INTO component FROM inventory_items WHERE id=p_component_item_id;
  IF NOT FOUND OR component.item_type<>'packaging' THEN
    RAISE EXCEPTION 'Recovered component must be a packaging inventory item';
  END IF;
  IF component.brand_id IS DISTINCT FROM run.brand_id THEN
    RAISE EXCEPTION 'Recovered packaging and run belong to different brands';
  END IF;
  IF p_source_item_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM inventory_items i WHERE i.id=p_source_item_id AND i.brand_id IS NOT DISTINCT FROM run.brand_id
  ) THEN
    RAISE EXCEPTION 'Recovered packaging source item belongs to a different brand';
  END IF;
  IF p_quality_incident_id IS NOT NULL THEN
    SELECT * INTO incident FROM inventory_quality_incidents WHERE id=p_quality_incident_id;
    IF NOT FOUND OR incident.brand_id IS DISTINCT FROM run.brand_id THEN
      RAISE EXCEPTION 'Recovered packaging incident belongs to a different brand';
    END IF;
  END IF;

  target_state := CASE WHEN p_condition_status='reusable' THEN 'recovered_packaging' ELSE 'quality_hold' END;
  custody_event := post_production_custody_event(
    component.brand_id,p_production_store_id,component.id,COALESCE(p_source_batch_number,''),target_state,
    'in','recovered_packaging',p_quantity,COALESCE(NULLIF(p_unit,''),'pcs'),p_quantity,
    COALESCE(NULLIF(component.base_unit,''),NULLIF(component.unit,''),'pcs'),NULL,'',
    'rework_recovery','production',NULL,p_production_store_id,NULL,NULL,run.id,p_quality_incident_id,
    'production_run',run.id,NULL,COALESCE(p_notes,'Recovered packaging'),now(),p_recorded_by,p_recorded_by_id,
    '',NULL,'recovered-packaging-custody:'||p_idempotency_key,
    jsonb_build_object('condition_status',p_condition_status,'source_item_id',p_source_item_id)
  );

  INSERT INTO production_recovered_packaging (
    production_run_id,quality_incident_id,source_item_id,source_batch_number,component_item_id,
    component_kind,quantity,unit,condition_status,custody_event_id,notes,recorded_by,
    recorded_by_id,idempotency_key
  ) VALUES (
    run.id,p_quality_incident_id,p_source_item_id,COALESCE(p_source_batch_number,''),component.id,
    COALESCE(NULLIF(p_component_kind,''),'other'),p_quantity,COALESCE(NULLIF(p_unit,''),'pcs'),
    p_condition_status,custody_event.id,COALESCE(p_notes,''),COALESCE(p_recorded_by,''),
    p_recorded_by_id,p_idempotency_key
  ) RETURNING * INTO recovered;
  RETURN recovered;
END $$;
REVOKE ALL ON FUNCTION post_recovered_packaging(UUID,UUID,UUID,TEXT,UUID,TEXT,NUMERIC,TEXT,TEXT,UUID,TEXT,TEXT,UUID,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION post_recovered_packaging(UUID,UUID,UUID,TEXT,UUID,TEXT,NUMERIC,TEXT,TEXT,UUID,TEXT,TEXT,UUID,TEXT) TO service_role;

-- Move material already held by Production into a linked rework pool without
-- inventing a Store document. The OUT and IN events plus run-material link are
-- one transaction, so total Production quantity is conserved.
CREATE OR REPLACE FUNCTION post_production_state_transfer(
  p_item_id UUID,
  p_production_store_id UUID,
  p_batch_number TEXT,
  p_source_state TEXT,
  p_destination_state TEXT,
  p_quantity NUMERIC,
  p_unit TEXT,
  p_base_quantity NUMERIC,
  p_production_run_id UUID,
  p_quality_incident_id UUID,
  p_reason TEXT,
  p_effective_at TIMESTAMPTZ,
  p_recorded_by TEXT,
  p_recorded_by_id UUID,
  p_idempotency_key TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  item inventory_items;
  run production_runs;
  incident inventory_quality_incidents;
  existing production_custody_events;
  existing_out production_custody_events;
  out_event production_custody_events;
  in_event production_custody_events;
BEGIN
  IF COALESCE(p_idempotency_key,'')='' OR COALESCE(p_base_quantity,0)<=0 OR COALESCE(p_quantity,0)<=0 THEN
    RAISE EXCEPTION 'A positive quantity and idempotency key are required';
  END IF;
  SELECT * INTO existing FROM production_custody_events
    WHERE idempotency_key='production-state-in:'||p_idempotency_key;
  IF FOUND THEN
    SELECT * INTO existing_out FROM production_custody_events
      WHERE idempotency_key='production-state-out:'||p_idempotency_key;
    RETURN jsonb_build_object('out_event_id',existing_out.id,'in_event_id',existing.id);
  END IF;
  IF p_destination_state NOT IN ('materials','packaging','recovered_packaging','rework') THEN
    RAISE EXCEPTION 'Unsupported destination state for a staged Production input';
  END IF;
  SELECT * INTO item FROM inventory_items WHERE id=p_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inventory item not found'; END IF;
  SELECT * INTO run FROM production_runs WHERE id=p_production_run_id FOR UPDATE;
  IF NOT FOUND OR run.run_type NOT IN ('rework','repackaging','quality_recovery') THEN
    RAISE EXCEPTION 'A rework, repackaging or quality-recovery run is required';
  END IF;
  IF run.brand_id IS DISTINCT FROM item.brand_id THEN RAISE EXCEPTION 'Item and run belong to different brands'; END IF;
  IF p_quality_incident_id IS NOT NULL THEN
    SELECT * INTO incident FROM inventory_quality_incidents WHERE id=p_quality_incident_id;
    IF NOT FOUND OR incident.brand_id IS DISTINCT FROM run.brand_id THEN
      RAISE EXCEPTION 'Quality incident and run belong to different brands';
    END IF;
  END IF;

  out_event := post_production_custody_event(
    item.brand_id,p_production_store_id,item.id,COALESCE(p_batch_number,''),p_source_state,
    'out','state_transfer',p_quantity,p_unit,p_base_quantity,COALESCE(NULLIF(item.base_unit,''),NULLIF(item.unit,''),p_unit),
    CASE WHEN COALESCE(item.size_ml,0)>0 THEN p_base_quantity*item.size_ml/1000 ELSE NULL END,
    CASE WHEN COALESCE(item.size_ml,0)>0 THEN 'litres' ELSE '' END,
    'production','production_rework',NULL,NULL,NULL,NULL,run.id,p_quality_incident_id,
    'production_run',run.id,NULL,p_reason,p_effective_at,p_recorded_by,p_recorded_by_id,
    '',NULL,'production-state-out:'||p_idempotency_key,jsonb_build_object('destination_state',p_destination_state)
  );
  in_event := post_production_custody_event(
    item.brand_id,p_production_store_id,item.id,COALESCE(p_batch_number,''),p_destination_state,
    'in','state_transfer',p_quantity,p_unit,p_base_quantity,COALESCE(NULLIF(item.base_unit,''),NULLIF(item.unit,''),p_unit),
    CASE WHEN COALESCE(item.size_ml,0)>0 THEN p_base_quantity*item.size_ml/1000 ELSE NULL END,
    CASE WHEN COALESCE(item.size_ml,0)>0 THEN 'litres' ELSE '' END,
    'production','production_rework',NULL,NULL,NULL,NULL,run.id,p_quality_incident_id,
    'production_run',run.id,NULL,p_reason,p_effective_at,p_recorded_by,p_recorded_by_id,
    '',NULL,'production-state-in:'||p_idempotency_key,
    jsonb_build_object('source_state',p_source_state,'paired_out_event_id',out_event.id)
  );

  INSERT INTO production_run_materials (
    run_id,item_id,expected_quantity,issued_quantity,unit,material_role,
    production_state,source_custody_event_id,notes
  ) VALUES (
    run.id,item.id,0,p_base_quantity,COALESCE(NULLIF(item.base_unit,''),NULLIF(item.unit,''),p_unit),
    CASE p_source_state WHEN 'materials' THEN 'material' WHEN 'packaging' THEN 'packaging'
      WHEN 'recovered_packaging' THEN 'recovered_packaging' ELSE 'additional_wip' END,
    p_destination_state,in_event.id,
    COALESCE(p_reason,'Existing Production WIP staged for rework')
  ) ON CONFLICT (source_custody_event_id) WHERE source_custody_event_id IS NOT NULL DO NOTHING;
  RETURN jsonb_build_object('out_event_id',out_event.id,'in_event_id',in_event.id);
END $$;
REVOKE ALL ON FUNCTION post_production_state_transfer(UUID,UUID,TEXT,TEXT,TEXT,NUMERIC,TEXT,NUMERIC,UUID,UUID,TEXT,TIMESTAMPTZ,TEXT,UUID,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION post_production_state_transfer(UUID,UUID,TEXT,TEXT,TEXT,NUMERIC,TEXT,NUMERIC,UUID,UUID,TEXT,TIMESTAMPTZ,TEXT,UUID,TEXT) TO service_role;

-- Posting a run's accepted output, quality hold, residual WIP and execution
-- header is one transaction. A retry returns the already-posted run; changed
-- quantities require a correcting custody workflow rather than an overwrite.
CREATE OR REPLACE FUNCTION post_production_run_output(
  p_run_id UUID,
  p_production_store_id UUID,
  p_actual_quantity NUMERIC,
  p_accepted_quantity NUMERIC,
  p_rejected_quantity NUMERIC,
  p_wip_quantity NUMERIC,
  p_unit TEXT,
  p_accepted_base_quantity NUMERIC,
  p_rejected_base_quantity NUMERIC,
  p_wip_base_quantity NUMERIC,
  p_quality_result TEXT,
  p_quality_approved_by TEXT,
  p_expiry_date DATE,
  p_notes TEXT,
  p_recorded_by TEXT,
  p_recorded_by_id UUID
) RETURNS production_runs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  run production_runs;
  item inventory_items;
  existing_count INTEGER;
BEGIN
  SELECT * INTO run FROM production_runs WHERE id=p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Production run not found'; END IF;
  IF run.status IN ('closed','cancelled') THEN RAISE EXCEPTION 'This production run is not editable'; END IF;
  IF p_actual_quantity<0 OR p_accepted_quantity<0 OR p_rejected_quantity<0 OR p_wip_quantity<0
     OR abs(p_actual_quantity-p_accepted_quantity-p_rejected_quantity-p_wip_quantity)>0.0001 THEN
    RAISE EXCEPTION 'Produced output must equal accepted plus rejected plus remaining WIP';
  END IF;
  SELECT count(*) INTO existing_count FROM production_custody_events
    WHERE production_run_id=run.id AND event_kind='run_output';
  IF existing_count>0 THEN
    IF abs(run.actual_quantity-p_actual_quantity)<0.0001
       AND abs(run.accepted_quantity-p_accepted_quantity)<0.0001
       AND abs(run.rejected_quantity-p_rejected_quantity)<0.0001
       AND abs(run.waste_quantity)<0.0001 THEN
      RETURN run;
    END IF;
    RAISE EXCEPTION 'Run output is already posted; use a correcting custody event';
  END IF;
  SELECT * INTO item FROM inventory_items WHERE id=run.product_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Production output item not found'; END IF;

  IF p_accepted_quantity>0 THEN
    PERFORM post_production_custody_event(
      item.brand_id,p_production_store_id,item.id,run.batch_number,run.output_state,
      'in','run_output',p_accepted_quantity,p_unit,p_accepted_base_quantity,COALESCE(NULLIF(item.base_unit,''),NULLIF(item.unit,''),p_unit),
      CASE WHEN COALESCE(item.size_ml,0)>0 THEN p_accepted_base_quantity*item.size_ml/1000 ELSE NULL END,
      CASE WHEN COALESCE(item.size_ml,0)>0 THEN 'litres' ELSE '' END,
      'production_transformation','production',NULL,NULL,NULL,NULL,run.id,run.quality_incident_id,
      'production_run',run.id,NULL,'Accepted output recorded for '||run.run_ref,now(),p_recorded_by,p_recorded_by_id,
      p_quality_approved_by,NULL,'run-output:'||run.id::text||':accepted',jsonb_build_object('quality','accepted')
    );
  END IF;
  IF p_rejected_quantity>0 THEN
    PERFORM post_production_custody_event(
      item.brand_id,p_production_store_id,item.id,run.batch_number,'quality_hold',
      'in','run_output',p_rejected_quantity,p_unit,p_rejected_base_quantity,COALESCE(NULLIF(item.base_unit,''),NULLIF(item.unit,''),p_unit),
      CASE WHEN COALESCE(item.size_ml,0)>0 THEN p_rejected_base_quantity*item.size_ml/1000 ELSE NULL END,
      CASE WHEN COALESCE(item.size_ml,0)>0 THEN 'litres' ELSE '' END,
      'production_transformation','production',NULL,NULL,NULL,NULL,run.id,run.quality_incident_id,
      'production_run',run.id,NULL,'Rejected output on quality hold for '||run.run_ref,now(),p_recorded_by,p_recorded_by_id,
      '',NULL,'run-output:'||run.id::text||':rejected',jsonb_build_object('quality','rejected')
    );
  END IF;
  IF p_wip_quantity>0 THEN
    PERFORM post_production_custody_event(
      item.brand_id,p_production_store_id,item.id,run.batch_number,'bulk_wip',
      'in','run_output',p_wip_quantity,p_unit,p_wip_base_quantity,COALESCE(NULLIF(item.base_unit,''),NULLIF(item.unit,''),p_unit),
      CASE WHEN COALESCE(item.size_ml,0)>0 THEN p_wip_base_quantity*item.size_ml/1000 ELSE NULL END,
      CASE WHEN COALESCE(item.size_ml,0)>0 THEN 'litres' ELSE '' END,
      'production_transformation','production',NULL,NULL,NULL,NULL,run.id,run.quality_incident_id,
      'production_run',run.id,NULL,'Unclassified WIP recorded for '||run.run_ref,now(),p_recorded_by,p_recorded_by_id,
      '',NULL,'run-output:'||run.id::text||':unclassified-wip',jsonb_build_object('quality','awaiting_classification')
    );
  END IF;

  UPDATE production_runs SET
    actual_quantity=p_actual_quantity,accepted_quantity=p_accepted_quantity,
    rejected_quantity=p_rejected_quantity,waste_quantity=0,
    status=CASE WHEN p_accepted_quantity>0 THEN 'awaiting_quality' ELSE 'in_production' END,
    completed_at=CASE WHEN p_actual_quantity>0 THEN now() ELSE NULL END,
    quality_result=COALESCE(p_quality_result,quality_result),
    quality_approved_by=COALESCE(p_quality_approved_by,quality_approved_by),
    quality_approved_at=CASE WHEN COALESCE(p_quality_approved_by,'')<>'' THEN now() ELSE quality_approved_at END,
    expiry_date=COALESCE(p_expiry_date,expiry_date),notes=COALESCE(p_notes,notes),updated_at=now()
  WHERE id=run.id RETURNING * INTO run;
  RETURN run;
END $$;
REVOKE ALL ON FUNCTION post_production_run_output(UUID,UUID,NUMERIC,NUMERIC,NUMERIC,NUMERIC,TEXT,NUMERIC,NUMERIC,NUMERIC,TEXT,TEXT,DATE,TEXT,TEXT,UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION post_production_run_output(UUID,UUID,NUMERIC,NUMERIC,NUMERIC,NUMERIC,TEXT,NUMERIC,NUMERIC,NUMERIC,TEXT,TEXT,DATE,TEXT,TEXT,UUID) TO service_role;

-- Consumption and the linked Production custody OUT are likewise atomic.
CREATE OR REPLACE FUNCTION post_production_material_consumption(
  p_material_id UUID,
  p_production_store_id UUID,
  p_consumed_quantity NUMERIC,
  p_base_quantity NUMERIC,
  p_custody_state TEXT,
  p_event_kind TEXT,
  p_notes TEXT,
  p_recorded_by TEXT,
  p_recorded_by_id UUID
) RETURNS production_run_materials
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  material production_run_materials;
  item inventory_items;
BEGIN
  SELECT * INTO material FROM production_run_materials WHERE id=p_material_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Production material line not found'; END IF;
  IF material.consumption_posted_at IS NOT NULL THEN
    IF abs(material.consumed_quantity-p_consumed_quantity)<0.0001 THEN RETURN material; END IF;
    RAISE EXCEPTION 'Consumption is already posted; use an auditable correcting event';
  END IF;
  IF p_consumed_quantity<0 OR p_consumed_quantity>material.issued_quantity-material.returned_quantity-material.waste_quantity+0.0001 THEN
    RAISE EXCEPTION 'Consumption exceeds the amount held for this run';
  END IF;
  SELECT * INTO item FROM inventory_items WHERE id=material.item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Material item not found'; END IF;
  IF p_consumed_quantity>0 THEN
    PERFORM post_production_custody_event(
      item.brand_id,p_production_store_id,item.id,'',p_custody_state,
      'out',p_event_kind,p_consumed_quantity,material.unit,p_base_quantity,COALESCE(NULLIF(item.base_unit,''),NULLIF(item.unit,''),material.unit),
      CASE WHEN COALESCE(item.size_ml,0)>0 THEN p_base_quantity*item.size_ml/1000 ELSE NULL END,
      CASE WHEN COALESCE(item.size_ml,0)>0 THEN 'litres' ELSE '' END,
      'production','production_transformation',NULL,NULL,NULL,NULL,material.run_id,NULL,
      'production_run_material',material.id,NULL,'Consumed on production run '||material.run_id::text,
      now(),p_recorded_by,p_recorded_by_id,'',NULL,'run-material:'||material.id::text||':consumed',
      jsonb_build_object('material_role',material.material_role)
    );
  END IF;
  UPDATE production_run_materials SET consumed_quantity=p_consumed_quantity,notes=COALESCE(p_notes,''),
    consumption_posted_at=now() WHERE id=material.id RETURNING * INTO material;
  RETURN material;
END $$;
REVOKE ALL ON FUNCTION post_production_material_consumption(UUID,UUID,NUMERIC,NUMERIC,TEXT,TEXT,TEXT,TEXT,UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION post_production_material_consumption(UUID,UUID,NUMERIC,NUMERIC,TEXT,TEXT,TEXT,TEXT,UUID) TO service_role;

CREATE TABLE IF NOT EXISTS inventory_disposal_loss_events (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loss_ref              TEXT NOT NULL,
  brand_id              UUID REFERENCES brands(id) ON DELETE SET NULL,
  item_id               UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  batch_number          TEXT NOT NULL DEFAULT '',
  source_custody        TEXT NOT NULL,
  source_store_id       UUID REFERENCES inventory_stores(id) ON DELETE SET NULL,
  salesperson_id        UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,
  quantity              NUMERIC(16, 5) NOT NULL,
  unit                  TEXT NOT NULL,
  valuation_basis       TEXT NOT NULL,
  unit_value_ksh        NUMERIC(16, 4) NOT NULL DEFAULT 0,
  loss_value_ksh        NUMERIC(16, 2) GENERATED ALWAYS AS (quantity * unit_value_ksh) STORED,
  reason                TEXT NOT NULL,
  quality_incident_id   UUID NOT NULL REFERENCES inventory_quality_incidents(id) ON DELETE RESTRICT,
  production_run_id     UUID REFERENCES production_runs(id) ON DELETE SET NULL,
  production_custody_event_id UUID REFERENCES production_custody_events(id) ON DELETE SET NULL,
  approved_by           TEXT NOT NULL,
  approved_by_id        UUID REFERENCES ops_team_members(id) ON DELETE SET NULL,
  approved_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by           TEXT NOT NULL DEFAULT '',
  idempotency_key       TEXT NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT inventory_loss_quantity_check CHECK (quantity > 0),
  CONSTRAINT inventory_loss_approval_check CHECK (approved_by <> ''),
  CONSTRAINT inventory_loss_custody_check CHECK (
    source_custody IN ('raw_store','packaging_store','production','finished_goods_store','field_sales','quality_hold')
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_loss_ref ON inventory_disposal_loss_events (loss_ref);
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_loss_idempotency ON inventory_disposal_loss_events (idempotency_key);
CREATE INDEX IF NOT EXISTS idx_inventory_loss_incident ON inventory_disposal_loss_events (quality_incident_id, created_at);

-- Disposal from Production is one transaction: custody leaves the active
-- ledger and the valued loss history is written from the same approved
-- incident. Callers cannot create one side without the other.
CREATE OR REPLACE FUNCTION post_production_disposal(
  p_item_id UUID,
  p_production_store_id UUID,
  p_batch_number TEXT,
  p_custody_state TEXT,
  p_quantity NUMERIC,
  p_unit TEXT,
  p_base_quantity NUMERIC,
  p_quality_incident_id UUID,
  p_production_run_id UUID,
  p_reason TEXT,
  p_effective_at TIMESTAMPTZ,
  p_recorded_by TEXT,
  p_recorded_by_id UUID,
  p_approved_by TEXT,
  p_approved_by_id UUID,
  p_valuation_basis TEXT,
  p_unit_value_ksh NUMERIC,
  p_idempotency_key TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  item inventory_items;
  incident inventory_quality_incidents;
  existing inventory_disposal_loss_events;
  custody_event production_custody_events;
  loss inventory_disposal_loss_events;
  already_disposed NUMERIC(16,5);
BEGIN
  IF COALESCE(p_idempotency_key,'')='' THEN
    RAISE EXCEPTION 'A disposal idempotency key is required';
  END IF;
  SELECT * INTO existing FROM inventory_disposal_loss_events WHERE idempotency_key=p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object('loss_id',existing.id,'production_event_id',existing.production_custody_event_id);
  END IF;
  SELECT * INTO incident FROM inventory_quality_incidents WHERE id=p_quality_incident_id FOR UPDATE;
  IF NOT FOUND OR incident.status NOT IN ('disposition_approved','in_progress')
     OR incident.disposition NOT IN ('dispose','partial_salvage') THEN
    RAISE EXCEPTION 'An approved disposal or partial-salvage incident is required';
  END IF;
  SELECT * INTO item FROM inventory_items WHERE id=p_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inventory item not found'; END IF;
  IF incident.item_id IS NOT NULL AND incident.item_id<>p_item_id THEN
    RAISE EXCEPTION 'The disposed item does not match the approved incident';
  END IF;
  IF COALESCE(incident.batch_number,'')<>'' AND incident.batch_number<>COALESCE(p_batch_number,'') THEN
    RAISE EXCEPTION 'The disposed batch does not match the approved incident';
  END IF;
  IF incident.brand_id IS DISTINCT FROM item.brand_id THEN
    RAISE EXCEPTION 'The approved incident and disposed item belong to different brands';
  END IF;
  IF COALESCE(p_approved_by,'')='' THEN RAISE EXCEPTION 'Disposal approval is required'; END IF;
  SELECT COALESCE(SUM(base_quantity),0) INTO already_disposed
    FROM production_custody_events
   WHERE quality_incident_id=incident.id AND event_kind='disposal' AND direction='out';
  IF already_disposed+p_base_quantity > incident.affected_quantity+0.00001 THEN
    RAISE EXCEPTION 'Disposal would exceed the quantity approved on the incident';
  END IF;

  custody_event := post_production_custody_event(
    item.brand_id,p_production_store_id,p_item_id,COALESCE(p_batch_number,''),p_custody_state,
    'out','disposal',p_quantity,p_unit,p_base_quantity,COALESCE(NULLIF(item.base_unit,''),NULLIF(item.unit,''),p_unit),
    CASE WHEN COALESCE(item.size_ml,0)>0 THEN p_base_quantity*item.size_ml/1000 ELSE NULL END,
    CASE WHEN COALESCE(item.size_ml,0)>0 THEN 'litres' ELSE '' END,
    'production','disposed_lost',NULL,NULL,NULL,NULL,p_production_run_id,incident.id,
    'quality_incident',incident.id,NULL,p_reason,p_effective_at,p_recorded_by,p_recorded_by_id,
    p_approved_by,p_approved_by_id,'production-disposal:'||p_idempotency_key,
    jsonb_build_object('valuation_basis',p_valuation_basis)
  );

  INSERT INTO inventory_disposal_loss_events (
    loss_ref,brand_id,item_id,batch_number,source_custody,quantity,unit,valuation_basis,
    unit_value_ksh,reason,quality_incident_id,production_run_id,production_custody_event_id,
    approved_by,approved_by_id,recorded_by,idempotency_key
  ) VALUES (
    ocg_next_reference('inventory_loss','LOSS-',4),item.brand_id,item.id,COALESCE(p_batch_number,''),
    CASE WHEN p_custody_state='quality_hold' THEN 'quality_hold' ELSE 'production' END,
    p_base_quantity,COALESCE(NULLIF(item.base_unit,''),NULLIF(item.unit,''),p_unit),COALESCE(p_valuation_basis,'current_reference_cost'),
    COALESCE(p_unit_value_ksh,item.unit_value_ksh,0),p_reason,incident.id,p_production_run_id,
    custody_event.id,p_approved_by,p_approved_by_id,p_recorded_by,p_idempotency_key
  ) RETURNING * INTO loss;
  RETURN jsonb_build_object('loss_id',loss.id,'production_event_id',custody_event.id);
END $$;
REVOKE ALL ON FUNCTION post_production_disposal(UUID,UUID,TEXT,TEXT,NUMERIC,TEXT,NUMERIC,UUID,UUID,TEXT,TIMESTAMPTZ,TEXT,UUID,TEXT,UUID,TEXT,NUMERIC,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION post_production_disposal(UUID,UUID,TEXT,TEXT,NUMERIC,TEXT,NUMERIC,UUID,UUID,TEXT,TIMESTAMPTZ,TEXT,UUID,TEXT,UUID,TEXT,NUMERIC,TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Cross-ledger links and authorised Field Sales -> Production recall.
-- ---------------------------------------------------------------------------

ALTER TABLE field_sales_custody_movements
  ADD COLUMN IF NOT EXISTS quality_incident_id UUID REFERENCES inventory_quality_incidents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS production_custody_event_id UUID REFERENCES production_custody_events(id) ON DELETE SET NULL;
ALTER TABLE field_sales_custody_movements DROP CONSTRAINT IF EXISTS fs_custody_kind_check;
ALTER TABLE field_sales_custody_movements ADD CONSTRAINT fs_custody_kind_check
  CHECK (movement_kind IN (
    'issue','sale','return','damage','sample','promotion','quality_recall','adjustment','reversal'
  )) NOT VALID;
CREATE INDEX IF NOT EXISTS idx_fs_custody_quality_incident
  ON field_sales_custody_movements (quality_incident_id) WHERE quality_incident_id IS NOT NULL;

-- A single transaction reduces the named salesperson's custody and increases
-- Production. The approved incident is mandatory; Finished Goods is untouched.
CREATE OR REPLACE FUNCTION post_field_sales_quality_recall(
  p_salesperson_id UUID,
  p_item_id UUID,
  p_quantity NUMERIC,
  p_batch_number TEXT,
  p_allocation_id UUID,
  p_quality_incident_id UUID,
  p_production_store_id UUID,
  p_effective_at TIMESTAMPTZ,
  p_recorded_by TEXT,
  p_recorded_by_id UUID,
  p_idempotency_key TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  incident inventory_quality_incidents;
  item inventory_items;
  allocation field_sales_allocations;
  existing field_sales_custody_movements;
  current_balance NUMERIC(16,5);
  already_recalled NUMERIC(16,5);
  custody_event production_custody_events;
  field_event field_sales_custody_movements;
BEGIN
  IF COALESCE(p_idempotency_key,'')='' THEN
    RAISE EXCEPTION 'A quality-recall idempotency key is required';
  END IF;
  SELECT * INTO existing FROM field_sales_custody_movements
   WHERE idempotency_key = 'quality-recall-field:' || p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object('field_event_id', existing.id, 'production_event_id', existing.production_custody_event_id);
  END IF;
  SELECT * INTO incident FROM inventory_quality_incidents WHERE id = p_quality_incident_id FOR UPDATE;
  IF NOT FOUND OR incident.status NOT IN ('disposition_approved','in_progress')
     OR incident.disposition NOT IN ('return_to_production','rework','repackage','partial_salvage') THEN
    RAISE EXCEPTION 'An approved Production recall/rework incident is required';
  END IF;
  IF incident.item_id IS NOT NULL AND incident.item_id <> p_item_id THEN
    RAISE EXCEPTION 'The recalled SKU does not match the approved incident';
  END IF;
  IF incident.salesperson_id IS NOT NULL AND incident.salesperson_id <> p_salesperson_id THEN
    RAISE EXCEPTION 'The recalled salesperson does not match the approved incident';
  END IF;
  IF COALESCE(incident.batch_number,'')<>'' AND incident.batch_number<>COALESCE(p_batch_number,'') THEN
    RAISE EXCEPTION 'The recalled batch does not match the approved incident';
  END IF;
  IF incident.linked_run_id IS NULL THEN
    RAISE EXCEPTION 'Create and link the authorised rework/recovery run before recalling salesperson custody';
  END IF;
  IF p_allocation_id IS NULL THEN
    RAISE EXCEPTION 'The original Sales Delivery Note/allocation is required';
  END IF;
  SELECT * INTO allocation FROM field_sales_allocations WHERE id=p_allocation_id;
  IF NOT FOUND OR allocation.salesperson_id IS DISTINCT FROM p_salesperson_id THEN
    RAISE EXCEPTION 'The original allocation does not belong to this salesperson';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM field_sales_allocation_items ai WHERE ai.allocation_id=p_allocation_id AND ai.item_id=p_item_id) THEN
    RAISE EXCEPTION 'The recalled SKU was not issued on the selected allocation';
  END IF;
  IF incident.source_allocation_id IS NOT NULL AND incident.source_allocation_id<>p_allocation_id THEN
    RAISE EXCEPTION 'The recall allocation does not match the approved incident';
  END IF;
  SELECT * INTO item FROM inventory_items WHERE id = p_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inventory item not found'; END IF;
  IF incident.brand_id IS DISTINCT FROM item.brand_id THEN
    RAISE EXCEPTION 'The approved incident and recalled SKU belong to different brands';
  END IF;
  IF allocation.brand_id IS DISTINCT FROM item.brand_id THEN
    RAISE EXCEPTION 'The original allocation and recalled SKU belong to different brands';
  END IF;
  SELECT COALESCE(SUM(base_quantity),0) INTO already_recalled
    FROM production_custody_events
   WHERE quality_incident_id=incident.id AND event_kind='sales_quality_recall' AND direction='in';
  IF already_recalled+p_quantity > incident.affected_quantity+0.00001 THEN
    RAISE EXCEPTION 'Recall would exceed the quantity approved on the incident';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(concat_ws(':','field-recall',p_salesperson_id,p_item_id), 0));
  SELECT COALESCE(SUM(CASE WHEN direction='in' THEN quantity ELSE -quantity END),0)
    INTO current_balance FROM field_sales_custody_movements
   WHERE salesperson_id = p_salesperson_id AND item_id = p_item_id
     AND allocation_id = p_allocation_id;
  IF p_quantity <= 0 OR current_balance + 0.00001 < p_quantity THEN
    RAISE EXCEPTION 'Insufficient salesperson custody: available %, requested %', current_balance, p_quantity;
  END IF;

  custody_event := post_production_custody_event(
    item.brand_id, p_production_store_id, p_item_id, COALESCE(p_batch_number,''), 'rework', 'in',
    'sales_quality_recall', p_quantity, COALESCE(NULLIF(item.base_unit,''),NULLIF(item.unit,''),'unit'), p_quantity,
    COALESCE(NULLIF(item.base_unit,''),NULLIF(item.unit,''),'unit'),
    CASE WHEN COALESCE(item.size_ml,0) > 0 THEN p_quantity * item.size_ml / 1000 ELSE NULL END,
    CASE WHEN COALESCE(item.size_ml,0) > 0 THEN 'litres' ELSE '' END,
    'field_sales', 'production', NULL, p_production_store_id, p_salesperson_id,
    p_allocation_id, incident.linked_run_id, incident.id, 'quality_recall', incident.id, NULL,
    incident.description, p_effective_at, p_recorded_by, p_recorded_by_id,
    incident.disposition_approved_by, incident.disposition_approved_by_id,
    'quality-recall-production:' || p_idempotency_key,
    jsonb_build_object('original_allocation_id', p_allocation_id)
  );

  INSERT INTO field_sales_custody_movements (
    brand_id, salesperson_id, item_id, allocation_id, batch_number, direction, movement_kind,
    quantity, balance_after, movement_date, reason, recorded_by, idempotency_key,
    quality_incident_id, production_custody_event_id
  ) VALUES (
    item.brand_id, p_salesperson_id, p_item_id, p_allocation_id, COALESCE(p_batch_number,''),
    'out', 'quality_recall', p_quantity, current_balance - p_quantity,
    (COALESCE(p_effective_at,now()) AT TIME ZONE 'Africa/Nairobi')::date,
    'Authorised quality recall to Production', p_recorded_by,
    'quality-recall-field:' || p_idempotency_key, incident.id, custody_event.id
  ) RETURNING * INTO field_event;

  INSERT INTO production_run_materials (
    run_id,item_id,expected_quantity,issued_quantity,unit,material_role,production_state,
    source_custody_event_id,notes
  ) VALUES (
    incident.linked_run_id,item.id,0,p_quantity,COALESCE(NULLIF(item.base_unit,''),NULLIF(item.unit,''),'unit'),'rework_input','rework',
    custody_event.id,'Quality recall from Sales allocation '||p_allocation_id::text
  ) ON CONFLICT (source_custody_event_id) WHERE source_custody_event_id IS NOT NULL DO NOTHING;

  RETURN jsonb_build_object('field_event_id', field_event.id, 'production_event_id', custody_event.id);
END $$;
REVOKE ALL ON FUNCTION post_field_sales_quality_recall(UUID,UUID,NUMERIC,TEXT,UUID,UUID,UUID,TIMESTAMPTZ,TEXT,UUID,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION post_field_sales_quality_recall(UUID,UUID,NUMERIC,TEXT,UUID,UUID,UUID,TIMESTAMPTZ,TEXT,UUID,TEXT) TO service_role;

-- Management reconciliation. Disposed/lost is explicitly non-active history.
CREATE OR REPLACE VIEW inventory_company_custody_positions AS
SELECT sb.brand_id, sb.item_id, sb.item_name, sb.sku, sb.batch_number,
  CASE sb.store_type WHEN 'raw' THEN 'raw_store' WHEN 'packaging' THEN 'packaging_store'
    WHEN 'finished_goods' THEN 'finished_goods_store' WHEN 'quarantine' THEN 'quality_hold'
    ELSE 'store' END AS custody_type,
  sb.store_id AS custody_id, sb.store_name AS custody_label, sb.quantity, sb.unit,
  NULL::NUMERIC AS equivalent_quantity, ''::TEXT AS equivalent_unit,
  true AS active_custody, sb.last_event_at
FROM inventory_store_balances sb
UNION ALL
SELECT pb.brand_id, pb.item_id, pb.item_name, pb.sku, pb.batch_number,
  CASE WHEN pb.custody_state = 'quality_hold' THEN 'quality_hold' ELSE 'production' END,
  pb.production_store_id, initcap(replace(pb.custody_state,'_',' ')), pb.quantity, pb.unit,
  pb.equivalent_quantity, COALESCE(pb.equivalent_unit,''), true, pb.last_event_at
FROM production_custody_balances pb
UNION ALL
SELECT c.brand_id, c.item_id, i.name, i.sku, ''::TEXT,
  'field_sales', c.salesperson_id, COALESCE(m.name,'Field Sales'),
  SUM(CASE WHEN c.direction='in' THEN c.quantity ELSE -c.quantity END), i.base_unit,
  CASE WHEN COALESCE(i.size_ml,0)>0 THEN SUM(CASE WHEN c.direction='in' THEN c.quantity ELSE -c.quantity END)*i.size_ml/1000 ELSE NULL END,
  CASE WHEN COALESCE(i.size_ml,0)>0 THEN 'litres' ELSE '' END, true, MAX(c.created_at)
FROM field_sales_custody_movements c
JOIN inventory_items i ON i.id=c.item_id
LEFT JOIN ops_team_members m ON m.id=c.salesperson_id
GROUP BY c.brand_id,c.item_id,i.name,i.sku,c.salesperson_id,m.name,i.base_unit,i.size_ml
HAVING abs(SUM(CASE WHEN c.direction='in' THEN c.quantity ELSE -c.quantity END))>0.00001
UNION ALL
SELECT l.brand_id,l.item_id,i.name,i.sku,l.batch_number,'disposed_lost',l.id,l.reason,
  l.quantity,l.unit,NULL::NUMERIC,''::TEXT,false,l.created_at
FROM inventory_disposal_loss_events l JOIN inventory_items i ON i.id=l.item_id;
GRANT SELECT ON inventory_company_custody_positions TO service_role;

CREATE OR REPLACE FUNCTION prevent_append_only_ledger_change()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; post a reversal or correcting event instead', TG_TABLE_NAME;
END $$;
DROP TRIGGER IF EXISTS trg_production_custody_append_only ON production_custody_events;
CREATE TRIGGER trg_production_custody_append_only BEFORE UPDATE OR DELETE ON production_custody_events
  FOR EACH ROW EXECUTE FUNCTION prevent_append_only_ledger_change();
DROP TRIGGER IF EXISTS trg_production_loss_append_only ON inventory_disposal_loss_events;
CREATE TRIGGER trg_production_loss_append_only BEFORE UPDATE OR DELETE ON inventory_disposal_loss_events
  FOR EACH ROW EXECUTE FUNCTION prevent_append_only_ledger_change();
DROP TRIGGER IF EXISTS trg_recovered_packaging_append_only ON production_recovered_packaging;
CREATE TRIGGER trg_recovered_packaging_append_only BEFORE UPDATE OR DELETE ON production_recovered_packaging
  FOR EACH ROW EXECUTE FUNCTION prevent_append_only_ledger_change();

INSERT INTO ops_id_sequences (name, current_val) VALUES
  ('quality_incident', 0), ('inventory_loss', 0)
ON CONFLICT (name) DO NOTHING;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'inventory_quality_incidents','production_custody_events',
    'production_recovered_packaging','inventory_disposal_loss_events'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_service', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)', t || '_service', t);
    EXECUTE format('GRANT ALL ON TABLE %I TO service_role', t);
  END LOOP;
END $$;

COMMIT;
