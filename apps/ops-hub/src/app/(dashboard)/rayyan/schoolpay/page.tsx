import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

// SchoolPay is NOT an integrated source — validated Excel import is the canonical
// source for student fees. This standalone SchoolPay reconciliation page is
// retired; school fees now live inside the brand finance workspace (§12, §15).
// Historical SchoolPay snapshot data is preserved in the database untouched.
export default function RayyanSchoolpayRetired() {
  redirect('/finance/ar-rayyan-playhouse')
}
