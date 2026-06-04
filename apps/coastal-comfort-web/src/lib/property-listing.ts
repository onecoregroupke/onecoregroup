import type { Property } from '@ocg/db'
import { getPropertyDescriptor } from './property-descriptors'

const BAMBURI_AMENITIES = [
  'Secure 24/7 Parking',
  'Walking Distance to Beach',
  'Daily Room Cleaning (Alternate Days)',
  'Water & Fan',
  'Netflix',
  'High-Speed Internet',
  'Air Conditioning',
  'Fully Equipped Kitchen',
]

const BAMBURI_HIGHLIGHTS = [
  'Steps from Bamburi Beach',
  'Secure 24/7 parking on-site',
  'Netflix & high-speed internet included',
  'Room cleaning on alternate days',
  'Convenient location near restaurants & shops',
  'Clean, well-maintained rooms',
]

function isOceanWaves(property: Pick<Property, 'slug' | 'name'>): boolean {
  return (
    property.slug.toLowerCase().includes('ocean-waves') ||
    property.name.toLowerCase().includes('ocean waves')
  )
}

export function normalizePropertyListing(property: Property): Property {
  if (!isOceanWaves(property)) return property

  return {
    ...property,
    name: 'Ocean Waves by Nuuranest Stays',
    neighbourhood: 'Bamburi',
    amenities: BAMBURI_AMENITIES,
    highlights: BAMBURI_HIGHLIGHTS,
  }
}

function locationRank(property: Property): number {
  const neighbourhood = property.neighbourhood.toLowerCase()
  if (neighbourhood.includes('nyali')) return 1
  if (neighbourhood.includes('bamburi')) return 2
  return 3
}

function floorNumberFromDescriptor(property: Property): number {
  const descriptor = getPropertyDescriptor(property)
  const ordinalFloor = descriptor.match(/\b(\d+)(?:st|nd|rd|th)\s+Floor\b/i)
  if (ordinalFloor) return Number(ordinalFloor[1])

  const namedFloors: Record<string, number> = {
    first: 1,
    second: 2,
    third: 3,
    fourth: 4,
    fifth: 5,
    sixth: 6,
  }

  const namedFloor = descriptor.match(/\b(First|Second|Third|Fourth|Fifth|Sixth)\s+Floor\b/i)
  return namedFloor ? namedFloors[namedFloor[1].toLowerCase()] : 999
}

export function sortListings(properties: Property[]): Property[] {
  return properties
    .map(normalizePropertyListing)
    .sort((a, b) => {
      const locationDifference = locationRank(a) - locationRank(b)
      if (locationDifference !== 0) return locationDifference

      const floorDifference = floorNumberFromDescriptor(a) - floorNumberFromDescriptor(b)
      if (floorDifference !== 0) return floorDifference

      return a.name.localeCompare(b.name)
    })
}
