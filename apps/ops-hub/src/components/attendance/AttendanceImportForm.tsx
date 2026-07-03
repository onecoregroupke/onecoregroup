'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload } from 'lucide-react'
import { api } from '@/lib/apiClient'

export function AttendanceImportForm() {
  const router = useRouter()
  const [json, setJson] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit() {
    setError('')
    let rows: unknown
    try {
      rows = JSON.parse(json)
    } catch {
      setError('Paste JSON exported from the attendance converter.')
      return
    }
    setSaving(true)
    const { ok, data } = await api<{ error?: string }>('/api/attendance', {
      method: 'POST',
      body: JSON.stringify({ rows }),
    })
    setSaving(false)
    if (!ok) { setError(data?.error ?? 'Import failed.'); return }
    setJson('')
    router.refresh()
  }

  return (
    <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ocg-gold">Import attendance</h2>
        <p className="mt-1 text-sm text-gray-500">Paste converted Deli S151 export rows as JSON. Each row should include employee_name/email, attendance_date, check_in_at, and check_out_at.</p>
      </div>
      <textarea className="input min-h-32 font-mono text-xs" value={json} onChange={(e) => setJson(e.target.value)} placeholder='[{"employee_name":"Jane Doe","employee_email":"jane@example.com","attendance_date":"2026-07-03","check_in_at":"2026-07-03T08:02:00+03:00","check_out_at":"2026-07-03T17:11:00+03:00"}]' />
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-3 flex justify-end">
        <button onClick={submit} disabled={saving || !json.trim()} className="inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
          <Upload size={15} /> {saving ? 'Importing...' : 'Import rows'}
        </button>
      </div>
    </section>
  )
}
