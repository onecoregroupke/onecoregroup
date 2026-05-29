import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { createServerClient } from '@ocg/db'
import type { Property, PropertyReview } from '@ocg/db'
import { Bed, Bath, Users, ArrowLeft, Wifi, Wind, UtensilsCrossed, Car, Tv, WashingMachine, CheckCircle } from 'lucide-react'
import { StarRating } from '@/components/ui/StarRating'
import { EnquiryForm } from '@/components/property/EnquiryForm'
import { BookingSidebar } from '@/components/property/BookingSidebar'
import { PropertyGallery } from '@/components/property/PropertyGallery'
import { NearbyProperties } from '@/components/property/NearbyProperties'
import { formatKsh } from '@/lib/format'
import { resolvePhotos } from '@/lib/photos'

interface PageProps {
  params: Promise<{ slug: string }>
}

async function getProperty(slug: string): Promise<Property | null> {
  try {
    const supabase = createServerClient()
    const { data } = await supabase
      .from('properties')
      .select('*')
      .eq('slug', slug)
      .eq('is_active', true)
      .single()
    return data as Property | null
  } catch {
    return null
  }
}

async function getPropertyReviews(propertyId: string): Promise<PropertyReview[]> {
  try {
    const supabase = createServerClient()
    const { data } = await supabase
      .from('property_reviews')
      .select('*')
      .eq('property_id', propertyId)
      .order('review_date', { ascending: false })
    return (data as PropertyReview[]) ?? []
  } catch {
    return []
  }
}

const amenityIcons: Record<string, typeof Wifi> = {
  WiFi: Wifi,
  'Air Conditioning': Wind,
  Kitchen: UtensilsCrossed,
  Parking: Car,
  TV: Tv,
  'Washing Machine': WashingMachine,
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params
  const property = await getProperty(slug)
  if (!property) return { title: 'Property Not Found' }
  return {
    title: `${property.name} — ${property.neighbourhood}, Mombasa`,
    description: property.short_description ?? property.tagline,
  }
}

