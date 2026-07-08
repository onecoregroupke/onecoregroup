-- Migration 040: Procurement/inventory categories + vendor blacklist
-- Additive only. Per-department category presets live in code
-- (apps/ops-hub/src/lib/brandCategories.ts); this migration adds the storage:
--   - procurement_purchases.category  (Packaging | Raw Material | General Supplies | …)
--   - vendor blacklisting with a reason + audit stamp, so anyone operating the
--     system can see WHO blacklisted a supplier, WHEN, and WHY. Blacklisted
--     vendors stay visible in the register but are blocked from new purchases.
-- Run in the Supabase SQL editor. Idempotent — safe to re-run.

-- Purchase category (procurement classification, e.g. Glitz N' Glim:
-- Packaging / Raw Material / General Supplies).
ALTER TABLE procurement_purchases ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_procurement_purchases_category ON procurement_purchases (category);

-- Vendor blacklist: keep the record, block the business.
ALTER TABLE procurement_vendors ADD COLUMN IF NOT EXISTS is_blacklisted   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE procurement_vendors ADD COLUMN IF NOT EXISTS blacklist_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE procurement_vendors ADD COLUMN IF NOT EXISTS blacklisted_by   TEXT NOT NULL DEFAULT '';
ALTER TABLE procurement_vendors ADD COLUMN IF NOT EXISTS blacklisted_at   TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_procurement_vendors_blacklisted ON procurement_vendors (is_blacklisted);
