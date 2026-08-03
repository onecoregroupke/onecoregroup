'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pause, Play, Square } from 'lucide-react'
import { api } from '@/lib/apiClient'

/** Pause / resume / end a recurring duty. Ending sets active=false — the template
 *  stops recurring but its completion history is kept. */
export function DutyRowControls({ id, paused }: { id: string; paused: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function patch(fields: Record<string, unknown>) {
    setBusy(true)
    await api('/api/duties', { method: 'PATCH', body: JSON.stringify({ id, ...fields }) })
    setBusy(false)
    router.refresh()
  }

  return (
    <span className="flex items-center gap-0.5">
      {paused ? (
        <button title="Resume" disabled={busy} onClick={() => patch({ paused: false })} className="rounded p-1 text-gray-400 hover:text-emerald-600 disabled:opacity-40"><Play size={13} /></button>
      ) : (
        <button title="Pause" disabled={busy} onClick={() => patch({ paused: true })} className="rounded p-1 text-gray-400 hover:text-amber-600 disabled:opacity-40"><Pause size={13} /></button>
      )}
      <button title="End recurrence (keeps history)" disabled={busy}
        onClick={() => { if (confirm('End this recurring duty? It stops recurring but the history is kept.')) void patch({ active: false }) }}
        className="rounded p-1 text-gray-400 hover:text-red-600 disabled:opacity-40"><Square size={13} /></button>
    </span>
  )
}
