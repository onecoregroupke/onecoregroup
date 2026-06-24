import { Resend } from 'resend'

/**
 * Branded transactional auth emails for the Ops Hub, sent via Resend so the
 * links are fully controlled in code (we build a `/auth/callback?token_hash`
 * URL ourselves) instead of relying on Supabase's default dashboard templates,
 * which default to the implicit flow and auto-log users in without a password.
 * Mirrors the Marketing Hub helper.
 */

const NAVY = '#1a1a2e'
const GOLD = '#b07a00'

/** Resolve the public Ops Hub URL (no trailing slash). */
export function hubUrl(): string {
  const raw = process.env['NEXT_PUBLIC_OPS_URL'] ?? 'http://localhost:3030'
  return raw.replace(/\/+$/, '')
}

/** Build the explicit token_hash callback URL the /auth/callback page expects. */
export function buildCallbackUrl(tokenHash: string, type: 'invite' | 'recovery'): string {
  const params = new URLSearchParams({ token_hash: tokenHash, type })
  return `${hubUrl()}/auth/callback?${params.toString()}`
}

function shell(opts: { heading: string; body: string; buttonLabel: string; link: string; footer: string }): string {
  return `
    <div style="font-family: -apple-system, Segoe UI, sans-serif; max-width: 520px; margin: 0 auto; background: #f1f5f9; padding: 32px 16px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="display: inline-block; width: 48px; height: 48px; line-height: 48px; background: ${GOLD}; color: white; font-weight: 700; border-radius: 12px;">OCG</div>
        <p style="margin: 12px 0 0; color: ${NAVY}; font-weight: 600;">One Core Group · Ops Hub</p>
      </div>
      <div style="background: white; border-radius: 16px; padding: 32px; border: 1px solid #e5e7eb;">
        <h1 style="margin: 0 0 12px; font-size: 18px; color: ${NAVY};">${opts.heading}</h1>
        <p style="margin: 0 0 24px; color: #475569; font-size: 14px; line-height: 1.6;">${opts.body}</p>
        <a href="${opts.link}" style="display: inline-block; background: ${NAVY}; color: white; text-decoration: none; font-weight: 600; padding: 12px 24px; border-radius: 10px; font-size: 14px;">${opts.buttonLabel}</a>
        <p style="margin: 24px 0 0; color: #94a3b8; font-size: 12px; line-height: 1.6;">If the button doesn't work, paste this link into your browser:<br><span style="color: #64748b; word-break: break-all;">${opts.link}</span></p>
      </div>
      <p style="text-align: center; color: #94a3b8; font-size: 12px; margin-top: 24px;">${opts.footer}</p>
    </div>`
}

function getResend(): Resend | null {
  const key = process.env['RESEND_API_KEY']
  return key ? new Resend(key) : null
}

function fromAddress(): string {
  const addr = process.env['OPS_EMAIL_FROM'] ?? 'ops@onecoregroup.com'
  return addr.includes('<') ? addr : `One Core Group Ops Hub <${addr}>`
}

/** Send a branded invitation that lands the user on the set-password page. */
export async function sendInviteEmail(opts: { email: string; displayName?: string | null; link: string }) {
  const resend = getResend()
  if (!resend) throw new Error('RESEND_API_KEY is not configured')
  const name = opts.displayName?.trim() ? `, ${opts.displayName.trim()}` : ''
  await resend.emails.send({
    from: fromAddress(),
    to: opts.email,
    subject: 'You\'ve been invited to the One Core Group Ops Hub',
    html: shell({
      heading: `Welcome${name} 👋`,
      body: 'An administrator has invited you to the One Core Group Ops Hub. Click below to choose a password and activate your portal — you\'ll use that password every time you sign in, on any device. Once in, you can see and update the tasks assigned to you. This link expires in 24 hours.',
      buttonLabel: 'Set your password',
      link: opts.link,
      footer: 'Access is restricted to authorised team members. If you weren\'t expecting this, you can ignore this email.',
    }),
  })
}

/** Send a branded password-reset / re-invite email that lands on set-password. */
export async function sendRecoveryEmail(opts: { email: string; link: string }) {
  const resend = getResend()
  if (!resend) throw new Error('RESEND_API_KEY is not configured')
  await resend.emails.send({
    from: fromAddress(),
    to: opts.email,
    subject: 'Reset your One Core Group Ops Hub password',
    html: shell({
      heading: 'Reset your password',
      body: 'We received a request to (re)set the password for your Ops Hub portal. Click below to choose a new one. This link expires in 1 hour. If you didn\'t request this, you can safely ignore this email — your password won\'t change.',
      buttonLabel: 'Choose a new password',
      link: opts.link,
      footer: 'For your security, this link can only be used once.',
    }),
  })
}
