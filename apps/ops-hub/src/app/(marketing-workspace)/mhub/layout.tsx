'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getClient, getSession, signOut } from '@/lib/supabase'
import { Sidebar } from '@/components/mhub/Sidebar'
import { Topbar } from '@/components/mhub/Topbar'
import { MhubBottomNav } from '@/components/mhub/BottomNav'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { PermissionsContext, makeContextValue } from '@/contexts/PermissionsContext'
import { can, MARKETING_SECTIONS } from '@/lib/permissions'
import type { PermissionsMap, SectionKey } from '@/lib/permissions'

// Every section that unlocks some part of the Marketing Hub. A user needs at
// least one of these (or be a founding admin) to enter the /mhub workspace —
// otherwise they're bounced back to their own tasks. This is UX + defence in
// depth; the real boundary is each mhub API route's own section gate.
const MHUB_SECTIONS: SectionKey[] = [
  ...MARKETING_SECTIONS.map((s) => s.key),
  'users',
]

// Marketing Hub workspace shell. A self-contained, full-screen surface (its own
// marketing sidebar — NOT the Ops sidebar) that lives inside the Ops Hub app and
// opens in a new tab. Authenticates against the shared Ops Hub cookie session, so
// staff sign in once; marketing access is scoped per-user via user_permissions.
export default function MarketingWorkspaceLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [permissions, setPermissions] = useState<PermissionsMap | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState<string | null>(null)

  useEffect(() => {
    getSession().then(async (session) => {
      if (!session) {
        router.push('/login')
        return
      }
      setEmail(session.user.email ?? null)

      // NB: activation (choosing a password) is enforced at invite time by the
      // /auth/callback → /auth/set-password flow, exactly like the Ops portal.
      // We deliberately do NOT gate on user_metadata.password_set here — that
      // flag is set at invite and never cleared on the live client session, so
      // gating on it bounced already-activated users back to "create password"
      // every time they opened the Marketing Hub.

      // Fetch this user's permissions row.
      // If no row exists they are the founding admin → permissions stays null.
      const supabase = getClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from('user_permissions')
        .select('permissions, is_active, display_name')
        .eq('user_id', session.user.id)
        .single() as { data: { permissions: PermissionsMap; is_active: boolean; display_name: string | null } | null; error: unknown }

      if (data) {
        // Inactive users are signed out immediately
        if (!data.is_active) {
          await signOut()
          router.push('/login')
          return
        }
        // A signed-in user with no Marketing Hub section at all doesn't belong
        // in this workspace — send them to their tasks rather than an empty shell.
        const hasMhubAccess = MHUB_SECTIONS.some((key) => can(data.permissions, key, 'view'))
        if (!hasMhubAccess) {
          router.replace('/my-tasks')
          return
        }
        setPermissions(data.permissions)
        setDisplayName(data.display_name ?? null)
      }
      // data === null → no row → founding admin, permissions stays null

      setChecking(false)
    })
  }, [router])

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <PermissionsContext.Provider value={makeContextValue(permissions, email, displayName)}>
      <div className="min-h-screen bg-slate-100 flex">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} onSignOut={signOut} />
        <div className="flex-1 flex flex-col min-w-0">
          <Topbar onMenuClick={() => setSidebarOpen(true)} />
          <main className="flex-1 overflow-auto p-4 pb-24 lg:p-6 lg:pb-6">{children}</main>
          <MhubBottomNav />
        </div>
      </div>
    </PermissionsContext.Provider>
  )
}
