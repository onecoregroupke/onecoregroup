'use client'

import { useState } from 'react'
import type { Property } from '@ocg/db'
import { PropertyCard } from '@/components/property/PropertyCard'
import { MapPin, LayoutGrid, Grid3x3, Grid2x2 } from 'lucide-react'

const FILTERS = ['All', 'Nyali', 'Bamburi'] as const
type Filter = (typeof FILTERS)[number]

const DEFAULT_SHOWN = 3

const COLS_OPTIONS = [
  { cols: 2, label: '2', icon: Grid2x2 },
  { cols: 3, label: '3', icon: Grid3x3 },
  { cols: 4, label: '4', icon: LayoutGrid },
] as const

const GRID_CLASS: Record<number, string> = {
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
}

export function PropertiesClient({ properties }: { properties: Property[] }) {
  const [active, setActive] = useState<Filter>('All')
  const [cols, setCols] = useState(3)
  const [showAll, setShowAll] = useState(false)

  const filtered =
    active === 'All'
      ? properties
      : properties.filter((p) => p.neighbourhood.toLowerCase() === active.toLowerCase())

  const visible = showAll ? filtered : filtered.slice(0, DEFAULT_SHOWN)
  const hasMore = filtered.length > DEFAULT_SHOWN

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-14">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-8">
        {/* Neighbourhood filter */}
        <MapPin size={16} className="text-nn-green flex-shrink-0" />
        <div className="flex gap-2 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => { setActive(f); setShowAll(false) }}
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

        {/* Spacer */}
        <span className="flex-1" />

        {/* Per-row toggle */}
        <div className="hidden sm:flex items-center gap-1 border border-gray-200 rounded-lg p-1 bg-white">
          {COLS_OPTIONS.map(({ cols: c, label, icon: Icon }) => (
            <button
              key={c}
              onClick={() => setCols(c)}
              title={`${c} per row`}
              className={`p-1.5 rounded transition-colors ${
                cols === c
                  ? 'bg-nn-green text-white'
                  : 'text-gray-400 hover:text-nn-green'
              }`}
            >
              <Icon size={16} />
            </button>
          ))}
        </div>

        {/* Count */}
        <span className="text-gray-400 text-sm hidden sm:block">
          {filtered.length} {filtered.length === 1 ? 'property' : 'properties'}
        </span>
      </div>

      {/* Grid */}
      {filtered.length > 0 ? (
        <>
          <div className={`grid gap-4 lg:gap-5 ${GRID_CLASS[cols]}`}>
            {visible.map((p) => (
              <PropertyCard key={p.id} property={p} compact={cols >= 3} />
            ))}
          </div>

          {hasMore && (
            <div className="mt-8 text-center">
              <button
                onClick={() => setShowAll((v) => !v)}
                className="px-8 py-3 border-2 border-nn-green text-nn-green font-medium rounded-full hover:bg-nn-green hover:text-white transition-colors text-sm"
              >
                {showAll
                  ? 'Show Less'
                  : `Show All ${filtered.length} Properties`}
              </button>
            </div>
          )}
        </>
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
