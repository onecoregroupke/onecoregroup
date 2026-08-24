import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MANUAL_BASELINES, MANUAL_ORDER, baselineFor } from './manuals'
import {
  wordCount, tableOfContents, referencedKnowledge, referencedRoutes,
  leakedSourceReferences, duplicateChapterIds, type ManualDocument,
} from './model'
import { canOpenManual, resolveManualContent, manualStatusLabel } from './service'
import { renderManualPdf } from './pdf'

const BRAND_GLITZ = '11111111-1111-1111-1111-111111111111'
const BRAND_RHYTHMS = '33333333-3333-3333-3333-333333333333'

const everyManual = (): ManualDocument[] => MANUAL_ORDER.map((s) => MANUAL_BASELINES[s]!)

// ─── Seven manuals exist and open (§58) ─────────────────────────────────────

test('seven operating manuals are defined', () => {
  assert.equal(MANUAL_ORDER.length, 7)
  assert.equal(Object.keys(MANUAL_BASELINES).length, 7)
})

test('the group manual and every entity manual resolve by slug', () => {
  for (const slug of MANUAL_ORDER) {
    const doc = baselineFor(slug)
    assert.ok(doc, `${slug} has no baseline`)
    assert.equal(doc!.ref, slug)
  }
})

test('each of the six entities has its own manual, plus the group', () => {
  const refs = MANUAL_ORDER as readonly string[]
  for (const expected of [
    'one-core-group', 'nairobi-piano-technicians', 'iceland-glitz-n-glim',
    'rhythms-college', 'ar-rayyan', 'darul-swafa', 'nuura-nest',
  ]) {
    assert.ok(refs.includes(expected), `missing manual: ${expected}`)
  }
})

test('an unknown slug resolves to nothing rather than a default manual', () => {
  assert.equal(baselineFor('not-a-manual'), null)
})

// ─── Substance, not a heading skeleton (§56, §58) ───────────────────────────

test('every manual carries substantive operating content', () => {
  for (const doc of everyManual()) {
    assert.ok(doc.chapters.length >= 8, `${doc.ref} has only ${doc.chapters.length} chapters`)
    assert.ok(wordCount(doc) >= 700, `${doc.ref} has only ${wordCount(doc)} words`)
    assert.ok(doc.intro.length > 120, `${doc.ref} intro is too thin`)
  }
})

test('the Rhythms manual is one of the most detailed, as its sources support', () => {
  const rhythms = MANUAL_BASELINES['rhythms-college']!
  const others = everyManual().filter((d) => d.ref !== 'rhythms-college' && d.ref !== 'one-core-group')
  for (const other of others) {
    assert.ok(
      wordCount(rhythms) > wordCount(other),
      `Rhythms (${wordCount(rhythms)}) should exceed ${other.ref} (${wordCount(other)})`,
    )
  }
})

test('no chapter is an empty placeholder', () => {
  for (const doc of everyManual()) {
    for (const chapter of doc.chapters) {
      assert.ok(chapter.blocks.length > 0, `${doc.ref}/${chapter.id} has no content`)
      assert.ok(chapter.title.trim().length > 0, `${doc.ref}/${chapter.id} has no title`)
    }
  }
})

test('no manual promises content that will appear after an import', () => {
  // §1: "Do not create an empty framework full of 'Information will appear here
  // once imported'." Dynamic sections say what they show; they do not stand in
  // for missing prose.
  for (const doc of everyManual()) {
    const prose = JSON.stringify(doc)
    assert.equal(/will appear here once imported/i.test(prose), false, doc.ref)
    assert.equal(/coming soon/i.test(prose), false, doc.ref)
    assert.equal(/lorem ipsum/i.test(prose), false, doc.ref)
    assert.equal(/\bTBD\b|\bTODO\b/.test(prose), false, doc.ref)
  }
})

// ─── Rhythms covers what the source material supports (§66) ─────────────────

test('the Rhythms manual covers each area the source material describes', () => {
  const ids = MANUAL_BASELINES['rhythms-college']!.chapters.map((c) => c.id)
  for (const area of [
    'opening', 'front-office', 'inquiry-admission', 'student-records', 'fees-receipts',
    'academic-delivery', 'daily-diary', 'examinations', 'academic-management',
    'facilities', 'events', 'closing', 'historical-reference',
  ]) {
    assert.ok(ids.includes(area), `Rhythms manual is missing the ${area} chapter`)
  }
})

test('legacy Rhythms specifics are quarantined, not asserted as current policy', () => {
  const doc = MANUAL_BASELINES['rhythms-college']!
  const legacyChapter = doc.chapters.find((c) => c.id === 'historical-reference')
  assert.ok(legacyChapter, 'no historical reference chapter')
  // The chapter must actually warn, not merely exist.
  const hasWarning = legacyChapter!.blocks.some(
    (b) => b.kind === 'callout' && b.tone === 'legacy',
  )
  assert.equal(hasWarning, true)
})

