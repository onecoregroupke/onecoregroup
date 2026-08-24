import { redirect } from 'next/navigation'

/**
 * §11: the employee duty surface now lives inside My Work. Preserved as a
 * redirect so existing links — the calendar's duty chips, older briefs, saved
 * bookmarks — keep resolving instead of 404ing.
 *
 * `?date=` is carried through: a link to a specific day must still open that day.
 */
export default async function MyDutiesRedirect({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const { date } = await searchParams
  redirect(date ? `/my-work?tab=duties&date=${encodeURIComponent(date)}` : '/my-work?tab=duties')
}
