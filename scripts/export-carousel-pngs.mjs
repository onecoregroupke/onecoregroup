#!/usr/bin/env node
/**
 * export-carousel-pngs.mjs
 *
 * 1. Render all 8 carousel slides to 1080×1080 PNG via headless Chrome (CDP).
 * 2. Generate a Preview.pdf (all 8 slides, A4-landscape equivalent via Chrome print).
 * 3. Upload PNGs + PDF into the NPT Drive project folder via the same OAuth creds
 *    used by the Ops Hub, then return the folder link.
 *
 * Usage:
 *   node scripts/export-carousel-pngs.mjs
 *
 * Reads creds from apps/ops-hub/.env.local (GOOGLE_OAUTH_* + GOOGLE_DRIVE_BRAND_FOLDERS).
 */

import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const EXPORTS_DIR = path.join(REPO_ROOT, '.claude/skills/oc-design/projects/TASK-0004/exports')
const HTML_FILE = path.join(EXPORTS_DIR, 'carousel.html')
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const TOTAL_SLIDES = 8
const SLIDE_SIZE = 1080

// ── env ──────────────────────────────────────────────────────────────────────
function readEnvFile(file) {
  const out = {}
  try {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#') || !t.includes('=')) continue
      const i = t.indexOf('=')
      const key = t.slice(0, i).trim()
      let val = t.slice(i + 1).trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
        val = val.slice(1, -1)
      out[key] = val
    }
  } catch { /* file may not exist */ }
  return out
}

const env = {
  ...readEnvFile(path.join(REPO_ROOT, '.env.local')),
  ...readEnvFile(path.join(REPO_ROOT, 'apps', 'ops-hub', '.env.local')),
  ...process.env,
}

// ── Google Drive client (OAuth) ───────────────────────────────────────────────
function driveClient() {
  const { google } = require(path.join(REPO_ROOT, 'node_modules', 'googleapis'))
  const clientId = env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = env.GOOGLE_OAUTH_CLIENT_SECRET
  const refreshToken = env.GOOGLE_OAUTH_REFRESH_TOKEN
  if (!clientId || !clientSecret || !refreshToken)
    throw new Error('Missing GOOGLE_OAUTH_* credentials in .env.local')
  const oauth = new google.auth.OAuth2(clientId, clientSecret)
  oauth.setCredentials({ refresh_token: refreshToken })
  return google.drive({ version: 'v3', auth: oauth })
}

async function findOrCreateFolder(drive, name, parentId) {
  const safe = name.replace(/'/g, "\\'")
  const res = await drive.files.list({
    q: `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and name = '${safe}' and trashed = false`,
    fields: 'files(id, name)',
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })
  const existing = res.data.files?.[0]?.id
  if (existing) { console.log(`  Found folder "${name}" → ${existing}`); return existing }
  const created = await drive.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
    fields: 'id',
    supportsAllDrives: true,
  })
  console.log(`  Created folder "${name}" → ${created.data.id}`)
  return created.data.id
}

async function uploadFile(drive, filePath, mimeType, parentId) {
  const name = path.basename(filePath)
  const res = await drive.files.create({
    requestBody: { name, parents: [parentId] },
    media: { mimeType, body: Readable.from(await fsp.readFile(filePath)) },
    fields: 'id, webViewLink',
    supportsAllDrives: true,
  })
  return res.data
}

async function makeShareable(drive, fileId) {
  try {
    await drive.permissions.create({
      fileId,
      requestBody: { role: 'reader', type: 'anyone' },
      supportsAllDrives: true,
    })
  } catch { /* best-effort */ }
}

// ── Chrome CDP helpers ────────────────────────────────────────────────────────
const delay = ms => new Promise(r => setTimeout(r, ms))

