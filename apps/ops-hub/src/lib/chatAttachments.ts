// Chat attachment validation (§6). Pure + unit-tested. Enforced server-side in
// /api/chat: allow only known-safe operational file types, reject dangerous ones,
// and never trust the extension alone — the MIME type and the file's magic bytes
// are checked too.

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024 // 25 MB

// Approved operational formats: images, PDFs, office docs, plain text, media, zip.
const ALLOWED_EXT = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'heic',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'ppt', 'pptx', 'txt', 'rtf', 'odt', 'ods', 'odp',
  'mp4', 'webm', 'mov', 'm4v', 'mp3', 'm4a', 'wav', 'ogg',
  'zip',
])

// Never allowed — executables, scripts, and script-carrying markup (SVG/HTML can
// carry active content and are deliberately excluded from an image allowlist).
const BLOCKED_EXT = new Set([
  'exe', 'msi', 'bat', 'cmd', 'com', 'scr', 'ps1', 'psm1', 'vbs', 'vbe', 'js', 'mjs', 'cjs',
  'jar', 'apk', 'app', 'deb', 'rpm', 'dll', 'so', 'dylib', 'bin', 'sh', 'bash', 'zsh',
  'php', 'py', 'rb', 'pl', 'html', 'htm', 'xhtml', 'svg', 'svgz', 'lnk', 'reg', 'iso', 'dmg', 'gadget',
])

export function attachmentExt(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec((name || '').trim())
  return m ? m[1].toLowerCase() : ''
}

/** Extension + MIME + size gate. Magic-byte check is done separately server-side. */
export function validateAttachment(name: string, mime: string, size: number): { ok: boolean; error?: string } {
  if (!Number.isFinite(size) || size <= 0) return { ok: false, error: 'Empty or invalid file.' }
  if (size > MAX_ATTACHMENT_BYTES) return { ok: false, error: `File is larger than ${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB.` }
  const ext = attachmentExt(name)
  if (!ext) return { ok: false, error: 'File must have an extension.' }
  if (BLOCKED_EXT.has(ext)) return { ok: false, error: `"${ext}" files are not allowed for security reasons.` }
  if (!ALLOWED_EXT.has(ext)) return { ok: false, error: `"${ext}" files are not a supported attachment type.` }
  const m = (mime || '').toLowerCase()
  if (/(x-msdownload|x-msdos-program|x-sh|x-executable|x-mach-binary|portable-executable|x-dosexec|javascript|x-httpd-php)/.test(m)) {
    return { ok: false, error: 'Executable or script content is not allowed.' }
  }
  return { ok: true }
}

/** Reject obvious executables by leading magic bytes (defence beyond ext/MIME). */
export function looksExecutable(head: Uint8Array): boolean {
  const b = head
  if (b.length >= 2 && b[0] === 0x4d && b[1] === 0x5a) return true                                   // MZ  (PE / DOS)
  if (b.length >= 4 && b[0] === 0x7f && b[1] === 0x45 && b[2] === 0x4c && b[3] === 0x46) return true   // ELF
  if (b.length >= 4 && b[0] === 0xca && b[1] === 0xfe && b[2] === 0xba && b[3] === 0xbe) return true   // Mach-O (fat)
  if (b.length >= 4 && b[0] === 0xfe && b[1] === 0xed && b[2] === 0xfa) return true                    // Mach-O
  if (b.length >= 2 && b[0] === 0x23 && b[1] === 0x21) return true                                     // #!  shebang
  return false
}

export function isImageAttachment(mime: string, name: string): boolean {
  return /^image\//i.test(mime || '') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(attachmentExt(name))
}
export function isVideoAttachment(mime: string, name: string): boolean {
  return /^video\//i.test(mime || '') || ['mp4', 'webm', 'mov', 'm4v'].includes(attachmentExt(name))
}

export function humanSize(bytes: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
