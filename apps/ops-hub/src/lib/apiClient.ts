'use client'

import { getClient } from './supabase'

/** Browser fetch helper that attaches the Supabase access token as a Bearer. */
export async function api<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<{ ok: boolean; status: number; data: T }> {
  const { data } = await getClient().auth.getSession()
  const token = data.session?.access_token
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  })
  let body: T
  try {
    body = (await res.json()) as T
  } catch {
    body = {} as T
  }
  return { ok: res.ok, status: res.status, data: body }
}
