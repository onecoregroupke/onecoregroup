import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@ocg/db'

export interface AuthedUser {
  id: string
  email: string | null
}

/**
 * Validate a Supabase Bearer token on an API request (same pattern as the
 * marketing-hub). Returns the user or null. Permission-level checks remain the
 * caller's responsibility (client-side `can()` gate + RLS).
 */
export async function requireUser(req: NextRequest): Promise<AuthedUser | null> {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL']
  const anon = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']
  if (!token || !url || !anon) return null

  const supabase = createClient<Database>(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) return null
  return { id: data.user.id, email: data.user.email ?? null }
}

/**
 * Gate the agent callback API (`/api/agent/*`). Any agent (the oc-ops CLI,
 * Cowork, a worker) authenticates with the shared OPS_AGENT_API_KEY via either
 * `x-ops-agent-key` or `Authorization: Bearer <key>`. Constant-time compare.
 */
export function verifyAgentKey(req: NextRequest): boolean {
  const expected = process.env['OPS_AGENT_API_KEY']
  if (!expected) return false
  const provided =
    req.headers.get('x-ops-agent-key') ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    ''
  if (provided.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return diff === 0
}

/** Allow a request from either a signed-in user OR the agent key. Used by
 *  /api/agent/run, which the UI calls (Bearer session) and the CLI may call
 *  (agent key). Returns an actor label for audit, or null if neither passes. */
export async function allowAgentOrUser(req: NextRequest): Promise<string | null> {
  if (verifyAgentKey(req)) return 'agent'
  const user = await requireUser(req)
  return user ? (user.email ?? user.id) : null
}
