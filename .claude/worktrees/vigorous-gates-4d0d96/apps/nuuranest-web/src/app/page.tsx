export const dynamic = 'force-dynamic'

import Image from 'next/image'
import Link from 'next/link'
import { createServerClient } from '@ocg/db'
import type { Property, PropertyReview } from '@ocg/db'
import { PropertyCard } from '@/components/property/PropertyCard'
import { StarRating } from '@/components/ui/StarRating'
import { WhatsAppButton } from '@/components/ui/WhatsAppButton'
import { withResolvedPhotos } from '@/lib/photos'
import { Home, MapPin, Clock, MessageCircle, ChevronDown, Star } from 'lucide-react'

async function getFeaturedProperties(): Promise<Property[]> {
  try {
    const supabase = createServerClient()
    const { data } = await supabase
      .from('properties')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
      .limit(3)
    return ((data as Property[]) ?? []).map(withResolvedPhotos)
  } catch {
    return []
  }
}

async function getFeaturedReviews(): Promise<PropertyReview[]> {
  try {
    const supabase = createServerClient()
    const { data } = await supabase
      .from('property_reviews')
      .select('*')
      .eq('is_featured', true)
      .order('review_date', { ascending: false })
      .limit(3)
    return (data as PropertyReview[]) ?? []
  } catch {
    return []
  }
}

const placeholderReviews: Partial<PropertyReview>[] = [
  {
    id: '1',
    reviewer_name: 'Amina W.',
    reviewer_location: 'Nairobi, Kenya',
    rating: 5,
    review_text:
      'Absolutely loved our stay! The apartment was spotless, the AC worked perfectly, and the host was responsive. Will definitely book again.',
    platform: 'booking_com',
    review_date: '2025-03-15',
  },
  {
    id: '2',
    reviewer_name: 'David M.',
    reviewer_location: 'Kampala, Uganda',
    rating: 5,
    review_text:
      'Perfect location, great value for money. Felt right at home. The kitchen was well-stocked and the WiFi was fast.',
    platform: 'airbnb',
    review_date: '2025-02-20',
  },
  {
    id: '3',
    reviewer_name: 'Fatima A.',
    reviewer_location: 'Dubai, UAE',
    rating: 4,
    review_text:
      'Lovely apartment in a quiet neighbourhood. Very clean and comfortable. Easy check-in process.',
    platform: 'booking_com',
    review_date: '2025-01-10',
  },
]

const features = [
  {
    icon: Home,
    title: 'Fully Furnished',
    desc: 'Move in and feel at home immediately. Everything you need is already there.',
  },
  {
    icon: MapPin,
    title: 'Prime Locations',
    desc: "Nyali and Bamburi — Mombasa's most sought-after coastal neighbourhoods.",
  },
  {
    icon: Clock,
    title: 'Flexible Stays',
    desc: 'Weekend getaway or extended stay — we accommodate your schedule.',
  },
  {
    icon: MessageCircle,
    title: 'Responsive Host',
    desc: 'Direct WhatsApp access. Real answers, fast. No call centres.',
  },
]

const neighbourhoods = [
  {
    name: 'Nyali',
    desc: "A leafy, upmarket neighbourhood just north of Mombasa Island. Home to Nyali Beach, the Mombasa Golf Club, and some of the coast's best restaurants and shopping centres.",
    image: 'https://images.unsplash.com/photo-1566438480900-0609be27a4be?w=800',
  },
  {
    name: 'Bamburi',
    desc: 'Known for its pristine beach and the famous Haller Park, Bamburi is a lively strip with beach hotels, seafood restaurants, and direct ocean access — a classic Mombasa experience.',
    image: 'https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?w=800',
  },
]

