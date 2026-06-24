'use client'

import { useState } from 'react'
import { AlertCircle, CheckCircle, Mail } from 'lucide-react'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        setError(data.error ?? 'Something went wrong. Please try again.')
        setLoading(false)
        return
      }
      // Always show the same confirmation (no account enumeration).
      setSent(true)
    } catch {
      setError('Something went wrong. Please try again.')
    }
    setLoading(false)
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

        <div className="bg-white rounded-2xl p-8 shadow-xl">
          {sent ? (
            <div className="text-center space-y-3">
              <CheckCircle className="mx-auto text-green-500" size={40} />
              <h2 className="font-semibold text-gray-900 text-lg">Check your inbox</h2>
              <p className="text-slate-500 text-sm">
                If an account exists for <span className="font-medium">{email}</span>, we&apos;ve sent a
                link to reset your password. The link expires in 1 hour.
              </p>
              <a href="/login" className="inline-block mt-2 text-sm text-ocg-navy underline">
                Back to sign in
              </a>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-2">
                <Mail size={18} className="text-ocg-navy" />
                <h2 className="font-semibold text-gray-900 text-lg">Forgot your password?</h2>
              </div>
              <p className="text-slate-500 text-sm mb-6">
                Enter your email and we&apos;ll send you a link to set a new password.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@onecoregroup.com"
                    className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ocg-navy"
                    required
                    autoComplete="email"
                  />
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
                  {loading ? 'Sending…' : 'Send reset link'}
                </button>
              </form>

              <p className="text-center mt-4">
                <a href="/login" className="text-sm text-slate-500 underline">
                  Back to sign in
                </a>
              </p>
            </>
          )}
        </div>

        <p className="text-center text-slate-500 text-xs mt-6">
          Access restricted to authorised team members.
        </p>
      </div>
    </div>
  )
}
