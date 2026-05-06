'use client'

import { useState } from 'react'
import type { Property } from '@ocg/db'
import { PropertyCard } from '@/components/property/PropertyCard'
import { MapPin } from 'lucide-react'

const FILTERS = ['All', 'Nyali', 'Bamburi'] as const
type Filter = (typeof FILTERS)[number]

export function PropertiesClient({ properties }: { properties: Property[] }) {
  const [active, setActive] = useState<Filter>('All')

  const filtered =
    active === 'All'
      ? properties
      : properties.filter((p) => p.neighbourhood.toLowerCase() === active.toLowerCase())

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-14">
      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-8">
        <MapPin size={16} className="text-nn-green flex-shrink-0" />
        <div className="flex gap-2 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setActive(f)}
              className={`px-5 py-2 rounded-full text-sm font-medium transition-colors border ${
                active === f
                  ? 'bg-nn-green text-white border-nn-green'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-nn-green hover:text-nn-green'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <span className="text-gray-400 text-sm ml-auto hidden sm:block">
          {filtered.length} {filtered.length === 1 ? 'property' : 'properties'}
        </span>
      </div>

      {/* Grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
          {filtered.map((p) => (
            <PropertyCard key={p.id} property={p} />
          ))}
        </div>
      ) : (
        <div className="text-center py-20 text-gray-400">
          <MapPin size={40} className="mx-auto mb-4 opacity-40" />
          <p className="text-lg font-medium">No properties in {active} yet</p>
          <p className="text-sm mt-1">Try a different neighbourhood filter</p>
        </div>
      )}
    </div>
  )
}
