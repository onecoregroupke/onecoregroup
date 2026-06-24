import { NptWorkspaceAuthShell } from '@/components/npt/NptWorkspaceAuthShell'

export default function NptWorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <NptWorkspaceAuthShell>{children}</NptWorkspaceAuthShell>
}
