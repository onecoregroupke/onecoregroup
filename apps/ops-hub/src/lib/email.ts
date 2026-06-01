import { Resend } from 'resend'

function client(): Resend | null {
  const key = process.env['RESEND_API_KEY']
  if (!key) return null
  return new Resend(key)
}

function fromAddress(): string {
  return process.env['OPS_EMAIL_FROM'] ?? 'ops@onecoregroup.com'
}

export interface TaskAssignmentParams {
  to: string
  taskId: string
  taskName: string
  projectName: string
  brandName?: string
  priority: string
  targetDate: string
  description?: string
  completionUrl: string
}

const GOLD = '#b07a00'
const NAVY = '#1a1a2e'

/** Branded assignment email with the no-login completion link. No-ops (returns
 *  false) if RESEND_API_KEY is unset, so task creation never hard-fails on email. */
export async function sendTaskAssignment(p: TaskAssignmentParams): Promise<boolean> {
  const resend = client()
  if (!resend) return false
  const html = `
  <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a1a2e">
    <div style="background:${NAVY};padding:20px 24px;border-radius:12px 12px 0 0">
      <span style="color:#fff;font-weight:700;font-size:18px">One Core Group</span>
      <span style="color:${GOLD};font-size:13px;margin-left:6px">Ops</span>
    </div>
    <div style="border:1px solid #eee;border-top:none;padding:24px;border-radius:0 0 12px 12px">
      <p style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#888;margin:0">
        New task assigned${p.brandName ? ` · ${p.brandName}` : ''}
      </p>
      <h1 style="font-size:20px;margin:8px 0 4px">${escapeHtml(p.taskName)}</h1>
      <p style="color:#666;font-size:13px;margin:0 0 16px">
        ${escapeHtml(p.taskId)} · ${escapeHtml(p.projectName)} · ${escapeHtml(p.priority)} priority
        ${p.targetDate ? ` · due ${escapeHtml(p.targetDate)}` : ''}
      </p>
      ${p.description ? `<p style="font-size:14px;line-height:1.5">${escapeHtml(p.description)}</p>` : ''}
      <a href="${p.completionUrl}"
         style="display:inline-block;margin-top:16px;background:${GOLD};color:#fff;text-decoration:none;
                padding:12px 20px;border-radius:8px;font-weight:600;font-size:14px">
        Mark complete →
      </a>
      <p style="color:#aaa;font-size:11px;margin-top:20px">
        You can update this task without logging in via the button above.
      </p>
    </div>
  </div>`
  try {
    await resend.emails.send({
      from: fromAddress(),
      to: p.to,
      subject: `[Task] ${p.taskName} — ${p.taskId}`,
      html,
    })
    return true
  } catch {
    return false
  }
}

export async function sendReport(
  subject: string,
  html: string,
  recipients: string[],
): Promise<boolean> {
  const resend = client()
  if (!resend || recipients.length === 0) return false
  try {
    await resend.emails.send({ from: fromAddress(), to: recipients, subject, html })
    return true
  } catch {
    return false
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
