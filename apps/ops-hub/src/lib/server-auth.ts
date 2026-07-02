import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import type { Database, PermissionsMap, BrandAccessMap, SectionKey, AccessLevel } from '@ocg/db'
import { db } from './serverClient'
import { listTeam } from './team'
import { can as canFn, canSeeAllTasks, allowedBrands } from './permissions'

/**
 * The authenticated caller, resolved from a verified Supabase session, enriched
 * with their permissions + team-member name. This is the single source of truth
 * for server-side authorization (pages, layouts, API routes).
 *
 * `permissions === null` means the founding admin (no user_permissions row) —
 * full access. `name` is the team-member display name used to scope task lists.
 */
export interface Actor {
  userId: string
  email: string | null
  /** Team-member display name used to scope "assigned_to" task queries. */
  name: string
  /** null = founding admin (full access). */
  permissions: PermissionsMap | null
  /** Per-section brand restriction. null = founding admin (unrestricted). */
  brandAccess: BrandAccessMap | null
  isActive: boolean
  /** May see EVERY team member's tasks (founding admin or `all_tasks` grant). */
  isSuperAdmin: boolean
  can: (section: SectionKey, level?: AccessLevel) => boolean
  /**
   * Brand UUIDs this user may touch within a brand-scoped section (finance /
   * inventory / procurement), or null for all brands. Callers MUST apply this
   * to every read AND write in those modules.
   */
  allowedBrandIds: (section: SectionKey) => string[] | null
}

/**
 * Build an Actor from a verified user. Loads the user_permissions row with the
 * service role and resolves the team-member name by email (same match as
 * /api/my-tasks). Used by both cookie-based (server-auth) and Bearer-based
 * (api-auth) entry points so both share one authorization model.
 */
export async function loadActor(user: { id: string; email: string | null }): Promise<Actor> {
  const supabase = db()
  // user_permissions isn't in the generated schema map; cast narrowly.
  // select('*') tolerates schema drift (e.g. brand_access before migration 035).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: row, error } = (await (supabase as any)
    .from('user_permissions')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()) as {
    data: {
      permissions: PermissionsMap
      brand_access?: BrandAccessMap | null
      display_name: string | null
      is_active: boolean
    } | null
    error: { message: string } | null
  }

  // A FAILED lookup must never fall through to "no row = founding admin" —
  // that would escalate any user to full access on a transient DB error.
  if (error) throw new Error(`Could not load permissions: ${error.message}`)

  // No row → founding admin (permissions stays null = full access).
  const permissions: PermissionsMap | null = row ? (row.permissions ?? {}) : null
  const brandAccess: BrandAccessMap | null = row ? (row.brand_access ?? {}) : null

  // Resolve the assignee name for task scoping (email match, then fallbacks).
  // Final fallback is the user id (never empty, never matches an assigned_to)
  // so a user with no resolvable name is scoped to ZERO tasks — never to all
  // (an empty assignee filter would otherwise be treated as "no filter").
  const team = await listTeam()
  const me = team.find(
    (m) => m.email && user.email && m.email.toLowerCase() === user.email.toLowerCase(),
  )
  const name = me?.name || row?.display_name || user.email?.split('@')[0] || user.id

  return {
    userId: user.id,
    email: user.email,
    name,
    permissions,
    brandAccess,
    isActive: row ? row.is_active !== false : true,
    isSuperAdmin: canSeeAllTasks(permissions),
    can: (section, level = 'view') => canFn(permissions, section, level),
    allowedBrandIds: (section) => allowedBrands(brandAccess, section),
  }
}

/** Supabase client bound to the request cookies — for reading the session in
 *  server components / route handlers. Identity only; data uses the service role. */
export async function getSsrClient() {
  const cookieStore = await cookies()
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL']
  const anon = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']
  if (!url || !anon) throw new Error('Missing Supabase env vars')
  return createServerClient<Database>(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Called from a Server Component (cookies are read-only there) —
          // safe to ignore; the middleware refreshes the session cookies.
        }
      },
    },
  })
}

/** The verified actor for the current request, or null if not signed in.
 *  Revoked users (is_active = false) are treated as signed out — the revoke
 *  takes effect server-side immediately, not just at next client load. */
export async function getActor(): Promise<Actor | null> {
  const supabase = await getSsrClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return null
  const actor = await loadActor({ id: data.user.id, email: data.user.email ?? null })
  return actor.isActive ? actor : null
}

/** Require a signed-in actor; redirect to /login otherwise. */
export async function requireActor(): Promise<Actor> {
  const actor = await getActor()
  if (!actor) redirect('/login')
  return actor
}

/** Require a signed-in actor with the given section permission; otherwise send
 *  them to /my-tasks (always available to any signed-in user). */
export async function requireSection(
  section: SectionKey,
  level: AccessLevel = 'view',
): Promise<Actor> {
  const actor = await requireActor()
  if (!actor.can(section, level)) redirect('/my-tasks')
  return actor
}