async function waitForPage(port, deadline = Date.now() + 20000) {
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/list`)
      const pages = await r.json()
      const page = pages.find(e => e.type === 'page')
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl
    } catch { /* not ready yet */ }
    await delay(200)
  }
  throw new Error('Timed out waiting for Chrome DevTools')
}

// Open Chrome once, capture all slides, optionally print PDF.
async function captureAllSlides(outDir) {
  const fileUrl = `file:///${HTML_FILE.replace(/\\/g, '/').replace(/ /g, '%20')}`
  const profileDir = path.join(outDir, '_chrome-profile')
  await fsp.mkdir(profileDir, { recursive: true })
  const port = 9260

  const proc = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--disable-dev-shm-usage', '--hide-scrollbars',
    '--no-sandbox', '--force-device-scale-factor=1',
    `--window-size=${SLIDE_SIZE},${SLIDE_SIZE}`,
    `--user-data-dir=${profileDir}`,
    `--remote-debugging-port=${port}`,
    fileUrl,
  ], { stdio: ['ignore', 'pipe', 'pipe'] })
  proc.stderr.on('data', () => {})

  let socket
  try {
    const wsUrl = await waitForPage(port)
    socket = new WebSocket(wsUrl)
    await new Promise((res, rej) => {
      socket.addEventListener('open', res, { once: true })
      socket.addEventListener('error', rej, { once: true })
    })

    let nextId = 1
    const pending = new Map()
    socket.addEventListener('message', event => {
      const msg = JSON.parse(event.data)
      if (!msg.id) return
      const cb = pending.get(msg.id)
      if (!cb) return
      pending.delete(msg.id)
      msg.error ? cb.reject(new Error(JSON.stringify(msg.error))) : cb.resolve(msg.result)
    })

    const cdp = (method, params = {}) => {
      const id = nextId++
      socket.send(JSON.stringify({ id, method, params }))
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
    }

    await cdp('Page.enable')
    await cdp('Runtime.enable')
    await cdp('Emulation.setDeviceMetricsOverride', {
      width: SLIDE_SIZE, height: SLIDE_SIZE,
      deviceScaleFactor: 1, mobile: false,
      screenWidth: SLIDE_SIZE, screenHeight: SLIDE_SIZE,
    })
    // Wait for fonts
    await cdp('Page.reload', { ignoreCache: true })
    await delay(1500)
    await cdp('Runtime.evaluate', {
      awaitPromise: true,
      expression: `document.fonts ? document.fonts.ready.then(()=>true) : true`,
    })

    const pngFiles = []
    for (let s = 1; s <= TOTAL_SLIDES; s++) {
      console.log(`  Rendering slide ${s}/${TOTAL_SLIDES}…`)
      // Show only this slide
      await cdp('Runtime.evaluate', {
        expression: `
          document.querySelectorAll('.slide').forEach((el, i) => {
            el.style.display = i === ${s - 1} ? 'flex' : 'none';
          });
          window.scrollTo(0, 0);
          document.body.style.margin = '0';
          document.body.style.padding = '0';
          document.body.style.background = 'transparent';
        `,
      })
      await delay(250)
      await cdp('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } })

      const shot = await cdp('Page.captureScreenshot', {
        format: 'png',
        fromSurface: true,
        captureBeyondViewport: false,
      })
      const name = `Slide_${String(s).padStart(2, '0')}.png`
      const outFile = path.join(outDir, name)
      await fsp.writeFile(outFile, Buffer.from(shot.data, 'base64'))
      console.log(`    ✓ ${name}`)
      pngFiles.push(outFile)
    }

    // Generate Preview.pdf — show all slides, use print
    console.log('  Generating Preview.pdf…')
    await cdp('Runtime.evaluate', {
      expression: `
        document.querySelectorAll('.slide').forEach(el => el.style.display = 'flex');
        document.body.style.background = '#111';
      `,
    })
    await delay(400)
    const pdf = await cdp('Page.printToPDF', {
      landscape: false,
      printBackground: true,
      paperWidth: SLIDE_SIZE / 96,   // inches (1080px / 96dpi)
      paperHeight: SLIDE_SIZE / 96,
      marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0,
      scale: 1,
    })
    const pdfFile = path.join(outDir, 'Preview.pdf')
    await fsp.writeFile(pdfFile, Buffer.from(pdf.data, 'base64'))
    console.log('    ✓ Preview.pdf')

    return { pngFiles, pdfFile }
  } finally {
    try { socket?.close() } catch {}
    proc.kill()
    // Clean up chrome profile
    try { await fsp.rm(profileDir, { recursive: true, force: true }) } catch {}
  }
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══ TASK-0004 PNG Export + Drive Upload ══╗')

  // 1. Render slides
  console.log('\n[1/3] Rendering slides with headless Chrome…')
  const { pngFiles, pdfFile } = await captureAllSlides(EXPORTS_DIR)
  console.log(`  Rendered ${pngFiles.length} PNGs + Preview.pdf`)

  // 2. Resolve Drive folder
  console.log('\n[2/3] Resolving Drive folder…')
  const drive = driveClient()

  // NPT brand folder from GOOGLE_DRIVE_BRAND_FOLDERS env
  const brandFoldersRaw = env.GOOGLE_DRIVE_BRAND_FOLDERS
  let nptFolderId = null
  if (brandFoldersRaw) {
    try { nptFolderId = JSON.parse(brandFoldersRaw)['nairobi-piano-technicians'] } catch {}
  }
  if (!nptFolderId) {
    const rootId = env.GOOGLE_DRIVE_ROOT_FOLDER_ID
    nptFolderId = await findOrCreateFolder(drive, 'Nairobi Piano Technicians', rootId || 'root')
  }
  console.log(`  NPT brand folder: ${nptFolderId}`)

  // Project subfolder
  const projectFolder = await findOrCreateFolder(
    drive, 'PROJ-003  Content Production — Nairobi Piano Technicians', nptFolderId
  )

  // Carousel delivery subfolder
  const carouselFolder = await findOrCreateFolder(
    drive, 'Jun04_IG_AnchorCarousel_W1', projectFolder
  )
  console.log(`  Carousel folder: ${carouselFolder}`)

  // 3. Upload files
  console.log('\n[3/3] Uploading files to Drive…')
  const uploaded = []
  for (const png of pngFiles) {
    const result = await uploadFile(drive, png, 'image/png', carouselFolder)
    await makeShareable(drive, result.id)
    uploaded.push({ name: path.basename(png), id: result.id })
    console.log(`  ✓ ${path.basename(png)} → ${result.id}`)
  }
  const pdfResult = await uploadFile(drive, pdfFile, 'application/pdf', carouselFolder)
  await makeShareable(drive, pdfResult.id)
  uploaded.push({ name: 'Preview.pdf', id: pdfResult.id })
  console.log(`  ✓ Preview.pdf → ${pdfResult.id}`)

  // Make folder shareable and print link
  await makeShareable(drive, carouselFolder)
  const folderLink = `https://drive.google.com/drive/folders/${carouselFolder}`
  console.log('\n╔══ DONE ══╗')
  console.log(`Folder: ${folderLink}`)
  console.log(JSON.stringify({ ok: true, folder_id: carouselFolder, folder_link: folderLink, files: uploaded }, null, 2))
}

main().catch(err => { console.error(err); process.exit(1) })
