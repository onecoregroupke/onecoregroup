// The Operating System document model (§§6–7).
//
// ONE structured representation, consumed by BOTH the web reader and the PDF
// renderer. There is deliberately no `webManualText` / `pdfManualText` pair:
// two texts describing the same procedure drift, and the one that drifts is
// always the one nobody is reading when it matters.
//
// The content is DATA, not markup and not prose-with-HTML-in-it, so a renderer
// can lay it out for a screen or for A4 without parsing anything.

/** A block of manual content. Every renderer must handle every kind. */
export type ManualBlock =
  /** Ordinary prose. */
  | { kind: 'paragraph'; text: string }
  /** A bulleted or numbered list. */
  | { kind: 'list'; items: string[]; ordered?: boolean }
  /**
   * An ordered operating flow — "requisition → issue → production → QC".
   * Rendered as connected steps rather than bullets, because the ORDER is the
   * information.
   */
  | { kind: 'flow'; title?: string; steps: string[] }
  /**
   * The anatomy of a controlled procedure (§56): purpose, who is responsible,
   * which records prove it happened, what management checks, what happens when
   * it fails, and which part of the Ops Hub supports it.
   */
  | { kind: 'control'; rows: { label: ControlLabel; value: string }[] }
  /** A note, a caution, or clearly-marked historical material (§53). */
  | { kind: 'callout'; tone: 'note' | 'warning' | 'legacy'; title?: string; text: string }
  /** A live link into the actual system, so the manual is usable (§55). */
  | { kind: 'systemLink'; href: string; label: string; description?: string }
  /** A pointer to the atomic Knowledge document behind this chapter (§39). */
  | { kind: 'knowledge'; titles: string[] }
  /**
   * A section filled from current structured data (§§33, 54). The manual stays
   * useful when these are empty — they enrich it, they do not carry it.
   */
  | { kind: 'dynamic'; source: DynamicSource; title: string; description?: string }

export type ControlLabel =
  | 'Purpose'
  | 'Normal flow'
  | 'Responsible'
  | 'Records'
  | 'Management control'
  | 'Escalation'
  | 'In the system'

export type DynamicSource = 'people' | 'duties' | 'authorities' | 'forms' | 'systems'

export interface ManualChapter {
  /** Stable anchor id — used by the table of contents and by PDF bookmarks. */
  id: string
  title: string
  /** One line under the heading, in the contents list, and in the PDF TOC. */
  summary?: string
  blocks: ManualBlock[]
}

export interface ManualDocument {
  /** Matches ocg_operating_system_versions.content_ref. */
  ref: string
  title: string
  /** The entity this manual describes, for headers and the PDF footer. */
  entity: string
  intro: string
  chapters: ManualChapter[]
}

// ─── Helpers used by both renderers ─────────────────────────────────────────

/** Chapters as table-of-contents entries. */
export function tableOfContents(doc: ManualDocument): { id: string; title: string; summary: string }[] {
  return doc.chapters.map((c) => ({ id: c.id, title: c.title, summary: c.summary ?? '' }))
}

/** Every Knowledge document title this manual references (§39). */
export function referencedKnowledge(doc: ManualDocument): string[] {
  const titles = new Set<string>()
  for (const chapter of doc.chapters) {
    for (const block of chapter.blocks) {
      if (block.kind === 'knowledge') block.titles.forEach((t) => titles.add(t))
    }
  }
  return [...titles]
}

/** Every in-app route this manual links to (§55). */
export function referencedRoutes(doc: ManualDocument): string[] {
  const routes = new Set<string>()
  for (const chapter of doc.chapters) {
    for (const block of chapter.blocks) {
      if (block.kind === 'systemLink') routes.add(block.href)
    }
  }
  return [...routes]
}

/**
 * A rough word count, used only to assert in tests that a manual carries real
 * operating content rather than a heading skeleton (§58).
 */
export function wordCount(doc: ManualDocument): number {
  let words = 0
  const count = (text: string) => { words += text.trim().split(/\s+/).filter(Boolean).length }
  count(doc.intro)
  for (const chapter of doc.chapters) {
    count(chapter.title)
    if (chapter.summary) count(chapter.summary)
    for (const block of chapter.blocks) {
      switch (block.kind) {
        case 'paragraph': count(block.text); break
        case 'list': block.items.forEach(count); break
        case 'flow': block.steps.forEach(count); if (block.title) count(block.title); break
        case 'control': block.rows.forEach((r) => count(r.value)); break
        case 'callout': count(block.text); if (block.title) count(block.title); break
        case 'systemLink': count(block.label); if (block.description) count(block.description); break
        case 'knowledge': block.titles.forEach(count); break
        case 'dynamic': count(block.title); if (block.description) count(block.description); break
      }
    }
  }
  return words
}

/**
 * §34 / §8: the raw source documents are private employee records and legacy
 * files. A manual is a professional synthesis of them, and must never leak a
 * source filename into a page or a downloadable PDF.
 *
 * Checked by test over every seeded manual rather than trusted to review.
 */
const FORBIDDEN_SOURCE_PATTERNS = [
  /OCG\s*TEAM/i,
  /sysstem\s*2015/i,
  /\.docx?\b/i,
  /\.zip\b/i,
  /__KREAD_SMOKE_/,
]

export function leakedSourceReferences(doc: ManualDocument): string[] {
  const found: string[] = []
  const scan = (text: string) => {
    for (const pattern of FORBIDDEN_SOURCE_PATTERNS) {
      const match = text.match(pattern)
      if (match) found.push(match[0])
    }
  }
  scan(doc.intro)
  scan(doc.title)
  for (const chapter of doc.chapters) {
    scan(chapter.title)
    if (chapter.summary) scan(chapter.summary)
    for (const block of chapter.blocks) {
      switch (block.kind) {
        case 'paragraph': scan(block.text); break
        case 'list': block.items.forEach(scan); break
        case 'flow': block.steps.forEach(scan); if (block.title) scan(block.title); break
        case 'control': block.rows.forEach((r) => scan(r.value)); break
        case 'callout': scan(block.text); if (block.title) scan(block.title); break
        case 'systemLink': scan(block.label); if (block.description) scan(block.description); break
        case 'knowledge': block.titles.forEach(scan); break
        case 'dynamic': scan(block.title); if (block.description) scan(block.description); break
      }
    }
  }
  return found
}

/** Anchor ids must be unique within a manual or the contents list misnavigates. */
export function duplicateChapterIds(doc: ManualDocument): string[] {
  const seen = new Set<string>()
  const dupes: string[] = []
  for (const chapter of doc.chapters) {
    if (seen.has(chapter.id)) dupes.push(chapter.id)
    seen.add(chapter.id)
  }
  return dupes
}
