import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@ocg/db'
import type { Property } from '@ocg/db'
import { requireMhubSection } from '@/lib/mhub-auth'

type PropertyPayload = Pick<Property, 'slug' | 'name' | 'location' | 'neighbourhood'> &
  Partial<
    Pick<
      Property,
      | 'tagline'
      | 'short_description'
      | 'full_description'
      | 'bedrooms'
      | 'bathrooms'
      | 'max_guests'
      | 'size_sqm'
      | 'price_per_night_ksh'
      | 'weekend_price_ksh'
      | 'photos'
      | 'amenities'
      | 'highlights'
      | 'house_rules'
      | 'booking_com_url'
      | 'airbnb_url'
      | 'whatsapp_number'
      | 'latitude'
      | 'longitude'
      | 'is_featured'
      | 'is_active'
      | 'sort_order'
    >
  >

function normalizePayload(body: Partial<PropertyPayload>) {
  const slug = body.slug?.trim()
  const name = body.name?.trim()
  const location = body.location?.trim()
  const neighbourhood = body.neighbourhood?.trim()

  if (!slug || !name || !location || !neighbourhood) {
    throw new Error('Slug, name, location, and neighbourhood are required.')
  }

  return {
    slug,
    name,
    location,
    neighbourhood,
    tagline: body.tagline?.trim() || null,
    short_description: body.short_description?.trim() || null,
    full_description: body.full_description?.trim() || null,
    bedrooms: body.bedrooms ?? null,
    bathrooms: body.bathrooms ?? null,
    max_guests: body.max_guests ?? null,
    size_sqm: body.size_sqm ?? null,
    price_per_night_ksh: body.price_per_night_ksh ?? null,
    weekend_price_ksh: body.weekend_price_ksh ?? null,
    photos: body.photos ?? [],
    amenities: body.amenities ?? [],
    highlights: body.highlights ?? [],
    house_rules: body.house_rules ?? [],
    booking_com_url: body.booking_com_url?.trim() || null,
    airbnb_url: body.airbnb_url?.trim() || null,
    whatsapp_number: body.whatsapp_number?.trim() || null,
    latitude: body.latitude ?? null,
    longitude: body.longitude ?? null,
    is_featured: body.is_featured ?? false,
    is_active: body.is_active ?? true,
    sort_order: body.sort_order ?? 0,
  }
}

export async function GET(req: NextRequest) {
  const gate = await requireMhubSection(req, 'properties', 'view')
  if (gate instanceof NextResponse) return gate

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('properties')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ properties: data ?? [] })
}

export async function POST(req: NextRequest) {
  const gate = await requireMhubSection(req, 'properties', 'edit')
  if (gate instanceof NextResponse) return gate

  try {
    const payload = normalizePayload((await req.json()) as Partial<PropertyPayload>)
    const supabase = createServerClient()
    const { data, error } = await supabase.from('properties').insert(payload).select('*').single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ property: data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Invalid property payload' },
      { status: 400 }
    )
  }
}

export async function PATCH(req: NextRequest) {
  const gate = await requireMhubSection(req, 'properties', 'edit')
  if (gate instanceof NextResponse) return gate

  try {
    const body = (await req.json()) as Partial<PropertyPayload> & { id?: string }
    if (!body.id) return NextResponse.json({ error: 'Property ID is required.' }, { status: 400 })

    const payload = normalizePayload(body)
    const supabase = createServerClient()
    const { data, error } = await supabase
      .from('properties')
      .update(payload)
      .eq('id', body.id)
      .select('*')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ property: data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Invalid property payload' },
      { status: 400 }
    )
  }
}
