import { listBrands } from '@/lib/brands'
import { listTeam } from '@/lib/team'
import { UsersAdmin } from '@/components/team/UsersAdmin'

export const dynamic = 'force-dynamic'

export default async function PortalUsersPage() {
  const [brands, team] = await Promise.all([listBrands(), listTeam()])
  return (
    <UsersAdmin
      brands={brands.map((b) => ({ id: b.id, label: b.short_name || b.name }))}
      team={team.map((m) => ({ id: m.id, name: m.name, email: m.email ?? '', role: m.role, brand_ids: m.brand_ids }))}
    />
  )
}
