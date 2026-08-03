'use client'

import { Download, Printer } from 'lucide-react'

// Client-side CSV export + print for the analytics view. Respects whatever the
// server already scoped/filtered (the page only passes data the viewer can see).
type Row = Record<string, string | number>

function toCsv(rows: Row[]): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const esc = (v: unknown) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n')
}

export function AnalyticsExport({ sheets, filename }: { sheets: Record<string, Row[]>; filename: string }) {
  function download() {
    const parts = Object.entries(sheets).map(([name, rows]) => `# ${name}\n${toCsv(rows)}`)
    const blob = new Blob([parts.join('\n\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${filename}.csv`
    document.body.appendChild(a); a.click(); a.remove()
    URL.revokeObjectURL(url)
  }
  return (
    <div className="flex gap-2 print:hidden">
      <button onClick={download} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:border-ocg-gold/50">
        <Download size={14} /> Export CSV
      </button>
      <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:border-ocg-gold/50">
        <Printer size={14} /> Print
      </button>
    </div>
  )
}
