// =============================================================================
// AES-256-GCM encryption for platform OAuth tokens (server-only).
// =============================================================================
// Wire format stored in marketing_platform_credentials.encrypted_payload:
//   v<key_version>:<base64(iv)>:<base64(tag)>:<base64(ciphertext)>
// The key is derived from MARKETING_CRED_SECRET via scrypt. Never log plaintext.

import crypto from 'node:crypto'

const KEY_VERSION = 1
const ALGO = 'aes-256-gcm'

function deriveKey(version: number): Buffer {
  const secret = process.env['MARKETING_CRED_SECRET']
  if (!secret) throw new Error('MARKETING_CRED_SECRET is not set')
  // Static salt namespaced by version — rotating the version re-derives the key.
  return crypto.scryptSync(secret, `ocg-marketing-cred-v${version}`, 32)
}

export function encryptToken(plaintext: string): string {
  const key = deriveKey(KEY_VERSION)
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGO, key, iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v${KEY_VERSION}:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`
}

export function decryptToken(payload: string): string {
  const parts = payload.split(':')
  if (parts.length !== 4 || !parts[0].startsWith('v')) {
    throw new Error('Malformed encrypted payload')
  }
  const version = Number(parts[0].slice(1))
  const key = deriveKey(version)
  const iv = Buffer.from(parts[1], 'base64')
  const tag = Buffer.from(parts[2], 'base64')
  const ct = Buffer.from(parts[3], 'base64')
  const decipher = crypto.createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}

export const CRED_KEY_VERSION = KEY_VERSION
