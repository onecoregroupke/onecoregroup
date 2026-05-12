'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Property } from '@ocg/db'
import { getClient } from '@/lib/supabase'
import { AlertCircle, CheckCircle, Eye, Home, Plus, RefreshCw, Save, Upload } from 'lucide-react'

const NUURANEST_URL =
  process.env['NEXT_PUBLIC_NUURANEST_URL'] ?? 'https://nuuranest.vercel.app'

const PROPERTY_PHOTOS_BUCKET = 'nuuranest-properties'

/** Tries multiple URL patterns (jpg/png, full slug and base slug without
 *  common suffixes) so folder names don't have to exactly match DB slugs. */
function PropertyThumbnail({ slug, active }: { slug: string; active: boolean }) {
  // Strip common suffixes so e.g. "coral-view-nuuranest" → "coral-view"
  const baseSlug = slug.replace(/-(nuuranest(-stays)?|stays)$/, '')
  const dedupe = (arr: string[]) => [...new Set(arr)]
  const sources = dedupe([
    `${NUURANEST_URL}/properties/${slug}/01.jpg`,
    `${NUURANEST_URL}/properties/${slug}/01.png`,
    `${NUURANEST_URL}/properties/${baseSlug}/01.jpg`,
    `${NUURANEST_URL}/properties/${baseSlug}/01.png`,
  ])
  const [idx, setIdx] = useState(0)
  const failed = idx >= sources.length

  if (failed) {
    return <Home size={18} className={active ? 'text-white/60' : 'text-gray-400'} />
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={sources[idx]}
      src={sources[idx]}
      alt=""
      className="h-full w-full object-cover"
      onError={() => setIdx((i) => i + 1)}
    />
  )
}

type PropertyForm = {
  id?: string
  slug: string
  name: string
  tagline: string
  location: string
  neighbourhood: string
  short_description: string
  full_description: string
  bedrooms: string
  bathrooms: string
  max_guests: string
  size_sqm: string
  price_per_night_ksh: string
  weekend_price_ksh: string
  photos: string
  amenities: string
  highlights: string
  house_rules: string
  booking_com_url: string
  airbnb_url: string
  whatsapp_number: string
  latitude: string
  longitude: string
  is_featured: boolean
  is_active: boolean
  sort_order: string
}

const EMPTY_FORM: PropertyForm = {
  slug: '',
  name: '',
  tagline: '',
  location: 'Mombasa, Kenya',
  neighbourhood: '',
  short_description: '',
  full_description: '',
  bedrooms: '',
  bathrooms: '',
  max_guests: '',
  size_sqm: '',
  price_per_night_ksh: '',
  weekend_price_ksh: '',
  photos: '',
  amenities: '',
  highlights: '',
  house_rules: '',
  booking_com_url: '',
  airbnb_url: '',
  whatsapp_number: '',
  latitude: '',
  longitude: '',
  is_featured: false,
  is_active: true,
  sort_order: '0',
}

function linesToArray(value: string) {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
}

function numberOrNull(value: string) {
  if (value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function propertyToForm(property: Property): PropertyForm {
  return {
    id: property.id,
    slug: property.slug,
    name: property.name,
    tagline: property.tagline ?? '',
    location: property.location,
    neighbourhood: property.neighbourhood,
    short_description: property.short_description ?? '',
    full_description: property.full_description ?? '',
    bedrooms: property.bedrooms?.toString() ?? '',
    bathrooms: property.bathrooms?.toString() ?? '',
    max_guests: property.max_guests?.toString() ?? '',
    size_sqm: property.size_sqm?.toString() ?? '',
    price_per_night_ksh: property.price_per_night_ksh?.toString() ?? '',
    weekend_price_ksh: property.weekend_price_ksh?.toString() ?? '',
    photos: property.photos.join('\n'),
    amenities: property.amenities.join('\n'),
    highlights: property.highlights.join('\n'),
    house_rules: property.house_rules.join('\n'),
    booking_com_url: property.booking_com_url ?? '',
    airbnb_url: property.airbnb_url ?? '',
    whatsapp_number: property.whatsapp_number ?? '',
    latitude: property.latitude?.toString() ?? '',
    longitude: property.longitude?.toString() ?? '',
    is_featured: property.is_featured,
    is_active: property.is_active,
    sort_order: property.sort_order.toString(),
  }
}

function formToPayload(form: PropertyForm) {
  return {
    id: form.id,
    slug: form.slug.trim(),
    name: form.name.trim(),
    tagline: form.tagline.trim() || null,
    location: form.location.trim(),
    neighbourhood: form.neighbourhood.trim(),
    short_description: form.short_description.trim() || null,
    full_description: form.full_description.trim() || null,
    bedrooms: numberOrNull(form.bedrooms),
    bathrooms: numberOrNull(form.bathrooms),
    max_guests: numberOrNull(form.max_guests),
    size_sqm: numberOrNull(form.size_sqm),
    price_per_night_ksh: numberOrNull(form.price_per_night_ksh),
    weekend_price_ksh: numberOrNull(form.weekend_price_ksh),
    photos: linesToArray(form.photos),
    amenities: linesToArray(form.amenities),
    highlights: linesToArray(form.highlights),
    house_rules: linesToArray(form.house_rules),
    booking_com_url: form.booking_com_url.trim() || null,
    airbnb_url: form.airbnb_url.trim() || null,
    whatsapp_number: form.whatsapp_number.trim() || null,
    latitude: numberOrNull(form.latitude),
    longitude: numberOrNull(form.longitude),
    is_featured: form.is_featured,
    is_active: form.is_active,
    sort_order: numberOrNull(form.sort_order) ?? 0,
  }
}

function TextField({
  label,
  value,
  onChange,
  type = 'text',
  required,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  required?: boolean
}) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
        {label}
      </span>
      <input
        type={type}
        value={value}
        required={required}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-ocg-navy"
      />
    </label>
  )
}

