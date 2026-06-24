import { listBrands } from '@/lib/brands'
import { UsersAdmin } from '@/components/team/UsersAdmin'

export const dynamic = 'force-dynamic'

export default async function PortalUsersPage() {
  const brands = await listBrands()
  return <UsersAdmin brands={brands.map((b) => ({ id: b.id, label: b.short_name || b.name }))} />
}
