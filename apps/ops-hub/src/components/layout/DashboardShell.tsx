'use client'

import { useState } from 'react'
import { signOut } from '@/lib/supabase'
import { Sidebar } from '@/components/layout/Sidebar'
import { BottomNav } from '@/components/layout/BottomNav'
import { Topbar } from '@/components/layout/Topbar'
import { TourLauncher } from '@/components/tour/TourLauncher'
import { PermissionsContext, makeContextValue } from '@/contexts/PermissionsContext'
import type { PermissionsMap } from '@/lib/permissions'

interface DashboardShellProps {
  children: React.ReactNode
  permissions: PermissionsMap | null
  email: string | null
  displayName: string | null
}

export function DashboardShell({
  children,
  permissions,
  email,
  displayName,
}: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <PermissionsContext.Provider value={makeContextValue(permissions, email, displayName)}>
      <div className="min-h-screen bg-slate-100 flex">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} onSignOut={signOut} />
        <div className="flex-1 flex flex-col min-w-0">
          <Topbar onMenuClick={() => setSidebarOpen(true)} />
          <main className="flex-1 overflow-x-hidden p-4 pb-24 lg:p-6">{children}</main>
          <BottomNav />
          <TourLauncher />
        </div>
      </div>
    </PermissionsContext.Provider>
  )
}
