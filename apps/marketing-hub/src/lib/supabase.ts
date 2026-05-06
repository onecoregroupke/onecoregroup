import { createBrowserClient as createClient } from '@ocg/db'

let _client: ReturnType<typeof createClient> | null = null

export function getClient() {
  if (!_client) _client = createClient()
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
