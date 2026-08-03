import { db } from './serverClient'
import { storageConfigured } from './storage'

// Chat attachments live in a PRIVATE bucket, keyed by conversation id. Access is
// only ever a short-lived signed URL, generated server-side for a verified
// conversation member — the file is never public.
const BUCKET = 'chat-attachments'

function slug(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'file'
}

export async function uploadChatAttachment(
  conversationId: string,
  buffer: Buffer,
  filename: string,
  contentType: string,
): Promise<{ path: string } | null> {
  if (!storageConfigured()) return null
  const supabase = db()
  try {
    await supabase.storage.createBucket(BUCKET, { public: false })
  } catch {
    /* already exists — ignore */
  }
  const path = `${conversationId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${slug(filename)}`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: contentType || 'application/octet-stream', upsert: false })
  if (error) throw new Error(`Attachment upload failed: ${error.message}`)
  return { path }
}

/** Short-lived signed URL for a verified conversation member to view/download. */
export async function signChatAttachment(path: string, ttlSeconds = 3600): Promise<string | null> {
  if (!path) return null
  const { data } = await db().storage.from(BUCKET).createSignedUrl(path, ttlSeconds)
  return data?.signedUrl ?? null
}
