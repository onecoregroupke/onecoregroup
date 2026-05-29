export const dynamic = 'force-dynamic'

import { createServerClient } from '@ocg/db'
import type { Property } from '@ocg/db'
import { withResolvedPhotos } from '@/lib/photos'
import { sortAndPriceListings } from '@/lib/property-listing'
import { PropertiesClient } from './PropertiesClient'

export const metadata = {
  title: 'Our Properties',
  description:
    'Browse Nuuranest Stays properties in Nyali and Bamburi, Mombasa. Fully furnished, prime locations.',
}

async function getAllProperties(): Promise<Property[]> {
  try {
    const supabase = createServerClient()
    const { data } = await supabase
      .from('properties')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
    return ((data as Property[]) ?? []).map(withResolvedPhotos)
  } catch {
    return []
  }
}

export default async function PropertiesPage() {
  const properties = sortAndPriceListings(await getAllProperties())

  return (
    <div className="min-h-screen bg-nn-bg">
      {/* Header */}
      <div className="bg-nn-green text-white pt-28 pb-16 lg:pt-36 lg:pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-nn-gold font-medium text-sm uppercase tracking-wider mb-3">
            Mombasa, Kenya
          </p>
          <h1 className="font-heading text-4xl lg:text-5xl font-bold mb-4">Our Properties</h1>
          <p className="text-green-200 text-lg max-w-xl leading-relaxed">
            Fully furnished short-stay units in Nyali and Bamburi — each personally curated
            for comfort, cleanliness, and a genuine coastal experience.
          </p>
        </div>
      </div>

      {/* Properties grid with client-side filter */}
      <PropertiesClient properties={properties} />
    </div>
  )
}
