import { createServerClient } from '@ocg/db'

/**
 * Service-role Supabase client for server code (API routes, server components).
 * Bypasses RLS — never import this into client components.
 */
export function db() {
  return createServerClient()
}

/**
 * Mint the next human-readable ID for a sequence ('task' | 'project' | 'client')
 * using the atomic `ops_next_sequence_val` SQL function, then format it.
 *   task    → TASK-0001
 *   project → PROJ-001
 *   client  → CLIENT-001
 */
export async function mintId(kind: 'task' | 'project' | 'client'): Promise<string> {
  const supabase = db()
  // rpc isn't in the generated Functions map; cast narrowly.
  const { data, error } = await (supabase.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: number | null; error: { message: string } | null }>)(
    'ops_next_sequence_val',
    { seq_name: kind },
  )
  if (error || data == null) {
    throw new Error(`Failed to mint ${kind} id: ${error?.message ?? 'no value returned'}`)
  }
  const n = Number(data)
  if (kind === 'task') return `TASK-${String(n).padStart(4, '0')}`
  if (kind === 'project') return `PROJ-${String(n).padStart(3, '0')}`
  return `CLIENT-${String(n).padStart(3, '0')}`
}

/**
 * Mint a document reference for any operational form (GRN, GIN, GTN,
 * requisition, intake, movement…) using the atomic `ocg_next_reference` SQL
 * function. Unlike `mintId` the sequence self-registers on first use, so a new
 * document type needs no migration to start numbering.
 *
 *   mintReference('grn', 'GRN-')        → GRN-0001
 *   mintReference('npt_intake', 'INT-') → INT-0001
 *
 * Sequence names are shared group-wide; pass a brand-qualified name
 * (`grn:glitz-n-glim`) when a brand needs its own run of numbers.
 */
export async function mintReference(seqName: string, prefix = '', width = 4): Promise<string> {
  const supabase = db()
  const { data, error } = await (supabase.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: string | null; error: { message: string } | null }>)(
    'ocg_next_reference',
    { seq_name: seqName, prefix, width },
  )
  if (error || !data) {
    throw new Error(`Failed to mint reference for "${seqName}": ${error?.message ?? 'no value returned'}`)
  }
  return data
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function todayInEat(): string {
  const eat = new Date(Date.now() + 3 * 60 * 60 * 1000)
  return eat.toISOString().slice(0, 10)
}
