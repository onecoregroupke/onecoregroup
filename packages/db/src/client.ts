import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from './types'

export function createBrowserClient() {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL']
  const anon = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']
  if (!url || !anon) throw new Error('Missing Supabase env vars')
  return createSupabaseClient<Database>(url, anon)
}

export function createServerClient() {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL']
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY']
  if (!url || !key) throw new Error('Missing Supabase service role env vars')
  return createSupabaseClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
