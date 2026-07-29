'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Calendar, PenSquare, Contact, PenTool } from 'lucide-react'
import { usePermissions } from '@/contexts/PermissionsContext'
import type { SectionKey } from '@/lib/permissions'

// Mobile-only bottom nav for the Marketing Hub — the phone-native way to move
// between the workspace's main surfaces (the sidebar stays available via the
// Topbar menu). Each item is gated by the same section as its page.
const ITEMS: { href: string; label: string; icon: React.ElementType; section: SectionKey }[] = [
  { href: '/mhub',                     label: 'Home',     icon: LayoutDashboard, section: 'dashboard' },
  { href: '/mhub/marketing/calendar',  label: 'Calendar', icon: Calendar,        section: 'marketing' },
  { href: '/mhub/marketing/content',   label: 'Content',  icon: PenSquare,       section: 'marketing' },
  { href: '/mhub/marketing/crm',       label: 'CRM',      icon: Contact,         section: 'marketing' },
  { href: '/mhub/input',               label: 'Input',    icon: PenTool,         section: 'input' },
]

export function MhubBottomNav() {
  const path = usePathname()
  const { can } = usePermissions()
  const items = ITEMS.filter((item) => can(item.section, 'view')).slice(0, 5)
  if (items.length === 0) return null

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden">
      <div
        className="mx-auto grid max-w-md gap-1"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map(({ href, label, icon: Icon }) => {
          const active = path === href || (href !== '/mhub' && path.startsWith(`${href}`))
          return (
            <Link
              key={href}
              href={href}
              className={`flex min-h-[48px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-2 text-[10px] font-medium transition-colors ${
                active ? 'text-ocg-gold' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              <Icon size={19} strokeWidth={active ? 2.5 : 2} />
              <span className="w-full truncate text-center">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
