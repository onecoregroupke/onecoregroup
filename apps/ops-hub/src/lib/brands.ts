import { cache } from 'react'
import { db } from './serverClient'
import type { Brand } from '@ocg/db'

export const listBrands = cache(async function listBrands(): Promise<Brand[]> {
  const { data } = await db()
    .from('brands')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  return (data as Brand[] | null) ?? []
})

/** Resolve a brand by slug or UUID. Returns null if not found. */
export async function resolveBrand(slugOrId: string): Promise<Brand | null> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(slugOrId)
  const { data } = await db()
    .from('brands')
    .select('*')
    .eq(isUuid ? 'id' : 'slug', slugOrId)
    .maybeSingle()
  return (data as Brand | null) ?? null
}

/** Map of brand_id → brand, for cheap lookups when rendering lists. */
export async function brandMap(): Promise<Map<string, Brand>> {
  const brands = await listBrands()
  return new Map(brands.map((b) => [b.id, b]))
}