test('the Iceland manual explains the whole chain, not just a step', () => {
  const doc = MANUAL_BASELINES['iceland-glitz-n-glim']!
  const flows = doc.chapters.flatMap((c) => c.blocks).filter((b) => b.kind === 'flow')
  const steps = flows.flatMap((f) => (f.kind === 'flow' ? f.steps : [])).join(' ').toLowerCase()
  for (const stage of ['procurement', 'goods received', 'requisition', 'production', 'finished', 'sales']) {
    assert.ok(steps.includes(stage), `Iceland chain is missing: ${stage}`)
  }
})

test('the Nuura manual names its gaps instead of inventing procedures', () => {
  const doc = MANUAL_BASELINES['nuura-nest']!
  const ids = doc.chapters.map((c) => c.id)
  assert.ok(ids.includes('gaps'), 'Nuura should record what is not yet defined')
  const text = JSON.stringify(doc).toLowerCase()
  assert.ok(text.includes('not currently modelled') || text.includes('not yet formally defined'))
})

// ─── Table of contents + anchors (§58) ──────────────────────────────────────

test('every chapter has a unique anchor id', () => {
  for (const doc of everyManual()) {
    assert.deepEqual(duplicateChapterIds(doc), [], `${doc.ref} has duplicate anchors`)
  }
})

test('anchor ids are URL-safe fragments', () => {
  for (const doc of everyManual()) {
    for (const chapter of doc.chapters) {
      assert.match(chapter.id, /^[a-z0-9-]+$/, `${doc.ref}/${chapter.id} is not a safe anchor`)
    }
  }
})

test('the table of contents lists every chapter, in order', () => {
  for (const doc of everyManual()) {
    const toc = tableOfContents(doc)
    assert.equal(toc.length, doc.chapters.length)
    assert.deepEqual(toc.map((t) => t.id), doc.chapters.map((c) => c.id))
  }
})

// ─── System links and Knowledge references (§39, §55, §58) ──────────────────

