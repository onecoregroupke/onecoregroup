import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@ocg/db'

let _client: ReturnType<typeof createBrowserClient<Database>> | null = null

/**
 * Browser Supabase client backed by COOKIE storage (via @supabase/ssr) so the
 * session is visible to the server (middleware + server components + API routes
 * read it via `lib/server-auth.ts`). This is what makes server-side
 * authorization possible — localStorage sessions are invisible to the server.
 *
 * PKCE + detectSessionInUrl:false are preserved from the previous @ocg/db
 * client: the invite/recovery flow (`app/auth/callback`) uses the explicit
 * verifyOtp({ token_hash }) flow and must not auto-consume a URL hash.
 */
export function getClient() {
  if (!_client) {
    const url = process.env['NEXT_PUBLIC_SUPABASE_URL']
    const anon = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']
    if (!url || !anon) throw new Error('Missing Supabase env vars')
    _client = createBrowserClient<Database>(url, anon, {
      auth: {
        flowType: 'pkce',
        detectSessionInUrl: false,
        autoRefreshToken: true,
      },
    })
  }
  return _client
}

export async function getSession() {
  const supabase = getClient()
  const { data } = await supabase.auth.getSession()
  return data.session
}

export async function signIn(email: string, password: string) {
  const supabase = getClient()
  return supabase.auth.signInWithPassword({ email, password })
}

export async function signOut() {
  const supabase = getClient()
  return supabase.auth.signOut()
}
