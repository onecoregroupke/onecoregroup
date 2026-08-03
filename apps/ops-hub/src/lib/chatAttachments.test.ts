import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateAttachment, looksExecutable, attachmentExt, MAX_ATTACHMENT_BYTES } from './chatAttachments'

test('accepts common operational formats', () => {
  for (const [n, m] of [['report.pdf', 'application/pdf'], ['photo.JPG', 'image/jpeg'], ['sheet.xlsx', ''], ['clip.mp4', 'video/mp4']] as const) {
    assert.equal(validateAttachment(n, m, 1000).ok, true, `${n} should be allowed`)
  }
})

test('rejects executables and scripts by extension', () => {
  for (const n of ['virus.exe', 'run.bat', 'a.sh', 'x.js', 'app.apk', 'page.html', 'icon.svg']) {
    assert.equal(validateAttachment(n, '', 1000).ok, false, `${n} should be blocked`)
  }
})

test('rejects a dangerous MIME even with a benign extension', () => {
  assert.equal(validateAttachment('totally.pdf', 'application/x-msdownload', 1000).ok, false)
})

test('rejects empty and oversized files, and missing extension', () => {
  assert.equal(validateAttachment('a.pdf', 'application/pdf', 0).ok, false)
  assert.equal(validateAttachment('a.pdf', 'application/pdf', MAX_ATTACHMENT_BYTES + 1).ok, false)
  assert.equal(validateAttachment('noext', '', 1000).ok, false)
})

test('magic-byte executable detection (defence beyond extension)', () => {
  assert.equal(looksExecutable(new Uint8Array([0x4d, 0x5a, 0x90, 0x00])), true) // MZ
  assert.equal(looksExecutable(new Uint8Array([0x7f, 0x45, 0x4c, 0x46])), true) // ELF
  assert.equal(looksExecutable(new Uint8Array([0x23, 0x21, 0x2f])), true)       // #!
  assert.equal(looksExecutable(new Uint8Array([0x25, 0x50, 0x44, 0x46])), false) // %PDF
})

test('attachmentExt is case-insensitive and safe on odd names', () => {
  assert.equal(attachmentExt('A.PDF'), 'pdf')
  assert.equal(attachmentExt('no-dot'), '')
})
