import { getDarulAdminData } from '@/lib/management'
import { DarulActionPanel } from './DarulActionPanel'

/** Server component: loads Darul reference data and renders the quick-add panel.
 *  Dropped at the top of every Darul sub-page so admin actions are always at hand. */
export async function DarulQuickAdd() {
  const { students, guardians, classes, invoices, team } = await getDarulAdminData()
  return (
    <DarulActionPanel
      guardians={guardians.map((g) => ({ id: g.id, label: g.full_name }))}
      students={students.map((s) => ({ id: s.id, label: s.full_name }))}
      classes={classes.map((c) => ({ id: c.id, label: c.name }))}
      invoices={invoices.map((i) => ({
        id: i.id,
        label: `${students.find((s) => s.id === i.student_id)?.full_name ?? 'Student'} — ${i.fee_item} (bal KSh ${Number(i.balance_ksh ?? 0).toLocaleString()})`,
      }))}
      team={team.map((m) => ({ id: m.id, label: m.name }))}
    />
  )
}
