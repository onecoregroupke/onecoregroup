-- Migration 049: procurement item classification, disposition, and shared scope (§20).
--
-- Additive. Fixes the "everything received becomes stock" problem: each purchase
-- line now declares whether it will be STORED and issued later (creates inventory)
-- or was CONSUMED immediately (recognised as expense, no inventory balance). Items
-- are classified, and a purchase can be scoped to one brand or shared across brands
-- (group welfare, shared facilities) with a cost centre + benefiting brands.

ALTER TABLE procurement_purchase_items
  -- stocked_inventory | consumable | immediate_expense | fixed_asset | service |
  -- resale | student_meal | staff_welfare | facilities | other
  ADD COLUMN IF NOT EXISTS item_type   TEXT NOT NULL DEFAULT 'stocked_inventory',
  -- 'stock' = store & issue later (→ inventory);  'consume' = used now (no stock)
  ADD COLUMN IF NOT EXISTS disposition TEXT NOT NULL DEFAULT 'stock';

ALTER TABLE procurement_purchases
  ADD COLUMN IF NOT EXISTS scope                 TEXT   NOT NULL DEFAULT 'brand', -- brand | group_shared | shared_selected
  ADD COLUMN IF NOT EXISTS cost_centre           TEXT   NOT NULL DEFAULT '',      -- Student Meals | Staff Welfare | Facilities | …
  ADD COLUMN IF NOT EXISTS beneficiary_brand_ids UUID[] NOT NULL DEFAULT '{}';    -- for shared purchases

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS item_type TEXT NOT NULL DEFAULT 'stocked_inventory';
