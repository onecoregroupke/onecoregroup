// =============================================================================
// Marketing media storage — uploads images/videos to a public Supabase bucket
// so they can be attached to content rows and rendered in the preview grid.
// =============================================================================

import { createServerClient } from '@ocg/db'

const BUCKET = 'marketing-media'

function safeName(name: string): string {
  const dot = name.lastIndexOf('.')
  const ext = dot >= 0 ? name.slice(dot).toLowerCase().replace(/[^a-z0-9.]/g, '') : ''
  const base = (dot >= 0 ? name.slice(0, dot) : name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
  return `${base || 'file'}${ext}`
}

async function ensureBucket(supabase: ReturnType<typeof createServerClient>): Promise<void> {
  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 209715200, // 200 MB
  })
  if (error && !/exist/i.test(error.message)) {
    // best-effort; a real upload error surfaces later
  }
}

export interface UploadMediaInput {
  brandId: string
  contentId: string
  fileName: string
  contentType: string
  bytes: Buffer
}

export async function uploadMedia(
  input: UploadMediaInput,
): Promise<{ ok: true; url: string; path: string } | { ok: false; error: string }> {
  const supabase = createServerClient()
  await ensureBucket(supabase)
  const path = `${input.brandId}/${input.contentId}/${Date.now()}-${safeName(input.fileName)}`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, input.bytes, { contentType: input.contentType, upsert: true })
  if (error) return { ok: false, error: error.message }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return { ok: true, url: data.publicUrl, path }
}
