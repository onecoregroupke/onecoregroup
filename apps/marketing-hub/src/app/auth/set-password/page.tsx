'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getClient } from '@/lib/supabase'
import { AlertCircle, CheckCircle, Eye, EyeOff, KeyRound } from 'lucide-react'

export default function SetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    const supabase = getClient()
    // Set the password AND flag the account as activated, so the dashboard no
    // longer forces this user back through set-password.
    const { error: updateError } = await supabase.auth.updateUser({
      password,
      data: { password_set: true },
    })

    if (updateError) {
      setError(updateError.message)
      setLoading(false)
      return
    }

    setDone(true)
    setTimeout(() => router.push('/'), 2000)
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
          {done ? (
            <div className="text-center space-y-3">
              <CheckCircle className="mx-auto text-green-500" size={40} />
              <h2 className="font-semibold text-gray-900 text-lg">Password set!</h2>
              <p className="text-slate-500 text-sm">Taking you to the dashboard…</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-6">
                <KeyRound size={18} className="text-ocg-navy" />
                <h2 className="font-semibold text-gray-900 text-lg">Set your password</h2>
              </div>
              <p className="text-slate-500 text-sm mb-6">
                Welcome to the One Core Group Marketing Hub. Choose a password to
                activate your account — you&apos;ll use it every time you sign in.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    New password
                  </label>
                  <div className="relative">
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Min. 8 characters"
                      className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ocg-navy pr-10"
                      required
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Confirm password
                  </label>
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="Repeat password"
                    className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ocg-navy"
                    required
                    autoComplete="new-password"
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
                  {loading ? 'Saving…' : 'Set Password & Sign In'}
                </button>
              </form>
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
