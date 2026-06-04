#!/usr/bin/env node
/**
 * generate-carousel.mjs
 * Reads the NPT logo, embeds it as base64, and writes a fully self-contained
 * carousel.html for TASK-0004 (8 slides, 1080×1080px each).
 *
 * Usage:  node scripts/generate-carousel.mjs
 */

import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT   = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DS_ROOT     = 'C:\\Users\\Administrator\\Desktop\\OCG DRIVE SYNC\\CENTER POINT\\NAIROBI PIANO TECHNICIANS DEPARTMENT\\DESIGN SYSTEM\\NPT Design System (1)'
const LOGO_PATH   = path.join(DS_ROOT, 'assets', 'npt-logo.png')
const OUT_FILE    = path.join(REPO_ROOT, '.claude/skills/oc-design/projects/TASK-0004/exports/carousel.html')

async function main() {
  // ── Embed logo ──────────────────────────────────────────────────────────────
  const logoBuf  = await fsp.readFile(LOGO_PATH)
  const logoB64  = `data:image/png;base64,${logoBuf.toString('base64')}`
  console.log(`Logo encoded: ${(logoBuf.length / 1024).toFixed(0)} KB`)

  const html = buildHtml(logoB64)
  await fsp.mkdir(path.dirname(OUT_FILE), { recursive: true })
  await fsp.writeFile(OUT_FILE, html, 'utf8')
  console.log(`Written → ${OUT_FILE} (${(html.length / 1024).toFixed(0)} KB)`)
}

// ── Piano keyboard SVG ──────────────────────────────────────────────────────
// 15 white keys (2 full octaves + C), 1080px wide
function pianoKeyboardSvg({ width = 1080, height = 320 } = {}) {
  const W  = width
  const H  = height
  const NK = 15          // white keys
  const kw = W / NK      // white key width ≈ 72px
  const bw = kw * 0.60   // black key width
  const bh = H * 0.62    // black key height

  // Pattern for 2 octaves starting at C: C D E F G A B  C D E F G A B  C
  // Black key offsets (fraction of white key width from left of preceding white key):
  const BK_PATTERN = [0.65, 1.65, 3.65, 4.65, 5.65,  7.65, 8.65, 10.65, 11.65, 12.65]

  let whites = ''
  for (let i = 0; i < NK; i++) {
    const x = i * kw
    const isLast = i === NK - 1
    whites += `<rect x="${x.toFixed(1)}" y="0" width="${(kw - 1).toFixed(1)}" height="${H}"
      fill="#f9f4ef" rx="0 0 3 3"
      stroke="#c8c0b4" stroke-width="1"/>`
  }

  let blacks = ''
  for (const pos of BK_PATTERN) {
    const x = pos * kw - bw / 2
    blacks += `<rect x="${x.toFixed(1)}" y="0" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}"
      fill="#021321" rx="2"/>`
    // subtle right shadow on black key
    blacks += `<rect x="${(x + bw).toFixed(1)}" y="0" width="3" height="${bh.toFixed(1)}"
      fill="rgba(0,0,0,0.18)"/>`
  }

  // champagne accent line at bottom of keyboard
  const accLine = `<line x1="0" y1="${H - 1}" x2="${W}" y2="${H - 1}" stroke="#f8d8a4" stroke-width="2"/>`

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${whites}${blacks}${accLine}</svg>`
}

// ── Piano strings + hammers (internal view) SVG ────────────────────────────
function pianoStringsSvg({ width = 800, height = 480 } = {}) {
  const strings = []
  const W = width, H = height
  const count = 60
  for (let i = 0; i < count; i++) {
    const x   = 40 + (i / (count - 1)) * (W - 80)
    const thick = 0.5 + (i / count) * 2.5
    const col = `rgba(248,216,164,${0.15 + (i / count) * 0.45})`
    strings.push(`<line x1="${x.toFixed(1)}" y1="0" x2="${x.toFixed(1)}" y2="${H}"
      stroke="${col}" stroke-width="${thick.toFixed(2)}"/>`)
  }
  // bridge at bottom third
  const bridgeY = H * 0.68
  strings.push(`<rect x="36" y="${bridgeY.toFixed(1)}" width="${W - 72}" height="8" fill="#f8d8a4" rx="1" opacity="0.7"/>`)
  // hammers (felt heads)
  const hammerY = H * 0.52
  for (let i = 0; i < count; i += 3) {
    const x = 40 + (i / (count - 1)) * (W - 80)
    const hw = 8 + (i / count) * 6
    strings.push(`<rect x="${(x - hw / 2).toFixed(1)}" y="${(hammerY - 6).toFixed(1)}"
      width="${hw.toFixed(1)}" height="12" fill="#e8d9c8" rx="2"/>`)
  }
  // tuning pins at top
  for (let i = 0; i < count; i += 2) {
    const x = 40 + (i / (count - 1)) * (W - 80)
    strings.push(`<circle cx="${x.toFixed(1)}" cy="18" r="4" fill="#8b7d59" opacity="0.8"/>`)
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"
    style="display:block">${strings.join('')}</svg>`
}

