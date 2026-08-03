import { DashboardShell } from '@/components/layout/DashboardShell'
import { ImpersonationBanner } from '@/components/layout/ImpersonationBanner'
import { requireActor } from '@/lib/server-auth'

export const dynamic = 'force-dynamic'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor()
  return (
    <DashboardShell
      permissions={actor.permissions}
      email={actor.email}
      displayName={actor.name}
    >
      {actor.impersonatedBy && <ImpersonationBanner name={actor.name} />}
      {children}
    </DashboardShell>
  )
}
