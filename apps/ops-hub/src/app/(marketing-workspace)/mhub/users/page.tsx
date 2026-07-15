'use client'

import { useEffect, useState } from 'react'
import {
  AlertCircle, CheckCircle, Mail, Plus, RefreshCw,
  Save, Send, Shield, ShieldOff, Trash2, UserCheck, Users, X,
} from 'lucide-react'
import { getClient } from '@/lib/supabase'
import { SECTIONS, defaultPermissions } from '@/lib/permissions'
import { usePermissions } from '@/contexts/PermissionsContext'
import type { PermissionsMap, AccessLevel, SectionKey } from '@/lib/permissions'

// ─── Types ────────────────────────────────────────────────────────────────────
interface HubUser {
  id: string
  email: string
  display_name: string | null
  permissions: PermissionsMap | null  // null = founding admin
  is_active: boolean
  is_admin: boolean
  email_confirmed_at: string | null
  last_sign_in_at: string | null
  created_at: string
}

const ACCESS_OPTIONS: { value: AccessLevel; label: string; colour: string }[] = [
  { value: 'none', label: 'No Access', colour: 'bg-gray-100 text-gray-500' },
  { value: 'view', label: 'View Only', colour: 'bg-blue-50 text-blue-700' },
  { value: 'edit', label: 'View & Edit', colour: 'bg-green-50 text-green-700' },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────
function initials(name: string | null, email: string) {
  const src = name ?? email
  return src.slice(0, 2).toUpperCase()
}

function avatarColor(email: string) {
  const palette = ['#1a1a2e', '#b07a00', '#1a6b42', '#2c45a0', '#9a2a2a', '#2a6a2a', '#6b21a8']
  let hash = 0
  for (const c of email) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff
  return palette[Math.abs(hash) % palette.length]
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function UsersPage() {
  const { can, isAdmin } = usePermissions()

  const [users, setUsers] = useState<HubUser[]>([])
  const [selected, setSelected] = useState<HubUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  // Invite form state
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [invitePerms, setInvitePerms] = useState<PermissionsMap>(defaultPermissions())
  const [inviting, setInviting] = useState(false)

  // Edit state — tracks pending changes to selected user
  const [editPerms, setEditPerms] = useState<PermissionsMap>({})
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')

  // ── Auth headers ────────────────────────────────────────────────────────────
  async function authHeaders() {
    const supabase = getClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Session expired.')
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }
  }

  // ── Load users ──────────────────────────────────────────────────────────────
  async function loadUsers() {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/mhub/users', { headers: await authHeaders() })
      const json = await res.json() as { users?: HubUser[]; error?: string }
      if (!res.ok) throw new Error(json.error)
      setUsers(json.users ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadUsers() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function selectUser(u: HubUser) {
    setSelected(u)
    setEditPerms(u.permissions ?? {})
    setEditName(u.display_name ?? '')
    setEditEmail(u.email)
    setMessage(''); setError('')
  }

  // ── Save permissions ─────────────────────────────────────────────────────────
  async function saveUser() {
    if (!selected || selected.is_admin) return
    setSaving(true); setError(''); setMessage('')
    try {
      const emailChanged = editEmail.trim() && editEmail.trim() !== selected.email
      const res = await fetch('/api/mhub/users', {
        method: 'PATCH',
        headers: await authHeaders(),
        body: JSON.stringify({
          user_id: selected.id,
          display_name: editName,
          permissions: editPerms,
          ...(emailChanged ? { email: editEmail.trim() } : {}),
        }),
      })
      const json = await res.json() as { error?: string }
      if (!res.ok) throw new Error(json.error)
      const updated: HubUser = { ...selected, display_name: editName || null, permissions: editPerms, email: emailChanged ? editEmail.trim() : selected.email }
      setUsers(prev => prev.map(u => u.id === updated.id ? updated : u))
      setSelected(updated)
      setMessage(emailChanged ? 'Saved. Login email updated.' : 'Permissions saved.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  // ── Toggle active ────────────────────────────────────────────────────────────
  async function toggleActive() {
    if (!selected || selected.is_admin) return
    setSaving(true); setError(''); setMessage('')
    try {
      const res = await fetch('/api/mhub/users', {
        method: 'PATCH',
        headers: await authHeaders(),
        body: JSON.stringify({ user_id: selected.id, is_active: !selected.is_active }),
      })
      const json = await res.json() as { error?: string }
      if (!res.ok) throw new Error(json.error)
      const updated: HubUser = { ...selected, is_active: !selected.is_active }
      setUsers(prev => prev.map(u => u.id === updated.id ? updated : u))
      setSelected(updated)
      setMessage(updated.is_active ? 'User reactivated.' : 'User deactivated.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update.')
    } finally {
      setSaving(false)
    }
  }

  // ── Resend invite / reset link ───────────────────────────────────────────────
  async function resendInvite() {
    if (!selected || selected.is_admin) return
    setSaving(true); setError(''); setMessage('')
    try {
      const res = await fetch('/api/mhub/users', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ action: 'resend', user_id: selected.id, email: selected.email, display_name: selected.display_name ?? '' }),
      })
      const json = await res.json() as { error?: string; resent?: string }
      if (!res.ok) throw new Error(json.error)
      setMessage(json.resent === 'recovery'
        ? 'Password-reset link sent (they had already accepted).'
        : 'Invite re-sent to their inbox.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to resend.')
    } finally {
      setSaving(false)
    }
  }

  // ── Delete user ──────────────────────────────────────────────────────────────
  async function deleteUser() {
    if (!selected || selected.is_admin) return
    if (!confirm(`Permanently delete ${selected.email}? This cannot be undone.`)) return
    setSaving(true); setError('')
    try {
      const res = await fetch(`/api/mhub/users?id=${selected.id}`, { method: 'DELETE', headers: await authHeaders() })
      const json = await res.json() as { error?: string }
      if (!res.ok) throw new Error(json.error)
      setUsers(prev => prev.filter(u => u.id !== selected.id))
      setSelected(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete.')
    } finally {
      setSaving(false)
    }
  }

  // ── Invite user ──────────────────────────────────────────────────────────────
  async function sendInvite() {
    if (!inviteEmail.trim()) return
    setInviting(true); setError('')
    try {
      const res = await fetch('/api/mhub/users', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ email: inviteEmail, display_name: inviteName, permissions: invitePerms }),
      })
      const json = await res.json() as { user?: HubUser; error?: string }
      if (!res.ok) throw new Error(json.error)
      setUsers(prev => [...prev, json.user!])
      setShowInvite(false)
      setInviteEmail(''); setInviteName(''); setInvitePerms(defaultPermissions())
      setMessage(`Invite sent to ${json.user!.email}. They'll receive an email to set their password.`)
      selectUser(json.user!)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to invite.')
    } finally {
      setInviting(false)
    }
  }

  function setAccess(perms: PermissionsMap, section: SectionKey, val: AccessLevel): PermissionsMap {
    return { ...perms, [section]: val }
  }

  // ── Guard: only admins or users with users:edit can see this page ────────────
  if (!can('users', 'view')) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-gray-400">
        <Shield size={48} className="text-gray-200" />
        <p className="text-lg font-semibold">Access Restricted</p>
        <p className="text-sm">You don&apos;t have permission to manage users.</p>
      </div>
    )
  }

  const canEdit = can('users', 'edit')

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Users size={20} className="text-ocg-navy" />
            <h1 className="font-bold text-2xl text-gray-900">Users &amp; Access</h1>
          </div>
          <p className="text-gray-500 text-sm">Manage team members and control what each person can see and edit.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadUsers} title="Refresh" className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
          {canEdit && (
            <button
              onClick={() => { setShowInvite(true); setMessage(''); setError('') }}
              className="inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              <Plus size={15} /> Invite User
            </button>
          )}
        </div>
      </div>

      {/* Global messages */}
      {message && (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-700">
          <CheckCircle size={16} /> {message}
          <button onClick={() => setMessage('')} className="ml-auto"><X size={14} /></button>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle size={16} /> {error}
          <button onClick={() => setError('')} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {/* Invite modal */}
      {showInvite && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <p className="font-semibold text-gray-900">Invite a team member</p>
              <button onClick={() => setShowInvite(false)} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Email *</span>
                  <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocg-navy"
                    placeholder="team@example.com" />
                </label>
                <label className="block">
                  <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Display name</span>
                  <input type="text" value={inviteName} onChange={e => setInviteName(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocg-navy"
                    placeholder="Jane Doe" />
                </label>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Access Permissions</p>
                <PermissionMatrix
                  permissions={invitePerms}
                  onChange={p => setInvitePerms(p)}
                  includeUsers={isAdmin}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                <button onClick={() => setShowInvite(false)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900">
                  Cancel
                </button>
                <button
                  onClick={sendInvite}
                  disabled={inviting || !inviteEmail.trim()}
                  className="inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {inviting ? <RefreshCw size={14} className="animate-spin" /> : <Mail size={14} />}
                  {inviting ? 'Sending…' : 'Send Invite'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main grid */}
      <div className="grid gap-6 xl:grid-cols-[300px_1fr]">

        {/* User list */}
        <aside className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="border-b border-gray-100 px-4 py-3">
            <p className="text-sm font-semibold text-gray-900">Team ({users.length})</p>
          </div>
          <div className="max-h-[640px] overflow-y-auto p-2 space-y-1">
            {loading ? (
              <p className="p-4 text-sm text-gray-400">Loading…</p>
            ) : users.length === 0 ? (
              <p className="p-4 text-sm text-gray-400">No users yet.</p>
            ) : (
              users.map(u => {
                const active = u.id === selected?.id
                const bg = avatarColor(u.email)
                return (
                  <button
                    key={u.id}
                    onClick={() => selectUser(u)}
                    className={`w-full rounded-xl p-2.5 text-left transition-colors ${active ? 'bg-ocg-navy' : 'hover:bg-gray-50'}`}
                  >
                    <div className="flex gap-2.5 items-center">
                      {/* Avatar */}
                      <div
                        className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 text-white text-xs font-bold"
                        style={{ backgroundColor: active ? 'rgba(255,255,255,0.2)' : bg }}
                      >
                        {initials(u.display_name, u.email)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-xs font-semibold ${active ? 'text-white' : 'text-gray-900'}`}>
                          {u.display_name ?? u.email}
                        </p>
                        {u.display_name && (
                          <p className={`truncate text-[10px] ${active ? 'text-white/50' : 'text-gray-400'}`}>{u.email}</p>
                        )}
                      </div>
                      {/* Badges */}
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {u.is_admin && (
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${active ? 'bg-white/20 text-white' : 'bg-amber-50 text-amber-700'}`}>
                            ADMIN
                          </span>
                        )}
                        {!u.is_admin && !u.is_active && (
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${active ? 'bg-white/20 text-white' : 'bg-red-50 text-red-600'}`}>
                            INACTIVE
                          </span>
                        )}
                        {!u.email_confirmed_at && !u.is_admin && (
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${active ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-400'}`}>
                            PENDING
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </aside>

        {/* Editor */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm">
          {!selected ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[320px] text-gray-300 gap-3">
              <UserCheck size={40} />
              <p className="text-sm font-medium text-gray-400">Select a user to manage their access</p>
            </div>
          ) : (
            <>
              {/* Editor header */}
              <div className="border-b border-gray-100 px-5 py-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div
                    className="h-10 w-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                    style={{ backgroundColor: avatarColor(selected.email) }}
                  >
                    {initials(selected.display_name, selected.email)}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{selected.display_name ?? selected.email}</p>
                    {selected.display_name && <p className="text-xs text-gray-400">{selected.email}</p>}
                  </div>
                  {selected.is_admin && (
                    <span className="text-xs font-bold px-2 py-1 rounded-full bg-amber-50 text-amber-700">Founding Admin</span>
                  )}
                </div>
                {/* Action buttons — only for non-admin users */}
                {!selected.is_admin && canEdit && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={resendInvite}
                      disabled={saving}
                      title="Resend invite / password-reset link"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-60"
                    >
                      <Send size={13} /> Resend
                    </button>
                    <button
                      onClick={toggleActive}
                      disabled={saving}
                      title={selected.is_active ? 'Deactivate user' : 'Reactivate user'}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
                        selected.is_active
                          ? 'border border-orange-200 text-orange-600 hover:bg-orange-50'
                          : 'border border-green-200 text-green-600 hover:bg-green-50'
                      }`}
                    >
                      {selected.is_active ? <ShieldOff size={13} /> : <Shield size={13} />}
                      {selected.is_active ? 'Deactivate' : 'Reactivate'}
                    </button>
                    <button
                      onClick={deleteUser}
                      disabled={saving}
                      title="Delete user permanently"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors disabled:opacity-60"
                    >
                      <Trash2 size={13} /> Delete
                    </button>
                  </div>
                )}
              </div>

              <div className="p-5 space-y-6">
                {/* Display name + login email */}
                {!selected.is_admin && (
                  <div className="grid gap-4 sm:grid-cols-2 max-w-2xl">
                    <label className="block">
                      <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Display Name</span>
                      <input
                        type="text"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        disabled={!canEdit}
                        placeholder={selected.email}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocg-navy disabled:bg-gray-50 disabled:text-gray-400"
                      />
                    </label>
                    <label className="block">
                      <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Login Email</span>
                      <input
                        type="email"
                        value={editEmail}
                        onChange={e => setEditEmail(e.target.value)}
                        disabled={!canEdit}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocg-navy disabled:bg-gray-50 disabled:text-gray-400"
                      />
                    </label>
                  </div>
                )}

                {/* Admin info */}
                {selected.is_admin ? (
                  <div className="rounded-2xl bg-amber-50 border border-amber-100 p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <Shield size={16} className="text-amber-600" />
                      <p className="text-sm font-semibold text-amber-800">Founding Administrator</p>
                    </div>
                    <p className="text-xs text-amber-700 leading-relaxed">
                      This account was the first to access the hub and has full, unrestricted access to all sections.
                      Permissions cannot be edited for this account.
                    </p>
                  </div>
                ) : (
                  /* Permission matrix */
                  <div>
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-4">Access Permissions</p>
                    <PermissionMatrix
                      permissions={editPerms}
                      onChange={setEditPerms}
                      includeUsers={isAdmin}
                      readonly={!canEdit}
                    />
                  </div>
                )}

                {/* Meta info */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 border-t border-gray-100">
                  {[
                    { label: 'Joined', value: new Date(selected.created_at).toLocaleDateString() },
                    { label: 'Last sign-in', value: selected.last_sign_in_at ? new Date(selected.last_sign_in_at).toLocaleDateString() : '—' },
                    { label: 'Status', value: selected.email_confirmed_at ? 'Confirmed' : 'Invite pending' },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">{label}</p>
                      <p className="text-xs font-semibold text-gray-700">{value}</p>
                    </div>
                  ))}
                </div>

                {/* Save button */}
                {!selected.is_admin && canEdit && (
                  <div className="flex justify-end border-t border-gray-100 pt-5">
                    <button
                      onClick={saveUser}
                      disabled={saving}
                      className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
                    >
                      <Save size={16} />
                      {saving ? 'Saving…' : 'Save Permissions'}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}

// ─── Permission Matrix Component ──────────────────────────────────────────────
function PermissionMatrix({
  permissions,
  onChange,
  includeUsers = false,
  readonly = false,
}: {
  permissions: PermissionsMap
  onChange: (p: PermissionsMap) => void
  includeUsers?: boolean
  readonly?: boolean
}) {
  const sections = SECTIONS.filter(s => s.key !== 'users' || includeUsers)

  return (
    <div className="rounded-xl border border-gray-100 overflow-hidden">
      {/* Column headers */}
      <div className="grid grid-cols-[1fr_repeat(3,_auto)] bg-gray-50 border-b border-gray-100">
        <div className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">Section</div>
        {ACCESS_OPTIONS.map(opt => (
          <div key={opt.value} className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 text-center min-w-[90px]">
            {opt.label}
          </div>
        ))}
      </div>

      {/* Rows */}
      {sections.map((section, i) => {
        const current = permissions[section.key] ?? 'none'
        return (
          <div
            key={section.key}
            className={`grid grid-cols-[1fr_repeat(3,_auto)] items-center ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} ${i < sections.length - 1 ? 'border-b border-gray-100' : ''}`}
          >
            <div className="px-4 py-3 text-sm font-medium text-gray-800">{section.label}</div>
            {ACCESS_OPTIONS.map(opt => {
              const selected = current === opt.value
              return (
                <div key={opt.value} className="flex items-center justify-center px-4 py-3 min-w-[90px]">
                  <button
                    type="button"
                    disabled={readonly}
                    onClick={() => onChange({ ...permissions, [section.key]: opt.value })}
                    className={`w-full text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition-all ${
                      selected
                        ? opt.colour + ' ring-2 ring-offset-1 ' + (
                            opt.value === 'none' ? 'ring-gray-300' :
                            opt.value === 'view' ? 'ring-blue-300' : 'ring-green-300'
                          )
                        : 'bg-white text-gray-300 border border-gray-200 hover:border-gray-300 hover:text-gray-500'
                    } ${readonly ? 'cursor-default opacity-70' : 'cursor-pointer'}`}
                  >
                    {opt.label}
                  </button>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
