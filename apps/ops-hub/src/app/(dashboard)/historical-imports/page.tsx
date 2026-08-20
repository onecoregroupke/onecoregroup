import { requireSection } from '@/lib/server-auth'
import { listBrands } from '@/lib/brands'
import { listHistoricalImports } from '@/lib/historicalImports'
import { HistoricalImportsWorkspace } from '@/components/imports/HistoricalImportsWorkspace'

export const dynamic = 'force-dynamic'

export default async function HistoricalImportsPage() {
  const actor = await requireSection('historical_imports', 'view')
  const allowed = actor.allowedBrandIds('historical_imports')
  const [dashboard, allBrands] = await Promise.all([listHistoricalImports(allowed), listBrands()])
  const brands = allowed === null ? allBrands : allBrands.filter((brand) => allowed.includes(brand.id))
  return <HistoricalImportsWorkspace {...dashboard} brands={brands.map((brand) => ({ id: brand.id, name: brand.short_name || brand.name }))} canEdit={actor.can('historical_imports', 'edit') && ['management', 'group'].includes(actor.recordScope('historical_imports'))} />
}