// ── Upright piano in room SVG ───────────────────────────────────────────────
function pianoInRoomSvg({ width = 760, height = 520 } = {}) {
  const W = width, H = height
  // Floor line
  const floorY = H * 0.82
  // Piano body (upright)
  const pX = W * 0.22, pY = H * 0.20
  const pW = W * 0.46, pH = floorY - pY
  // Piano lid (top)
  const lidH = pH * 0.12
  // Room wall + floor
  const room = `
    <rect x="0" y="0" width="${W}" height="${H}" fill="none"/>
    <line x1="0" y1="${floorY.toFixed(1)}" x2="${W}" y2="${floorY.toFixed(1)}" stroke="#8b7d59" stroke-width="1.5" opacity="0.4"/>
    <line x1="${(W*0.08).toFixed(1)}" y1="0" x2="${(W*0.08).toFixed(1)}" y2="${floorY.toFixed(1)}" stroke="#8b7d59" stroke-width="1" opacity="0.2"/>
  `
  // Window on wall
  const winX = W * 0.62, winY = H * 0.08, winW = W * 0.28, winH = H * 0.35
  const window_ = `
    <rect x="${winX.toFixed(1)}" y="${winY.toFixed(1)}" width="${winW.toFixed(1)}" height="${winH.toFixed(1)}"
      fill="none" stroke="#8b7d59" stroke-width="1.5" opacity="0.35"/>
    <line x1="${(winX+winW/2).toFixed(1)}" y1="${winY.toFixed(1)}" x2="${(winX+winW/2).toFixed(1)}" y2="${(winY+winH).toFixed(1)}"
      stroke="#8b7d59" stroke-width="1" opacity="0.25"/>
    <line x1="${winX.toFixed(1)}" y1="${(winY+winH/2).toFixed(1)}" x2="${(winX+winW).toFixed(1)}" y2="${(winY+winH/2).toFixed(1)}"
      stroke="#8b7d59" stroke-width="1" opacity="0.25"/>
    <rect x="${winX.toFixed(1)}" y="${winY.toFixed(1)}" width="${winW.toFixed(1)}" height="${(winH*0.1).toFixed(1)}"
      fill="#8b7d59" opacity="0.08"/>
  `
  // Piano body
  const piano = `
    <rect x="${pX.toFixed(1)}" y="${pY.toFixed(1)}" width="${pW.toFixed(1)}" height="${pH.toFixed(1)}"
      fill="#021321" rx="2"/>
    <rect x="${pX.toFixed(1)}" y="${pY.toFixed(1)}" width="${pW.toFixed(1)}" height="${lidH.toFixed(1)}"
      fill="#031732" rx="2"/>
    <rect x="${(pX+pW*0.08).toFixed(1)}" y="${(pY+lidH*1.1).toFixed(1)}"
      width="${(pW*0.84).toFixed(1)}" height="${(pH*0.06).toFixed(1)}" fill="#8b7d59" opacity="0.4" rx="1"/>
    <rect x="${(pX+pW*0.06).toFixed(1)}" y="${(pY+pH*0.22).toFixed(1)}"
      width="${(pW*0.88).toFixed(1)}" height="${(pH*0.42).toFixed(1)}" fill="#031732" rx="1"/>
    <rect x="${(pX+pW*0.08).toFixed(1)}" y="${(pY+pH*0.64).toFixed(1)}"
      width="${(pW*0.84).toFixed(1)}" height="${(pH*0.04).toFixed(1)}" fill="#8b7d59" opacity="0.3" rx="1"/>
    <rect x="${(pX+pW*0.28).toFixed(1)}" y="${(pY+pH*0.70).toFixed(1)}"
      width="${(pW*0.44).toFixed(1)}" height="${(pH*0.08).toFixed(1)}" fill="#f9f4ef" opacity="0.7" rx="1"/>
    <rect x="${(pX+pW*0.06).toFixed(1)}" y="${(floorY-pH*0.06).toFixed(1)}"
      width="${(pW*0.18).toFixed(1)}" height="${(pH*0.06).toFixed(1)}" fill="#021321" rx="1"/>
    <rect x="${(pX+pW*0.76).toFixed(1)}" y="${(floorY-pH*0.06).toFixed(1)}"
      width="${(pW*0.18).toFixed(1)}" height="${(pH*0.06).toFixed(1)}" fill="#021321" rx="1"/>
    <rect x="${(pX+pW*0.28).toFixed(1)}" y="${(floorY-pH*0.03).toFixed(1)}"
      width="${(pW*0.44).toFixed(1)}" height="${(pH*0.015).toFixed(1)}" fill="#8b7d59" opacity="0.5" rx="1"/>
    <rect x="${(pX+pW*0.32).toFixed(1)}" y="${(floorY-pH*0.03).toFixed(1)}"
      width="${(pW*0.12).toFixed(1)}" height="${(pH*0.05).toFixed(1)}" fill="#8b7d59" opacity="0.35" rx="1"/>
    <rect x="${(pX+pW*0.46).toFixed(1)}" y="${(floorY-pH*0.03).toFixed(1)}"
      width="${(pW*0.12).toFixed(1)}" height="${(pH*0.05).toFixed(1)}" fill="#8b7d59" opacity="0.35" rx="1"/>
    <rect x="${(pX+pW*0.60).toFixed(1)}" y="${(floorY-pH*0.03).toFixed(1)}"
      width="${(pW*0.12).toFixed(1)}" height="${(pH*0.05).toFixed(1)}" fill="#8b7d59" opacity="0.35" rx="1"/>
  `
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"
    style="display:block">${room}${window_}${piano}</svg>`
}

// ── Main HTML builder ────────────────────────────────────────────────────────
function buildHtml(logoB64) {
  const keyboard = pianoKeyboardSvg()
  const strings  = pianoStringsSvg({ width: 860, height: 420 })
  const roomSvg  = pianoInRoomSvg({ width: 780, height: 500 })

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=1080">
<title>NPT — Why Buy Through NPT? | Instagram Carousel</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Kaisei+Decol:wght@400;500;700&family=Lato:ital,wght@0,400;0,600;0,700;1,400&family=Lora:ital,wght@1,300;1,400&display=swap">
<script src="https://unpkg.com/lucide@latest"></script>
<style>
/* ── Reset & base ─────────────────────────────── */
*,*::before,*::after { box-sizing:border-box; margin:0; padding:0; }
html { font-size:16px; }
body { background:#111; font-family:'Lato',system-ui,sans-serif; }

/* ── NPT tokens ───────────────────────────────── */
:root {
  --navy:       #021321;
  --navy-alt:   #031732;
  --ivory:      #f9f4ef;
  --white:      #ffffff;
  --champ:      #f8d8a4;  /* accent ON DARK only */
  --gold:       #8b7d59;  /* accent ON LIGHT only */
  --muted:      #7d7d7d;
  --subtle:     #b9b9b9;
  --border-d:   rgba(255,255,255,0.10);
  --border-l:   rgba(135,134,134,0.21);
  --border-iv:  #e4dbd2;
  --shadow:     6px 6px 9px rgba(0,0,0,0.08);
  --shadow-str: 6px 6px 9px rgba(0,0,0,0.22);
  --r:          4px;
}

/* ── Slide shell ─────────────────────────────── */
.slide {
  width:  1080px;
  height: 1080px;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  margin: 0 auto 4px;
  page-break-after: always;
  font-family: 'Lato', sans-serif;
}

/* ── Surface scopes ────────────────────────────── */
.dark  { background: var(--navy);  color: #fff; }
.light { background: var(--ivory); color: var(--navy); }

/* ── Shared chrome ─────────────────────────────── */
.champ-bar {
  position: absolute;
  bottom: 0; left: 0; right: 0;
  height: 4px;
  background: var(--champ);
}
.slide-num {
  position: absolute;
  bottom: 18px; right: 40px;
  font-size: 11px; font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.dark .slide-num { color: var(--champ); opacity: 0.5; }
.light .slide-num { color: var(--gold); opacity: 0.6; }

.eyebrow {
  font-size: 12px; font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  font-family: 'Lato', sans-serif;
}
.dark  .eyebrow { color: var(--champ); }
.light .eyebrow { color: var(--gold);  }

.display { font-family: 'Kaisei Decol', Georgia, serif; }
.pullquote { font-family: 'Lora', Georgia, serif; font-style: italic; font-weight: 300; }

/* ── NPT crest logo ──────────────────────────── */
.npt-crest { object-fit: contain; }

/* ─────────────────────────────────────────────────────────────────────────────
   SLIDE 1 — COVER
───────────────────────────────────────────────────────────────────────────── */
#s1 { justify-content: center; align-items: center; }

#s1 .inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 0;
  padding: 0 80px;
}

#s1 .crest-wrap {
  width: 180px; height: 180px;
  margin-bottom: 36px;
}
#s1 .crest-wrap img { width: 100%; height: 100%; object-fit: contain; }

#s1 .eyebrow { margin-bottom: 20px; }

#s1 .headline {
  font-size: 70px;
  font-weight: 400;
  color: #fff;
  line-height: 1.1;
  letter-spacing: -1px;
  margin-bottom: 36px;
}

#s1 .rule {
  width: 120px; height: 2px;
  background: var(--champ);
  margin: 0 auto 28px;
}

#s1 .pull {
  font-size: 28px;
  line-height: 1.4;
  letter-spacing: -0.5px;
  color: var(--champ);
  max-width: 700px;
  margin-bottom: 0;
}

#s1 .campaign-tag {
  position: absolute;
  bottom: 28px; left: 0; right: 0;
  text-align: center;
  font-size: 10px; font-weight: 600;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--champ);
  opacity: 0.45;
}

#s1 .keys-band {
  position: absolute;
  bottom: 44px; left: 0; right: 0;
  height: 48px;
  overflow: hidden;
  opacity: 0.07;
}

/* ─────────────────────────────────────────────────────────────────────────────
   SLIDE 2 — UNDERSTAND (light)
───────────────────────────────────────────────────────────────────────────── */
#s2 { }

#s2 .keyboard-wrap {
  flex-shrink: 0;
  width: 100%;
  height: 310px;
  overflow: hidden;
  background: var(--navy);
  border-bottom: 3px solid var(--border-iv);
}
#s2 .keyboard-wrap svg { display: block; }

#s2 .text-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 52px 72px 64px;
}
#s2 .step-row {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 28px;
}
#s2 .step-num {
  width: 40px; height: 40px;
  border: 1.5px solid var(--gold);
  border-radius: var(--r);
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 700;
  color: var(--gold);
  flex-shrink: 0;
}
#s2 .headline {
  font-size: 52px;
  font-weight: 400;
  color: var(--navy);
  line-height: 1.15;
  letter-spacing: -0.5px;
  margin-bottom: 24px;
}
#s2 .body {
  font-size: 17px;
  line-height: 1.65;
  color: var(--muted);
  max-width: 780px;
  margin-bottom: 0;
}
#s2 .npt-mark {
  position: absolute;
  bottom: 22px; left: 40px;
  display: flex; flex-direction: column;
  line-height: 1;
}
#s2 .npt-mark .mark-text {
  font-family: 'Kaisei Decol', serif;
  font-size: 18px; font-weight: 400;
  color: var(--gold);
}
#s2 .npt-mark .mark-sub {
  font-size: 8px; font-weight: 600;
  letter-spacing: 0.16em; text-transform: uppercase;
  color: var(--muted); margin-top: 3px;
}

/* ─────────────────────────────────────────────────────────────────────────────
   SLIDE 3 — CHECK TONE (dark)
───────────────────────────────────────────────────────────────────────────── */
#s3 { }

#s3 .strings-wrap {
  flex-shrink: 0;
  width: 100%;
  height: 360px;
  overflow: hidden;
  background: var(--navy-alt);
  display: flex;
  align-items: center;
  justify-content: center;
  border-bottom: 2px solid rgba(248,216,164,0.15);
}

#s3 .text-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 44px 72px 64px;
}
#s3 .step-row {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 24px;
}
#s3 .step-num {
  width: 40px; height: 40px;
  border: 1.5px solid rgba(248,216,164,0.5);
  border-radius: var(--r);
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 700;
  color: var(--champ);
  flex-shrink: 0;
}
#s3 .headline {
  font-size: 52px;
  font-weight: 400;
  color: #fff;
  line-height: 1.15;
  letter-spacing: -0.5px;
  margin-bottom: 22px;
}
#s3 .body {
  font-size: 17px;
  line-height: 1.65;
  color: rgba(255,255,255,0.62);
  max-width: 780px;
}
#s3 .npt-mark {
  position: absolute; bottom: 22px; left: 40px;
}
#s3 .npt-mark .mark-text {
  font-family: 'Kaisei Decol', serif; font-size: 18px;
  color: var(--champ); opacity: 0.7;
}
#s3 .npt-mark .mark-sub {
  font-size: 8px; font-weight: 600;
  letter-spacing: 0.16em; text-transform: uppercase;
  color: rgba(255,255,255,0.3); margin-top: 3px;
}

/* ─────────────────────────────────────────────────────────────────────────────
   SLIDE 4 — ADVISE (light)
───────────────────────────────────────────────────────────────────────────── */
#s4 { }

#s4 .room-wrap {
  flex-shrink: 0;
  width: 100%;
  height: 380px;
  overflow: hidden;
  background: var(--ivory);
  border-bottom: 1px solid var(--border-iv);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px 40px 0;
}

#s4 .text-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 44px 72px 64px;
}
#s4 .headline {
  font-size: 50px;
  font-weight: 400;
  color: var(--navy);
  line-height: 1.15;
  letter-spacing: -0.5px;
  margin-bottom: 22px;
}
#s4 .body {
  font-size: 17px; line-height: 1.65;
  color: var(--muted); max-width: 780px;
}
#s4 .npt-mark { position: absolute; bottom: 22px; left: 40px; }
#s4 .npt-mark .mark-text {
  font-family: 'Kaisei Decol', serif; font-size: 18px; color: var(--gold);
}
#s4 .npt-mark .mark-sub {
  font-size: 8px; font-weight: 600;
  letter-spacing: 0.16em; text-transform: uppercase;
  color: var(--muted); margin-top: 3px;
}

/* ─────────────────────────────────────────────────────────────────────────────
   SLIDE 5 — FULL SERVICE (dark)
───────────────────────────────────────────────────────────────────────────── */
#s5 {
  padding: 72px 72px 80px;
  justify-content: space-between;
}

#s5 .header { margin-bottom: 44px; }
#s5 .header .eyebrow { margin-bottom: 16px; }
#s5 .header .headline {
  font-size: 46px; font-weight: 400;
  color: #fff;
  line-height: 1.15; letter-spacing: -0.5px;
}

#s5 .services {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 28px;
  flex: 1;
}

#s5 .svc-card {
  background: var(--navy-alt);
  border: 1px solid var(--border-d);
  border-radius: var(--r);
  box-shadow: var(--shadow-str);
  padding: 32px 32px 36px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

#s5 .svc-icon {
  width: 44px; height: 44px;
  color: var(--champ);
}
#s5 .svc-icon svg { width: 44px; height: 44px; stroke: var(--champ); stroke-width: 1.75; fill: none; }

#s5 .svc-name {
  font-family: 'Kaisei Decol', serif;
  font-size: 26px; font-weight: 400;
  color: #fff;
  line-height: 1.2;
}
#s5 .svc-body {
  font-size: 15px; line-height: 1.6;
  color: rgba(255,255,255,0.55);
}
#s5 .svc-card .rule {
  width: 32px; height: 1px;
  background: var(--champ);
  opacity: 0.4;
}

/* ─────────────────────────────────────────────────────────────────────────────
   SLIDE 6 — FEATURED PIANO (dark)
───────────────────────────────────────────────────────────────────────────── */
#s6 {
  padding: 0;
  justify-content: flex-end;
  align-items: stretch;
}

#s6 .piano-hero {
  position: absolute;
  top: 48px; left: 50%; transform: translateX(-50%);
  width: 700px; height: 560px;
  overflow: hidden;
  display: flex; align-items: flex-end; justify-content: center;
}

#s6 .featured-label {
  position: absolute;
  top: 52px; left: 72px;
}

#s6 .text-panel {
  background: var(--navy-alt);
  border-top: 1px solid rgba(248,216,164,0.2);
  padding: 40px 72px 56px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  z-index: 1;
}
#s6 .piano-type {
  font-size: 13px; font-weight: 600;
  letter-spacing: 0.22em; text-transform: uppercase;
  color: var(--champ); opacity: 0.75;
}
#s6 .piano-name {
  font-family: 'Kaisei Decol', serif;
  font-size: 52px; font-weight: 400;
  color: #fff; letter-spacing: -0.5px;
  line-height: 1.1;
}
#s6 .campaign-pill {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  border: 1px solid rgba(248,216,164,0.35);
  border-radius: 40px;
  padding: 7px 22px;
  font-size: 11px; font-weight: 600;
  letter-spacing: 0.18em; text-transform: uppercase;
  color: var(--champ); opacity: 0.8;
}

/* ─────────────────────────────────────────────────────────────────────────────
   SLIDE 7 — LOCATION (light)
───────────────────────────────────────────────────────────────────────────── */
#s7 { }

#s7 .top-band {
  background: var(--navy);
  padding: 52px 72px 44px;
  display: flex; flex-direction: column; gap: 0;
}
#s7 .top-band .eyebrow { color: var(--champ); opacity: 0.75; margin-bottom: 20px; }
#s7 .top-band .headline {
  font-family: 'Kaisei Decol', serif;
  font-size: 52px; font-weight: 400;
  color: #fff; line-height: 1.1; letter-spacing: -0.5px;
}
#s7 .top-band .address-row {
  display: flex; align-items: flex-start; gap: 10px;
  margin-top: 18px;
}
#s7 .top-band .address-row svg {
  width: 20px; height: 20px; stroke: var(--champ); stroke-width: 1.75;
  flex-shrink: 0; margin-top: 3px;
}
#s7 .top-band .address {
  font-size: 18px; font-weight: 600;
  color: rgba(255,255,255,0.82);
  line-height: 1.4;
}

#s7 .content-panel {
  flex: 1;
  background: var(--ivory);
  padding: 44px 72px 64px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}
#s7 .visit-text {
  font-family: 'Kaisei Decol', serif;
  font-size: 38px; font-weight: 400;
  color: var(--navy); line-height: 1.25;
  letter-spacing: -0.3px;
  max-width: 780px;
}
#s7 .contact-row {
  display: flex; gap: 40px; align-items: center;
  flex-wrap: wrap;
}
#s7 .contact-item {
  display: flex; align-items: center; gap: 10px;
}
#s7 .contact-item svg {
  width: 18px; height: 18px; stroke: var(--gold); stroke-width: 2;
  fill: none; flex-shrink: 0;
}
#s7 .contact-item span {
  font-size: 15px; font-weight: 600;
  color: var(--navy);
  letter-spacing: 0.02em;
}
#s7 .npt-mark { position: absolute; bottom: 22px; left: 40px; }
#s7 .npt-mark .mark-text {
  font-family: 'Kaisei Decol', serif; font-size: 18px; color: var(--gold);
}
#s7 .npt-mark .mark-sub {
  font-size: 8px; font-weight: 600;
  letter-spacing: 0.16em; text-transform: uppercase;
  color: var(--muted); margin-top: 3px;
}

/* ─────────────────────────────────────────────────────────────────────────────
   SLIDE 8 — CTA (dark)
───────────────────────────────────────────────────────────────────────────── */
#s8 {
  justify-content: center;
  align-items: center;
  padding: 72px;
  gap: 0;
}
#s8 .logo-area {
  display: flex; flex-direction: column;
  align-items: center;
  margin-bottom: 44px;
}
#s8 .logo-area img {
  width: 120px; height: 120px; object-fit: contain;
  margin-bottom: 12px;
}
#s8 .logo-area .wordmark {
  font-family: 'Kaisei Decol', serif;
  font-size: 16px; font-weight: 400;
  color: rgba(255,255,255,0.6);
  letter-spacing: 0.06em;
}

#s8 .rule { width: 80px; height: 1px; background: var(--champ); opacity: 0.4; margin-bottom: 44px; }

#s8 .eyebrow { margin-bottom: 18px; text-align: center; }

#s8 .headline {
  font-size: 62px; font-weight: 400;
  color: #fff; line-height: 1.1;
  letter-spacing: -1px;
  text-align: center;
  margin-bottom: 48px;
}

#s8 .phones {
  display: flex; flex-direction: column;
  align-items: center;
  gap: 18px;
  width: 100%;
  max-width: 520px;
}

#s8 .phone-pill {
  display: flex; align-items: center; gap: 16px;
  border: 1px solid rgba(248,216,164,0.3);
  border-radius: var(--r);
  padding: 16px 36px;
  width: 100%;
  background: rgba(248,216,164,0.05);
}
#s8 .phone-pill svg {
  width: 22px; height: 22px;
  stroke: var(--champ); stroke-width: 1.75;
  flex-shrink: 0; fill: none;
}
#s8 .phone-pill .num {
  font-family: 'Kaisei Decol', serif;
  font-size: 28px; font-weight: 400;
  color: #fff; letter-spacing: 0.04em;
}

#s8 .footer-tag {
  position: absolute;
  bottom: 22px; left: 0; right: 0;
  text-align: center;
  font-size: 10px; font-weight: 600;
  letter-spacing: 0.2em; text-transform: uppercase;
  color: var(--champ); opacity: 0.35;
}

/* ── Print / isolate ──────────────────────────── */
@media print {
  body { background:#fff; }
  .slide { margin:0; page-break-after:always; }
}
</style>
</head>
<body>

<!-- ═══════════════════════════════════════
     SLIDE 1 — COVER
══════════════════════════════════════════ -->
<div class="slide dark" id="s1" data-slide="1">
  <div class="inner">
    <div class="crest-wrap">
      <img src="${logoB64}" class="npt-crest" alt="NPT">
    </div>
    <div class="eyebrow">Why Buy Through</div>
    <h1 class="headline display">Nairobi Piano<br>Technicians?</h1>
    <div class="rule"></div>
    <p class="pull pullquote">"Because a piano needs<br>more than a price tag."</p>
  </div>
  <div class="keys-band">
    ${pianoKeyboardSvg({ width: 1080, height: 48 })}
  </div>
  <div class="campaign-tag">Every Piano Has a Voice &nbsp;·&nbsp; Week 1 &nbsp;·&nbsp; June 2026</div>
  <div class="champ-bar"></div>
  <div class="slide-num">1 / 8</div>
</div>

<!-- ═══════════════════════════════════════
     SLIDE 2 — UNDERSTAND (light)
══════════════════════════════════════════ -->
<div class="slide light" id="s2" data-slide="2">
  <div class="keyboard-wrap">${keyboard}</div>
  <div class="text-body">
    <div class="step-row">
      <div class="step-num">01</div>
      <div class="eyebrow">Understand</div>
    </div>
    <h2 class="headline display">We help you understand<br>the piano before you buy.</h2>
    <p class="body">Our technicians walk you through every instrument — its tone, touch, action, and condition — so you make an informed decision, not just a price comparison.</p>
  </div>
  <div class="npt-mark">
    <div class="mark-text">NPT</div>
    <div class="mark-sub">Nairobi Piano Technicians</div>
  </div>
  <div class="champ-bar"></div>
  <div class="slide-num">2 / 8</div>
</div>

<!-- ═══════════════════════════════════════
     SLIDE 3 — CHECK TONE (dark)
══════════════════════════════════════════ -->
<div class="slide dark" id="s3" data-slide="3">
  <div class="strings-wrap">${strings}</div>
  <div class="text-body">
    <div class="step-row">
      <div class="step-num">02</div>
      <div class="eyebrow">Assessment</div>
    </div>
    <h2 class="headline display">We check tone,<br>touch, and condition.</h2>
    <p class="body">Every string, hammer, and damper is evaluated. A piano that sounds wrong or feels stiff may need work you don't want to inherit unknowingly.</p>
  </div>
  <div class="npt-mark">
    <div class="mark-text" style="font-family:'Kaisei Decol',serif;font-size:18px;color:var(--champ);opacity:.7">NPT</div>
    <div class="mark-sub" style="font-size:8px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.3);margin-top:3px">Nairobi Piano Technicians</div>
  </div>
  <div class="champ-bar"></div>
  <div class="slide-num">3 / 8</div>
</div>

<!-- ═══════════════════════════════════════
     SLIDE 4 — ADVISE (light)
══════════════════════════════════════════ -->
<div class="slide light" id="s4" data-slide="4">
  <div class="room-wrap">${roomSvg}</div>
  <div class="text-body">
    <div class="step-row">
      <div class="step-num">03</div>
      <div class="eyebrow">Guidance</div>
    </div>
    <h2 class="headline display">We advise based on<br>your space and needs.</h2>
    <p class="body">Room acoustics, available floor area, humidity, and how the piano will be used all affect the right choice. We help you match the instrument to your environment.</p>
  </div>
  <div class="npt-mark">
    <div class="mark-text">NPT</div>
    <div class="mark-sub">Nairobi Piano Technicians</div>
  </div>
  <div class="champ-bar"></div>
  <div class="slide-num">4 / 8</div>
</div>

<!-- ═══════════════════════════════════════
     SLIDE 5 — FULL SERVICE (dark)
══════════════════════════════════════════ -->
<div class="slide dark" id="s5" data-slide="5">
  <div class="header">
    <div class="eyebrow">Steps 4 – 6</div>
    <h2 class="headline display">We support you long<br>after the sale.</h2>
  </div>
  <div class="services">
    <div class="svc-card">
      <div class="svc-icon"><svg viewBox="0 0 24 24"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>
      <div class="rule"></div>
      <div class="svc-name">Tuning &amp;<br>Pitch Raising</div>
      <div class="svc-body">Stable, musical tunings by a PTG-certified technician. Regular tuning is essential for every piano.</div>
    </div>
    <div class="svc-card">
      <div class="svc-icon"><svg viewBox="0 0 24 24"><rect x="1" y="3" width="15" height="13" rx="2"/><path d="m16 8 5 2v7h-5"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg></div>
      <div class="rule"></div>
      <div class="svc-name">Piano Moving<br>&amp; Delivery</div>
      <div class="svc-body">Careful, experienced moving teams. A piano is fragile in transit — trust the specialists.</div>
    </div>
    <div class="svc-card">
      <div class="svc-icon"><svg viewBox="0 0 24 24"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg></div>
      <div class="rule"></div>
      <div class="svc-name">Repairs &amp;<br>Restoration</div>
      <div class="svc-body">Full structural work: action, strings, soundboard, pinblock, and cabinet refinishing.</div>
    </div>
    <div class="svc-card">
      <div class="svc-icon"><svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg></div>
      <div class="rule"></div>
      <div class="svc-name">Long-Term<br>Care</div>
      <div class="svc-body">Sales come with up to a 5-year guarantee and free tuning. We stay with you after the purchase.</div>
    </div>
  </div>
  <div class="champ-bar"></div>
  <div class="slide-num">5 / 8</div>
</div>

<!-- ═══════════════════════════════════════
     SLIDE 6 — FEATURED PIANO (dark)
══════════════════════════════════════════ -->
<div class="slide dark" id="s6" data-slide="6">
  <div class="featured-label eyebrow" style="color:var(--champ);opacity:.6;font-size:11px;letter-spacing:.28em">Featured This Week</div>

  <!-- Detailed upright piano SVG -->
  <div class="piano-hero">
    <svg xmlns="http://www.w3.org/2000/svg" width="580" height="540" viewBox="0 0 580 540">
      <!-- Cabinet body -->
      <rect x="40" y="22" width="500" height="448" rx="4" fill="#031732" stroke="rgba(248,216,164,0.35)" stroke-width="1.5"/>
      <!-- Top lid -->
      <rect x="40" y="22" width="500" height="52" rx="4" fill="#021321"/>
      <rect x="40" y="66" width="500" height="6" fill="rgba(248,216,164,0.2)"/>
      <!-- Music desk -->
      <rect x="100" y="72" width="380" height="8" rx="2" fill="#021321" stroke="rgba(248,216,164,0.2)" stroke-width="1"/>
      <!-- Fallboard (keyboard lid) closed area -->
      <rect x="55" y="80" width="470" height="18" rx="2" fill="rgba(248,216,164,0.07)"/>
      <!-- Keyboard frame -->
      <rect x="55" y="98" width="470" height="20" rx="1" fill="#021321" stroke="rgba(248,216,164,0.15)" stroke-width="1"/>
      <!-- White keys - 15 keys -->
      ${Array.from({length:15},(_,i)=>{
        const x=55+i*31.3
        return `<rect x="${x.toFixed(1)}" y="118" width="29.8" height="108" rx="0 0 3 3" fill="#f9f4ef" stroke="#c8c0b4" stroke-width="0.8"/>`
      }).join('')}
      <!-- Black keys -->
      ${[0.65,1.65,3.65,4.65,5.65,7.65,8.65,10.65,11.65,12.65].map(pos=>{
        const x=55+pos*31.3-9.4
        return `<rect x="${x.toFixed(1)}" y="118" width="18.8" height="68" rx="2" fill="#021321"/>`
      }).join('')}
      <!-- Keyboard base -->
      <rect x="55" y="226" width="470" height="14" rx="1" fill="#021321" stroke="rgba(248,216,164,0.12)" stroke-width="1"/>
      <!-- String section (decorative lines) -->
      <rect x="55" y="240" width="470" height="180" fill="#020d1c"/>
      ${Array.from({length:28},(_,i)=>{
        const x=70+i*16+Math.random()*2
        const opacity=0.06+i/28*0.18
        return `<line x1="${x.toFixed(0)}" y1="240" x2="${x.toFixed(0)}" y2="420" stroke="rgba(248,216,164,${opacity.toFixed(2)})" stroke-width="${(0.6+i/28*1.4).toFixed(1)}"/>`
      }).join('')}
      <!-- Bridge line -->
      <rect x="55" y="380" width="470" height="5" fill="rgba(248,216,164,0.25)" rx="1"/>
      <!-- NPT badge on nameboard -->
      <rect x="220" y="250" width="140" height="28" rx="var(--r)" fill="rgba(248,216,164,0.1)" stroke="rgba(248,216,164,0.3)" stroke-width="1"/>
      <text x="290" y="269" text-anchor="middle" font-family="'Kaisei Decol',serif" font-size="13" fill="#f8d8a4" font-weight="400" letter-spacing="2">NPT</text>
      <!-- Lower panel -->
      <rect x="55" y="420" width="470" height="50" rx="1" fill="#021321" stroke="rgba(248,216,164,0.1)" stroke-width="1"/>
      <!-- Pedals -->
      <rect x="221" y="448" width="34" height="10" rx="3" fill="rgba(248,216,164,0.55)"/>
      <rect x="263" y="448" width="34" height="10" rx="3" fill="rgba(248,216,164,0.55)"/>
      <rect x="305" y="448" width="34" height="10" rx="3" fill="rgba(248,216,164,0.55)"/>
      <!-- Pedal lyre -->
      <rect x="217" y="458" width="146" height="4" rx="2" fill="rgba(248,216,164,0.2)"/>
      <!-- Legs -->
      <rect x="55" y="470" width="28" height="68" rx="3" fill="#021321" stroke="rgba(248,216,164,0.2)" stroke-width="1"/>
      <rect x="497" y="470" width="28" height="68" rx="3" fill="#021321" stroke="rgba(248,216,164,0.2)" stroke-width="1"/>
    </svg>
  </div>

  <div class="text-panel">
    <div class="piano-type">Yamaha Series · Upright</div>
    <div class="piano-name display">Yamaha U1 Upright</div>
    <div class="campaign-pill">Every Piano Has a Voice</div>
  </div>
  <div class="champ-bar"></div>
  <div class="slide-num">6 / 8</div>
</div>

<!-- ═══════════════════════════════════════
     SLIDE 7 — LOCATION (light)
══════════════════════════════════════════ -->
<div class="slide light" id="s7" data-slide="7">
  <div class="top-band">
    <div class="eyebrow">Where to Find Us</div>
    <h2 class="headline display">Lower Kabete Road,<br>Kabete, Nairobi.</h2>
    <div class="address-row">
      <svg viewBox="0 0 24 24" fill="none"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
      <span class="address">Opposite Kabete Shops &nbsp;·&nbsp; Easy access from Nairobi CBD</span>
    </div>
  </div>

  <div class="content-panel">
    <p class="visit-text display">Visit NPT and experience<br>the piano in person.<br><span style="font-size:28px;opacity:.65">Karibu!</span></p>
    <div class="contact-row">
      <div class="contact-item">
        <svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.4 2 2 0 0 1 3.6 1.22h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.96a16 16 0 0 0 6.07 6.07l.95-.96a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 21.73 16.92z" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <span>+254 722 873 237</span>
      </div>
      <div class="contact-item">
        <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <span>+254 722 219 775</span>
      </div>
      <div class="contact-item">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke-linecap="round"/><path d="M12 8v4l3 3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <span>Mon–Sat · 8 am – 5 pm</span>
      </div>
    </div>
  </div>
  <div class="npt-mark">
    <div class="mark-text">NPT</div>
    <div class="mark-sub">Nairobi Piano Technicians</div>
  </div>
  <div class="champ-bar"></div>
  <div class="slide-num">7 / 8</div>
</div>

<!-- ═══════════════════════════════════════
     SLIDE 8 — CTA (dark)
══════════════════════════════════════════ -->
<div class="slide dark" id="s8" data-slide="8">
  <div class="logo-area">
    <img src="${logoB64}" class="npt-crest" alt="NPT">
    <div class="wordmark">Nairobi Piano Technicians</div>
  </div>
  <div class="rule"></div>
  <div class="eyebrow">Get in Touch</div>
  <h2 class="headline display">Call or WhatsApp<br>NPT Today</h2>
  <div class="phones">
    <div class="phone-pill">
      <svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.4 2 2 0 0 1 3.6 1.22h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.96a16 16 0 0 0 6.07 6.07l.95-.96a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 21.73 16.92z" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <span class="num">+254 722 873 237</span>
    </div>
    <div class="phone-pill">
      <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <span class="num">+254 722 219 775</span>
    </div>
  </div>
  <div class="footer-tag">nairobipianotechnicians.com &nbsp;·&nbsp; Lower Kabete Road, Nairobi &nbsp;·&nbsp; PTG Member</div>
  <div class="champ-bar"></div>
  <div class="slide-num">8 / 8</div>
</div>

<script>
const p = new URLSearchParams(location.search), s = p.get('slide')
if (s) {
  document.querySelectorAll('.slide').forEach((el,i) => {
    el.style.display = i+1 === +s ? 'flex' : 'none'
  })
  document.body.style.background = 'transparent'
}
</script>
</body>
</html>`
}

main().catch(e => { console.error(e); process.exit(1) })
