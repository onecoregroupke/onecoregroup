import { db } from './serverClient'
import { storageConfigured } from './storage'

// =============================================================================
// Operational attachments — photos and documents on intakes, repair activity,
// movements, goods receipts, issue notes, requisitions, leave applications and
// form submissions.
//
// Same contract as chat attachments (047): a PRIVATE bucket, paths namespaced by
// domain and record id, and access only ever through a short-lived signed URL
// minted server-side after the caller's permission has been checked. A public
// URL is never stored or returned.
// =============================================================================

const BUCKET = 'ops-attachments'

/** Domains get their own path prefix so a signed URL can never be reused across modules. */
export type AttachmentDomain =
  | 'form-submission'
  | 'npt-intake'
  | 'npt-repair-activity'
  | 'npt-movement'
  | 'goods-receipt'
  | 'goods-issue'
  | 'requisition'
  | 'inspection'
  | 'employee-document'
  | 'supplier-document'

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'video/mp4',
])

const MAX_BYTES = 25 * 1024 * 1024

export function isAllowedAttachment(mimeType: string, sizeBytes: number): { ok: boolean; reason?: string } {
  if (sizeBytes > MAX_BYTES) return { ok: false, reason: 'File is larger than 25 MB.' }
  if (!ALLOWED_MIME.has(mimeType)) return { ok: false, reason: `Files of type "${mimeType}" are not accepted.` }
  return { ok: true }
}

function slug(s: string): string {
  return (
    s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'file'
  )
}

export async function uploadOpsAttachment(
  domain: AttachmentDomain,
  recordId: string,
  buffer: Buffer,
  filename: string,
  contentType: string,
): Promise<{ path: string }> {
  if (!storageConfigured()) throw new Error('File storage is not configured on this deployment.')
  const check = isAllowedAttachment(contentType, buffer.byteLength)
  if (!check.ok) throw new Error(check.reason ?? 'File rejected.')

  const supabase = db()
  try {
    await supabase.storage.createBucket(BUCKET, { public: false })
  } catch {
    /* already exists — ignore */
  }
  const path = `${domain}/${recordId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${slug(filename)}`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: contentType || 'application/octet-stream', upsert: false })
  if (error) throw new Error(`Attachment upload failed: ${error.message}`)
  return { path }
}

/** Short-lived signed URL. Only call after the caller's access has been verified. */
export async function signOpsAttachment(path: string, ttlSeconds = 3600): Promise<string | null> {
  if (!path) return null
  const { data } = await db().storage.from(BUCKET).createSignedUrl(path, ttlSeconds)
  return data?.signedUrl ?? null
}

export async function deleteOpsAttachment(path: string): Promise<void> {
  if (!path) return
  await db().storage.from(BUCKET).remove([path])
}
