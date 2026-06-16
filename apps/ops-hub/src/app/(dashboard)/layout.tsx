'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getClient, getSession, signOut } from '@/lib/supabase'
import { Sidebar } from '@/components/layout/Sidebar'
import { BottomNav } from '@/components/layout/BottomNav'
import { Topbar } from '@/components/layout/Topbar'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { PermissionsContext, makeContextValue } from '@/contexts/PermissionsContext'
import type { PermissionsMap } from '@/lib/permissions'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
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

      // No permissions row → founding admin (permissions stays null).
      const supabase = getClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = (await (supabase as any)
        .from('user_permissions')
        .select('permissions, display_name, is_active')
        .eq('user_id', session.user.id)
        .single()) as {
        data: { permissions: PermissionsMap; display_name: string | null; is_active: boolean } | null
      }

      if (data) {
        if (!data.is_active) {
          await signOut()
          router.push('/login')
          return
        }
        setPermissions(data.permissions)
        setDisplayName(data.display_name)
      }

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
          <main className="flex-1 overflow-x-hidden p-4 pb-24 lg:p-6">{children}</main>
          <BottomNav />
        </div>
      </div>
    </PermissionsContext.Provider>
  )
}
