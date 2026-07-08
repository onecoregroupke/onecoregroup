import { FormsWorkspace } from '@/components/forms/FormsWorkspace'

export const dynamic = 'force-dynamic'

// Custom forms / report books. Open to every signed-in user: teachers and
// staff fill their daily registers here; managers build and edit the forms.
export default async function FormsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const sp = await searchParams
  return <FormsWorkspace initialBrandSlug={sp.brand ?? ''} />
}
