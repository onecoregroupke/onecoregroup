// =============================================================================
// Marketing brands — read adapter over the existing `brands` table.
// =============================================================================
// Marketing features reuse One Core's brand model rather than maintaining a
// separate one. This module maps a brands row into the MarketingBrand shape
// the marketing UI expects (primaryColor ← color_hex, shortName ← short_name).

import { createServerClient } from '@ocg/db'
import type { Brand } from '@ocg/db'
import type { MarketingBrand } from './types'

function toMarketingBrand(row: Brand): MarketingBrand {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    shortName: row.short_name ?? null,
    primaryColor: row.color_hex || '#1a1a2e',
    isActive: row.is_active,
    sortOrder: row.sort_order ?? 0,
  }
}

export async function listBrands(includeInactive = false): Promise<MarketingBrand[]> {
  const supabase = createServerClient()
  let query = supabase
    .from('brands')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (!includeInactive) query = query.eq('is_active', true)
  const { data, error } = await query
  if (error || !data) {
    if (error) console.warn('[marketing] listBrands failed:', error.message)
    return []
  }
  return (data as Brand[]).map(toMarketingBrand)
}
