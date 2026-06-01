import { db, mintId, nowIso } from './serverClient'
import type { OpsClientRow } from '@ocg/db'

export async function listClients(): Promise<OpsClientRow[]> {
  const { data } = await db()
    .from('ops_clients')
    .select('*')
    .order('client_name', { ascending: true })
  return (data as OpsClientRow[] | null) ?? []
}

export async function getClient(clientId: string): Promise<OpsClientRow | null> {
  const { data } = await db().from('ops_clients').select('*').eq('client_id', clientId).maybeSingle()
  return (data as OpsClientRow | null) ?? null
}

export interface CreateClientInput {
  client_name: string
  industry?: string
  country_city?: string
  relationship_status?: string
}

/** Create a client with a freshly minted CLIENT-XXX id. Idempotent on name:
 *  if an active client with the same name exists, returns it instead. */
export async function createClient(input: CreateClientInput): Promise<{
  client: OpsClientRow
  reused: boolean
}> {
  const supabase = db()
  const name = input.client_name.trim()

  const { data: existing } = await supabase
    .from('ops_clients')
    .select('*')
    .ilike('client_name', name)
    .maybeSingle()
  if (existing) return { client: existing as OpsClientRow, reused: true }

  const clientId = await mintId('client')
  const row = {
    client_id: clientId,
    client_name: name,
    industry: input.industry ?? '',
    country_city: input.country_city ?? '',
    relationship_status: input.relationship_status ?? 'Active Client',
    folder_status: 'pending',
    updated_at: nowIso(),
  }
  const { data, error } = await supabase.from('ops_clients').insert(row).select('*').single()
  if (error) throw new Error(`createClient failed: ${error.message}`)
  return { client: data as OpsClientRow, reused: false }
}
