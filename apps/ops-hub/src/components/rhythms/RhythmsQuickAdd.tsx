import { getRhythmsAdminData } from '@/lib/management'
import { RhythmsActionPanel } from './RhythmsActionPanel'

/** Server component: loads Rhythms reference data and renders the quick-add panel. */
export async function RhythmsQuickAdd() {
  const { students, guardians, classes, team } = await getRhythmsAdminData()
  return (
    <RhythmsActionPanel
      guardians={guardians.map((g) => ({ id: g.id, label: g.full_name }))}
      students={students.map((s) => ({ id: s.id, label: s.full_name }))}
      classes={classes.map((c) => ({ id: c.id, label: c.name }))}
      team={team.map((m) => ({ id: m.id, label: m.name }))}
    />
  )
}
