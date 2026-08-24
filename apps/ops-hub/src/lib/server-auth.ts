import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import type {
  Database, PermissionsMap, BrandAccessMap, SectionKey, AccessLevel,
  RecordAccessMap, RecordAccessLevel,
} from '@ocg/db'
import { db } from './serverClient'
import { listTeam } from './team'
import {
  can as canFn, canSeeAllTasks, allowedBrands, taskScope, recordAccessLevel,
  type TaskScope,
} from './permissions'

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
  /** Per-section row horizon. null = founding admin (`group`). */
  recordAccess: RecordAccessMap | null
  isActive: boolean
  /** May see EVERY team member's tasks (founding admin or `all_tasks` grant). */
  isSuperAdmin: boolean
  /**
   * Task visibility: 'all' (group super admin), 'brands' (BRAND MANAGER —
   * all tasks but only within their brands), or 'own' (own assigned tasks).
   * Task list/dashboard/report queries MUST apply this scope.
   */
  taskScope: TaskScope
  can: (section: SectionKey, level?: AccessLevel) => boolean
  /**
   * Brand UUIDs this user may touch within a brand-scoped section (finance /
   * inventory / procurement), or null for all brands. Callers MUST apply this
   * to every read AND write in those modules.
   */
  allowedBrandIds: (section: SectionKey) => string[] | null
  recordScope: (section: SectionKey) => RecordAccessLevel
  /** Set to the founding admin's email when this actor is being viewed via
   *  impersonation ("enter portal"); null otherwise. */
  impersonatedBy?: string | null
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
      record_access?: RecordAccessMap | null
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
  const recordAccess: RecordAccessMap | null = row ? (row.record_access ?? {}) : null

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
    recordAccess,
    isActive: row ? row.is_active !== false : true,
    isSuperAdmin: canSeeAllTasks(permissions),
    taskScope: taskScope(permissions, brandAccess),
    can: (section, level = 'view') => canFn(permissions, section, level),
    allowedBrandIds: (section) => allowedBrands(brandAccess, section),
    recordScope: (section) => {
      if (recordAccess === null || recordAccess[section]) return recordAccessLevel(recordAccess, section)
      if ((section === 'people' || section === 'knowledge') && canFn(permissions, 'management', 'view')) {
        return 'management'
      }
      return 'own'
    },
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

/** The genuinely signed-in actor, IGNORING impersonation. Revoked users
 *  (is_active = false) are treated as signed out — the revoke takes effect
 *  server-side immediately, not just at next client load. */
export const getRealActor = cache(async function getRealActor(): Promise<Actor | null> {
  const supabase = await getSsrClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return null
  const actor = await loadActor({ id: data.user.id, email: data.user.email ?? null })
  return actor.isActive ? actor : null
})

/** Load an actor by user id (impersonation target). Resolves the email via the
 *  service-role admin API so name + brand scoping resolve correctly. */
export async function loadActorById(userId: string): Promise<Actor | null> {
  let email: string | null = null
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (db() as any).auth.admin.getUserById(userId)
    email = data?.user?.email ?? null
  } catch { /* ignore — fall back to id-only */ }
  return loadActor({ id: userId, email })
}

/** The EFFECTIVE actor for the request. A founding admin may be "viewing as"
 *  another user via the `ocg_impersonate` cookie (set by /api/impersonate). The
 *  real user is re-verified as a founding admin on every request, so a forged
 *  cookie is inert for anyone who is not one. */
export const getActor = cache(async function getActor(): Promise<Actor | null> {
  const real = await getRealActor()
  if (!real) return null
  if (real.permissions === null) {
    const cookieStore = await cookies()
    const targetId = cookieStore.get('ocg_impersonate')?.value
    if (targetId && targetId !== real.userId) {
      const target = await loadActorById(targetId)
      if (target?.isActive) return { ...target, impersonatedBy: real.email ?? real.userId }
    }
  }
  return { ...real, impersonatedBy: null }
})

/** Require a signed-in actor; redirect to /login otherwise. */
export async function requireActor(): Promise<Actor> {
  const actor = await getActor()
  if (!actor) redirect('/login')
  return actor
}

/** Require a signed-in actor with the given section permission; otherwise send
 *  them to /my-work (always available to any signed-in user). */
export async function requireSection(
  section: SectionKey,
  level: AccessLevel = 'view',
): Promise<Actor> {
  const actor = await requireActor()
  if (!actor.can(section, level)) redirect('/my-work')
  return actor
}
