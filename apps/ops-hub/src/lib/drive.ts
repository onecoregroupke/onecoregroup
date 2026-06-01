import { google } from 'googleapis'

/**
 * Google Drive delivery for agent artifacts — produces real, sharable Google Docs.
 *
 * Two auth modes (OAuth preferred):
 *   1. OAuth as a real user (GOOGLE_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN).
 *      Files are OWNED BY THAT USER (e.g. onecoregroupke@gmail.com), count against
 *      their 15 GB, and are fully shareable. This is the way to make Drive work on
 *      a free Gmail account. Get the refresh token with `node scripts/google-oauth.mjs`.
 *   2. Service account (GOOGLE_SERVICE_ACCOUNT_JSON_BASE64) — only works against a
 *      Shared Drive (Google Workspace), since service accounts have no personal quota.
 *
 * Folder convention (auto-created if missing):
 *   <root>/<Brand or Client name>/<PROJ-XXX  Project Name>/
 * where <root> = GOOGLE_DRIVE_ROOT_FOLDER_ID if accessible, else a folder named
 * GOOGLE_DRIVE_ROOT_FOLDER_NAME created in the user's My Drive.
 */

const SCOPES = ['https://www.googleapis.com/auth/drive']

function driveClient() {
  const refresh = process.env['GOOGLE_OAUTH_REFRESH_TOKEN']
  const clientId = process.env['GOOGLE_OAUTH_CLIENT_ID']
  const clientSecret = process.env['GOOGLE_OAUTH_CLIENT_SECRET']
  if (refresh && clientId && clientSecret) {
    const oauth = new google.auth.OAuth2(clientId, clientSecret)
    oauth.setCredentials({ refresh_token: refresh })
    return google.drive({ version: 'v3', auth: oauth })
  }
  const b64 = process.env['GOOGLE_SERVICE_ACCOUNT_JSON_BASE64']
  if (b64) {
    const creds = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))
    // Domain-Wide Delegation (Google Workspace only): when GOOGLE_IMPERSONATE_SUBJECT
    // is set, the service account acts AS that Workspace user, so created files are
    // owned by them (quota-backed) rather than the quota-less service account.
    // The SA's Client ID + the Drive scope must be authorized in the Workspace
    // Admin console → Security → API controls → Domain-wide delegation.
    const subject = process.env['GOOGLE_IMPERSONATE_SUBJECT']
    const auth = new google.auth.JWT({
      email: creds.client_email,
      key: creds.private_key,
      scopes: SCOPES,
      ...(subject ? { subject } : {}),
    })
    return google.drive({ version: 'v3', auth })
  }
  throw new Error('No Drive credentials: set GOOGLE_OAUTH_* (recommended) or GOOGLE_SERVICE_ACCOUNT_JSON_BASE64')
}

export function driveConfigured(): boolean {
  const oauth =
    process.env['GOOGLE_OAUTH_REFRESH_TOKEN'] &&
    process.env['GOOGLE_OAUTH_CLIENT_ID'] &&
    process.env['GOOGLE_OAUTH_CLIENT_SECRET']
  return Boolean(oauth || process.env['GOOGLE_SERVICE_ACCOUNT_JSON_BASE64'])
}

/** Whether OAuth-as-user mode is active (vs service account). */
export function driveOAuthMode(): boolean {
  return Boolean(
    process.env['GOOGLE_OAUTH_REFRESH_TOKEN'] &&
      process.env['GOOGLE_OAUTH_CLIENT_ID'] &&
      process.env['GOOGLE_OAUTH_CLIENT_SECRET'],
  )
}

async function findOrCreateFolder(
  drive: ReturnType<typeof driveClient>,
  name: string,
  parentId: string,
): Promise<string> {
  const safe = name.replace(/'/g, "\\'")
  const res = await drive.files.list({
    q: `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and name = '${safe}' and trashed = false`,
    fields: 'files(id, name)',
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })
  const existing = res.data.files?.[0]?.id
  if (existing) return existing
  const created = await drive.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
    fields: 'id',
    supportsAllDrives: true,
  })
  return created.data.id!
}

/** Find a child folder matching ANY of the given aliases (case-insensitive),
 *  else create one named `primaryName`. Lets the agent write INTO the brand
 *  folders you already made (matched by brand name, short name, or slug) instead
 *  of creating duplicates. */
