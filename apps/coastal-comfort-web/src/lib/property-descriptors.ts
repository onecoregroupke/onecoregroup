import type { Property } from '@ocg/db'

/**
 * Floor/level labels shown above Coastal Comfort property listings.
 */
const FLOOR_LABELS: Record<string, string> = {
  'sunset-suite-nuuranest': '1st Floor',
  'palm-retreat-nuuranest': '2nd Floor',
  'ocean-waves-nuuranest': '5th Floor',
  'ocean-waves-bamburi': '5th Floor',
  'coastal-haven-nuuranest': '6th Floor',
  'ocean-breeze-nuuranest': '2nd Floor',
  'coral-view-nuuranest': '1st Floor',
}

function getFloorLabelByName(name?: string | null): string | undefined {
  const normalizedName = name?.toLowerCase() ?? ''
  if (normalizedName.includes('ocean waves')) return '5th Floor'
  return undefined
}

/**
 * Returns a short, prominent descriptor for a property listing.
 * e.g. "Nyali 3 Bedroom Apartment · 1st Floor"
 */
export function getPropertyDescriptor(
  property: Pick<Property, 'slug' | 'neighbourhood' | 'bedrooms'> &
    Partial<Pick<Property, 'name'>>,
): string {
  const floor = FLOOR_LABELS[property.slug] ?? getFloorLabelByName(property.name)
  const beds = property.bedrooms ? `${property.bedrooms} Bedroom ` : ''
  const base = `${property.neighbourhood} ${beds}Apartment`
  return floor ? `${base} · ${floor}` : base
}
