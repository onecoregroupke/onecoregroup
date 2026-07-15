import { createServerClient } from '@ocg/db/client'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

// GET /api/mhub/npt/catalogue — public, no auth required
// Consumed by the NPT piano-sales app (server-side fetch)
export async function GET() {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('piano_catalogue')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (error) {
    return Response.json({ error: error.message }, { status: 500, headers: CORS })
  }

  return Response.json({ pianos: data }, { headers: CORS })
}
