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
      <FormsWorkspace initialBrandSlug={sp.brand ?? ''} />

      {/* §31: the transaction documents live in the modules whose ledgers they
          post to — Inventory, Manufacturing, Procurement. This stays as a quiet
          footnote rather than a headline card, so the pads stop reading like
          another custom forms library, while the route keeps working for the
          links and components that already use it. */}
      {canOperational && (
        <p className="flex flex-wrap items-center gap-1.5 rounded-xl border border-gray-100 bg-white px-4 py-3 text-xs text-gray-500 shadow-sm">
          <FileSpreadsheet size={13} className="shrink-0 text-gray-400" />
          <span>
            Stock and purchasing documents (Goods Received · Issue · Transfer · Material Requisition ·
            Invoice · Delivery Note) are raised from{' '}
            <Link href="/inventory" className="font-medium text-ocg-gold hover:underline">Inventory</Link>,{' '}
            <Link href="/manufacturing" className="font-medium text-ocg-gold hover:underline">Manufacturing</Link>{' '}
            and{' '}
            <Link href="/procurement" className="font-medium text-ocg-gold hover:underline">Procurement</Link>, or{' '}
            <Link href="/forms/operations" className="font-medium text-ocg-gold hover:underline">
              directly here <ArrowUpRight size={11} className="inline" />
            </Link>.
          </span>
        </p>
      )}
    </div>
  )
}
