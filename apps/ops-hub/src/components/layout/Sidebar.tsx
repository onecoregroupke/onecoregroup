'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, ListTodo, FolderKanban, Building2, Bot,
  CheckSquare, Settings, LogOut, X, BriefcaseBusiness, Wrench, GraduationCap,
  UsersRound, BookOpen, BookMarked, UserCog, CalendarCheck, Lock, Landmark,
  CalendarClock, MessagesSquare, Megaphone, Boxes, ShoppingCart, ClipboardCheck,
  ClipboardList, ExternalLink, Home, Sparkles,
} from 'lucide-react'
import { usePermissions } from '@/contexts/PermissionsContext'
import type { SectionKey } from '@/lib/permissions'

export const OPS_BRANDS = [
  { slug: 'nairobi-piano-technicians', label: 'NPT',       color: '#1a1a2e' },
  { slug: 'glitz-n-glim',              label: 'Glitz',     color: '#b07a00' },
  { slug: 'nuuranest-stays',           label: 'Nuura',     color: '#1a6b42' },
  { slug: 'ar-rayyan-playhouse',       label: 'Ar-Rayyan', color: '#2c45a0' },
  { slug: 'rhythms-college',           label: 'Rhythms',   color: '#9a2a2a' },
  { slug: 'darul-swafa',               label: 'Darul',     color: '#2a6a2a' },
]

// section === null → always visible to any signed-in user (their own work)
export const MAIN_NAV: { href: string; label: string; icon: React.ElementType; section: SectionKey | null }[] = [
  { href: '/',          label: 'Dashboard', icon: LayoutDashboard, section: 'ops' },
  { href: '/management', label: 'Management', icon: BriefcaseBusiness, section: 'management' },
  { href: '/meetings', label: 'Meetings', icon: CalendarClock, section: null },
  { href: '/finance', label: 'Finance', icon: Landmark, section: 'finance' },
  { href: '/inventory', label: 'Inventory', icon: Boxes, section: 'inventory' },
  { href: '/procurement', label: 'Procurement', icon: ShoppingCart, section: 'procurement' },
  { href: '/management/team', label: 'Team', icon: UsersRound, section: 'management' },
  { href: '/management/users', label: 'Portal Access', icon: UserCog, section: 'users' },
  { href: '/management/duties', label: 'Daily Duties', icon: CalendarCheck, section: 'management' },
  { href: '/attendance', label: 'Attendance', icon: ClipboardCheck, section: null },
  // Personal is every user's PRIVATE task space — always visible, own rows only.
  { href: '/personal',  label: 'Personal',  icon: Lock,            section: null },
  { href: '/my-tasks',  label: 'My Tasks',  icon: CheckSquare,     section: null },
  { href: '/forms',     label: 'Forms',     icon: ClipboardList,   section: null },
  { href: '/chat',      label: 'Chat',      icon: MessagesSquare,  section: null },
  { href: '/forum',     label: 'Forum',     icon: Megaphone,       section: null },
  { href: '/tasks',     label: 'Tasks',     icon: ListTodo,        section: 'ops' },
  { href: '/projects',  label: 'Projects',  icon: FolderKanban,    section: 'ops' },
  { href: '/clients',   label: 'Clients',   icon: Building2,       section: 'ops' },
  { href: '/npt',        label: 'NPT Service', icon: Wrench,        section: 'npt_service' },
  { href: '/rayyan',     label: 'Rayyan Admin', icon: GraduationCap, section: 'rayyan_admin' },
  { href: '/rhythms',     label: 'Rhythms', icon: BookOpen, section: 'rhythms_admin' },
  { href: '/darul',     label: 'Darul Swafa', icon: BookMarked, section: 'darul_admin' },
  { href: '/nuuranest', label: 'Nuuranest', icon: Home, section: 'nuuranest_admin' },
  { href: '/glitz',     label: "Glitz N' Glim", icon: Sparkles, section: 'glitz_admin' },
  { href: '/agents',    label: 'Agents',    icon: Bot,             section: 'ops_agents' },
]

interface SidebarProps {
  open: boolean
  onClose: () => void
  onSignOut: () => void
}

export function Sidebar({ open, onClose, onSignOut }: SidebarProps) {
  const path = usePathname()
  const { can, isAdmin } = usePermissions()

  const visibleNav = MAIN_NAV.filter((item) => item.section === null || can(item.section, 'view'))
  const showBrands = can('ops', 'view')
  // Marketing Hub is a self-contained workspace inside this app; it opens in a
  // NEW TAB (like the NPT full workspace). Gated on the marketing section so
  // access is scoped per-role via user_permissions.
  const showMarketing = can('marketing', 'view')

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={onClose} aria-hidden />
      )}

      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-ocg-navy flex flex-col transition-transform duration-300 ${
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex items-center justify-between px-5 py-5 border-b border-white/10">
          <div>
            <span className="text-white font-bold text-lg">OCG</span>
            <span className="text-ocg-gold text-sm ml-1 font-medium">Ops</span>
          </div>
          <button onClick={onClose} className="lg:hidden text-white/60 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {visibleNav.map(({ href, label, icon: Icon, section }) => {
            const active = path === href || (href !== '/' && path.startsWith(`${href}/`))
            const editable = section ? can(section, 'edit') : true
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                data-tour={`nav-${href}`}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  active
                    ? 'bg-white/10 text-white font-medium'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon size={16} />
                <span className="flex-1">{label}</span>
                {!isAdmin && section && !editable && (
                  <span className="text-[9px] font-bold uppercase tracking-wide text-white/30 bg-white/10 px-1.5 py-0.5 rounded">
                    View
                  </span>
                )}
              </Link>
            )
          })}

          {showMarketing && (
            <a
              href="/mhub"
              target="_blank"
              rel="noreferrer"
              onClick={onClose}
              data-tour="nav-mhub"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/60 hover:text-white hover:bg-white/5 transition-colors"
            >
              <Megaphone size={16} />
              <span className="flex-1">Marketing Hub</span>
              <ExternalLink size={13} className="text-white/30" />
            </a>
          )}

          {showBrands && (
            <div className="pt-4 mt-2 border-t border-white/10">
              <p className="text-white/30 text-xs uppercase tracking-wider px-3 mb-2">Brands</p>
              {OPS_BRANDS.map((brand) => {
                const href = `/tasks?brand=${brand.slug}`
                return (
                  <Link
                    key={brand.slug}
                    href={href}
                    onClick={onClose}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-white/60 hover:text-white hover:bg-white/5 transition-colors"
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
          )}
        </nav>

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
