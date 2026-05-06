import { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { createServerClient } from '@ocg/db'
import type { Property } from '@ocg/db'
import { Heart, Shield, MessageSquare, Users } from 'lucide-react'

export const metadata: Metadata = {
  title: 'About Us',
  description: 'Learn about Nuuranest Stays — a personal collection of curated short-stay properties on the Mombasa coast.',
}

const values = [
  { icon: Heart, title: 'Comfort', desc: 'Every property is carefully furnished to feel like a real home — not a hotel room.' },
  { icon: Shield, title: 'Cleanliness', desc: 'Professional cleaning before every check-in. No shortcuts.' },
  { icon: MessageSquare, title: 'Communication', desc: "Direct WhatsApp access to your host. Questions answered, problems solved." },
  { icon: Users, title: 'Community', desc: 'We work with local cleaners, maintenance teams, and suppliers to support the community.' },
]

async function getProperties(): Promise<Property[]> {
  try {
    const supabase = createServerClient()
    const { data } = await supabase
      .from('properties')
      .select('id, slug, name, neighbourhood, bedrooms')
      .eq('is_active', true)
      .order('sort_order')
    return (data as Property[]) ?? []
  } catch {
    return []
  }
}

export default async function AboutPage() {
  const properties = await getProperties()

  return (
    <div className="min-h-screen bg-nn-bg">
      {/* Header */}
      <div className="bg-nn-green text-white pt-28 pb-16 lg:pt-36 lg:pb-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-nn-gold font-medium text-sm uppercase tracking-wider mb-3">Our Story</p>
          <h1 className="font-heading text-4xl lg:text-5xl font-bold mb-4">
            About Nuuranest Stays
          </h1>
          <p className="text-green-200 text-lg leading-relaxed max-w-2xl">
            A personal collection of curated short-stay properties on the Mombasa coast.
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16 space-y-14">
        {/* Story */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
          <div>
            <h2 className="font-heading text-2xl lg:text-3xl font-semibold text-nn-dark mb-4">
              More Than Just a Room
            </h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              Nuuranest is a collection of five personally curated short-stay properties on the
              Mombasa coast. We believe every traveller deserves a home — not just a room.
            </p>
            <p className="text-gray-700 leading-relaxed mb-4">
              Whether you&apos;re visiting for a weekend escape, a family holiday, or an extended
              work trip, our properties in Nyali and Bamburi offer the comfort, privacy, and
              convenience of home, with the warmth of a personal host.
            </p>
            <p className="text-gray-700 leading-relaxed">
              We&apos;re listed on Booking.com and Airbnb — but we always welcome direct bookings.
              Message us on WhatsApp for the best rates and fastest response.
            </p>
          </div>
          <div className="relative h-72 lg:h-80 rounded-xl overflow-hidden">
            <Image
              src="https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?w=800"
              alt="Nuuranest coastal property"
              fill
              className="object-cover"
              sizes="(max-width: 1024px) 100vw, 50vw"
            />
          </div>
        </div>

        {/* Our Properties */}
        {properties.length > 0 && (
          <div>
            <h2 className="font-heading text-2xl font-semibold text-nn-dark mb-6">
              Our Properties
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {properties.map((p) => (
                <Link
                  key={p.id}
                  href={`/properties/${p.slug}`}
                  className="flex items-center gap-4 bg-white rounded-xl p-4 border border-gray-100 hover:border-nn-green hover:shadow-sm transition-all group"
                >
                  <div className="w-10 h-10 bg-nn-green rounded-full flex items-center justify-center flex-shrink-0 text-white text-sm font-bold">
                    {p.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-nn-dark text-sm truncate">{p.name}</p>
                    <p className="text-gray-400 text-xs">
                      {p.neighbourhood} · {p.bedrooms} bed{p.bedrooms !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <span className="text-nn-green text-sm opacity-0 group-hover:opacity-100 transition-opacity">
                    →
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Values */}
        <div>
          <h2 className="font-heading text-2xl font-semibold text-nn-dark mb-6">
            Our Commitment
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {values.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex items-start gap-4 bg-white rounded-xl p-5 border border-gray-100">
                <div className="w-10 h-10 bg-nn-bg rounded-full flex items-center justify-center flex-shrink-0">
                  <Icon size={18} className="text-nn-green" />
                </div>
                <div>
                  <h3 className="font-semibold text-nn-dark mb-1">{title}</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Booking platforms */}
        <div className="bg-white rounded-xl p-6 border border-gray-100">
          <h2 className="font-heading text-xl font-semibold text-nn-dark mb-3">
            Find Us Online
          </h2>
          <p className="text-gray-600 text-sm mb-5 leading-relaxed">
            You can find us on Booking.com and Airbnb — or message us directly on WhatsApp for
            the best rates and a more personal experience.
          </p>
          <div className="flex flex-wrap gap-3">
            <a
              href="https://booking.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block bg-blue-600 text-white text-sm font-medium px-5 py-2.5 rounded-full hover:bg-blue-700 transition-colors"
            >
              Search on Booking.com
            </a>
            <a
              href="https://airbnb.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block bg-[#ff5a5f] text-white text-sm font-medium px-5 py-2.5 rounded-full hover:bg-[#e5393e] transition-colors"
            >
              Search on Airbnb
            </a>
          </div>
        </div>

        {/* CTA */}
        <div className="bg-nn-green rounded-xl p-8 text-center text-white">
          <h3 className="font-heading text-2xl font-bold mb-3">
            Come Stay With Us
          </h3>
          <p className="text-green-200 mb-6">
            Browse our properties and find your perfect coastal retreat.
          </p>
          <Link
            href="/properties"
            className="inline-block bg-white text-nn-green font-semibold px-8 py-3 rounded-full hover:bg-nn-bg transition-colors"
          >
            View Our Properties
          </Link>
        </div>
      </div>
    </div>
  )
}