export default async function PropertyDetailPage({ params }: PageProps) {
  const { slug } = await params
  const property = await getProperty(slug)
  if (!property) notFound()

  const reviews = await getPropertyReviews(property.id)

  const resolved = resolvePhotos(property)
  const photos =
    resolved.length > 0
      ? resolved
      : [
          'https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?w=1200',
          'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800',
          'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?w=800',
        ]

  const amenities = (property.amenities as string[]) ?? []
  const highlights = (property.highlights as string[]) ?? []
  const houseRules = (property.house_rules as string[]) ?? []

  const whatsappMessage = `Hi! I'm interested in booking ${property.name}. Can you share availability and pricing?`

  return (
    <div className="min-h-screen bg-nn-bg">
      {/* Back link + header */}
      <div className="bg-white border-b border-gray-100 pt-20 lg:pt-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Link
            href="/properties"
            className="inline-flex items-center gap-2 text-gray-500 hover:text-nn-green text-sm transition-colors"
          >
            <ArrowLeft size={16} /> All Properties
          </Link>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-6">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <span className="inline-block bg-nn-green text-white text-xs font-medium px-3 py-1 rounded-full mb-3">
                {property.neighbourhood}
              </span>
              <h1 className="font-heading text-3xl lg:text-4xl font-bold text-nn-dark">
                {property.name}
              </h1>
              {property.tagline && (
                <p className="text-nn-gold italic mt-2">{property.tagline}</p>
              )}
            </div>
            {property.price_per_night_ksh != null && (
              <div className="text-right">
                <p className="text-2xl font-bold text-nn-green">
                  {formatKsh(Number(property.price_per_night_ksh))}
                </p>
                <p className="text-gray-400 text-sm">per night</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="lg:grid lg:grid-cols-3 lg:gap-10">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Photo Gallery */}
            <PropertyGallery photos={photos} propertyName={property.name} />

            {/* Info bar */}
            <div className="bg-white rounded-xl p-5 flex items-center justify-around gap-4 border border-gray-100">
              {property.bedrooms != null && (
                <div className="text-center">
                  <Bed size={24} className="text-nn-green mx-auto mb-1" />
                  <p className="font-semibold text-nn-dark">{property.bedrooms}</p>
                  <p className="text-gray-400 text-xs">Bedroom{property.bedrooms !== 1 ? 's' : ''}</p>
                </div>
              )}
              {property.bathrooms != null && (
                <div className="text-center">
                  <Bath size={24} className="text-nn-green mx-auto mb-1" />
                  <p className="font-semibold text-nn-dark">{property.bathrooms}</p>
                  <p className="text-gray-400 text-xs">Bathroom{property.bathrooms !== 1 ? 's' : ''}</p>
                </div>
              )}
              {property.max_guests != null && (
                <div className="text-center">
                  <Users size={24} className="text-nn-green mx-auto mb-1" />
                  <p className="font-semibold text-nn-dark">{property.max_guests}</p>
                  <p className="text-gray-400 text-xs">Guests</p>
                </div>
              )}
              {property.size_sqm != null && (
                <div className="text-center">
                  <div className="text-nn-green mx-auto mb-1 text-xl font-bold">m²</div>
                  <p className="font-semibold text-nn-dark">{property.size_sqm}</p>
                  <p className="text-gray-400 text-xs">Size</p>
                </div>
              )}
            </div>

            {/* Description */}
            {(property.full_description ?? property.short_description) && (
              <div className="bg-white rounded-xl p-6 border border-gray-100">
                <h2 className="font-heading text-xl font-semibold text-nn-dark mb-4">
                  About This Property
                </h2>
                <p className="text-gray-700 leading-relaxed">
                  {property.full_description ?? property.short_description}
                </p>
              </div>
            )}

            {/* Highlights */}
            {highlights.length > 0 && (
              <div className="bg-white rounded-xl p-6 border border-gray-100">
                <h2 className="font-heading text-xl font-semibold text-nn-dark mb-4">
                  Highlights
                </h2>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {highlights.map((h) => (
                    <li key={h} className="flex items-center gap-3 text-gray-700 text-sm">
                      <CheckCircle size={16} className="text-nn-green flex-shrink-0" />
                      {h}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Amenities */}
            {amenities.length > 0 && (
              <div className="bg-white rounded-xl p-6 border border-gray-100">
                <h2 className="font-heading text-xl font-semibold text-nn-dark mb-5">Amenities</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {amenities.map((amenity) => {
                    const Icon = amenityIcons[amenity] ?? CheckCircle
                    return (
                      <div key={amenity} className="flex items-center gap-3 text-gray-700 text-sm">
                        <Icon size={18} className="text-nn-green flex-shrink-0" />
                        {amenity}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Enquiry Form */}
            <EnquiryForm property={property} />

            {/* House Rules */}
            {houseRules.length > 0 && (
              <div className="bg-white rounded-xl p-6 border border-gray-100">
                <h2 className="font-heading text-xl font-semibold text-nn-dark mb-4">
                  House Rules
                </h2>
                <ul className="space-y-2">
                  {houseRules.map((rule) => (
                    <li key={rule} className="flex items-start gap-3 text-gray-700 text-sm">
                      <span className="text-nn-gold mt-0.5">•</span>
                      {rule}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Reviews */}
            <div className="bg-white rounded-xl p-6 border border-gray-100">
              <h2 className="font-heading text-xl font-semibold text-nn-dark mb-5">
                Guest Reviews {reviews.length > 0 && `(${reviews.length})`}
              </h2>
              {reviews.length > 0 ? (
                <div className="space-y-6">
                  {reviews.map((r) => (
                    <div key={r.id} className="border-b border-gray-100 pb-6 last:border-0 last:pb-0">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="font-semibold text-nn-dark">{r.reviewer_name}</p>
                          {r.reviewer_location && (
                            <p className="text-gray-400 text-xs">{r.reviewer_location}</p>
                          )}
                        </div>
                        <div className="text-right">
                          <StarRating rating={r.rating ?? 5} size={14} />
                          {r.review_date && (
                            <p className="text-gray-400 text-xs mt-1">
                              {new Date(r.review_date).toLocaleDateString('en-KE', {
                                month: 'short',
                                year: 'numeric',
                              })}
                            </p>
                          )}
                        </div>
                      </div>
                      <p className="text-gray-700 text-sm leading-relaxed italic">
                        &ldquo;{r.review_text}&rdquo;
                      </p>
                      <span className="inline-block mt-2 text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full capitalize">
                        via {r.platform?.replace('_', '.') ?? 'guest'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-400 text-sm">No reviews yet — be the first to stay!</p>
              )}
            </div>

            {/* Location */}
            <div className="bg-white rounded-xl p-6 border border-gray-100">
              <h2 className="font-heading text-xl font-semibold text-nn-dark mb-3">Location</h2>
              <p className="text-gray-700">
                Located in <strong>{property.neighbourhood}</strong>, Mombasa County, Kenya.
              </p>
              <p className="text-gray-500 text-sm mt-2">
                {property.location}
              </p>
              <div className="mt-4 h-40 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400 text-sm">
                Map coming soon — WhatsApp us for exact directions
              </div>
            </div>

            {/* Nearby */}
            <NearbyProperties currentSlug={property.slug} neighbourhood={property.neighbourhood} />
          </div>

          {/* Sticky sidebar */}
          <div className="hidden lg:block">
            <BookingSidebar
              property={property}
              whatsappMessage={whatsappMessage}
            />
          </div>
        </div>

        {/* Mobile bottom bar */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 flex items-center gap-3 z-40">
          <div className="flex-1">
            {property.price_per_night_ksh != null && (
              <p className="font-bold text-nn-green">
                {formatKsh(Number(property.price_per_night_ksh))}{' '}
                <span className="text-gray-400 font-normal text-sm">/ night</span>
              </p>
            )}
          </div>
          <a
            href={`https://wa.me/${process.env['NEXT_PUBLIC_NUURANEST_WHATSAPP']?.replace(/[^0-9]/g, '') ?? '254XXXXXXXXX'}?text=${encodeURIComponent(whatsappMessage)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-[#25d366] text-white px-5 py-2.5 rounded-full font-medium text-sm"
          >
            WhatsApp Us
          </a>
          <a
            href="#enquiry-form"
            className="bg-nn-green text-white px-5 py-2.5 rounded-full font-medium text-sm"
          >
            Enquire
          </a>
        </div>
      </div>
    </div>
  )
}
