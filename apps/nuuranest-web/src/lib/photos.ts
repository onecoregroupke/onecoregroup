import fs from 'fs'
import path from 'path'
import type { Property } from '@ocg/db'

/**
 * Returns photo URLs for a property, sorted numerically from public/properties/{slug}/.
 * Falls back to property.photos from the database if no local folder exists.
 * Server-side only (uses fs).
 */
export function getLocalPhotos(slug: string): string[] {
  try {
    const dir = path.join(process.cwd(), 'public', 'properties', slug)
    return fs
      .readdirSync(dir)
      .filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f))
      .sort((a, b) => {
        const n = (s: string) => parseInt(s.replace(/\D/g, ''), 10) || 0
        return n(a) - n(b)
      })
      .map((f) => `/properties/${slug}/${f}`)
  } catch {
    return []
  }
}

/**
 * Resolves the ordered photo list for a property.
 * Prefers local numbered files; falls back to DB photos.
 */
export function resolvePhotos(property: Pick<Property, 'slug' | 'photos'>): string[] {
  const local = getLocalPhotos(property.slug)
  if (local.length > 0) return local
  return Array.isArray(property.photos) ? (property.photos as string[]) : []
}

/**
 * Injects resolved photos into a property object so client components
 * (PropertyCard, etc.) that read property.photos get the correct ordered list.
 */
export function withResolvedPhotos<T extends Pick<Property, 'slug' | 'photos'>>(property: T): T {
  const resolved = resolvePhotos(property)
  return resolved.length > 0 ? { ...property, photos: resolved } : property
}
