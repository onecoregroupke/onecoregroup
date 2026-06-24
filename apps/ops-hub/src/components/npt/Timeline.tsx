'use client'

import { useState } from 'react'
import {
  CalendarClock, Wrench, Thermometer, FileText, ReceiptText,
  MessageSquare, Bell, Cog, Phone, Filter, X,
} from 'lucide-react'
import type { TimelineItem, TimelineType } from '@/lib/npt'

const TYPE_META: Record<TimelineType, { label: string; icon: React.ElementType; tone: string }> = {
  appointment: { label: 'Appointments', icon: CalendarClock, tone: 'text-blue-600 bg-blue-50' },
  service_history: { label: 'Service history', icon: Wrench, tone: 'text-emerald-600 bg-emerald-50' },
  measurement: { label: 'Measurements', icon: Thermometer, tone: 'text-cyan-600 bg-cyan-50' },
  estimate: { label: 'Estimates', icon: FileText, tone: 'text-amber-600 bg-amber-50' },
  invoice: { label: 'Invoices', icon: ReceiptText, tone: 'text-purple-600 bg-purple-50' },
  comment: { label: 'Comments', icon: MessageSquare, tone: 'text-gray-600 bg-gray-100' },
  notice: { label: 'Notices', icon: Bell, tone: 'text-orange-600 bg-orange-50' },
  system: { label: 'System logs', icon: Cog, tone: 'text-gray-400 bg-gray-50' },
  message: { label: 'Messages', icon: MessageSquare, tone: 'text-indigo-600 bg-indigo-50' },
  call: { label: 'Phone calls', icon: Phone, tone: 'text-teal-600 bg-teal-50' },
}

export function Timeline({ items }: { items: TimelineItem[] }) {
  // Which types are present, and which are currently hidden.
  const present = Array.from(new Set(items.map((i) => i.type)))
  const [hidden, setHidden] = useState<Set<TimelineType>>(new Set())
  const [showFilters, setShowFilters] = useState(false)

  const visible = items.filter((i) => !hidden.has(i.type))

  function toggle(t: TimelineType) {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t); else next.add(t)
      return next
    })
  }

  return (
    <section className="rounded-xl border border-gray-100 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ocg-gold">Timeline</h2>
        <div className="flex items-center gap-2">
          {hidden.size > 0 && (
            <button onClick={() => setHidden(new Set())} className="text-[11px] font-medium text-gray-400 hover:text-gray-700">Clear filters</button>
          )}
          <button onClick={() => setShowFilters((v) => !v)} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
            <Filter size={13} /> Filters
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="flex flex-wrap gap-2 border-b border-gray-100 bg-gray-50/50 p-3">
          {present.map((t) => {
            const meta = TYPE_META[t]
            const on = !hidden.has(t)
            return (
              <button key={t} onClick={() => toggle(t)} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium border ${on ? 'border-ocg-navy bg-ocg-navy text-white' : 'border-gray-200 bg-white text-gray-400'}`}>
                <meta.icon size={12} /> {meta.label}
                {!on && <X size={11} />}
              </button>
            )
          })}
        </div>
      )}

      <div className="max-h-[560px] overflow-y-auto p-3">
        {visible.length === 0 ? (
          <p className="p-4 text-sm text-gray-500">No activity{items.length ? ' for the selected filters' : ' yet'}.</p>
        ) : (
          <ol className="space-y-2">
            {visible.map((item) => {
              const meta = TYPE_META[item.type] ?? TYPE_META.comment
              return (
                <li key={item.id} className="flex gap-3 rounded-lg border border-gray-100 p-3">
                  <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${meta.tone}`} title={meta.label}>
                    <meta.icon size={14} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-sm font-medium text-gray-800">{item.title}</p>
                      <span className="shrink-0 text-[11px] text-gray-400">{when(item.when)}</span>
                    </div>
                    {item.body && <p className="mt-0.5 whitespace-pre-wrap text-xs text-gray-500">{item.body}</p>}
                    {item.who && <p className="mt-0.5 text-[11px] text-gray-400">{item.who}</p>}
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </section>
  )
}

function when(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })
}
