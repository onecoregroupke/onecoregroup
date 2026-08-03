'use client'

import { useState } from 'react'
import { Eye, X } from 'lucide-react'

/** Shown at the top of the portal while a founding admin is viewing as another
 *  user. "Exit" clears the impersonation cookie and returns to Portal Access. */
export function ImpersonationBanner({ name }: { name: string }) {
  const [busy, setBusy] = useState(false)
  async function exit() {
    setBusy(true)
    await fetch('/api/impersonate', { method: 'DELETE' })
    window.location.href = '/management/users'
  }
  return (
    <div className="mb-4 flex flex-wrap items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white shadow-sm">
      <Eye size={15} /> Viewing the portal as <b>{name}</b>
      <button onClick={exit} disabled={busy}
        className="ml-2 inline-flex items-center gap-1 rounded bg-white/20 px-2 py-0.5 text-xs font-semibold hover:bg-white/30 disabled:opacity-60">
        <X size={12} /> {busy ? 'Exiting…' : 'Exit to my portal'}
      </button>
    </div>
  )
}
