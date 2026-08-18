'use client'

import { Plus, X } from 'lucide-react'

/**
 * Shared chrome for the operational pads (GRN, GIN, GTN, MRF, invoice,
 * delivery note).
 *
 * These deliberately look like the paper they replace: the same field names, in
 * the same order, in the same blocks, with the same line grid and the same
 * signature footer. A storekeeper who has filled the pad for years should not
 * have to learn a new document — only a new pen.
 *
 * The layout is boxed and ruled rather than the soft card style used elsewhere
 * in the Hub, because a form that is transcribed FROM paper reads better when
 * it keeps the paper's structure. It still uses the Hub's palette, spacing
 * scale and `.input` class — it is the same design system, applied to a form.
 */

export function Pad({
  title,
  subtitle,
  identity,
  children,
}: {
  title: string
  subtitle?: string
  /** The legal identity block printed at the head of the physical pad. */
  identity?: { name: string; lines: string[] } | null
  children: React.ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-gray-300 bg-white shadow-sm">
      <header className="border-b-2 border-gray-800 bg-gray-50 px-5 py-4">
        {identity && (
          <div className="mb-3 text-center">
            <p className="text-sm font-bold uppercase tracking-wide text-gray-900">{identity.name}</p>
            {identity.lines.map((l) => (
              <p key={l} className="text-[11px] leading-tight text-gray-600">{l}</p>
            ))}
          </div>
        )}
        <div className="text-center">
          <h2 className="text-base font-bold uppercase tracking-[0.15em] text-gray-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}
        </div>
      </header>
      <div className="space-y-4 p-5">{children}</div>
    </section>
  )
}

/** A labelled field, laid out the way the pad prints it: label then a rule. */
export function PadField({
  label,
  children,
  className = '',
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">{label}</span>
      {children}
    </label>
  )
}

/** The header block of a pad — a grid of fields above the line grid. */
export function PadHeader({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 border-b border-gray-200 pb-4 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
}

/**
 * The ruled line grid. `columns` are given as the pad prints them, so the
 * column order on screen matches the column order on paper.
 */
export function PadLines({
  columns,
  rows,
  onAdd,
  addLabel = 'Add line',
  children,
}: {
  columns: Array<{ label: string; width?: string; align?: 'left' | 'right' }>
  rows: number
  onAdd: () => void
  addLabel?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-y border-gray-300 bg-gray-50">
              {columns.map((c) => (
                <th
                  key={c.label}
                  style={c.width ? { width: c.width } : undefined}
                  className={`px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-600 ${
                    c.align === 'right' ? 'text-right' : 'text-left'
                  }`}
                >
                  {c.label}
                </th>
              ))}
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="mt-2 inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:border-ocg-gold/40"
      >
        <Plus size={12} /> {addLabel} ({rows})
      </button>
    </div>
  )
}

export function PadRow({ children, onRemove }: { children: React.ReactNode; onRemove?: () => void }) {
  return (
    <tr className="border-b border-gray-100">
      {children}
      <td className="px-1 py-1 align-middle">
        {onRemove && (
          <button type="button" onClick={onRemove} className="rounded p-1 text-gray-300 hover:text-red-500" aria-label="Remove line">
            <X size={13} />
          </button>
        )}
      </td>
    </tr>
  )
}

export function PadCell({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return <td className={`px-1.5 py-1 align-middle ${align === 'right' ? 'text-right' : ''}`}>{children}</td>
}

/**
 * The signature footer. Every pad ends with two or more named sign-offs, and
 * they are captured as typed names rather than drawn signatures — a typed name
 * with an audit trail behind it is stronger evidence than a scribble, and the
 * audit event records who was actually signed in.
 */
export function PadFooter({ fields }: { fields: Array<{ label: string; node: React.ReactNode }> }) {
  return (
    <div className="grid gap-3 border-t border-gray-200 pt-4 sm:grid-cols-2 lg:grid-cols-4">
      {fields.map((f) => (
        <PadField key={f.label} label={f.label}>{f.node}</PadField>
      ))}
    </div>
  )
}

/** The effect this form will have on stock, stated before it is submitted. */
export function StockEffectNotice({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'out' | 'in' | 'none'
  children: React.ReactNode
}) {
  const styles: Record<string, string> = {
    info: 'border-blue-200 bg-blue-50 text-blue-800',
    out: 'border-red-200 bg-red-50 text-red-800',
    in: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    none: 'border-gray-200 bg-gray-50 text-gray-600',
  }
  return (
    <p className={`rounded-lg border p-3 text-xs leading-relaxed ${styles[tone]}`}>{children}</p>
  )
}