async function findOrCreateFolderByAliases(
  drive: ReturnType<typeof driveClient>,
  aliases: string[],
  primaryName: string,
  parentId: string,
): Promise<string> {
  const wanted = aliases
    .map((a) => a?.trim().toLowerCase())
    .filter((a): a is string => Boolean(a))
  if (wanted.length === 0) return findOrCreateFolder(drive, primaryName, parentId)

  const res = await drive.files.list({
    q: `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
    pageSize: 200,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })
  const match = (res.data.files ?? []).find((f) =>
    wanted.includes((f.name ?? '').trim().toLowerCase()),
  )
  if (match?.id) return match.id
  return findOrCreateFolder(drive, primaryName, parentId)
}

/** Resolve the delivery root: the configured folder id if we can access it,
 *  otherwise a folder created in the account's My Drive by name. */
async function resolveRootFolder(drive: ReturnType<typeof driveClient>): Promise<string> {
  const envId = process.env['GOOGLE_DRIVE_ROOT_FOLDER_ID']
  if (envId) {
    try {
      await drive.files.get({ fileId: envId, fields: 'id', supportsAllDrives: true })
      return envId
    } catch {
      // not accessible under this credential/scope — fall through to by-name
    }
  }
  const name = process.env['GOOGLE_DRIVE_ROOT_FOLDER_NAME'] || 'One Core Group — Ops Deliverables'
  return findOrCreateFolder(drive, name, 'root')
}

/** Make a file shareable by link (anyone with the link can view). Best-effort. */
async function makeShareable(drive: ReturnType<typeof driveClient>, fileId: string): Promise<void> {
  const mode = process.env['OPS_DRIVE_SHARE'] ?? 'anyone'
  if (mode === 'none') return
  try {
    await drive.permissions.create({
      fileId,
      requestBody: { role: 'reader', type: 'anyone' },
      supportsAllDrives: true,
    })
  } catch {
    // sharing is best-effort; the doc still exists and is reachable by its owner
  }
}

export interface DeliverInput {
  ownerFolderName: string // brand or client name (primary, used if no match)
  /** alternate names to match an existing brand/client folder by (name/short_name/slug) */
  ownerAliases?: string[]
  projectId: string
  projectName: string
  projectFolderId?: string | null
  docTitle: string
  markdown: string
}

export interface DeliverResult {
  doc_id: string
  docx_id: string
  web_view_link: string
  folder_id: string
}

/** Create a Google Doc from markdown, export a .docx alongside it, both inside
 *  the project folder, and make the Doc shareable. Returns the doc link + ids. */
export async function deliverDoc(input: DeliverInput): Promise<DeliverResult> {
  const drive = driveClient()

  let projectFolderId = input.projectFolderId ?? null
  if (!projectFolderId) {
    const root = await resolveRootFolder(drive)
    const ownerFolder = await findOrCreateFolderByAliases(
      drive,
      [input.ownerFolderName, ...(input.ownerAliases ?? [])],
      input.ownerFolderName || 'Unsorted',
      root,
    )
    projectFolderId = await findOrCreateFolder(
      drive,
      `${input.projectId}  ${input.projectName}`,
      ownerFolder,
    )
  }

  const docRes = await drive.files.create({
    requestBody: {
      name: input.docTitle,
      mimeType: 'application/vnd.google-apps.document',
      parents: [projectFolderId],
    },
    media: { mimeType: 'text/plain', body: input.markdown },
    fields: 'id, webViewLink',
    supportsAllDrives: true,
  })
  const docId = docRes.data.id!
  await makeShareable(drive, docId)

  const exported = await drive.files.export(
    { fileId: docId, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
    { responseType: 'arraybuffer' },
  )
  const docxRes = await drive.files.create({
    requestBody: { name: `${input.docTitle}.docx`, parents: [projectFolderId] },
    media: {
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      body: Buffer.from(exported.data as ArrayBuffer),
    },
    fields: 'id',
    supportsAllDrives: true,
  })

  return {
    doc_id: docId,
    docx_id: docxRes.data.id!,
    web_view_link: docRes.data.webViewLink ?? `https://docs.google.com/document/d/${docId}/edit`,
    folder_id: projectFolderId,
  }
}
