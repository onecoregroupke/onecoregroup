import Link from 'next/link'
import { FileSpreadsheet, ArrowUpRight } from 'lucide-react'
import { FormsWorkspace } from '@/components/forms/FormsWorkspace'
import { requireSection } from '@/lib/server-auth'
import { getActor } from '@/lib/server-auth'

export const dynamic = 'force-dynamic'

// Custom forms / report books. Access is gated on the `forms` grant (brand-scoped):
// staff granted forms fill their registers; forms-edit users build the forms.
// Founding admins and managers (explicit `management`) pass via fallback.
export default async function FormsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  await requireSection('forms')
  const sp = await searchParams
  const actor = await getActor()

  // The operational pads (GRN, GIN, GTN, requisition, invoice, delivery note)
  // are a separate surface: they post to the stock ledger, so they sit behind
  // the permission for the ledger they touch rather than behind `forms`.
  const canOperational =
    !!actor && (actor.can('procurement', 'edit') || actor.can('inventory', 'edit') || actor.can('finance', 'edit'))

  return (
    <div className="space-y-5">
      {canOperational && (
        <Link
          href="/forms/operations"
          className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-white p-5 shadow-sm transition-colors hover:border-ocg-gold/40"
        >
          <span className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ocg-navy/5">
              <FileSpreadsheet size={17} className="text-ocg-navy" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-gray-900">Operational forms</span>
              <span className="mt-0.5 block text-sm text-gray-500">
                Goods Received Note · Issue Note · Transfer Note · Material Requisition · Invoice ·
                Delivery Note. Same fields as the paper pads, and posting one updates the stock card
                immediately.
              </span>
            </span>
          </span>
          <ArrowUpRight size={16} className="shrink-0 text-gray-300" />
        </Link>
      )}

      <FormsWorkspace initialBrandSlug={sp.brand ?? ''} />
    </div>
  )
}
