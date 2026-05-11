'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Menu, X } from 'lucide-react'
import { WhatsAppButton } from '@/components/ui/WhatsAppButton'

const links = [
  { href: '/properties', label: 'Properties' },
  { href: '/catalogue', label: 'Catalogue' },
  { href: '/availability', label: 'Availability' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
]

export function Navbar() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 60)
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? 'bg-white shadow-md' : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 lg:h-20">
          {/* Logo */}
          <Link href="/" className="flex-shrink-0">
            <span
              className={`font-heading font-semibold text-xl lg:text-2xl transition-colors ${
                scrolled ? 'text-nn-green' : 'text-white'
              }`}
            >
              Nuuranest
            </span>
            <span
              className={`text-sm ml-1 transition-colors ${
                scrolled ? 'text-nn-gold' : 'text-nn-gold'
              }`}
            >
              Stays
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-8">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`text-sm font-medium transition-colors hover:text-nn-gold ${
                  scrolled ? 'text-nn-dark' : 'text-white'
                }`}
              >
                {l.label}
              </Link>
            ))}
          </nav>

          {/* Desktop CTA */}
          <div className="hidden lg:block">
            <WhatsAppButton size="sm" label="Book Now" />
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle menu"
            className={`lg:hidden p-2 rounded-md transition-colors ${
              scrolled ? 'text-nn-dark' : 'text-white'
            }`}
          >
            {open ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="lg:hidden bg-white shadow-lg border-t border-gray-100">
          <nav className="flex flex-col px-4 py-4 gap-4">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="text-nn-dark font-medium py-2 border-b border-gray-100 hover:text-nn-green transition-colors"
              >
                {l.label}
              </Link>
            ))}
            <div className="pt-2">
              <WhatsAppButton size="md" label="Book via WhatsApp" fullWidth />
            </div>
          </nav>
        </div>
      )}
    </header>
  )
}
