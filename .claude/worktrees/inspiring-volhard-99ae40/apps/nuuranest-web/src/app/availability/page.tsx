import { Metadata } from 'next'
import Link from 'next/link'
import { MessageCircle, Calendar, ExternalLink, Info } from 'lucide-react'
import { AvailabilityEnquiryForm } from './AvailabilityEnquiryForm'

export const metadata: Metadata = {
  title: 'Availability',
  description: 'Check availability and book a Nuuranest Stays property in Mombasa.',
}

const bookingOptions = [
  {
    icon: MessageCircle,
    title: 'WhatsApp',
    label: 'Fastest response',
    desc: "Message us directly on WhatsApp — we'll confirm availability within hours.",
    primary: true,
    color: 'bg-[#25d366]',
  },
  {
    icon: ExternalLink,
    title: 'Booking.com',
    label: 'International bookings',
    desc: 'Search our properties on Booking.com for online availability and confirmed bookings.',
    primary: false,
    color: 'bg-ocg-navy',
  },
  {
    icon: ExternalLink,
    title: 'Airbnb',
    label: 'Verified platform',
    desc: 'Book through Airbnb for secure payments and host verification.',
    primary: false,
    color: 'bg-[#ff5a5f]',
  },
]

const phone =
  process.env['NEXT_PUBLIC_NUURANEST_WHATSAPP']?.replace(/[^0-9]/g, '') ?? '254XXXXXXXXX'

export default function AvailabilityPage() {
  return (
    <div className="min-h-screen bg-nn-bg">
      {/* Header */}
      <div className="bg-nn-green text-white pt-28 pb-16 lg:pt-36 lg:pb-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-nn-gold font-medium text-sm uppercase tracking-wider mb-3">
            Booking
          </p>
          <h1 className="font-heading text-4xl lg:text-5xl font-bold mb-4">
            Check Availability
          </h1>
          <p className="text-green-200 text-lg leading-relaxed">
            Here&apos;s how to check availability and secure your stay at Nuuranest.
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16 space-y-10">
        {/* Notice */}
        <div className="bg-nn-gold/10 border border-nn-gold/30 rounded-xl p-5 flex items-start gap-3">
          <Info size={18} className="text-nn-gold flex-shrink-0 mt-0.5" />
          <p className="text-sm text-gray-700">
            We&apos;re working on a live availability calendar. For now, WhatsApp is the fastest way to confirm dates.
            We typically respond within 2 hours.
          </p>
        </div>

        {/* Booking options */}
        <div>
          <h2 className="font-heading text-2xl font-semibold text-nn-dark mb-6">
            Ways to Book
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {bookingOptions.map((opt) => {
              const Icon = opt.icon
              return (
                <div
                  key={opt.title}
                  className={`bg-white rounded-xl p-6 border-2 ${
                    opt.primary ? 'border-[#25d366]' : 'border-gray-100'
                  } shadow-sm`}
                >
                  <div
                    className={`w-12 h-12 ${opt.color} rounded-full flex items-center justify-center mb-4`}
                  >
                    <Icon size={20} className="text-white" />
                  </div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-nn-dark">{opt.title}</h3>
                    {opt.primary && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                        Recommended
                      </span>
                    )}
                  </div>
                  <p className="text-nn-gold text-xs font-medium mb-2">{opt.label}</p>
                  <p className="text-gray-600 text-sm mb-4 leading-relaxed">{opt.desc}</p>
                  {opt.title === 'WhatsApp' && (
                    <a
                      href={`https://wa.me/${phone}?text=${encodeURIComponent("Hi! I'd like to check availability at Nuuranest Stays. What dates are open?")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 bg-[#25d366] text-white text-sm font-medium px-4 py-2 rounded-full hover:bg-[#1da851] transition-colors"
                    >
                      <MessageCircle size={14} />
                      Message Us
                    </a>
                  )}
                  {opt.title === 'Booking.com' && (
                    <a
                      href="https://booking.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-full hover:bg-blue-700 transition-colors"
                    >
                      <ExternalLink size={14} />
                      Search on Booking.com
                    </a>
                  )}
                  {opt.title === 'Airbnb' && (
                    <a
                      href="https://airbnb.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 bg-[#ff5a5f] text-white text-sm font-medium px-4 py-2 rounded-full hover:bg-[#e5393e] transition-colors"
                    >
                      <ExternalLink size={14} />
                      Search on Airbnb
                    </a>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Quick Enquiry Form */}
        <div>
          <h2 className="font-heading text-2xl font-semibold text-nn-dark mb-2">
            Quick Availability Enquiry
          </h2>
          <p className="text-gray-500 text-sm mb-6">
            Fill in your dates and we&apos;ll check availability and get back to you quickly.
          </p>
          <AvailabilityEnquiryForm />
        </div>

        {/* Browse properties CTA */}
        <div className="bg-nn-green rounded-xl p-8 text-center text-white">
          <Calendar size={32} className="mx-auto mb-3 text-nn-gold" />
          <h3 className="font-heading text-xl font-semibold mb-2">
            Not sure which property to choose?
          </h3>
          <p className="text-green-200 text-sm mb-5">
            Browse all five Nuuranest properties and find the perfect fit for your stay.
          </p>
          <Link
            href="/properties"
            className="inline-block bg-white text-nn-green font-semibold px-6 py-3 rounded-full hover:bg-nn-bg transition-colors"
          >
            Browse Properties
          </Link>
        </div>
      </div>
    </div>
  )
}
