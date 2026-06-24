'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MAIN_NAV } from './Sidebar'
import { usePermissions } from '@/contexts/PermissionsContext'

const MOBILE_HREFS = ['/', '/my-tasks', '/tasks', '/management/team', '/npt']

export function BottomNav() {
  const path = usePathname()
  const { can } = usePermissions()
  const items = MAIN_NAV
    .filter((item) => MOBILE_HREFS.includes(item.href))
    .filter((item) => item.section === null || can(item.section, 'view'))

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden">
      <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
        {items.map(({ href, label, icon: Icon }) => {
          const active = path === href || (href !== '/' && path.startsWith(`${href}/`))
          return (
            <Link
              key={href}
              href={href}
              className={`flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-2 text-[10px] font-medium transition-colors ${
                active ? 'text-ocg-gold' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              <Icon size={19} strokeWidth={active ? 2.5 : 2} />
              <span className="w-full truncate text-center">{label.replace('NPT Service', 'NPT')}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