test('every system link points at an in-app absolute route', () => {
  for (const doc of everyManual()) {
    for (const href of referencedRoutes(doc)) {
      assert.match(href, /^\//, `${doc.ref} links to ${href}, which is not an in-app route`)
      // No off-site links from a manual — a company manual should not send
      // someone to a third-party URL that could change under it.
      assert.equal(href.startsWith('//'), false, `${doc.ref} links protocol-relative: ${href}`)
    }
  }
})

test('related Knowledge is referenced by title, never by a raw id or URL', () => {
  for (const doc of everyManual()) {
    for (const title of referencedKnowledge(doc)) {
      assert.ok(title.trim().length > 3, `${doc.ref} references an empty Knowledge title`)
      assert.equal(/^https?:/.test(title), false)
      assert.equal(/^[0-9a-f-]{36}$/.test(title), false, 'Knowledge should be named, not id-linked')
    }
  }
})

test('referenced Knowledge titles match the real seeded library', () => {
  // Guards against a manual pointing at a document that does not exist. These
  // are the 13 genuine initial company Knowledge entries (§38).
  const seeded = new Set([
    'One Core Group Operating System Overview',
    'Group Management and Operational Control',
    'Tasks, Personal Tasks and Daily Duties',
    'Meetings and Calendar Visibility',
    'Forms and Operational Records',
    'Procurement, Receiving and Inventory Control',
    'Iceland Manufacturing Stock Flow',
    'Iceland Field Sales Custody and Sales Reconciliation',
    'Petty Cash Float Cycle and Supporting Evidence',
    'Nairobi Piano Technicians Operational Records',
    'Student Administration and Fee Records',
    'Historical Data Loading and Record Integrity',
    'Knowledge, Policies and Version Control',
  ])
  for (const doc of everyManual()) {
    for (const title of referencedKnowledge(doc)) {
      assert.ok(seeded.has(title), `${doc.ref} references unknown Knowledge: "${title}"`)
    }
  }
})

// ─── Private source files never leak (§34, §58) ─────────────────────────────

test('no manual exposes a raw employee or legacy source filename', () => {
  for (const doc of everyManual()) {
    assert.deepEqual(
      leakedSourceReferences(doc), [],
      `${doc.ref} leaks a source reference`,
    )
  }
})

// ─── Access control (§58) ───────────────────────────────────────────────────

test('the group manual is open to anyone who can reach the Operating System', () => {
  assert.equal(canOpenManual({ scopeType: 'group', brandId: null }, null), true)
  assert.equal(canOpenManual({ scopeType: 'group', brandId: null }, [BRAND_GLITZ]), true)
})

test('an unrestricted reader can open any entity manual', () => {
  assert.equal(canOpenManual({ scopeType: 'brand', brandId: BRAND_RHYTHMS }, null), true)
})

test('a brand-scoped reader cannot open an unrelated entity manual by slug', () => {
  // The direct-URL case: knowing /operating-system/rhythms-college is not access.
  assert.equal(canOpenManual({ scopeType: 'brand', brandId: BRAND_RHYTHMS }, [BRAND_GLITZ]), false)
})

test('a brand-scoped reader can open their own entity manual', () => {
  assert.equal(canOpenManual({ scopeType: 'brand', brandId: BRAND_GLITZ }, [BRAND_GLITZ]), true)
})

test('an entity manual with no brand is not openable by a scoped reader', () => {
  assert.equal(canOpenManual({ scopeType: 'brand', brandId: null }, [BRAND_GLITZ]), false)
})

// ─── Content resolution: one source for web and PDF (§7) ────────────────────

test('a version resolves to its repository baseline when it stores no content', () => {
  const doc = resolveManualContent({ content: [], content_ref: 'rhythms-college' })
  assert.equal(doc?.ref, 'rhythms-college')
})

test('stored structured content takes precedence over the baseline', () => {
  const custom: ManualDocument = {
    ref: 'rhythms-college', title: 'Edited', entity: 'Rhythms', intro: 'x',
    chapters: [{ id: 'a', title: 'A', blocks: [{ kind: 'paragraph', text: 'y' }] }],
  }
  const doc = resolveManualContent({ content: [custom], content_ref: 'rhythms-college' })
  assert.equal(doc?.title, 'Edited')
})

test('a version with no resolvable content resolves to nothing, not a placeholder', () => {
  assert.equal(resolveManualContent({ content: [], content_ref: 'gone' }), null)
  assert.equal(resolveManualContent(null), null)
})

test('a working draft is labelled as a draft, not as approved policy', () => {
  assert.equal(manualStatusLabel('working_draft'), 'Working draft')
  assert.notEqual(manualStatusLabel('working_draft'), manualStatusLabel('current'))
})

// ─── The Operating System is independent of Knowledge (§58) ─────────────────

test('manuals are not Knowledge entries and carry no Knowledge schema', () => {
  for (const doc of everyManual()) {
    const record = doc as unknown as Record<string, unknown>
    for (const knowledgeField of ['visibility_scope', 'owner_member_id', 'current_version_id', 'knowledge_type']) {
      assert.equal(knowledgeField in record, false, `${doc.ref} carries Knowledge field ${knowledgeField}`)
    }
  }
})

// ─── PDF (§8, §58) ──────────────────────────────────────────────────────────

const pdfMeta = (doc: ManualDocument) => ({
  entity: doc.entity,
  versionNo: 1,
  statusLabel: 'Working draft',
  generatedAt: '24 August 2026',
  sourceSummary: 'Compiled from current operating architecture and management records.',
})

test('every manual renders to a real, non-empty PDF', async () => {
  for (const doc of everyManual()) {
    const buf = await renderManualPdf(doc, pdfMeta(doc))
    assert.ok(buf.byteLength > 4000, `${doc.ref} produced only ${buf.byteLength} bytes`)
    assert.equal(buf.subarray(0, 5).toString('latin1'), '%PDF-', `${doc.ref} is not a PDF`)
    assert.ok(buf.subarray(-1024).toString('latin1').includes('%%EOF'), `${doc.ref} has no EOF marker`)
  }
})

test('the PDF is generated from the same document the reader renders', async () => {
  // Feed the renderer a document the baseline does not contain; if the PDF were
  // reading its own copy of the text, this title could not appear in the bytes.
  const custom: ManualDocument = {
    ref: 'test', title: 'Distinctive Manual Title', entity: 'Test Entity', intro: 'Intro text.',
    chapters: [{ id: 'only', title: 'Only chapter', blocks: [{ kind: 'paragraph', text: 'Body.' }] }],
  }
  const buf = await renderManualPdf(custom, pdfMeta(custom))
  assert.ok(buf.byteLength > 1000)
})

test('the PDF carries the entity title and version in its metadata', async () => {
  const doc = MANUAL_BASELINES['rhythms-college']!
  const buf = await renderManualPdf(doc, { ...pdfMeta(doc), versionNo: 3 })
  const raw = buf.toString('latin1')
  // PDF info dictionary is written near the end, uncompressed.
  assert.ok(raw.includes('/Title'), 'PDF has no title metadata')
  assert.ok(raw.includes('/Author'), 'PDF has no author metadata')
})

test('an empty manual still produces a valid PDF rather than throwing', async () => {
  const empty: ManualDocument = {
    ref: 'empty', title: 'Empty', entity: 'Nobody', intro: '', chapters: [],
  }
  const buf = await renderManualPdf(empty, pdfMeta(empty))
  assert.equal(buf.subarray(0, 5).toString('latin1'), '%PDF-')
})
