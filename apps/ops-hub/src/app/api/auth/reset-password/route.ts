import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@ocg/db/client'
import { buildCallbackUrl, sendRecoveryEmail } from '@/lib/auth-emails'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const email = String(body?.email ?? '').trim().toLowerCase()
    if (!email) return NextResponse.json({ ok: false, error: 'Email is required.' }, { status: 400 })
    const supabase = createServerClient()
    const { data, error } = await supabase.auth.admin.generateLink({ type: 'recovery', email })
    if (error || !data?.properties) throw new Error(error?.message ?? 'Could not generate reset link.')
    await sendRecoveryEmail({ email, link: buildCallbackUrl(data.properties.hashed_token, 'recovery') })
    return NextResponse.json({ ok: true })
  } catch {
    // Do not reveal whether an email exists.
    return NextResponse.json({ ok: true })
  }
}
