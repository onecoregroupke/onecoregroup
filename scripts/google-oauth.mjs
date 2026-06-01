#!/usr/bin/env node
/**
 * google-oauth.mjs — one-time consent to get a Google Drive refresh token so the
 * Ops Hub can create sharable Google Docs OWNED BY YOUR Google account (works on
 * a free Gmail; service accounts can't, because they have no storage quota).
 *
 * Prereq: in Google Cloud Console → APIs & Services → Credentials, create an
 * OAuth client of type **Desktop app**. Note its Client ID + Client secret, and
 * enable the **Google Drive API** for the project. Add yourself as a Test user
 * on the OAuth consent screen (or publish the app).
 *
 * Usage (from repo root):
 *   GOOGLE_OAUTH_CLIENT_ID=... GOOGLE_OAUTH_CLIENT_SECRET=... node scripts/google-oauth.mjs
 *   # or put those two in apps/ops-hub/.env.local and just run:
 *   node scripts/google-oauth.mjs            # scope: drive.file (app-created files only)
 *   node scripts/google-oauth.mjs --full     # scope: full drive (use your existing root folder)
 *
 * It prints GOOGLE_OAUTH_REFRESH_TOKEN — paste it into apps/ops-hub/.env.local
 * AND the Vercel env, then redeploy.
 */

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { google } from 'googleapis'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')

function readEnvFile(file) {
  const out = {}
  try {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#') || !t.includes('=')) continue
      const i = t.indexOf('=')
      out[t.slice(0, i).trim()] = t.slice(i + 1).trim()
    }
  } catch {
    /* no file */
  }
  return out
}

const env = { ...readEnvFile(path.join(REPO_ROOT, 'apps', 'ops-hub', '.env.local')), ...process.env }
const args = process.argv.slice(2)
const argVal = (name) => {
  const i = args.indexOf('--' + name)
  return i >= 0 ? args[i + 1] : undefined
}

const CLIENT_ID = argVal('client-id') || env.GOOGLE_OAUTH_CLIENT_ID
const CLIENT_SECRET = argVal('client-secret') || env.GOOGLE_OAUTH_CLIENT_SECRET
const SCOPE = args.includes('--full')
  ? 'https://www.googleapis.com/auth/drive'
  : 'https://www.googleapis.com/auth/drive.file'
const PORT = 53682
const REDIRECT = `http://localhost:${PORT}`

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(
    'Missing client credentials. Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET\n' +
      '(in apps/ops-hub/.env.local or as env vars, or pass --client-id / --client-secret).',
  )
  process.exit(1)
}

const oauth = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT)
const authUrl = oauth.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: [SCOPE],
})

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, REDIRECT)
  const code = u.searchParams.get('code')
  if (!code) {
    res.writeHead(400, { 'Content-Type': 'text/plain' })
    res.end('No authorization code in request.')
    return
  }
  try {
    const { tokens } = await oauth.getToken(code)
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end('<h2>✓ Authorized. Copy the refresh token from your terminal, then close this tab.</h2>')
    console.log('\n=============================================================')
    if (tokens.refresh_token) {
      console.log('Add this to apps/ops-hub/.env.local AND the Vercel env:\n')
      console.log('GOOGLE_OAUTH_REFRESH_TOKEN=' + tokens.refresh_token)
      console.log('\nScope granted: ' + SCOPE)
    } else {
      console.log(
        'No refresh_token returned. Revoke this app at\n' +
          'https://myaccount.google.com/permissions and run again (must use prompt=consent).',
      )
    }
    console.log('=============================================================')
    server.close()
    process.exit(tokens.refresh_token ? 0 : 1)
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain' })
    res.end('Token exchange failed: ' + e.message)
    console.error(e)
    server.close()
    process.exit(1)
  }
})

server.listen(PORT, () => {
  console.log('\n1) Make sure your OAuth client (Desktop app) allows redirect: ' + REDIRECT)
  console.log('2) Open this URL, signed in as the Google account that should OWN the docs:\n')
  console.log('   ' + authUrl + '\n')
  console.log('3) Approve. The refresh token will print here automatically.')
})
