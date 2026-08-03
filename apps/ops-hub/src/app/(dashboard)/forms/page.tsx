import { FormsWorkspace } from '@/components/forms/FormsWorkspace'
import { requireSection } from '@/lib/server-auth'

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
  return <FormsWorkspace initialBrandSlug={sp.brand ?? ''} />
}
