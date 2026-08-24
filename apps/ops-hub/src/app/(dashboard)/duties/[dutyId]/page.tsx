import { redirect } from 'next/navigation'

/**
 * The calendar links a duty chip to /duties/<id>?date=<date>. That route never
 * had a page — the link 404'd. Rather than leave a dead link behind the move to
 * My Work (§11), it now resolves to the duty's day in My Work, which is where
 * that occurrence is actually completed.
 */
export default async function DutyOccurrenceRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ dutyId: string }>
  searchParams: Promise<{ date?: string }>
}) {
  await params
  const { date } = await searchParams
  redirect(date ? `/my-work?tab=duties&date=${encodeURIComponent(date)}` : '/my-work?tab=duties')
}
