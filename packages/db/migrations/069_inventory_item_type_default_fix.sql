-- Migration 069: fix a broken inventory_items.item_type default (§15).
--
-- Migration 049 set item_type's default to 'stocked_inventory'. Migration 060
-- later added inventory_items_type_check, which only allows raw_material |
-- packaging | work_in_progress | finished_good | damaged | returned | sample |
-- consumable — 'stocked_inventory' was never in that list. Because 060 used
-- ADD COLUMN IF NOT EXISTS on a column that already existed, the stale default
-- survived untouched. Every insert that omits item_type (the plain "New item"
-- register path used by every brand) has therefore failed this check ever
-- since 060 was applied. Discovered via live write-path verification (§40).
BEGIN;

ALTER TABLE inventory_items
  ALTER COLUMN item_type SET DEFAULT 'consumable';

COMMIT;
