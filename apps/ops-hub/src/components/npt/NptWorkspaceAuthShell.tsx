'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSession } from '@/lib/supabase'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

export function NptWorkspaceAuthShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    getSession().then((session) => {
      if (!session) {
        router.push('/login')
        return
      }
      setReady(true)
    })
  }, [router])

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#eef1f4]">
        <LoadingSpinner />
      </div>
    )
  }

  return children
}
