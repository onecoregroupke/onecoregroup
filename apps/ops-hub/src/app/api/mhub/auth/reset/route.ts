import { createServerClient } from '@ocg/db/client'
import { buildCallbackUrl, sendRecoveryEmail } from '@/lib/auth-emails'

// ── POST /api/mhub/auth/reset — send a password-reset link ────────────────────────
// Public (unauthenticated): used by the "Forgot password?" flow. Always returns
// success regardless of whether the email exists, to avoid account enumeration.
export async function POST(req: Request) {
  let email = ''
  try {
    const body = (await req.json()) as { email?: string }
    email = body.email?.trim().toLowerCase() ?? ''
  } catch {
    return Response.json({ error: 'Invalid request.' }, { status: 400 })
  }

  if (!email || !email.includes('@')) {
    return Response.json({ error: 'A valid email is required.' }, { status: 400 })
  }

  const supabase = createServerClient()

  try {
    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email,
    })
    // generateLink errors if the user doesn't exist — swallow it so we don't
    // reveal which addresses have accounts.
    if (!error && data?.properties?.hashed_token) {
      await sendRecoveryEmail({
        email,
        link: buildCallbackUrl(data.properties.hashed_token, 'recovery'),
      })
    }
  } catch (err) {
    // Log server-side, but never surface details to the caller.
    console.error('Password reset error (non-fatal to response):', err)
  }

  // Constant response either way.
  return Response.json({ ok: true })
}