export default async function HomePage() {
  const [featuredProperties, reviews] = await Promise.all([
    getFeaturedProperties(),
    getFeaturedReviews(),
  ])

  const displayReviews = reviews.length > 0 ? reviews : (placeholderReviews as PropertyReview[])

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        <Image
          src="https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?w=1600"
          alt="Coastal Mombasa property"
          fill
          className="object-cover"
          priority
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/30 to-black/60" />

        <div className="relative z-10 text-center text-white px-4 max-w-4xl mx-auto">
          <p className="text-nn-gold font-medium text-sm uppercase tracking-widest mb-4">
            Mombasa, Kenya
          </p>
          <h1 className="font-heading text-4xl sm:text-5xl lg:text-7xl font-bold mb-6 leading-tight">
            Your Home on the Coast
          </h1>
          <p className="text-lg sm:text-xl text-gray-200 mb-10 max-w-2xl mx-auto leading-relaxed">
            Five beautifully appointed short-stay properties in Nyali and Bamburi, Mombasa.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/properties"
              className="bg-white text-nn-green font-semibold px-8 py-3.5 rounded-full hover:bg-nn-bg transition-colors text-base"
            >
              Browse Properties
            </Link>
            <WhatsAppButton label="Book via WhatsApp" size="lg" />
          </div>
        </div>

        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white animate-bounce">
          <ChevronDown size={28} />
        </div>
      </section>

      {/* Featured Properties */}
      <section className="bg-nn-bg py-16 lg:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between mb-10">
            <div>
              <p className="text-nn-gold font-medium text-sm uppercase tracking-wider mb-2">
                Our Properties
              </p>
              <h2 className="font-heading text-3xl lg:text-4xl font-semibold text-nn-dark">
                Our Stays
              </h2>
            </div>
            <Link
              href="/properties"
              className="text-nn-green font-medium hover:text-green-800 transition-colors hidden sm:block"
            >
              View All Properties →
            </Link>
          </div>

          {featuredProperties.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
              {featuredProperties.map((p) => (
                <PropertyCard key={p.id} property={p} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-white rounded-xl overflow-hidden shadow-sm animate-pulse">
                  <div className="aspect-[4/3] bg-gray-200" />
                  <div className="p-5 space-y-3">
                    <div className="h-4 bg-gray-200 rounded w-1/3" />
                    <div className="h-6 bg-gray-200 rounded w-2/3" />
                    <div className="h-10 bg-gray-200 rounded w-full mt-4" />
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-8 text-center sm:hidden">
            <Link
              href="/properties"
              className="text-nn-green font-medium hover:text-green-800 transition-colors"
            >
              View All Properties →
            </Link>
          </div>
        </div>
      </section>

      {/* Why Nuuranest */}
      <section className="bg-white py-16 lg:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <p className="text-nn-gold font-medium text-sm uppercase tracking-wider mb-2">
              Why Choose Us
            </p>
            <h2 className="font-heading text-3xl lg:text-4xl font-semibold text-nn-dark">
              The Nuuranest Difference
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
            {features.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="text-center p-6 rounded-xl bg-nn-bg hover:shadow-md transition-shadow"
              >
                <div className="inline-flex items-center justify-center w-14 h-14 bg-nn-green rounded-full mb-4">
                  <Icon size={24} className="text-white" />
                </div>
                <h3 className="font-heading text-lg font-semibold text-nn-dark mb-2">{title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Reviews */}
      <section className="bg-nn-bg py-16 lg:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <p className="text-nn-gold font-medium text-sm uppercase tracking-wider mb-2">
              Guest Reviews
            </p>
            <h2 className="font-heading text-3xl lg:text-4xl font-semibold text-nn-dark">
              What Our Guests Say
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {displayReviews.map((review) => (
              <div key={review.id} className="bg-white rounded-xl p-6 shadow-sm">
                <StarRating rating={review.rating ?? 5} size={18} />
                <p className="text-gray-700 text-sm leading-relaxed mt-4 mb-6 italic">
                  &ldquo;{review.review_text}&rdquo;
                </p>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-nn-dark text-sm">{review.reviewer_name}</p>
                    {review.reviewer_location && (
                      <p className="text-gray-400 text-xs">{review.reviewer_location}</p>
                    )}
                  </div>
                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full capitalize">
                    {review.platform?.replace('_', '.') ?? 'Guest'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Neighbourhoods */}
      <section className="bg-white py-16 lg:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <p className="text-nn-gold font-medium text-sm uppercase tracking-wider mb-2">
              Locations
            </p>
            <h2 className="font-heading text-3xl lg:text-4xl font-semibold text-nn-dark">
              {"Mombasa's Best Neighbourhoods"}
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
            {neighbourhoods.map((n) => (
              <div key={n.name} className="relative rounded-xl overflow-hidden group">
                <div className="relative h-64 lg:h-80">
                  <Image
                    src={n.image}
                    alt={n.name}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-500"
                    sizes="(max-width: 768px) 100vw, 50vw"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                </div>
                <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
                  <h3 className="font-heading text-2xl font-semibold mb-2">{n.name}</h3>
                  <p className="text-gray-200 text-sm leading-relaxed">{n.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-nn-green py-16 lg:py-24">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-white">
          <Star size={32} className="text-nn-gold mx-auto mb-4" />
          <h2 className="font-heading text-3xl lg:text-4xl font-bold mb-4">
            Ready to Book Your Stay?
          </h2>
          <p className="text-green-200 text-lg mb-8 leading-relaxed">
            Message us directly on WhatsApp for the fastest response — or browse all five
            properties to find your perfect match.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <WhatsAppButton
              label="WhatsApp Us Now"
              size="lg"
              message="Hi! I'd like to book a stay at Nuuranest. Can you share availability?"
            />
            <Link
              href="/properties"
              className="border-2 border-white text-white font-semibold px-8 py-3.5 rounded-full hover:bg-white hover:text-nn-green transition-colors"
            >
              Browse All Properties
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
