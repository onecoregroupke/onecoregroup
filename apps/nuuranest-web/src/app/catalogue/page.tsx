import fs from 'fs'
import path from 'path'
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

function getLocalPhotos(slug: string): string[] {
  try {
    const dir = path.join(process.cwd(), 'public', 'properties', slug)
    return fs
      .readdirSync(dir)
      .filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f))
      .sort((a, b) => {
        const n = (s: string) => parseInt(s.replace(/\D/g, ''), 10) || 0
        return n(a) - n(b)
      })
      .map((f) => `/properties/${slug}/${f}`)
  } catch {
    return []
  }
}

async function getAllProperties(): Promise<Property[]> {
  try {
    const supabase = createServerClient()
    const { data } = await supabase
      .from('properties')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
    const rows = (data as Property[]) ?? []
    // Bamburi first, then Nyali, preserving sort_order within each group
    return rows.sort((a, b) => {
      const rank = (n: string) => (n.toLowerCase() === 'bamburi' ? 0 : 1)
      return rank(a.neighbourhood) - rank(b.neighbourhood) || a.sort_order - b.sort_order
    })
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
      <div className="bg-nn-green text-white pt-28 pb-12 lg:pt-36 lg:pb-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-nn-gold font-medium text-sm uppercase tracking-wider mb-2">
            Full Catalogue
          </p>
          <h1 className="font-heading text-3xl lg:text-4xl font-bold mb-2">Our Properties</h1>
          <p className="text-green-200 text-base max-w-xl leading-relaxed">
            Five fully furnished short-stay units in Nyali and Bamburi, Mombasa.
          </p>
        </div>
      </div>

      {/* Catalogue list */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-14">
        {properties.length === 0 ? (
          <div className="text-center py-24 text-gray-400">
            <MapPin size={48} className="mx-auto mb-4 opacity-30" />
            <p className="text-xl font-medium">No properties available yet</p>
          </div>
        ) : (
          <div className="space-y-5">
            {properties.map((property, index) => {
              const localPhotos = getLocalPhotos(property.slug)
              const dbPhotos = Array.isArray(property.photos) ? (property.photos as string[]) : []
              const photos = localPhotos.length > 0 ? localPhotos : dbPhotos
              const mainPhoto =
                photos[0] ?? 'https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?w=800'
              const thumbs = photos.slice(1, 4)

              return (
                <article
                  key={property.id}
                  className="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex flex-col sm:flex-row">
                    {/* Image column */}
                    <div className="sm:w-64 lg:w-72 flex-shrink-0">
                      <div className="relative h-48 sm:h-full min-h-[192px]">
                        <Image
                          src={mainPhoto}
                          alt={property.name}
                          fill
                          className="object-cover"
                          sizes="(max-width: 640px) 100vw, 288px"
                          priority={index === 0}
                        />
                        <div className="absolute top-3 left-3 flex gap-1.5">
                          <span className="bg-nn-green text-white text-[11px] font-medium px-2 py-0.5 rounded-full">
                            {property.neighbourhood}
                          </span>
                          {property.is_featured && (
                            <span className="bg-nn-gold text-white text-[11px] font-medium px-2 py-0.5 rounded-full">
                              Featured
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Thumbnail row */}
                      {thumbs.length > 0 && (
                        <div className={`grid gap-0.5 grid-cols-${thumbs.length}`}>
                          {thumbs.map((src, i) => (
                            <div key={i} className="relative aspect-video">
                              <Image
                                src={src}
                                alt={`${property.name} photo ${i + 2}`}
                                fill
                                className="object-cover"
                                sizes="96px"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Details column */}
                    <div className="flex flex-col justify-between flex-1 p-5">
                      <div>
                        <p className="text-nn-gold text-[11px] font-semibold uppercase tracking-widest mb-1">
                          {property.location}
                        </p>
                        <h2 className="font-heading text-xl font-bold text-nn-dark leading-snug mb-0.5">
                          {property.name}
                        </h2>
                        {property.tagline && (
                          <p className="text-nn-green italic text-sm mb-3">{property.tagline}</p>
                        )}

                        {/* Specs */}
                        <div className="flex flex-wrap gap-3 text-gray-500 text-xs mb-3">
                          {property.bedrooms != null && (
                            <span className="flex items-center gap-1">
                              <Bed size={13} />
                              {property.bedrooms} bed{property.bedrooms !== 1 ? 's' : ''}
                            </span>
                          )}
                          {property.bathrooms != null && (
                            <span className="flex items-center gap-1">
                              <Bath size={13} />
                              {property.bathrooms} bath{property.bathrooms !== 1 ? 's' : ''}
                            </span>
                          )}
                          {property.max_guests != null && (
                            <span className="flex items-center gap-1">
                              <Users size={13} />
                              {property.max_guests} guests max
                            </span>
                          )}
                        </div>

                        {property.short_description && (
                          <p className="text-gray-600 text-sm leading-relaxed line-clamp-2">
                            {property.short_description}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-3 border-t border-gray-100">
                        {/* Price */}
                        <div>
                          {property.price_per_night_ksh != null && (
                            <p className="text-nn-green font-bold text-base">
                              {formatKsh(Number(property.price_per_night_ksh))}{' '}
                              <span className="text-gray-400 font-normal text-xs">/ night</span>
                            </p>
                          )}
                          {property.weekend_price_ksh != null && (
                            <p className="text-gray-400 text-xs">
                              {formatKsh(Number(property.weekend_price_ksh))} weekends
                            </p>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/properties/${property.slug}`}
                            className="inline-flex items-center gap-1.5 bg-nn-green text-white font-semibold px-4 py-2 rounded-full hover:bg-green-900 transition-colors text-xs"
                          >
                            View <ArrowRight size={13} />
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
                              className="text-[11px] text-gray-500 hover:text-nn-green border border-gray-200 px-2.5 py-1.5 rounded-full transition-colors"
                            >
                              Booking.com
                            </a>
                          )}
                          {property.airbnb_url && (
                            <a
                              href={property.airbnb_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] text-gray-500 hover:text-nn-green border border-gray-200 px-2.5 py-1.5 rounded-full transition-colors"
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
