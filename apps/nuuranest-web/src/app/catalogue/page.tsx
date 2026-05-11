import Image from 'next/image'
import Link from 'next/link'
import { createServerClient } from '@ocg/db'
import type { Property } from '@ocg/db'
import { Bed, Bath, Users, MapPin, ArrowRight } from 'lucide-react'
import { WhatsAppButton } from '@/components/ui/WhatsAppButton'

export const metadata = {
  title: 'Property Catalogue',
  description:
    'Browse the full Nuuranest Stays catalogue — five fully furnished short-stay properties in Nyali and Bamburi, Mombasa.',
}

async function getAllProperties(): Promise<Property[]> {
  try {
    const supabase = createServerClient()
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

function formatKsh(amount: number) {
  return `KSH ${amount.toLocaleString('en-KE')}`
}

export default async function CataloguePage() {
  const properties = await getAllProperties()

  return (
    <div className="min-h-screen bg-nn-bg">
      {/* Header */}
      <div className="bg-nn-green text-white pt-28 pb-16 lg:pt-36 lg:pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-nn-gold font-medium text-sm uppercase tracking-wider mb-3">
            Full Catalogue
          </p>
          <h1 className="font-heading text-4xl lg:text-5xl font-bold mb-4">Our Properties</h1>
          <p className="text-green-200 text-lg max-w-xl leading-relaxed">
            Every Nuuranest Stays property — each personally curated for comfort, cleanliness, and a
            genuine coastal experience.
          </p>
        </div>
      </div>

      {/* Catalogue entries */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 lg:py-20">
        {properties.length === 0 ? (
          <div className="text-center py-24 text-gray-400">
            <MapPin size={48} className="mx-auto mb-4 opacity-30" />
            <p className="text-xl font-medium">No properties available yet</p>
          </div>
        ) : (
          <div className="space-y-16 lg:space-y-24">
            {properties.map((property, index) => {
              const photo =
                Array.isArray(property.photos) && property.photos.length > 0
                  ? (property.photos[0] as string)
                  : 'https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?w=1200'

              const extraPhotos = Array.isArray(property.photos)
                ? (property.photos.slice(1, 4) as string[])
                : []

              const isEven = index % 2 === 0

              return (
                <article
                  key={property.id}
                  className="bg-white rounded-2xl overflow-hidden shadow-sm"
                >
                  <div
                    className={`flex flex-col ${isEven ? 'lg:flex-row' : 'lg:flex-row-reverse'}`}
                  >
                    {/* Image block */}
                    <div className="lg:w-1/2 relative">
                      <div className="relative aspect-[4/3] lg:aspect-auto lg:h-full min-h-[280px]">
                        <Image
                          src={photo}
                          alt={property.name}
                          fill
                          className="object-cover"
                          sizes="(max-width: 1024px) 100vw, 50vw"
                          priority={index === 0}
                        />
                        <div className="absolute top-4 left-4 flex gap-2">
                          <span className="bg-nn-green text-white text-xs font-medium px-3 py-1 rounded-full">
                            {property.neighbourhood}
                          </span>
                          {property.is_featured && (
                            <span className="bg-nn-gold text-white text-xs font-medium px-3 py-1 rounded-full">
                              Featured
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Extra thumbnail strip */}
                      {extraPhotos.length > 0 && (
                        <div className="grid grid-cols-3 gap-0.5">
                          {extraPhotos.map((src, i) => (
                            <div key={i} className="relative aspect-[4/3]">
                              <Image
                                src={src}
                                alt={`${property.name} photo ${i + 2}`}
                                fill
                                className="object-cover"
                                sizes="(max-width: 1024px) 33vw, 16vw"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Details block */}
                    <div className="lg:w-1/2 flex flex-col justify-between p-6 lg:p-10">
                      <div>
                        <p className="text-nn-gold text-xs font-semibold uppercase tracking-widest mb-2">
                          {property.location}
                        </p>
                        <h2 className="font-heading text-2xl lg:text-3xl font-bold text-nn-dark mb-1">
                          {property.name}
                        </h2>
                        {property.tagline && (
                          <p className="text-nn-green italic text-base mb-4">{property.tagline}</p>
                        )}

                        {/* Specs */}
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

                        {/* Highlights */}
                        {Array.isArray(property.highlights) && property.highlights.length > 0 && (
                          <ul className="space-y-1.5 mb-6">
                            {(property.highlights as string[]).slice(0, 4).map((h) => (
                              <li key={h} className="flex items-start gap-2 text-sm text-gray-700">
                                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-nn-gold flex-shrink-0" />
                                {h}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      <div className="pt-4 border-t border-gray-100">
                        {/* Price */}
                        {property.price_per_night_ksh != null && (
                          <p className="text-nn-green font-bold text-xl mb-4">
                            {formatKsh(Number(property.price_per_night_ksh))}{' '}
                            <span className="text-gray-400 font-normal text-sm">/ night</span>
                            {property.weekend_price_ksh != null && (
                              <span className="text-gray-400 font-normal text-sm ml-2">
                                · {formatKsh(Number(property.weekend_price_ksh))} weekends
                              </span>
                            )}
                          </p>
                        )}

                        {/* Actions */}
                        <div className="flex flex-wrap items-center gap-3">
                          <Link
                            href={`/properties/${property.slug}`}
                            className="inline-flex items-center gap-2 bg-nn-green text-white font-semibold px-6 py-2.5 rounded-full hover:bg-green-900 transition-colors text-sm"
                          >
                            View Property <ArrowRight size={15} />
                          </Link>
                          <WhatsAppButton
                            size="sm"
                            label="Enquire"
                            message={`Hi! I'm interested in ${property.name}. Can you share availability and pricing?`}
                          />
                          {property.booking_com_url && (
                            <a
                              href={property.booking_com_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-gray-500 hover:text-nn-green transition-colors border border-gray-200 px-3 py-2 rounded-full"
                            >
                              Booking.com
                            </a>
                          )}
                          {property.airbnb_url && (
                            <a
                              href={property.airbnb_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-gray-500 hover:text-nn-green transition-colors border border-gray-200 px-3 py-2 rounded-full"
                            >
                              Airbnb
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
