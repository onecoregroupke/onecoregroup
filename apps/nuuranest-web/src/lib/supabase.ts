import { createBrowserClient } from '@ocg/db'

let client: ReturnType<typeof createBrowserClient> | null = null

export function getSupabaseBrowser() {
  if (!client) client = createBrowserClient()
  return client
}
