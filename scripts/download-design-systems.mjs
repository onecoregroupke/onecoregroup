#!/usr/bin/env node
/**
 * download-design-systems.mjs
 *
 * Finds the DESIGN SYSTEM subfolder inside each brand's Drive folder,
 * downloads every zip it contains, and extracts it into the matching
 * local Drive-sync path.
 *
 * Usage:  node scripts/download-design-systems.mjs
 */

import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const require = createRequire(import.meta.url)
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DRIVE_SYNC_ROOT = 'C:\\Users\\Administrator\\Desktop\\OCG DRIVE SYNC\\CENTER POINT'

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
  } catch { /* may not exist */ }
  return out
}
const env = {
  ...readEnvFile(path.join(REPO_ROOT, '.env.local')),
  ...readEnvFile(path.join(REPO_ROOT, 'apps', 'ops-hub', '.env.local')),
  ...process.env,
}

// ── Drive client ──────────────────────────────────────────────────────────────
function driveClient() {
  const { google } = require(path.join(REPO_ROOT, 'node_modules', 'googleapis'))
  const oauth = new google.auth.OAuth2(env.GOOGLE_OAUTH_CLIENT_ID, env.GOOGLE_OAUTH_CLIENT_SECRET)
  oauth.setCredentials({ refresh_token: env.GOOGLE_OAUTH_REFRESH_TOKEN })
  return google.drive({ version: 'v3', auth: oauth })
}

async function listFolder(drive, folderId) {
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType, size)',
    pageSize: 200,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })
  return res.data.files ?? []
}

async function findSubfolder(drive, parentId, name) {
  const files = await listFolder(drive, parentId)
  const lower = name.toLowerCase()
  return files.find(f =>
    f.mimeType === 'application/vnd.google-apps.folder' &&
    f.name.toLowerCase().includes(lower)
  ) ?? null
}

async function downloadFile(drive, fileId, destPath) {
  const res = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'stream' }
  )
  await fsp.mkdir(path.dirname(destPath), { recursive: true })
  await pipeline(res.data, fs.createWriteStream(destPath))
}

// ── Extract zip via PowerShell ────────────────────────────────────────────────
function extractZip(zipPath, destDir) {
  return new Promise((resolve, reject) => {
    const ps = spawn('powershell', [
      '-NoProfile', '-Command',
      `Expand-Archive -Path "${zipPath}" -DestinationPath "${destDir}" -Force`
    ])
    let err = ''
    ps.stderr.on('data', d => { err += d.toString() })
    ps.on('close', code => {
      if (code === 0) resolve()
      else reject(new Error(`Expand-Archive failed (${code}): ${err}`))
    })
  })
}

// ── Brand config ──────────────────────────────────────────────────────────────
const BRANDS = [
  {
    slug: 'nairobi-piano-technicians',
    label: 'NPT',
    driveFolderId: '15TH08qgNsRvRf4pV-Ent8nTGdktoU7aw',
    localDir: path.join(DRIVE_SYNC_ROOT, 'NAIROBI PIANO TECHNICIANS DEPARTMENT', 'DESIGN SYSTEM'),
  },
  {
    slug: 'nuuranest-stays',
    label: 'Nuuranest',
    driveFolderId: '12kiSzJEySzF3w81q21-e-6X7tn8NukfB',
    localDir: path.join(DRIVE_SYNC_ROOT, 'NUURANEST STAYS DEPARTMENT', 'DESIGN SYSTEM'),
  },
  {
    slug: 'glitz-n-glim',
    label: 'Glitz N\' Glim',
    driveFolderId: '1ILh7RaUeib3yzZRQpmaI6xKpPpWEmxJ-',
    localDir: path.join(DRIVE_SYNC_ROOT, 'ICELAND GEYSER DEPARTMENT', 'DESIGN SYSTEM'),
  },
]

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  const drive = driveClient()
  const results = []

  for (const brand of BRANDS) {
    console.log(`\n── ${brand.label} ──`)

    // Find DESIGN SYSTEM subfolder inside the brand's Drive folder
    const dsFolder = await findSubfolder(drive, brand.driveFolderId, 'design system')
    if (!dsFolder) {
      console.log(`  ⚠  No "Design System" subfolder found in Drive — skipping`)
      results.push({ slug: brand.slug, localDir: brand.localDir, zips: [], skipped: true })
      continue
    }
    console.log(`  Drive folder: ${dsFolder.name} (${dsFolder.id})`)

    // List its contents
    const files = await listFolder(drive, dsFolder.id)
    const zips = files.filter(f =>
      f.name.toLowerCase().endsWith('.zip') ||
      f.mimeType === 'application/zip' ||
      f.mimeType === 'application/x-zip-compressed'
    )
    if (zips.length === 0) {
      console.log(`  ⚠  No zip files found in Design System folder — skipping`)
      results.push({ slug: brand.slug, localDir: brand.localDir, zips: [], skipped: true })
      continue
    }

    await fsp.mkdir(brand.localDir, { recursive: true })
    const downloaded = []

    for (const zip of zips) {
      const destZip = path.join(brand.localDir, zip.name)
      const sizeMB = zip.size ? `${(zip.size / 1024 / 1024).toFixed(1)} MB` : 'unknown size'
      console.log(`  ↓  ${zip.name} (${sizeMB})…`)
      await downloadFile(drive, zip.id, destZip)
      console.log(`     saved → ${destZip}`)

      // Extract alongside the zip
      const extractDir = path.join(brand.localDir, path.basename(zip.name, '.zip'))
      console.log(`  ↗  Extracting to ${extractDir}…`)
      await extractZip(destZip, extractDir)
      console.log(`     ✓ extracted`)
      downloaded.push({ name: zip.name, localZip: destZip, extractDir })
    }

    results.push({ slug: brand.slug, localDir: brand.localDir, zips: downloaded, skipped: false })
  }

  // Print summary + the env var value to paste
  console.log('\n\n══ DONE ══')
  const pathMap = {}
  for (const r of results) {
    if (!r.skipped) pathMap[r.slug] = r.localDir
  }
  console.log('\nPaste into apps/ops-hub/.env.local:')
  console.log(`BRAND_DESIGN_SYSTEM_PATHS=${JSON.stringify(JSON.stringify(pathMap))}`)
  console.log('\nFull results:')
  console.log(JSON.stringify(results, null, 2))
}

main().catch(err => { console.error(err); process.exit(1) })
