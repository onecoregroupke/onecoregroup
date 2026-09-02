'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'
import { api } from '@/lib/apiClient'

export function ReconciliationApprovalPanel({
  allocationId,
  hasVariance,
  status,
  approvedBy,
  existingReason,
}: {
  allocationId: string
  hasVariance: boolean
  status: string
  approvedBy: string
  existingReason: string
}) {
  const router = useRouter()
  const [reason, setReason] = useState(existingReason)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (status === 'reconciled' || status === 'closed') {
    return (
      <p className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
        <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
        Reconciled{approvedBy ? ` by ${approvedBy}` : ''}{existingReason ? ` · ${existingReason}` : ''}.
      </p>
    )
  }

  async function approve() {
    if (hasVariance && !reason.trim()) {
      setError('Explain the variance before approving this reconciliation.')
      return
    }
    setSaving(true); setError('')
    const result = await api<{ error?: string }>('/api/field-sales', {
      method: 'POST',
      body: JSON.stringify({ action: 'approve-reconciliation', id: allocationId, reason: reason.trim() }),
    })
    setSaving(false)
    if (!result.ok) { setError(result.data.error ?? 'Could not approve reconciliation.'); return }
    router.refresh()
  }

  return (
    <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Manager reconciliation</p>
      {hasVariance && (
        <label className="mt-2 block text-xs font-medium text-gray-600">
          Variance approval reason *
          <textarea className="input mt-1 min-h-20" value={reason} onChange={(event) => setReason(event.target.value)} />
        </label>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <button onClick={approve} disabled={saving}
        className="mt-2 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
        {saving ? 'Saving…' : hasVariance ? 'Approve variance & reconcile' : 'Mark reconciled'}
      </button>
    </div>
  )
}
