import { requireSection } from '@/lib/server-auth'

// Server-side gate for every /inventory page. `inventory` is an explicit
// grant (no inheritance) and can be compartmentalized per brand.
export default async function InventoryLayout({ children }: { children: React.ReactNode }) {
  await requireSection('inventory')
  return <>{children}</>
}
