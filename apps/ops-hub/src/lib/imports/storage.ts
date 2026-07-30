import { db } from '../serverClient'
import { storageConfigured } from '../storage'

// Retain uploaded import workbooks in a PRIVATE bucket. Never exposed publicly;
// authorised download is via a short-lived signed URL only.
const BUCKET = 'ops-imports'

function slug(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'import'
}

export async function retainImportFile(
  buffer: Buffer,
  filename: string,
  ownerSlug: string,
): Promise<{ bucket: string; path: string }> {
  if (!storageConfigured()) return { bucket: '', path: '' }
  const supabase = db()
  try {
    await supabase.storage.createBucket(BUCKET, { public: false })
  } catch {
    /* already exists — ignore */
  }
  const path = `${slug(ownerSlug) || 'unsorted'}/${Date.now()}-${slug(filename)}`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', upsert: true })
  if (error) return { bucket: '', path: '' } // best-effort; import still records filename + hash
  return { bucket: BUCKET, path }
}

/** Short-lived signed URL for an authorised reviewer to download the source file. */
export async function signImportFile(path: string, ttlSeconds = 300): Promise<string | null> {
  if (!path) return null
  const { data } = await db().storage.from(BUCKET).createSignedUrl(path, ttlSeconds)
  return data?.signedUrl ?? null
}
