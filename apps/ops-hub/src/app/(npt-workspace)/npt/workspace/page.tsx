import { NptWorkspace } from '@/components/npt/NptWorkspace'
import { getNptServiceData, safeRows } from '@/lib/management'
import { requireSection } from '@/lib/server-auth'
import type {
  NptAppointmentRow,
  NptContactRow,
  NptPianoMeasurementRow,
  NptTimelineEventRow,
} from '@ocg/db'

export const dynamic = 'force-dynamic'

export default async function NptWorkspacePage() {
  await requireSection('npt_service')
  const [base, contacts, appointments, measurements, events] = await Promise.all([
    getNptServiceData(),
    safeRows<NptContactRow>('npt_contacts', { limit: 500, order: 'created_at' }),
    safeRows<NptAppointmentRow>('npt_appointments', { limit: 500, order: 'start_at', ascending: false }),
    safeRows<NptPianoMeasurementRow>('npt_piano_measurements', { limit: 500, order: 'measured_at', ascending: false }),
    safeRows<NptTimelineEventRow>('npt_timeline_events', { limit: 500, order: 'occurred_at', ascending: false }),
  ])

  return (
    <NptWorkspace
      data={{
        ...base,
        contacts,
        appointments,
        measurements,
        events,
      }}
    />
  )
}
