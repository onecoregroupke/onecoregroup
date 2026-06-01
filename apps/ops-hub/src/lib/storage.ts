import { db } from './serverClient'

// Supabase Storage delivery for agent artifacts. Sidesteps the Google service
// account storage-quota limitation: the draft markdown is uploaded to a private
// bucket owned by the OCG Supabase project, and a long-lived signed URL is
// stored on the artifact. Path: <brand-or-client>/<PROJ-XXX>/<ts>-<title>.md

const BUCKET = 'ops-artifacts'
const SIGNED_URL_TTL = 60 * 60 * 24 * 365 // 1 year

export function storageConfigured(): boolean {
  return Boolean(
    process.env['SUPABASE_SERVICE_ROLE_KEY'] && process.env['NEXT_PUBLIC_SUPABASE_URL'],
  )
}

function slugifyFile(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'draft'
  )
}

async function ensureBucket(
  supabase: ReturnType<typeof db>,
): Promise<void> {
  const { error } = await supabase.storage.createBucket(BUCKET, { public: false })
  // Ignore "already exists"; surface nothing — a real upload error is caught later.
  if (error && !/exist/i.test(error.message)) {
    // best-effort; do not throw here
  }
}

export interface UploadArtifactInput {
  /** brand slug or client id — first path segment */
  ownerSlug: string
  projectId: string
  title: string
  markdown: string
}

export interface UploadArtifactResult {
  kind: 'supabase'
  bucket: string
  storage_path: string
  web_view_link: string
}

export async function uploadArtifact(input: UploadArtifactInput): Promise<UploadArtifactResult> {
  const supabase = db()
  await ensureBucket(supabase)
  const path = `${input.ownerSlug || 'unsorted'}/${input.projectId}/${Date.now()}-${slugifyFile(
    input.title,
  )}.md`

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, input.markdown, { contentType: 'text/markdown; charset=utf-8', upsert: true })
  if (upErr) throw new Error(`Supabase upload failed: ${upErr.message}`)

  const { data, error: signErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL)
  if (signErr || !data) throw new Error(`Signed URL failed: ${signErr?.message ?? 'no url'}`)

  return { kind: 'supabase', bucket: BUCKET, storage_path: path, web_view_link: data.signedUrl }
}

/** Re-mint a signed URL for an already-stored artifact (links expire after TTL). */
export async function refreshArtifactUrl(storagePath: string): Promise<string | null> {
  const supabase = db()
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, SIGNED_URL_TTL)
  return data?.signedUrl ?? null
}
