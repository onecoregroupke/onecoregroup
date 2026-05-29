'use client'

import { useState } from 'react'
import type { Property } from '@ocg/db'
import { MessageCircle, ExternalLink } from 'lucide-react'
import { formatKsh } from '@/lib/format'

interface BookingSidebarProps {
  property: Property
  whatsappMessage: string
}

export function BookingSidebar({ property, whatsappMessage }: BookingSidebarProps) {
  const [checkIn, setCheckIn] = useState('')
  const [checkOut, setCheckOut] = useState('')
  const [guests, setGuests] = useState(2)

  const nights =
    checkIn && checkOut
      ? Math.max(
          0,
          Math.ceil(
            (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / (1000 * 60 * 60 * 24)
          )
        )
      : 0

  const pricePerNight = Number(property.price_per_night_ksh ?? 0)
  const totalPrice = nights > 0 ? pricePerNight * nights : 0

  const dynamicMessage =
    `Hi! I'd like to book ${property.name}` +
    (checkIn ? ` from ${checkIn}` : '') +
    (checkOut ? ` to ${checkOut}` : '') +
    ` for ${guests} guest${guests !== 1 ? 's' : ''}.` +
    (nights > 0 ? ` That would be ${nights} nights.` : '')

  const phone =
    process.env['NEXT_PUBLIC_NUURANEST_WHATSAPP']?.replace(/[^0-9]/g, '') ?? '254XXXXXXXXX'

  return (
    <div className="sticky top-24 bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5">
      <div>
        <p className="text-2xl font-bold text-nn-green">
          {formatKsh(pricePerNight)}{' '}
          <span className="text-gray-400 font-normal text-sm">/ night</span>
        </p>
        {property.weekend_price_ksh && (
          <p className="text-sm text-gray-400 mt-0.5">
            Weekend: {formatKsh(Number(property.weekend_price_ksh))} / night
          </p>
        )}
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Check-in</label>
          <input
            type="date"
            value={checkIn}
            onChange={(e) => setCheckIn(e.target.value)}
            min={new Date().toISOString().split('T')[0]}
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nn-green"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Check-out</label>
          <input
            type="date"
            value={checkOut}
            onChange={(e) => setCheckOut(e.target.value)}
            min={checkIn || new Date().toISOString().split('T')[0]}
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nn-green"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Guests</label>
          <select
            value={guests}
            onChange={(e) => setGuests(Number(e.target.value))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nn-green bg-white"
          >
            {Array.from({ length: property.max_guests ?? 6 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{n} guest{n !== 1 ? 's' : ''}</option>
            ))}
          </select>
        </div>
      </div>

      {nights > 0 && (
        <div className="bg-nn-bg rounded-lg p-4 space-y-2 text-sm">
          <div className="flex justify-between text-gray-600">
            <span>{formatKsh(pricePerNight)} × {nights} night{nights !== 1 ? 's' : ''}</span>
            <span>{formatKsh(totalPrice)}</span>
          </div>
          <div className="flex justify-between font-semibold text-nn-dark pt-2 border-t border-gray-200">
            <span>Total</span>
            <span>{formatKsh(totalPrice)}</span>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <a
          href={`https://wa.me/${phone}?text=${encodeURIComponent(dynamicMessage)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center justify-center gap-2 bg-[#25d366] text-white font-medium py-3 rounded-lg hover:bg-[#1da851] transition-colors"
        >
          <MessageCircle size={18} />
          Book via WhatsApp
        </a>

        {property.booking_com_url && (
          <a
            href={property.booking_com_url}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 border border-gray-200 text-gray-600 font-medium py-2.5 rounded-lg hover:bg-gray-50 transition-colors text-sm"
          >
            <ExternalLink size={14} />
            Book on Booking.com
          </a>
        )}

        {property.airbnb_url && (
          <a
            href={property.airbnb_url}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 border border-gray-200 text-gray-600 font-medium py-2.5 rounded-lg hover:bg-gray-50 transition-colors text-sm"
          >
            <ExternalLink size={14} />
            Book on Airbnb
          </a>
        )}

        <a
          href="#enquiry-form"
          className="w-full flex items-center justify-center border-2 border-nn-green text-nn-green font-medium py-2.5 rounded-lg hover:bg-nn-green hover:text-white transition-colors text-sm"
        >
          Send Enquiry
        </a>
      </div>

      <p className="text-xs text-gray-400 text-center">
        No booking fee. Direct booking gets the best rate.
      </p>
    </div>
  )
}
