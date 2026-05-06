import Image from 'next/image'
import Link from 'next/link'
import { Bed, Bath, Users } from 'lucide-react'
import type { Property } from '@ocg/db'

interface PropertyCardProps {
  property: Property
  compact?: boolean
}

function formatKsh(amount: number) {
  return `KSH ${amount.toLocaleString('en-KE')}`
}

export function PropertyCard({ property, compact = false }: PropertyCardProps) {
  const photo =
    Array.isArray(property.photos) && property.photos.length > 0
      ? (property.photos[0] as string)
      : 'https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?w=800'

  return (
    <div className="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow group">
      <div className="relative aspect-[4/3] overflow-hidden">
        <Image
          src={photo}
          alt={property.name}
          fill
          className="object-cover group-hover:scale-105 transition-transform duration-500"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
        />
        <div className="absolute top-3 left-3">
          <span className="bg-nn-green text-white text-xs font-medium px-3 py-1 rounded-full">
            {property.neighbourhood}
          </span>
        </div>
        {property.is_featured && (
          <div className="absolute top-3 right-3">
            <span className="bg-nn-gold text-white text-xs font-medium px-3 py-1 rounded-full">
              Featured
            </span>
          </div>
        )}
      </div>

      <div className="p-5">
        <h3 className="font-heading text-lg font-semibold text-nn-dark mb-1 leading-tight">
          {property.name}
        </h3>
        {property.tagline && (
          <p className="text-nn-gold text-sm italic mb-2">{property.tagline}</p>
        )}
        {!compact && property.short_description && (
          <p className="text-gray-600 text-sm mb-3 line-clamp-2">{property.short_description}</p>
        )}

        {/* Icons row */}
        <div className="flex items-center gap-4 text-gray-500 text-sm mb-4">
          {property.bedrooms != null && (
            <span className="flex items-center gap-1">
              <Bed size={14} /> {property.bedrooms} bed{property.bedrooms !== 1 ? 's' : ''}
            </span>
          )}
          {property.bathrooms != null && (
            <span className="flex items-center gap-1">
              <Bath size={14} /> {property.bathrooms} bath{property.bathrooms !== 1 ? 's' : ''}
            </span>
          )}
          {property.max_guests != null && (
            <span className="flex items-center gap-1">
              <Users size={14} /> {property.max_guests} guests
            </span>
          )}
        </div>

        {/* Price */}
        {property.price_per_night_ksh != null && (
          <p className="text-nn-green font-semibold text-base mb-4">
            {formatKsh(Number(property.price_per_night_ksh))}{' '}
            <span className="text-gray-400 font-normal text-sm">/ night</span>
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Link
            href={`/properties/${property.slug}`}
            className="flex-1 text-center bg-nn-green text-white text-sm font-medium py-2.5 rounded-lg hover:bg-green-900 transition-colors"
          >
            View Details
          </Link>
          {property.booking_com_url && (
            <a
              href={property.booking_com_url}
              target="_blank"
              rel="noopener noreferrer"
              title="Book on Booking.com"
              className="px-3 py-2.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-xs text-gray-600"
            >
              Bk.com
            </a>
          )}
          {property.airbnb_url && (
            <a
              href={property.airbnb_url}
              target="_blank"
              rel="noopener noreferrer"
              title="Book on Airbnb"
              className="px-3 py-2.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-xs text-gray-600"
            >
              Airbnb
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
