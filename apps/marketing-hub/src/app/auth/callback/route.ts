import { NextResponse } from 'next/server'
import { createServerClient } from '@ocg/db/client'

/**
 * Supabase redirects invite / magic-link / password-reset emails here.
 * URL shape: /auth/callback?token_hash=XXX&type=invite|recovery|...
 *
 * We exchange the token for a session then redirect:
 *  - invite / recovery  → /auth/set-password  (user must set a password)
 *  - anything else      → /  (dashboard)
 */
export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as string | null

  if (!token_hash || !type) {
    return NextResponse.redirect(`${origin}/login?error=missing_token`)
  }

  const supabase = createServerClient()

  const { error } = await supabase.auth.verifyOtp({
    token_hash,
    type: type as Parameters<typeof supabase.auth.verifyOtp>[0]['type'],
  })

  if (error) {
    console.error('[auth/callback] verifyOtp error:', error.message)
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`
    )
  }

  // Invite and password-reset flows both need the user to set a password
  if (type === 'invite' || type === 'recovery') {
    return NextResponse.redirect(`${origin}/auth/set-password`)
  }

  return NextResponse.redirect(`${origin}/`)
}
