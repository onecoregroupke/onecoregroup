import { redirect } from 'next/navigation'

/**
 * §11: My Tasks and My Duties are no longer competing top-level employee
 * concepts — My Work is the canonical destination.
 *
 * The route is PRESERVED rather than removed: assignment emails, morning briefs
 * and browser bookmarks already point here, and 404ing them to tidy the
 * navigation would break links that are out in the world. It lands on the
 * Assigned Tasks tab, which is what someone following an old link wanted.
 */
export default function MyTasksRedirect() {
  redirect('/my-work?tab=tasks')
}
