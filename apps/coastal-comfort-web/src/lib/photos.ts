import fs from 'fs'
import path from 'path'
import type { Property } from '@ocg/db'

/** Strips common brand suffixes so DB slugs like "coral-view-nuuranest"
 *  resolve to the "coral-view" folder name used on disk. */
function toFolderSlug(slug: string): string {
  return slug.replace(/-(nuuranest(-stays)?|stays)$/, '')
}

/**
 * Returns photo URLs for a property, sorted numerically from public/properties/{slug}/.
 * Tries the exact slug first, then the folder slug (slug with brand suffix stripped).
 * Falls back to property.photos from the database if no local folder exists.
 * Server-side only (uses fs).
 */
export function getLocalPhotos(slug: string): string[] {
  const candidates = [...new Set([slug, toFolderSlug(slug)])]
  for (const candidate of candidates) {
    try {
      const dir = path.join(process.cwd(), 'public', 'properties', candidate)
      const files = fs
        .readdirSync(dir)
        .filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f))
        .sort((a, b) => {
          const n = (s: string) => parseInt(s.replace(/\D/g, ''), 10) || 0
          return n(a) - n(b)
        })
      if (files.length > 0) {
        return files.map((f) => `/properties/${candidate}/${f}`)
      }
    } catch {
      // folder doesn't exist, try next candidate
    }
  }
  return []
}

/**
 * Resolves the ordered photo list for a property.
 * Prefers DB photos when they contain real (non-placeholder) URLs — so any
 * order set in the admin panel is reflected on the site immediately.
 * Falls back to local numbered files when DB photos are empty or still
 * contain placeholder Unsplash images.
 */
export function resolvePhotos(property: Pick<Property, 'slug' | 'photos'>): string[] {
  const dbPhotos = Array.isArray(property.photos) ? (property.photos as string[]) : []
  const realDbPhotos = dbPhotos.filter(
    (url) => typeof url === 'string' && url.trim() !== '' && !url.includes('unsplash.com'),
  )
  if (realDbPhotos.length > 0) return realDbPhotos
  return getLocalPhotos(property.slug)
}

/**
 * Injects resolved photos into a property object so client components
 * (PropertyCard, etc.) that read property.photos get the correct ordered list.
 */
export function withResolvedPhotos<T extends Pick<Property, 'slug' | 'photos'>>(property: T): T {
  const resolved = resolvePhotos(property)
  return resolved.length > 0 ? { ...property, photos: resolved } : property
}
