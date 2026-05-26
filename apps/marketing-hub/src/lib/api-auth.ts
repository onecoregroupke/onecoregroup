import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@ocg/db'

export interface AuthedUser {
  id: string
  email: string | null
}

/**
 * Validates the Bearer token on an API request against Supabase Auth using the
 * anon client (same pattern as /api/properties). Returns the user, or null if
 * the request is unauthenticated. Permission-level checks remain the caller's
 * responsibility via the client-side `can()` gate plus RLS.
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
