'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, ListTodo, FolderKanban, Building2, Bot,
  Settings, LogOut, X, BriefcaseBusiness, Wrench, GraduationCap,
  UsersRound, BookOpen, BookMarked, UserCog, CalendarCheck, Lock, Landmark,
  CalendarClock, MessagesSquare, Megaphone, Boxes, ShoppingCart, ClipboardCheck,
  ClipboardList, ExternalLink, Home, Sparkles, BarChart3, CalendarDays, Factory,
  Truck, Wallet, ArchiveRestore,
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

export interface NavItem {
  href: string
  label: string
  icon: React.ElementType
  /** null → always visible to any signed-in user (their own work only). */
  section: SectionKey | null
  /** Opens in a new tab (a self-contained workspace). */
  external?: boolean
}

export interface NavGroup {
  key: string
  /** Omitted for the first group, which needs no heading above the logo. */
  heading?: string
  items: NavItem[]
}

/**
 * The sidebar, grouped (§27).
 *
 * Grouping is presentational only — every item keeps exactly the permission it
 * had before, and an empty group is never rendered. The ordering answers the
 * question an ordinary employee actually asks each morning: what do I have to
 * do, when, and who do I need to talk to. Management tooling sits below that,
 * because most people never open it.
 *
 * Naming follows §28 throughout: "My Work" is company work expected of me,
 * "Task Board" is management's coordination of assigned tasks, and "Duty
 * Management" is the configuration of recurring responsibilities. Neither
 * management surface is called "My" anything.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    key: 'my-day',
    heading: 'My day',
    items: [
      { href: '/', label: 'Dashboard', icon: LayoutDashboard, section: 'ops' },
      // My Work is the canonical employee destination — always visible, own
      // records only. It replaces the old My Tasks / My Duties pair (§11).
      { href: '/my-work', label: 'My Work', icon: BriefcaseBusiness, section: null },
      { href: '/calendar', label: 'Calendar', icon: CalendarDays, section: null },
      { href: '/attendance', label: 'Attendance', icon: ClipboardCheck, section: null },
      { href: '/meetings', label: 'Meetings', icon: CalendarClock, section: null },
      // Personal is the user's PRIVATE to-do space — not company work (§28).
      { href: '/personal', label: 'Personal', icon: Lock, section: null },
    ],
  },
  {
    key: 'communication',
    heading: 'Communication',
    items: [
      { href: '/chat', label: 'Chat', icon: MessagesSquare, section: null },
      { href: '/forum', label: 'Forum', icon: Megaphone, section: null },
    ],
  },
  {
    key: 'operations',
    heading: 'Operations',
    items: [
      { href: '/inventory', label: 'Inventory', icon: Boxes, section: 'inventory' },
      { href: '/manufacturing', label: 'Manufacturing', icon: Factory, section: 'inventory' },
      { href: '/field-sales', label: 'Field Sales', icon: Truck, section: 'inventory' },
      { href: '/procurement', label: 'Procurement', icon: ShoppingCart, section: 'procurement' },
      { href: '/petty-cash', label: 'Petty Cash', icon: Wallet, section: 'finance' },
      { href: '/finance', label: 'Finance', icon: Landmark, section: 'finance' },
      { href: '/forms', label: 'Forms', icon: ClipboardList, section: 'forms' },
    ],
  },
  {
    key: 'work-management',
    heading: 'Work management',
    items: [
      { href: '/management', label: 'Management', icon: BriefcaseBusiness, section: 'management' },
      { href: '/tasks', label: 'Task Board', icon: ListTodo, section: 'ops' },
      { href: '/management/duties', label: 'Duty Management', icon: CalendarCheck, section: 'management' },
      { href: '/projects', label: 'Projects', icon: FolderKanban, section: 'ops' },
      { href: '/clients', label: 'Clients', icon: Building2, section: 'ops' },
      { href: '/management/team', label: 'Team', icon: UsersRound, section: 'people' },
      { href: '/management/analytics', label: 'Analytics', icon: BarChart3, section: 'management' },
      { href: '/management/users', label: 'Portal Access', icon: UserCog, section: 'users' },
      { href: '/historical-imports', label: 'Historical Imports', icon: ArchiveRestore, section: 'historical_imports' },
      { href: '/agents', label: 'Agents', icon: Bot, section: 'ops_agents' },
    ],
  },
  {
    key: 'company',
    heading: 'Company',
    items: [
      { href: '/knowledge', label: 'Knowledge', icon: BookOpen, section: 'knowledge' },
    ],
  },
  {
    key: 'entities',
    heading: 'Entities',
    items: [
      { href: '/npt', label: 'NPT Service', icon: Wrench, section: 'npt_service' },
      { href: '/glitz', label: "Glitz N' Glim", icon: Sparkles, section: 'glitz_admin' },
      { href: '/nuuranest', label: 'Nuuranest', icon: Home, section: 'nuuranest_admin' },
      { href: '/rayyan', label: 'Rayyan Admin', icon: GraduationCap, section: 'rayyan_admin' },
      { href: '/rhythms', label: 'Rhythms', icon: BookOpen, section: 'rhythms_admin' },
      { href: '/darul', label: 'Darul Swafa', icon: BookMarked, section: 'darul_admin' },
    ],
  },
]

/** Flattened, for consumers that need one list (mobile nav, tours, tests). */
export const MAIN_NAV: NavItem[] = NAV_GROUPS.flatMap((g) => g.items)

interface SidebarProps {
  open: boolean
  onClose: () => void
  onSignOut: () => void
}

export function Sidebar({ open, onClose, onSignOut }: SidebarProps) {
  const path = usePathname()
  const { can, isAdmin } = usePermissions()

  const visible = (item: NavItem) => item.section === null || can(item.section, 'view')
  // §27: never display an empty heading.
  const groups = NAV_GROUPS
    .map((group) => ({ ...group, items: group.items.filter(visible) }))
    .filter((group) => group.items.length > 0)

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

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {groups.map((group, index) => (
            <div key={group.key} className={index > 0 ? 'mt-4 border-t border-white/10 pt-3' : ''}>
              {group.heading && (
                <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-white/30">
                  {group.heading}
                </p>
              )}
              <div className="space-y-1">
                {group.items.map(({ href, label, icon: Icon, section }) => {
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
              </div>
            </div>
          ))}

          {showMarketing && (
            <div className="mt-4 border-t border-white/10 pt-3">
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
            </div>
          )}

          {showBrands && (
            <div className="pt-4 mt-2 border-t border-white/10">
              <p className="text-white/30 text-[10px] uppercase tracking-wider px-3 mb-2">Brands</p>
              {OPS_BRANDS.map((brand) => (
                <Link
                  key={brand.slug}
                  href={`/tasks?brand=${brand.slug}`}
                  onClick={onClose}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-white/60 hover:text-white hover:bg-white/5 transition-colors"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: brand.color }}
                  />
                  {brand.label}
                </Link>
              ))}
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
