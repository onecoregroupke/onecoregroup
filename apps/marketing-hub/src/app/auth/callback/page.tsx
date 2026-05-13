'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getClient } from '@/lib/supabase'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { AlertCircle } from 'lucide-react'

function CallbackHandler() {
  const router = useRouter()
  const params = useSearchParams()
  const [error, setError] = useState('')

  useEffect(() => {
    const token_hash = params.get('token_hash')
    const type = params.get('type')

    if (!token_hash || !type) {
      setError('Invalid or expired link. Please ask an admin to resend your invitation.')
      return
    }

    const supabase = getClient()

    supabase.auth
      .verifyOtp({
        token_hash,
        type: type as Parameters<typeof supabase.auth.verifyOtp>[0]['type'],
      })
      .then(({ error: verifyError }) => {
        if (verifyError) {
          setError(verifyError.message)
          return
        }
        // Invite and password-reset → user must choose a password
        if (type === 'invite' || type === 'recovery') {
          router.replace('/auth/set-password')
        } else {
          router.replace('/')
        }
      })
  }, [params, router])

  if (error) {
    return (
      <div className="bg-white rounded-2xl p-8 shadow-xl max-w-sm w-full text-center space-y-4">
        <AlertCircle className="mx-auto text-red-500" size={40} />
        <h2 className="font-semibold text-gray-900">Link problem</h2>
        <p className="text-slate-500 text-sm">{error}</p>
        <a href="/login" className="inline-block mt-2 text-sm text-ocg-navy underline">
          Back to sign in
        </a>
      </div>
    )
  }

  return (
    <div className="text-center space-y-4">
      <LoadingSpinner />
      <p className="text-slate-400 text-sm">Verifying your link…</p>
    </div>
  )
}

export default function AuthCallbackPage() {
  return (
    <div className="min-h-screen bg-ocg-navy flex items-center justify-center px-4">
      <Suspense
        fallback={
          <div className="text-center space-y-4">
            <LoadingSpinner />
            <p className="text-slate-400 text-sm">Loading…</p>
          </div>
        }
      >
        <CallbackHandler />
      </Suspense>
    </div>
  )
}
