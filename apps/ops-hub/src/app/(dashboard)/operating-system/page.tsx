import Link from 'next/link'
import { BookMarked, ArrowUpRight, Download, Building2, Landmark } from 'lucide-react'
import { requireSection } from '@/lib/server-auth'
import { listManuals, visibleManuals, manualStatusLabel, resolveManualContent } from '@/lib/operatingSystem/service'
import { wordCount } from '@/lib/operatingSystem/model'

export const dynamic = 'force-dynamic'

/**
 * THE OPERATING SYSTEM (§4).
 *
 * The company's actual operating manuals — one for the group, one per entity.
 * Deliberately not a grid of small Knowledge cards: these are major management
 * documents and the landing page should read like a shelf, not a feed.
 */
export default async function OperatingSystemPage() {
  const actor = await requireSection('knowledge', 'view')
  const all = await listManuals()
  const manuals = visibleManuals(all, actor.allowedBrandIds('knowledge'))

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ocg-gold">Company</p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-gray-900">
          <BookMarked size={22} className="text-gray-400" /> Operating System
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-gray-500">
          How One Core Group and each entity actually operate — functions, responsibilities, recurring
          routines, controls, records, escalation and management review, in one connected manual per
          entity. Individual policies and SOPs live in{' '}
          <Link href="/knowledge" className="font-medium text-ocg-gold hover:underline">Knowledge</Link>;
          these manuals explain how it all fits together.
        </p>
      </div>

      {manuals.length === 0 ? (
        <p className="rounded-xl border border-gray-100 bg-white p-6 text-sm text-gray-500 shadow-sm">
          No operating manuals are available in your scope.
        </p>
      ) : (
        <div className="space-y-3">
          {manuals.map((manual) => {
            const doc = resolveManualContent(manual.version)
            const chapters = doc?.chapters.length ?? 0
            const words = doc ? wordCount(doc) : 0
            const isGroup = manual.scopeType === 'group'
            return (
              <article
                key={manual.id}
                className={`rounded-xl border bg-white p-5 shadow-sm transition-colors hover:border-ocg-gold/40 ${
                  isGroup ? 'border-ocg-navy/20' : 'border-gray-100'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                        isGroup ? 'bg-ocg-navy/10' : 'bg-gray-100'
                      }`}>
                        {isGroup
                          ? <Landmark size={17} className="text-ocg-navy" />
                          : <Building2 size={17} className="text-gray-500" />}
                      </span>
                      <div className="min-w-0">
                        <h2 className="truncate text-base font-semibold text-gray-900">{manual.title}</h2>
                        <p className="text-xs text-gray-400">{manual.brandName}</p>
                      </div>
                    </div>

                    <p className="mt-3 max-w-3xl text-sm leading-relaxed text-gray-600">{manual.summary}</p>

                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
                      {manual.version && (
                        <>
                          <span className="font-medium text-gray-500">v{manual.version.version_no}</span>
                          <StatusChip status={manual.version.status} />
                          <span>· {chapters} chapters</span>
                          <span>· ~{words.toLocaleString()} words</span>
                          <span>
                            · updated {new Date(manual.version.created_at).toLocaleDateString('en-KE', {
                              day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Nairobi',
                            })}
                          </span>
                        </>
                      )}
                      {!manual.version && <span>No version generated yet</span>}
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col gap-2">
                    <Link
                      href={`/operating-system/${manual.slug}`}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                    >
                      Open <ArrowUpRight size={14} />
                    </Link>
                    <a
                      href={`/api/operating-system/${manual.slug}/pdf`}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:border-ocg-gold/40 hover:text-ocg-gold"
                    >
                      <Download size={14} /> PDF
                    </a>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      <p className="rounded-xl border border-amber-100 bg-amber-50 p-4 text-xs leading-relaxed text-amber-900">
        <strong>These are working drafts.</strong> They are compiled from the current operating
        architecture, management-provided operational records, employee routine records, existing
        company Knowledge, and legacy entity manuals where applicable. They are accurate enough to
        work from, but some procedures remain subject to management confirmation as the structured
        employee and historical data are progressively loaded. Where a legacy specific has not been
        confirmed, the manual says so rather than presenting it as current policy.
      </p>
    </div>
  )
}

function StatusChip({ status }: { status: string }) {
  const tone = status === 'current'
    ? 'bg-emerald-50 text-emerald-700'
    : status === 'working_draft'
      ? 'bg-amber-50 text-amber-700'
      : 'bg-gray-100 text-gray-500'
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone}`}>
      {manualStatusLabel(status)}
    </span>
  )
}
