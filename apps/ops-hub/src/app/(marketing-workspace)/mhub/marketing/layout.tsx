'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Calendar, PenSquare, Layers, Share2, Megaphone, Contact, MessageCircle, FileBarChart } from 'lucide-react'

const TABS = [
  { href: '/mhub/marketing/calendar',  label: 'Calendar',  icon: Calendar  },
  { href: '/mhub/marketing/content',   label: 'Content',   icon: PenSquare },
  { href: '/mhub/marketing/campaigns', label: 'Campaigns', icon: Megaphone },
  { href: '/mhub/marketing/crm',       label: 'CRM',       icon: Contact   },
  { href: '/mhub/marketing/reports',   label: 'Reports',   icon: FileBarChart },
  { href: '/mhub/marketing/whatsapp',  label: 'WhatsApp',  icon: MessageCircle },
  { href: '/mhub/marketing/pillars',   label: 'Pillars',   icon: Layers    },
  { href: '/mhub/marketing/platforms', label: 'Platforms', icon: Share2    },
]

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap gap-1 rounded-xl border border-gray-100 bg-white p-1 shadow-sm">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = path === href || path.startsWith(`${href}/`)
          return (
            <Link
              key={href}
              href={href}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active ? 'bg-ocg-navy text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Icon size={15} />
              {label}
            </Link>
          )
        })}
      </nav>
      {children}
    </div>
  )
}
