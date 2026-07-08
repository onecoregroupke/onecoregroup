/**
 * Per-department category presets for inventory + procurement. Departments
 * classify stock and purchases differently — Glitz N' Glim (Iceland Geysers)
 * runs a production flow (raw material → WIP → finished goods) while the
 * schools mostly track supplies. Keyed by brand slug; unknown brands fall back
 * to DEFAULT. Used to populate the category dropdowns; values are stored as
 * plain text so custom one-off categories keep working.
 */

export interface BrandCategoryPreset {
  /** Inventory classification for the stock register. */
  inventory: string[]
  /** Procurement classification for purchases. */
  procurement: string[]
}

const DEFAULT_PRESET: BrandCategoryPreset = {
  inventory: ['General Supplies', 'Equipment', 'Furniture', 'Learning Materials', 'Consumables', 'Others'],
  procurement: ['General Supplies', 'Equipment', 'Services', 'Others'],
}

const PRESETS: Record<string, BrandCategoryPreset> = {
  'glitz-n-glim': {
    inventory: ['Raw Material', 'Packaging', 'Work in Progress (WIP)', 'Finished Goods', 'Others'],
    procurement: ['Packaging', 'Raw Material', 'General Supplies'],
  },
  'nairobi-piano-technicians': {
    inventory: ['Tools', 'Spare Parts', 'Consumables', 'Pianos for Sale', 'Others'],
    procurement: ['Spare Parts', 'Tools & Equipment', 'General Supplies', 'Others'],
  },
}

export function inventoryCategories(brandSlug: string | null | undefined): string[] {
  return (brandSlug && PRESETS[brandSlug]?.inventory) || DEFAULT_PRESET.inventory
}

export function procurementCategories(brandSlug: string | null | undefined): string[] {
  return (brandSlug && PRESETS[brandSlug]?.procurement) || DEFAULT_PRESET.procurement
}
