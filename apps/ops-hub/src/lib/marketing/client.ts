'use client'

// Authed fetch wrapper for the marketing pages. Mirrors the inline `request`
// helper in the Properties page: attaches the Supabase session bearer token
// and unwraps JSON, throwing on non-2xx.

import { getClient } from '@/lib/supabase'

export async function apiFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const supabase = getClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('Your session has expired. Please sign in again.')

  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      ...init?.headers,
    },
  })
  const json = (await response.json().catch(() => ({}))) as T & { error?: string }
  if (!response.ok) throw new Error(json.error ?? 'Request failed')
  return json
}
