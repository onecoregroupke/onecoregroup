import Link from 'next/link'
import { ArrowUpRight, BedDouble, Home, Star, Eye } from 'lucide-react'
import { db } from '@/lib/serverClient'
import { requireSection } from '@/lib/server-auth'
import type { Property } from '@ocg/db'

export const dynamic = 'force-dynamic'

// Nuuranest Stays admin overview. A read-only cockpit of the short-stay
// portfolio; deeper listing edits live in the Marketing Hub (Properties).
export default async function NuuranestPage() {
  await requireSection('nuuranest_admin')
  const { data } = await db()
    .from('properties')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  const properties = (data as Property[]) ?? []
  const active = properties.filter((p) => p.is_active)
  const featured = properties.filter((p) => p.is_featured)
  const nightly = active
    .map((p) => Number(p.price_per_night_ksh ?? 0))
    .filter((n) => n > 0)
  const avgNightly = nightly.length ? Math.round(nightly.reduce((a, b) => a + b, 0) / nightly.length) : 0

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ocg-gold">Nuuranest Stays</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-gray-900">
            <Home size={22} className="text-[#1a6b42]" /> Nuuranest admin
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            The short-stay portfolio at a glance. Listing content, photos, and pricing are edited in the Marketing Hub.
          </p>
        </div>
        <Link href="/mhub/properties" className="inline-flex w-fit items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:border-ocg-gold/50 hover:text-ocg-gold">
          Manage listings <ArrowUpRight size={14} />
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Properties" value={properties.length} />
        <Stat label="Active" value={active.length} tone="text-emerald-600" />
        <Stat label="Featured" value={featured.length} tone="text-amber-600" />
        <Stat label="Avg nightly" value={avgNightly ? `KSh ${avgNightly.toLocaleString()}` : '—'} />
      </div>

      <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-ocg-gold">Properties</h2>
        {properties.length === 0 ? (
          <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">No properties yet. Add listings from the Marketing Hub → Properties.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {properties.map((p) => (
              <div key={p.id} className="rounded-xl border border-gray-100 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-gray-900">{p.name}</p>
                    <p className="truncate text-xs text-gray-400">{p.neighbourhood || p.location}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {p.is_featured && <Star size={14} className="text-amber-500" />}
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${p.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-400'}`}>
                      {p.is_active ? 'Active' : 'Hidden'}
                    </span>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                  {p.bedrooms != null && <span className="inline-flex items-center gap-1"><BedDouble size={13} /> {p.bedrooms} bd</span>}
                  {p.max_guests != null && <span>{p.max_guests} guests</span>}
                  {Number(p.price_per_night_ksh ?? 0) > 0 && (
                    <span className="font-medium text-gray-700">KSh {Number(p.price_per_night_ksh).toLocaleString()}/night</span>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-3 text-[11px] text-gray-400">
                  <span className="inline-flex items-center gap-1"><Eye size={12} /> {(p.photos ?? []).length} photos</span>
                  {p.booking_com_url && <span>Booking.com</span>}
                  {p.airbnb_url && <span>Airbnb</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function Stat({ label, value, tone = 'text-gray-900' }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <p className={`text-3xl font-light ${tone}`}>{value}</p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
    </div>
  )
}
