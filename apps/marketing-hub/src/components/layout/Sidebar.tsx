'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  PenSquare,
  CheckSquare,
  FileText,
  Home,
  Sparkles,
  Settings,
  LogOut,
  X,
  BarChart2,
} from 'lucide-react'

const BRANDS = [
  { slug: 'nairobi-piano-technicians', label: 'NPT', color: '#1a1a2e' },
  { slug: 'glitz-n-glim', label: 'Glitz', color: '#b07a00' },
  { slug: 'nuuranest-stays', label: 'Nuura', color: '#1a6b42' },
  { slug: 'ar-rayyan-playhouse', label: 'Ar-Rayyan', color: '#2c45a0' },
  { slug: 'rhythms-college', label: 'Rhythms', color: '#9a2a2a' },
  { slug: 'darul-swafa', label: 'Darul', color: '#2a6a2a' },
]

const mainNav = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/input', label: 'Input Portal', icon: PenSquare },
  { href: '/compliance', label: 'Compliance', icon: CheckSquare },
  { href: '/properties', label: 'Properties', icon: Home },
  { href: '/glitz', label: 'Glitz N\' Glim', icon: Sparkles },
  { href: '/npt', label: 'NPT Catalogue', icon: BarChart2 },
  { href: '/reports', label: 'Reports', icon: FileText },
]

interface SidebarProps {
  open: boolean
  onClose: () => void
  onSignOut: () => void
}

export function Sidebar({ open, onClose, onSignOut }: SidebarProps) {
  const path = usePathname()

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-ocg-navy flex flex-col transition-transform duration-300 ${
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-5 border-b border-white/10">
          <div>
            <span className="text-white font-bold text-lg">OCG</span>
            <span className="text-ocg-gold text-sm ml-1 font-medium">Hub</span>
          </div>
          <button onClick={onClose} className="lg:hidden text-white/60 hover:text-white">
            <X size={18} />
          </button>
        </div>

        {/* Main nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {mainNav.map(({ href, label, icon: Icon }) => {
            const active = path === href
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  active
                    ? 'bg-white/10 text-white font-medium'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon size={16} />
                {label}
              </Link>
            )
          })}

          {/* Brands section */}
          <div className="pt-4 mt-2 border-t border-white/10">
            <p className="text-white/30 text-xs uppercase tracking-wider px-3 mb-2">Brands</p>
            {BRANDS.map((brand) => {
              const href = `/brands/${brand.slug}`
              const active = path === href
              return (
                <Link
                  key={brand.slug}
                  href={href}
                  onClick={onClose}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    active
                      ? 'bg-white/10 text-white font-medium'
                      : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: brand.color }}
                  />
                  {brand.label}
                </Link>
              )
            })}
          </div>
        </nav>

        {/* Footer */}
        <div className="px-3 py-4 border-t border-white/10 space-y-1">
          <Link
            href="/settings"
            onClick={onClose}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/60 hover:text-white hover:bg-white/5 transition-colors"
          >
            <Settings size={16} />
            Settings
          </Link>
          <button
            onClick={onSignOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/60 hover:text-red-400 hover:bg-white/5 transition-colors"
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </aside>
    </>
  )
}
