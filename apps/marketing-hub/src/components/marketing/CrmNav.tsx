'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Users, Briefcase, UserPlus } from 'lucide-react'

const TABS = [
  { href: '/marketing/crm',       label: 'Contacts', icon: Users,    exact: true },
  { href: '/marketing/crm/deals', label: 'Deals',    icon: Briefcase, exact: false },
  { href: '/marketing/crm/leads', label: 'Leads',    icon: UserPlus,  exact: false },
]

export function CrmNav() {
  const path = usePathname()
  return (
    <div className="flex flex-wrap gap-1">
      {TABS.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? path === href : path === href || path.startsWith(`${href}/`)
        return (
          <Link
            key={href}
            href={href}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              active ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            <Icon size={15} />
            {label}
          </Link>
        )
      })}
    </div>
  )
}
