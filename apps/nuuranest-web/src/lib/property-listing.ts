import type { Property } from '@ocg/db'
import { getPropertyDescriptor } from './property-descriptors'

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

export function withListingPrice(property: Property): Property {
  const neighbourhood = property.neighbourhood.toLowerCase()
  if (neighbourhood.includes('nyali')) {
    return { ...property, price_per_night_ksh: 12000 }
  }
  if (neighbourhood.includes('bamburi')) {
    return { ...property, price_per_night_ksh: 3000 }
  }
  return property
}

export function sortAndPriceListings(properties: Property[]): Property[] {
  return properties
    .map(withListingPrice)
    .sort((a, b) => {
      const locationDifference = locationRank(a) - locationRank(b)
      if (locationDifference !== 0) return locationDifference

      const floorDifference = floorNumberFromDescriptor(a) - floorNumberFromDescriptor(b)
      if (floorDifference !== 0) return floorDifference

      return a.name.localeCompare(b.name)
    })
}
