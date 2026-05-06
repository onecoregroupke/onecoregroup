import { createServerClient } from '@ocg/db'
import type { Property } from '@ocg/db'
import { PropertyCard } from './PropertyCard'

interface NearbyPropertiesProps {
  currentSlug: string
  neighbourhood: string
}

export async function NearbyProperties({ currentSlug, neighbourhood }: NearbyPropertiesProps) {
  let nearby: Property[] = []
  try {
    const supabase = createServerClient()
    const { data } = await supabase
      .from('properties')
      .select('*')
      .eq('is_active', true)
      .neq('slug', currentSlug)
      .order('sort_order')
      .limit(3)
    nearby = (data as Property[]) ?? []
  } catch {
    return null
  }

  if (nearby.length === 0) return null

  return (
    <div className="bg-white rounded-xl p-6 border border-gray-100">
      <h2 className="font-heading text-xl font-semibold text-nn-dark mb-5">
        Other Properties You May Like
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {nearby.map((p) => (
          <PropertyCard key={p.id} property={p} compact />
        ))}
      </div>
    </div>
  )
}
