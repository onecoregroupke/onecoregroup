'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, KeyRound, Lock, UserCog } from 'lucide-react'
import { api } from '@/lib/apiClient'
import { getClient } from '@/lib/supabase'

/**
 * Self-service account area (every signed-in user). Change display name and
 * password. Email is provisioned by administration and shown read-only. The
 * password flow re-authenticates with the current password, then calls Supabase
 * Auth's updateUser — the new password is set by the auth provider and is never
 * sent to our own server.
 */
export function AccountSettings() {
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [nameMsg, setNameMsg] = useState('')

  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [savingPw, setSavingPw] = useState(false)
  const [pwMsg, setPwMsg] = useState('')
  const [pwErr, setPwErr] = useState('')

  useEffect(() => {
    void api<{ email: string; display_name: string }>('/api/account').then(({ ok, data }) => {
      if (ok) { setEmail(data.email ?? ''); setDisplayName(data.display_name ?? '') }
    })
  }, [])

  async function saveName() {
    setSavingName(true); setNameMsg('')
    const { ok, data } = await api<{ error?: string }>('/api/account', {
      method: 'PATCH', body: JSON.stringify({ display_name: displayName }),
    })
    setSavingName(false)
    setNameMsg(ok ? 'Saved.' : data?.error ?? 'Could not save.')
  }

  async function changePassword() {
    setPwErr(''); setPwMsg('')
    if (next.length < 8) { setPwErr('New password must be at least 8 characters.'); return }
    if (next !== confirm) { setPwErr('New password and confirmation do not match.'); return }
    setSavingPw(true)
    const supabase = getClient()
    // Re-authenticate with the current password before allowing the change.
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password: current })
    if (signInErr) { setSavingPw(false); setPwErr('Your current password is incorrect.'); return }
    const { error: updErr } = await supabase.auth.updateUser({ password: next })
    setSavingPw(false)
    if (updErr) { setPwErr(updErr.message); return }
    setCurrent(''); setNext(''); setConfirm('')
    setPwMsg('Password changed.')
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="mb-4 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ocg-gold">
          <UserCog size={14} /> Profile
        </h2>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-500">Display name</span>
          <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </label>
        <label className="mt-3 block">
          <span className="mb-1 block text-xs font-medium text-gray-500">Login email</span>
          <input className="input bg-gray-50 text-gray-500" value={email} readOnly />
          <span className="mt-1 flex items-center gap-1 text-[11px] text-gray-400"><Lock size={11} /> Managed by administration — contact an admin to change it.</span>
        </label>
        <div className="mt-4 flex items-center gap-3">
          <button onClick={saveName} disabled={savingName || !displayName.trim()}
            className="rounded-lg bg-ocg-navy px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">
            {savingName ? 'Saving…' : 'Save profile'}
          </button>
          {nameMsg && <span className="inline-flex items-center gap-1 text-sm text-emerald-700">{nameMsg === 'Saved.' && <CheckCircle2 size={14} />}{nameMsg}</span>}
        </div>
      </section>

      <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="mb-4 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ocg-gold">
          <KeyRound size={14} /> Password
        </h2>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-500">Current password</span>
          <input type="password" className="input" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
        </label>
        <label className="mt-3 block">
          <span className="mb-1 block text-xs font-medium text-gray-500">New password</span>
          <input type="password" className="input" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
        </label>
        <label className="mt-3 block">
          <span className="mb-1 block text-xs font-medium text-gray-500">Confirm new password</span>
          <input type="password" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        </label>
        {pwErr && <p className="mt-3 text-sm text-red-600">{pwErr}</p>}
        <div className="mt-4 flex items-center gap-3">
          <button onClick={changePassword} disabled={savingPw || !current || !next}
            className="rounded-lg bg-ocg-navy px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">
            {savingPw ? 'Changing…' : 'Change password'}
          </button>
          {pwMsg && <span className="inline-flex items-center gap-1 text-sm text-emerald-700"><CheckCircle2 size={14} /> {pwMsg}</span>}
        </div>
      </section>
    </div>
  )
}
