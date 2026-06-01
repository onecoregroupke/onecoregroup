import { google } from 'googleapis'

/**
 * Google Drive delivery for agent artifacts. Uses a service account whose JSON
 * is provided base64-encoded in GOOGLE_SERVICE_ACCOUNT_JSON_BASE64. The account
 * needs Editor on the Drive root (GOOGLE_DRIVE_ROOT_FOLDER_ID), which inherits
 * to brand/project subfolders.
 *
 * Folder convention (auto-created if missing):
 *   <root>/<Brand or Client name>/<PROJ-XXX  Project Name>/
 */

const SCOPES = ['https://www.googleapis.com/auth/drive']

function driveClient() {
  const b64 = process.env['GOOGLE_SERVICE_ACCOUNT_JSON_BASE64']
  if (!b64) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 not set')
  const creds = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))
  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: SCOPES,
  })
  return google.drive({ version: 'v3', auth })
}

export function driveConfigured(): boolean {
  return Boolean(
    process.env['GOOGLE_SERVICE_ACCOUNT_JSON_BASE64'] && process.env['GOOGLE_DRIVE_ROOT_FOLDER_ID'],
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
  })
  const existing = res.data.files?.[0]?.id
  if (existing) return existing
  const created = await drive.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
    fields: 'id',
  })
  return created.data.id!
}

export interface DeliverInput {
  ownerFolderName: string // brand or client name
  projectId: string
  projectName: string
  /** if the project already has a resolved folder id, skip the tree walk */
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
 *  the project folder. Returns the doc link + ids. */
export async function deliverDoc(input: DeliverInput): Promise<DeliverResult> {
  const rootId = process.env['GOOGLE_DRIVE_ROOT_FOLDER_ID']
  if (!rootId) throw new Error('GOOGLE_DRIVE_ROOT_FOLDER_ID not set')
  const drive = driveClient()

  let projectFolderId = input.projectFolderId ?? null
  if (!projectFolderId) {
    const ownerFolder = await findOrCreateFolder(drive, input.ownerFolderName || 'Unsorted', rootId)
    projectFolderId = await findOrCreateFolder(
      drive,
      `${input.projectId}  ${input.projectName}`,
      ownerFolder,
    )
  }

  // Google Doc from markdown (uploaded as text/plain then converted).
  const docRes = await drive.files.create({
    requestBody: {
      name: input.docTitle,
      mimeType: 'application/vnd.google-apps.document',
      parents: [projectFolderId],
    },
    media: { mimeType: 'text/plain', body: input.markdown },
    fields: 'id, webViewLink',
  })
  const docId = docRes.data.id!

  // Export the Doc as .docx and upload the bytes next to it.
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
  })

  return {
    doc_id: docId,
    docx_id: docxRes.data.id!,
    web_view_link: docRes.data.webViewLink ?? `https://docs.google.com/document/d/${docId}/edit`,
    folder_id: projectFolderId,
  }
}
