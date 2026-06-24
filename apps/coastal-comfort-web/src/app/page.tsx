export const dynamic = 'force-dynamic'

import Image from 'next/image'
import { createClient } from '@supabase/supabase-js'
import type { Database, Property } from '@ocg/db'
import { Bath, Bed, MapPin, Users } from 'lucide-react'
import { CataloguePhotoSlider } from '@/components/catalogue/CataloguePhotoSlider'
import { getPropertyDescriptor } from '@/lib/property-descriptors'
import { sortListings } from '@/lib/property-listing'
import { resolvePhotos } from '@/lib/photos'

export const metadata = {
  title: 'Catalogue',
  description:
    'Browse Coastal Comfort furnished coastal stays in Nyali and Bamburi, Mombasa.',
}

const coastalNames: Record<string, string> = {
  'sunset-suite-nuuranest': 'Harbour Light Residence',
  'palm-retreat-nuuranest': 'Palmline Hideaway',
  'ocean-waves-nuuranest': 'Sea Glass Apartment',
  'ocean-waves-bamburi': 'Sea Glass Apartment',
  'coastal-haven-nuuranest': 'Shoreline Haven',
  'ocean-breeze-nuuranest': 'Tides View Suite',
  'coral-view-nuuranest': 'Coralstone Retreat',
}

function getDisplayName(property: Property): string {
  if (property.name.toLowerCase().includes('ocean waves')) return 'Sea Glass Apartment'
  return coastalNames[property.slug] ?? property.name
}

async function getAllProperties(): Promise<Property[]> {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL']
  const key =
    process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']

  if (!url || !key) return []

  try {
    const supabase = createClient<Database>(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data } = await supabase
      .from('properties')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
    return (data as Property[]) ?? []
  } catch {
    return []
  }
}

export default async function CataloguePage() {
  const properties = sortListings(await getAllProperties())

  return (
    <div className="min-h-screen bg-nn-bg">
      <header className="bg-nn-green text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex items-center justify-between">
          <div>
            <p className="text-nn-gold text-xs font-semibold uppercase tracking-[0.28em]">
              Coastal Comfort
            </p>
            <p className="font-heading text-2xl font-semibold">Property Catalogue</p>
          </div>
          <p className="hidden sm:block text-green-200 text-sm">Nyali & Bamburi, Mombasa</p>
        </div>
      </header>

      <section className="bg-nn-green text-white pb-16 lg:pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 lg:pt-16">
          <p className="text-nn-gold font-medium text-sm uppercase tracking-wider mb-3">
            Furnished Coastal Stays
          </p>
          <h1 className="font-heading text-4xl lg:text-5xl font-bold mb-4">
            Coastal Comfort Catalogue
          </h1>
          <p className="text-green-200 text-lg max-w-2xl leading-relaxed">
            A curated selection of furnished apartments across Nyali and Bamburi, Mombasa,
            presented for easy browsing without booking links, contact details, or public rates.
          </p>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 lg:py-20">
        {properties.length === 0 ? (
          <div className="text-center py-24 text-gray-400">
            <MapPin size={48} className="mx-auto mb-4 opacity-30" />
            <p className="text-xl font-medium">No properties available yet</p>
          </div>
        ) : (
          <div className="space-y-16 lg:space-y-24">
            {properties.map((property, index) => {
              const photos = resolvePhotos(property)
              const isEven = index % 2 === 0
              const displayName = getDisplayName(property)

              return (
                <article
                  key={property.id}
                  className="bg-white rounded-2xl overflow-hidden shadow-sm"
                >
                  <div className="px-6 pt-5 pb-4 flex items-center gap-2 border-b border-gray-50">
                    <MapPin size={13} className="text-nn-green flex-shrink-0" />
                    <p className="text-nn-green text-sm font-semibold uppercase tracking-wide flex-1">
                      {getPropertyDescriptor(property)}
                    </p>
                    {property.is_featured && (
                      <span className="flex-shrink-0 bg-nn-gold text-white text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide">
                        Featured
                      </span>
                    )}
                  </div>

                  <div
                    className={`flex flex-col ${isEven ? 'lg:flex-row' : 'lg:flex-row-reverse'}`}
                  >
                    <div className="lg:w-1/2 relative">
                      {photos.length > 0 ? (
                        <CataloguePhotoSlider photos={photos} propertyName={displayName} />
                      ) : (
                        <div className="relative aspect-[4/3] lg:aspect-auto lg:h-full min-h-[280px]">
                          <Image
                            src="https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?w=1200"
                            alt={displayName}
                            fill
                            className="object-cover"
                            sizes="(max-width: 1024px) 100vw, 50vw"
                            priority={index === 0}
                          />
                        </div>
                      )}
                    </div>

                    <div className="lg:w-1/2 flex flex-col justify-between p-6 lg:p-10">
                      <div>
                        <h2 className="font-heading text-2xl lg:text-3xl font-bold text-nn-dark mb-1">
                          {displayName}
                        </h2>
                        {property.tagline && (
                          <p className="text-nn-green italic text-base mb-4">{property.tagline}</p>
                        )}

                        <div className="flex flex-wrap gap-4 text-gray-500 text-sm mb-5">
                          {property.bedrooms != null && (
                            <span className="flex items-center gap-1.5">
                              <Bed size={15} />
                              {property.bedrooms} bedroom{property.bedrooms !== 1 ? 's' : ''}
                            </span>
                          )}
                          {property.bathrooms != null && (
                            <span className="flex items-center gap-1.5">
                              <Bath size={15} />
                              {property.bathrooms} bathroom{property.bathrooms !== 1 ? 's' : ''}
                            </span>
                          )}
                          {property.max_guests != null && (
                            <span className="flex items-center gap-1.5">
                              <Users size={15} />
                              Up to {property.max_guests} guests
                            </span>
                          )}
                        </div>

                        {property.short_description && (
                          <p className="text-gray-600 leading-relaxed text-sm lg:text-base mb-6">
                            {property.short_description}
                          </p>
                        )}

                        {Array.isArray(property.highlights) && property.highlights.length > 0 && (
                          <ul className="space-y-1.5">
                            {(property.highlights as string[]).slice(0, 4).map((highlight) => (
                              <li
                                key={highlight}
                                className="flex items-start gap-2 text-sm text-gray-700"
                              >
                                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-nn-gold flex-shrink-0" />
                                {highlight}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <footer className="bg-nn-green text-green-200 text-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
          <p className="font-heading text-white text-lg">Coastal Comfort</p>
          <p>Furnished coastal stay catalogue for Nyali and Bamburi, Mombasa.</p>
        </div>
      </footer>
    </div>
  )
}
