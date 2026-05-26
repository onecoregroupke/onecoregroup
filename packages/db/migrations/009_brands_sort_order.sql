-- Migration 009: brand display ordering
-- Additive only. Lets the marketing calendar order its platform columns by a
-- deliberate brand order instead of falling back to alphabetical. Existing
-- rows default to 0; other apps that don't select this column are unaffected.

ALTER TABLE brands ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_brands_sort_order ON brands(sort_order);
