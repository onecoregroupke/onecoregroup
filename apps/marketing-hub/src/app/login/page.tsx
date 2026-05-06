'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { signIn, getSession } from '@/lib/supabase'
import { AlertCircle, Eye, EyeOff } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getSession().then((session) => {
      if (session) router.push('/')
    })
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error: authError } = await signIn(email, password)
    if (authError) {
      setError('Invalid email or password. Please try again.')
      setLoading(false)
      return
    }
    router.push('/')
  }

  return (
    <div className="min-h-screen bg-ocg-navy flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-ocg-gold rounded-xl mb-4">
            <span className="text-white font-bold text-xl">OCG</span>
          </div>
          <h1 className="text-white font-semibold text-xl">Marketing Hub</h1>
          <p className="text-slate-400 text-sm mt-1">One Core Group · Internal Use Only</p>
        </div>

        {/* Form */}
        <div className="bg-white rounded-2xl p-8 shadow-xl">
          <h2 className="font-semibold text-gray-900 text-lg mb-6">Sign in</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="wallace@onecoregroup.com"
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ocg-navy"
                required
                autoComplete="email"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your password"
                  className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ocg-navy pr-10"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg">
                <AlertCircle size={14} />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-ocg-navy text-white font-medium py-3 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-60 mt-2"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="text-center text-slate-500 text-xs mt-6">
          Access restricted to authorised team members.
          <br />
          Contact Wallace to request access.
        </p>
      </div>
    </div>
  )
}
