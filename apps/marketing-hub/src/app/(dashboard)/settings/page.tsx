'use client'

import { useEffect, useState } from 'react'
import { CheckCircle, AlertCircle, KeyRound, User } from 'lucide-react'
import { getClient, getSession } from '@/lib/supabase'
import { usePermissions } from '@/contexts/PermissionsContext'

export default function SettingsPage() {
  const { isAdmin, permissions } = usePermissions()

  // ── Profile state ───────────────────────────────────────────────────────────
  const [email, setEmail] = useState('')
  const [userId, setUserId] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // ── Password state ──────────────────────────────────────────────────────────
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // ── Load current user ───────────────────────────────────────────────────────
  useEffect(() => {
    getSession().then(async (session) => {
      if (!session) return
      setEmail(session.user.email ?? '')
      setUserId(session.user.id)

      // Fetch display name from user_permissions row
      const supabase = getClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from('user_permissions')
        .select('display_name')
        .eq('user_id', session.user.id)
        .single() as { data: { display_name: string | null } | null; error: unknown }

      if (data?.display_name) setDisplayName(data.display_name)
    })
  }, [])

  // ── Save display name ───────────────────────────────────────────────────────
  async function saveProfile() {
    setProfileSaving(true)
    setProfileMsg(null)
    try {
      const res = await fetch('/api/me', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${(await getSession())?.access_token ?? ''}`,
        },
        body: JSON.stringify({ display_name: displayName }),
      })
      const json = await res.json() as { error?: string }
      if (!res.ok) throw new Error(json.error ?? 'Failed to save')
      setProfileMsg({ ok: true, text: 'Display name updated.' })
    } catch (e) {
      setProfileMsg({ ok: false, text: e instanceof Error ? e.message : 'Error saving profile.' })
    } finally {
      setProfileSaving(false)
    }
  }

  // ── Change password ─────────────────────────────────────────────────────────
  async function changePassword() {
    if (newPassword !== confirmPassword) {
      setPwMsg({ ok: false, text: 'Passwords do not match.' })
      return
    }
    if (newPassword.length < 8) {
      setPwMsg({ ok: false, text: 'Password must be at least 8 characters.' })
      return
    }
    setPwSaving(true)
    setPwMsg(null)
    try {
      const supabase = getClient()
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw new Error(error.message)
      setNewPassword('')
      setConfirmPassword('')
      setPwMsg({ ok: true, text: 'Password updated successfully.' })
    } catch (e) {
      setPwMsg({ ok: false, text: e instanceof Error ? e.message : 'Error updating password.' })
    } finally {
      setPwSaving(false)
    }
  }

  // ── Role label ──────────────────────────────────────────────────────────────
  const roleLabel = isAdmin ? 'Founding Admin' : 'Team Member'
  const sectionCount = permissions ? Object.values(permissions).filter(v => v !== 'none').length : 0

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Settings</h1>
        <p className="text-slate-500 text-sm mt-1">Manage your account preferences</p>
      </div>

      {/* Account info */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
        <h2 className="font-semibold text-slate-700 flex items-center gap-2">
          <User size={16} className="text-slate-400" />
          Account
        </h2>
        <div className="text-sm space-y-1">
          <div className="flex justify-between py-1.5 border-b border-slate-100">
            <span className="text-slate-500">Email</span>
            <span className="text-slate-800 font-medium">{email || '—'}</span>
          </div>
          <div className="flex justify-between py-1.5">
            <span className="text-slate-500">Role</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              isAdmin ? 'bg-ocg-gold/10 text-ocg-gold' : 'bg-slate-100 text-slate-600'
            }`}>
              {roleLabel}
            </span>
          </div>
          {!isAdmin && (
            <div className="flex justify-between py-1.5 border-t border-slate-100">
              <span className="text-slate-500">Access</span>
              <span className="text-slate-600 text-sm">{sectionCount} section{sectionCount !== 1 ? 's' : ''} enabled</span>
            </div>
          )}
        </div>
      </div>

      {/* Display name */}
      {!isAdmin && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <h2 className="font-semibold text-slate-700 flex items-center gap-2">
            <User size={16} className="text-slate-400" />
            Display Name
          </h2>
          <input
            type="text"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder="Your name"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocg-gold/40"
          />
          {profileMsg && (
            <p className={`flex items-center gap-1.5 text-sm ${profileMsg.ok ? 'text-green-600' : 'text-red-600'}`}>
              {profileMsg.ok ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
              {profileMsg.text}
            </p>
          )}
          <button
            onClick={saveProfile}
            disabled={profileSaving}
            className="bg-ocg-navy text-white text-sm px-4 py-2 rounded-lg hover:bg-ocg-navy/90 disabled:opacity-50 transition-colors"
          >
            {profileSaving ? 'Saving…' : 'Save Name'}
          </button>
        </div>
      )}

      {/* Change password */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <h2 className="font-semibold text-slate-700 flex items-center gap-2">
          <KeyRound size={16} className="text-slate-400" />
          Change Password
        </h2>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-500 mb-1 block">New password</label>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="Min. 8 characters"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocg-gold/40"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Confirm new password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Repeat password"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocg-gold/40"
            />
          </div>
        </div>
        {pwMsg && (
          <p className={`flex items-center gap-1.5 text-sm ${pwMsg.ok ? 'text-green-600' : 'text-red-600'}`}>
            {pwMsg.ok ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
            {pwMsg.text}
          </p>
        )}
        <button
          onClick={changePassword}
          disabled={pwSaving || !newPassword}
          className="bg-ocg-navy text-white text-sm px-4 py-2 rounded-lg hover:bg-ocg-navy/90 disabled:opacity-50 transition-colors"
        >
          {pwSaving ? 'Updating…' : 'Update Password'}
        </button>
      </div>
    </div>
  )
}