function TextAreaField({
  label,
  value,
  onChange,
  rows = 4,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  rows?: number
}) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
        {label}
      </span>
      <textarea
        value={value}
        rows={rows}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-ocg-navy"
      />
    </label>
  )
}

export default function PropertiesAdminPage() {
  const [properties, setProperties] = useState<Property[]>([])
  const [form, setForm] = useState<PropertyForm>(EMPTY_FORM)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [loadingSitePhotos, setLoadingSitePhotos] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const selectedProperty = useMemo(
    () => properties.find((property) => property.id === form.id) ?? null,
    [form.id, properties]
  )

  function update<K extends keyof PropertyForm>(key: K, value: PropertyForm[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function request(path: string, init?: RequestInit) {
    const supabase = getClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) throw new Error('Your session has expired. Please sign in again.')

    const response = await fetch(path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        ...init?.headers,
      },
    })
    const json = (await response.json()) as { error?: string; properties?: Property[]; property?: Property }
    if (!response.ok) throw new Error(json.error ?? 'Request failed')
    return json
  }

  async function loadProperties() {
    setLoading(true)
    setError('')
    try {
      const json = await request('/api/properties')
      setProperties(json.properties ?? [])
      if (!form.id && json.properties?.[0]) setForm(propertyToForm(json.properties[0]))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load properties.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadProperties()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function saveProperty() {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const payload = formToPayload(form)
      if (!payload.slug || !payload.name || !payload.location || !payload.neighbourhood) {
        throw new Error('Slug, name, location, and neighbourhood are required.')
      }

      const json = await request('/api/properties', {
        method: form.id ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      })

      const saved = json.property
      if (saved) {
        setProperties((current) => {
          const exists = current.some((property) => property.id === saved.id)
          const next = exists
            ? current.map((property) => (property.id === saved.id ? saved : property))
            : [...current, saved]
          return next.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
        })
        setForm(propertyToForm(saved))
      }
      setMessage('Property saved.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save property.')
    } finally {
      setSaving(false)
    }
  }

  async function uploadPhotos(files: FileList | null) {
    if (!files?.length) return

    setUploading(true)
    setError('')
    setMessage('')

    try {
      const supabase = getClient()
      const folder = (form.slug.trim() || 'new-property')
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '')

      const urls: string[] = []

      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue

        const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'
        const safeName = file.name
          .replace(/\.[^/.]+$/, '')
          .toLowerCase()
          .replace(/[^a-z0-9-]+/g, '-')
          .replace(/^-+|-+$/g, '')
        const path = `${folder}/${Date.now()}-${safeName || 'photo'}.${extension}`

        const { error: uploadError } = await supabase.storage
          .from(PROPERTY_PHOTOS_BUCKET)
          .upload(path, file, {
            cacheControl: '31536000',
            upsert: false,
          })

        if (uploadError) throw new Error(uploadError.message)

        const { data } = supabase.storage.from(PROPERTY_PHOTOS_BUCKET).getPublicUrl(path)
        urls.push(data.publicUrl)
      }

      if (!urls.length) throw new Error('No image files were selected.')

      const existing = linesToArray(form.photos)
      update('photos', [...existing, ...urls].join('\n'))
      setMessage(`${urls.length} photo${urls.length === 1 ? '' : 's'} uploaded. Save the property to publish the updated gallery.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload photos.')
    } finally {
      setUploading(false)
    }
  }

  async function loadSitePhotos() {
    const slug = form.slug.trim()
    if (!slug) {
      setError('Save the property slug first before loading site photos.')
      return
    }
    setLoadingSitePhotos(true)
    setError('')
    setMessage('')
    try {
      const res = await fetch(`${NUURANEST_URL}/api/photos/${slug}`)
      const json = (await res.json()) as { photos?: string[] }
      const photos = json.photos ?? []
      if (!photos.length) {
        setMessage('No local photos found for this slug on the site.')
        return
      }
      update('photos', photos.join('\n'))
      setMessage(`${photos.length} site photo${photos.length === 1 ? '' : 's'} loaded. Save to publish.`)
    } catch {
      setError('Could not reach the Nuuranest site. Check that it is deployed and try again.')
    } finally {
      setLoadingSitePhotos(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-bold text-2xl text-gray-900">Nuuranest Properties</h1>
          <p className="text-gray-500 text-sm mt-1">
            Manage the listings, photos, prices, and booking links shown on the Nuuranest website.
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href="https://nuuranest.vercel.app/properties"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Eye size={16} />
            View Site
          </a>
          <button
            onClick={() => {
              setForm(EMPTY_FORM)
              setMessage('')
              setError('')
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            <Plus size={16} />
            New
          </button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
        <aside className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="border-b border-gray-100 px-4 py-3">
            <p className="text-sm font-semibold text-gray-900">Listings</p>
          </div>
          <div className="max-h-[680px] overflow-y-auto p-2">
            {loading ? (
              <p className="p-4 text-sm text-gray-400">Loading properties...</p>
            ) : properties.length === 0 ? (
              <p className="p-4 text-sm text-gray-400">No properties yet.</p>
            ) : (
              properties.map((property) => {
                const active = property.id === selectedProperty?.id
                return (
                  <button
                    key={property.id}
                    onClick={() => {
                      setForm(propertyToForm(property))
                      setMessage('')
                      setError('')
                    }}
                    className={`w-full rounded-xl p-3 text-left transition-colors ${
                      active ? 'bg-ocg-navy text-white' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex gap-3">
                      <div className={`h-14 w-14 rounded-lg overflow-hidden flex items-center justify-center ${active ? 'bg-white/10' : 'bg-gray-100'}`}>
                        <PropertyThumbnail slug={property.slug} active={active} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-sm font-semibold ${active ? 'text-white' : 'text-gray-900'}`}>
                          {property.name}
                        </p>
                        <p className={`truncate text-xs ${active ? 'text-white/60' : 'text-gray-500'}`}>
                          {property.neighbourhood}
                        </p>
                        <div className="mt-2 flex gap-1">
                          {property.is_featured && (
                            <span className={`rounded-full px-2 py-0.5 text-[11px] ${active ? 'bg-white/15 text-white' : 'bg-amber-50 text-amber-700'}`}>
                              Featured
                            </span>
                          )}
                          <span className={`rounded-full px-2 py-0.5 text-[11px] ${property.is_active ? active ? 'bg-white/15 text-white' : 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                            {property.is_active ? 'Active' : 'Hidden'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </aside>

        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4">
            <p className="text-sm font-semibold text-gray-900">
              {form.id ? `Editing ${form.name || 'property'}` : 'Create Property'}
            </p>
          </div>

          <div className="p-5 space-y-6">
            {message && (
              <div className="flex items-center gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-700">
                <CheckCircle size={16} />
                {message}
              </div>
            )}
            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle size={16} />
                {error}
              </div>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
              <TextField label="Property name" required value={form.name} onChange={(value) => update('name', value)} />
              <TextField label="Slug" required value={form.slug} onChange={(value) => update('slug', value)} />
              <TextField label="Tagline" value={form.tagline} onChange={(value) => update('tagline', value)} />
              <TextField label="Neighbourhood" required value={form.neighbourhood} onChange={(value) => update('neighbourhood', value)} />
              <TextField label="Location" required value={form.location} onChange={(value) => update('location', value)} />
              <TextField label="WhatsApp number" value={form.whatsapp_number} onChange={(value) => update('whatsapp_number', value)} />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <TextAreaField label="Short description" value={form.short_description} onChange={(value) => update('short_description', value)} rows={3} />
              <TextAreaField label="Full description" value={form.full_description} onChange={(value) => update('full_description', value)} rows={3} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <TextField label="Bedrooms" type="number" value={form.bedrooms} onChange={(value) => update('bedrooms', value)} />
              <TextField label="Bathrooms" type="number" value={form.bathrooms} onChange={(value) => update('bathrooms', value)} />
              <TextField label="Max guests" type="number" value={form.max_guests} onChange={(value) => update('max_guests', value)} />
              <TextField label="Size sqm" type="number" value={form.size_sqm} onChange={(value) => update('size_sqm', value)} />
              <TextField label="Weekday price Ksh" type="number" value={form.price_per_night_ksh} onChange={(value) => update('price_per_night_ksh', value)} />
              <TextField label="Weekend price Ksh" type="number" value={form.weekend_price_ksh} onChange={(value) => update('weekend_price_ksh', value)} />
              <TextField label="Sort order" type="number" value={form.sort_order} onChange={(value) => update('sort_order', value)} />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <TextField label="Booking.com URL" value={form.booking_com_url} onChange={(value) => update('booking_com_url', value)} />
              <TextField label="Airbnb URL" value={form.airbnb_url} onChange={(value) => update('airbnb_url', value)} />
              <TextField label="Latitude" type="number" value={form.latitude} onChange={(value) => update('latitude', value)} />
              <TextField label="Longitude" type="number" value={form.longitude} onChange={(value) => update('longitude', value)} />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {/* ── Photo Manager ── */}
              <div className="space-y-3">
                <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Photos
                </span>

                {/* Upload + load from site */}
                <div className="flex gap-2">
                  <div className="flex-1 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-3">
                    <label className="flex cursor-pointer flex-col items-center justify-center gap-1.5 text-center">
                      <Upload size={20} className="text-ocg-navy" />
                      <span className="text-sm font-semibold text-gray-900">
                        {uploading ? 'Uploading…' : 'Upload photos'}
                      </span>
                      <span className="text-xs text-gray-500">JPG, PNG or WebP</span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        disabled={uploading}
                        onChange={(event) => {
                          void uploadPhotos(event.target.files)
                          event.currentTarget.value = ''
                        }}
                        className="sr-only"
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={() => void loadSitePhotos()}
                    disabled={loadingSitePhotos}
                    title="Pull photos from the public folder on the Nuuranest site"
                    className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-green-300 bg-green-50 px-3 py-3 text-center hover:bg-green-100 transition-colors disabled:opacity-60 min-w-[90px]"
                  >
                    <RefreshCw size={20} className={`text-green-700 ${loadingSitePhotos ? 'animate-spin' : ''}`} />
                    <span className="text-xs font-semibold text-green-800">
                      {loadingSitePhotos ? 'Loading…' : 'Load from site'}
                    </span>
                  </button>
                </div>

                {/* Draggable photo grid */}
                {linesToArray(form.photos).length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {linesToArray(form.photos).map((url, i, arr) => (
                      <div
                        key={url}
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData('text/plain', String(i))}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault()
                          const from = Number(e.dataTransfer.getData('text/plain'))
                          if (from === i) return
                          const next = [...arr]
                          const [moved] = next.splice(from, 1)
                          next.splice(i, 0, moved)
                          update('photos', next.join('\n'))
                        }}
                        className="group relative aspect-square overflow-hidden rounded-lg bg-gray-100 cursor-grab active:cursor-grabbing"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt=""
                          className="h-full w-full object-cover"
                          onError={(e) => {
                            const t = e.currentTarget
                            t.style.display = 'none'
                            t.parentElement?.classList.add('broken-img')
                          }}
                        />
                        {/* Position badge */}
                        <span className="absolute top-1 left-1 bg-black/60 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                          {i + 1}
                        </span>
                        {/* Delete button */}
                        <button
                          type="button"
                          onClick={() => {
                            const next = arr.filter((_, j) => j !== i)
                            update('photos', next.join('\n'))
                          }}
                          className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-xs leading-none"
                          aria-label="Remove photo"
                        >
                          ×
                        </button>
                        {/* First badge */}
                        {i === 0 && (
                          <span className="absolute bottom-1 left-1 right-1 bg-green-600 text-white text-[9px] text-center rounded py-0.5 font-semibold">
                            HERO
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Raw URL textarea (collapsed but still editable) */}
                <details className="text-xs text-gray-400">
                  <summary className="cursor-pointer select-none hover:text-gray-600 transition-colors py-1">
                    Edit URLs manually
                  </summary>
                  <textarea
                    value={form.photos}
                    rows={5}
                    onChange={(e) => update('photos', e.target.value)}
                    className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-ocg-navy font-mono"
                    placeholder="One URL per line"
                  />
                </details>
              </div>

              <TextAreaField label="Amenities, one per line" value={form.amenities} onChange={(value) => update('amenities', value)} rows={6} />
              <TextAreaField label="Highlights, one per line" value={form.highlights} onChange={(value) => update('highlights', value)} rows={5} />
              <TextAreaField label="House rules, one per line" value={form.house_rules} onChange={(value) => update('house_rules', value)} rows={5} />
            </div>

            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(event) => update('is_active', event.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                Active on website
              </label>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={form.is_featured}
                  onChange={(event) => update('is_featured', event.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                Featured listing
              </label>
            </div>

            <div className="flex justify-end border-t border-gray-100 pt-5">
              <button
                onClick={saveProperty}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
              >
                <Save size={16} />
                {saving ? 'Saving...' : 'Save Property'}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
