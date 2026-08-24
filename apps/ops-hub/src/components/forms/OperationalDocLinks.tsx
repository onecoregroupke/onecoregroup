import Link from 'next/link'
import { FileSpreadsheet, ArrowUpRight } from 'lucide-react'

export interface DocLink {
  pad: string
  label: string
  hint: string
}

/**
 * Entry points into the operational pads, from the module the document belongs
 * to (§31).
 *
 * These are LINKS, not a second implementation. The Goods Receipt Note reachable
 * from Inventory and the one reachable from /forms/operations are the same
 * component posting through the same ledger — the same canonical document with
 * several context-appropriate doors, which is what §31 asks for.
 *
 * `brand` is passed through so the document opens already bound to the entity
 * the user was looking at, which is §30's second option ("receive the brand
 * context from the module the user came from") and avoids asking again.
 */
export function OperationalDocLinks({
  title = 'Documents',
  hint,
  docs,
  brand,
}: {
  title?: string
  hint?: string
  docs: DocLink[]
  /** Brand slug or id from the surrounding module. Omitted → the pad will ask. */
  brand?: string
}) {
  if (docs.length === 0) return null
  const suffix = brand ? `&brand=${encodeURIComponent(brand)}` : ''

  return (
    <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-1 flex items-center gap-2">
        <FileSpreadsheet size={15} className="text-gray-400" />
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ocg-gold">{title}</h2>
      </div>
      {hint && <p className="mb-3 text-xs text-gray-400">{hint}</p>}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {docs.map((d) => (
          <Link
            key={d.pad}
            href={`/forms/operations?pad=${d.pad}${suffix}`}
            className="flex items-start justify-between gap-2 rounded-lg border border-gray-100 p-3 transition-colors hover:border-ocg-gold/40"
          >
            <span className="min-w-0">
              <span className="block text-sm font-medium text-gray-800">{d.label}</span>
              <span className="mt-0.5 block text-xs text-gray-400">{d.hint}</span>
            </span>
            <ArrowUpRight size={14} className="mt-0.5 shrink-0 text-gray-300" />
          </Link>
        ))}
      </div>
    </section>
  )
}
