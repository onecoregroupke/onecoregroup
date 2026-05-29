'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSession, signOut } from '@/lib/supabase'
import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    getSession().then((session) => {
      if (!session) router.push('/login')
      else setChecking(false)
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
    <div className="min-h-screen bg-slate-100 flex">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} onSignOut={signOut} />

      <div className="flex-1 flex flex-col min-w-0">
        <Topbar onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 p-4 lg:p-6 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
