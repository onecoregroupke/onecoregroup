import { createBrowserClient } from '@ocg/db/client'
import type { Product, ProductSize } from '@ocg/db'

export const WHATSAPP = '254792967822'

export function waLink(
  productName: string,
  variant?: string | null,
  size?: string | null,
  price?: number | null,
) {
  const namePart = variant ? `${productName} (${variant})` : productName
  const sizePart = size ? ` — ${size}` : ''
  const pricePart = price ? ` @ Ksh ${price.toLocaleString()}` : ''
  const msg = `Hi! I'd like to order *${namePart}${sizePart}*${pricePart}. Please confirm availability.`
  return `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(msg)}`
}

export interface GroupedCategory {
  id: string
  name: string
  accent: string
  products: Product[]
}

/** Fetch all active products ordered by sort_order */
export async function fetchActiveProducts(): Promise<Product[]> {
  try {
    const supabase = createBrowserClient()
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
    if (error) {
      console.error('[glitz] fetchActiveProducts error:', error.message)
      return []
    }
    return (data as Product[]) ?? []
  } catch (err) {
    console.error('[glitz] fetchActiveProducts:', err)
    return []
  }
}

/** Fetch a single active product by slug */
export async function fetchProductBySlug(slug: string): Promise<Product | null> {
  try {
    const supabase = createBrowserClient()
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('slug', slug)
      .eq('is_active', true)
      .single()
    if (error) return null
    return data as Product
  } catch (err) {
    console.error('[glitz] fetchProductBySlug:', err)
    return null
  }
}

/** Group a flat product list into categories, preserving insertion order */
export function groupByCategory(products: Product[]): GroupedCategory[] {
  const map = new Map<string, GroupedCategory>()
  for (const p of products) {
    const key = p.category ?? 'other'
    if (!map.has(key)) {
      map.set(key, {
        id: key,
        name: p.category_display_name ?? key,
        accent: p.category_accent ?? '#6b7280',
        products: [],
      })
    }
    map.get(key)!.products.push(p)
  }
  return Array.from(map.values())
}

export type { Product, ProductSize }
