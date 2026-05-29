import Link from 'next/link'
import { MessageCircle, Mail, MapPin } from 'lucide-react'

export function Footer() {
  const whatsapp = process.env['NEXT_PUBLIC_NUURANEST_WHATSAPP'] ?? '+254XXXXXXXXX'

  return (
    <footer className="bg-nn-green text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 lg:gap-12">
          {/* Brand */}
          <div className="md:col-span-2">
            <div className="font-heading text-2xl font-semibold mb-2">
              Nuuranest <span className="text-nn-gold">Stays</span>
            </div>
            <p className="text-green-200 text-sm leading-relaxed max-w-xs">
              Five beautifully appointed short-stay properties in Nyali and Bamburi, Mombasa.
              Your home on the coast.
            </p>
            <div className="mt-4 flex gap-3">
              <a
                href={`https://wa.me/${whatsapp.replace(/[^0-9]/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-[#25d366] text-white text-sm px-4 py-2 rounded-full hover:bg-[#1da851] transition-colors"
              >
                <MessageCircle size={16} />
                WhatsApp Us
              </a>
            </div>
          </div>

          {/* Quick links */}
          <div>
            <h3 className="font-semibold text-nn-gold mb-3 uppercase text-xs tracking-wider">Quick Links</h3>
            <ul className="space-y-2 text-sm text-green-200">
              {[
                { href: '/properties', label: 'Properties' },
                { href: '/availability', label: 'Availability' },
                { href: '/about', label: 'About Us' },
                { href: '/contact', label: 'Contact' },
              ].map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="hover:text-white transition-colors">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact + platforms */}
          <div>
            <h3 className="font-semibold text-nn-gold mb-3 uppercase text-xs tracking-wider">Contact</h3>
            <ul className="space-y-2 text-sm text-green-200">
              <li className="flex items-start gap-2">
                <MessageCircle size={14} className="mt-0.5 flex-shrink-0" />
                <span>{whatsapp}</span>
              </li>
              <li className="flex items-start gap-2">
                <Mail size={14} className="mt-0.5 flex-shrink-0" />
                <span>hello@nuuranest.com</span>
              </li>
              <li className="flex items-start gap-2">
                <MapPin size={14} className="mt-0.5 flex-shrink-0" />
                <span>Nyali & Bamburi, Mombasa</span>
              </li>
            </ul>
            <div className="mt-4 flex flex-col gap-2 text-sm">
              <a
                href="https://booking.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-green-200 hover:text-white transition-colors"
              >
                Book on Booking.com →
              </a>
              <a
                href="https://airbnb.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-green-200 hover:text-white transition-colors"
              >
                Book on Airbnb →
              </a>
            </div>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-green-800 flex flex-col sm:flex-row justify-between items-center gap-2 text-xs text-green-400">
          <p>© {new Date().getFullYear()} Nuuranest Stays. All rights reserved.</p>
          <p>Managed by One Core Group</p>
        </div>
      </div>
    </footer>
  )
}
