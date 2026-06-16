'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload } from 'lucide-react'
import { api } from '@/lib/apiClient'

export function SchoolpayImportForm({
  endpoint = '/api/rayyan/schoolpay-import',
  title = 'Import SchoolPay CSV',
}: {
  endpoint?: string
  title?: string
}) {
  const router = useRouter()
  const [sourceLabel, setSourceLabel] = useState('SchoolPay export')
  const [notes, setNotes] = useState('')
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function onFile(file: File | null) {
    setError('')
    setMessage('')
    setRows([])
    if (!file) return
    const text = await file.text()
    try {
      setRows(parseCsv(text))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function submit() {
    setError('')
    setMessage('')
    if (rows.length === 0) {
      setError('Choose a CSV file first.')
      return
    }
    setSaving(true)
    const { ok, data } = await api<{ error?: string; imported?: number; matched?: number; unmatched?: number; followups?: number }>(endpoint, {
      method: 'POST',
      body: JSON.stringify({ source_label: sourceLabel, notes, rows }),
    })
    setSaving(false)
    if (!ok) {
      setError(data?.error ?? 'Import failed.')
      return
    }
    setMessage(`Imported ${data.imported ?? 0} rows, matched ${data.matched ?? 0}, unmatched ${data.unmatched ?? 0}, created ${data.followups ?? 0} fee follow-ups.`)
    setRows([])
    router.refresh()
  }

  return (
    <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ocg-gold">{title}</h2>
        <p className="mt-1 text-sm text-gray-500">Snapshots are matched by SchoolPay code, admission number, then student name. Payments still stay in SchoolPay.</p>
      </div>
      <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1.2fr]">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-500">Source label</span>
          <input className="input" value={sourceLabel} onChange={(event) => setSourceLabel(event.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-500">Notes</span>
          <input className="input" value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-500">CSV file</span>
          <input type="file" accept=".csv,text/csv" className="input" onChange={(event) => onFile(event.target.files?.[0] ?? null)} />
        </label>
      </div>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-500">{rows.length > 0 ? `${rows.length} row${rows.length === 1 ? '' : 's'} ready to import.` : 'No rows loaded yet.'}</p>
        <button onClick={submit} disabled={saving || rows.length === 0} className="inline-flex items-center justify-center gap-2 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60">
          <Upload size={16} /> {saving ? 'Importing...' : 'Import snapshots'}
        </button>
      </div>
      {message && <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}
      {error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    </section>
  )
}

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const next = text[i + 1]
    if (char === '"' && quoted && next === '"') {
      cell += '"'
      i++
    } else if (char === '"') {
      quoted = !quoted
    } else if (char === ',' && !quoted) {
      row.push(cell)
      cell = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i++
      row.push(cell)
      if (row.some((value) => value.trim())) rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }
  row.push(cell)
  if (row.some((value) => value.trim())) rows.push(row)
  const [headers, ...body] = rows
  if (!headers || headers.length === 0) throw new Error('CSV is missing a header row.')
  return body.map((values) => Object.fromEntries(headers.map((header, index) => [header.trim(), values[index]?.trim() ?? ''])))
}
