import { NextResponse, type NextRequest } from 'next/server'
import type { AccessLevel, SectionKey } from '@ocg/db'
import { getApiActor } from '@/lib/api-auth'
import type { Actor } from '@/lib/server-auth'

/**
 * Authorization for the Marketing Hub (`/mhub`) API surface.
 *
 * Every mhub route used to be authenticate-only (`requireUser`), which — because
 * the data layer runs with the service role and bypasses RLS — let ANY signed-in
 * portal user read and write every brand's marketing content, calendar, CRM,
 * campaigns, catalogues, and properties. These helpers restore the same
 * section + per-brand model the ops modules already use.
 *
 * The mhub client reads a bare `{ error }` body (not the ops `{ ok, error }`
 * shape), so these gates mirror that.
 */

export interface MarketingScope {
  actor: Actor
  /** Brand UUIDs the caller may touch in marketing, or null = all brands. */
  brandIds: string[] | null
}

/** Gate an mhub route on a section permission. Returns the Actor, or a
 *  ready-to-return 401/403 NextResponse. */
export async function requireMhubSection(
  req: NextRequest,
  section: SectionKey,
  level: AccessLevel = 'view',
): Promise<Actor | NextResponse> {
  const actor = await getApiActor(req)
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!actor.can(section, level)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return actor
}

/** Gate a marketing route AND resolve the caller's brand compartment.
 *  `brandIds === null` = the user may see every brand (founding admin or a
 *  `marketing` grant with no brand restriction). */
export async function requireMarketing(
  req: NextRequest,
  level: AccessLevel = 'view',
): Promise<MarketingScope | NextResponse> {
  const gate = await requireMhubSection(req, 'marketing', level)
  if (gate instanceof NextResponse) return gate
  return { actor: gate, brandIds: gate.allowedBrandIds('marketing') }
}

/**
 * The effective brand filter for a LIST query, given an optional caller-supplied
 * brand and the caller's compartment (null = unrestricted).
 *   - unrestricted: honour the requested brand if any, otherwise no filter.
 *   - restricted:   a requested brand must be inside the compartment; with no
 *                   request, fall back to the whole compartment.
 * `empty: true` means the caller asked for a brand outside their compartment —
 * the route should return no rows rather than leaking another brand's data.
 */
export function effectiveBrandIds(
  requested: string | null | undefined,
  allowed: string[] | null,
): { brandIds?: string[]; empty?: boolean } {
  if (allowed === null) return { brandIds: requested ? [requested] : undefined }
  if (requested) return allowed.includes(requested) ? { brandIds: [requested] } : { empty: true }
  return { brandIds: allowed }
}

/** Whether the caller may act on a specific brand's record (create/update). */
export function brandInScope(
  brandId: string | null | undefined,
  allowed: string[] | null,
): boolean {
  if (allowed === null) return true
  return !!brandId && allowed.includes(brandId)
}
