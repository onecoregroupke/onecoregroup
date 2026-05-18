import type { Property } from '@ocg/db'

/**
 * Temporary floor/level labels per slug.
 * Update these once the actual floor numbers are confirmed.
 */
const FLOOR_LABELS: Record<string, string> = {
  'sunset-suite-nuuranest': 'First Floor',
  'palm-retreat-nuuranest': 'Third Floor',
  'coastal-haven-nuuranest': 'Second Floor',
  'ocean-breeze-nuuranest': 'Sixth Floor',
  'coral-view-nuuranest': 'Fourth Floor',
}

/**
 * Returns a short, prominent descriptor for a property listing.
 * e.g. "Nyali 3 Bedroom Apartment · First Floor"
 */
export function getPropertyDescriptor(
  property: Pick<Property, 'slug' | 'neighbourhood' | 'bedrooms'>,
): string {
  const floor = FLOOR_LABELS[property.slug]
  const beds = property.bedrooms ? `${property.bedrooms} Bedroom ` : ''
  const base = `${property.neighbourhood} ${beds}Apartment`
  return floor ? `${base} · ${floor}` : base
}
