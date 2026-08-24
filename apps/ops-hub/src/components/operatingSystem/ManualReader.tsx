'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Download, ChevronRight, ArrowUpRight, Info, TriangleAlert,
  History, BookOpen, List, X, Users,
} from 'lucide-react'
import type { ManualBlock, ManualChapter, ManualDocument } from '@/lib/operatingSystem/model'
import type { DynamicSection } from '@/lib/operatingSystem/dynamic'

export interface ManualMeta {
  slug: string
  entity: string
  versionNo: number
  statusLabel: string
  status: string
  generatedAt: string
  sourceSummary: string
}

/**
 * The Operating System reader (§5).
 *
 * A long-form document, not a card grid: a manager should be comfortable
 * reading twenty-plus sections here. Sticky chapter navigation on desktop, a
 * drawer on mobile. Every block kind in the model has a renderer — the same
 * document the PDF renderer receives.
 */
export function ManualReader({
  doc, meta, dynamic, knowledgeLinks,
}: {
  doc: ManualDocument
  meta: ManualMeta
  dynamic: Record<string, DynamicSection>
  /** Knowledge title → entry id, for the documents this manual references. */
  knowledgeLinks: Record<string, string>
}) {
  const [tocOpen, setTocOpen] = useState(false)

  return (
    <div className="space-y-5">
      <Link href="/operating-system" className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700">
        <ArrowLeft size={13} /> Operating System
      </Link>

      {/* ── Metadata header ─────────────────────────────────────────── */}
      <header className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ocg-gold">{meta.entity}</p>
        <h1 className="mt-1 text-3xl font-semibold leading-tight text-gray-900">{doc.title}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-gray-600">{doc.intro}</p>

        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-gray-500">
          <span className="font-medium">Version {meta.versionNo}</span>
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            meta.status === 'current' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
          }`}>{meta.statusLabel}</span>
          <span>· Generated {meta.generatedAt}</span>
          <span>· {doc.chapters.length} chapters</span>
        </div>

        {meta.sourceSummary && (
          <p className="mt-3 rounded-lg bg-gray-50 p-3 text-xs leading-relaxed text-gray-500">
            <strong className="text-gray-600">Sources.</strong> {meta.sourceSummary}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href={`/api/operating-system/${meta.slug}/pdf`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            <Download size={14} /> Download PDF
          </a>
          <button
            onClick={() => setTocOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:border-ocg-gold/40 lg:hidden"
          >
            <List size={14} /> Contents
          </button>
        </div>
      </header>

      <div className="lg:grid lg:grid-cols-[240px_1fr] lg:gap-6">
        {/* ── Sticky contents (desktop) ─────────────────────────────── */}
        <nav className="hidden lg:block">
          <div className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Contents</p>
            <ol className="space-y-0.5">
              {doc.chapters.map((c, i) => (
                <li key={c.id}>
                  <a
                    href={`#${c.id}`}
                    className="flex gap-2 rounded px-2 py-1.5 text-xs leading-snug text-gray-600 hover:bg-gray-50 hover:text-ocg-gold"
                  >
                    <span className="shrink-0 tabular-nums text-gray-300">{i + 1}</span>
                    <span>{c.title}</span>
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </nav>

        {/* ── Contents drawer (mobile) ──────────────────────────────── */}
        {tocOpen && (
          <div className="fixed inset-0 z-50 flex items-end bg-black/40 lg:hidden" onClick={() => setTocOpen(false)}>
            <div
              className="flex max-h-[80vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-5 py-4">
                <p className="text-sm font-semibold text-gray-900">Contents</p>
                <button onClick={() => setTocOpen(false)} className="rounded p-1 text-gray-400" aria-label="Close">
                  <X size={18} />
                </button>
              </div>
              <ol className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
                {doc.chapters.map((c, i) => (
                  <li key={c.id}>
                    <a
                      href={`#${c.id}`}
                      onClick={() => setTocOpen(false)}
                      className="flex gap-2 rounded px-2 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <span className="shrink-0 tabular-nums text-gray-300">{i + 1}</span>
                      <span>{c.title}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}

        {/* ── The manual ────────────────────────────────────────────── */}
        <main className="min-w-0 space-y-6">
          {doc.chapters.map((chapter, index) => (
            <Chapter
              key={chapter.id}
              chapter={chapter}
              number={index + 1}
              dynamic={dynamic}
              knowledgeLinks={knowledgeLinks}
            />
          ))}
        </main>
      </div>
    </div>
  )
}

function Chapter({
  chapter, number, dynamic, knowledgeLinks,
}: {
  chapter: ManualChapter
  number: number
  dynamic: Record<string, DynamicSection>
  knowledgeLinks: Record<string, string>
}) {
  return (
    <section id={chapter.id} className="scroll-mt-4 rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="mb-4 border-b border-gray-100 pb-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-300">Chapter {number}</p>
        <h2 className="mt-0.5 text-xl font-semibold text-gray-900">{chapter.title}</h2>
        {chapter.summary && <p className="mt-1 text-sm text-gray-500">{chapter.summary}</p>}
      </div>
      <div className="space-y-4">
        {chapter.blocks.map((block, i) => (
          <Block key={i} block={block} dynamic={dynamic} knowledgeLinks={knowledgeLinks} />
        ))}
      </div>
    </section>
  )
}

function Block({
  block, dynamic, knowledgeLinks,
}: {
  block: ManualBlock
  dynamic: Record<string, DynamicSection>
  knowledgeLinks: Record<string, string>
}) {
  switch (block.kind) {
    case 'paragraph':
      return <p className="text-[15px] leading-relaxed text-gray-700">{block.text}</p>

    case 'list':
      return block.ordered ? (
        <ol className="ml-5 list-decimal space-y-1.5 text-[15px] leading-relaxed text-gray-700 marker:text-gray-300">
          {block.items.map((item, i) => <li key={i} className="pl-1">{item}</li>)}
        </ol>
      ) : (
        <ul className="ml-5 list-disc space-y-1.5 text-[15px] leading-relaxed text-gray-700 marker:text-gray-300">
          {block.items.map((item, i) => <li key={i} className="pl-1">{item}</li>)}
        </ul>
      )

    case 'flow':
      return (
        <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-4">
          {block.title && (
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">{block.title}</p>
          )}
          <ol className="space-y-1">
            {block.steps.map((step, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-semibold tabular-nums text-gray-500 ring-1 ring-gray-200">
                  {i + 1}
                </span>
                <span className="leading-snug">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )

    case 'control':
      return (
        <dl className="overflow-hidden rounded-lg border border-gray-100">
          {block.rows.map((row, i) => (
            <div key={i} className={`grid gap-1 px-4 py-2.5 sm:grid-cols-[150px_1fr] sm:gap-4 ${
              i % 2 === 0 ? 'bg-gray-50/50' : 'bg-white'
            }`}>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{row.label}</dt>
              <dd className="text-sm leading-relaxed text-gray-700">{row.value}</dd>
            </div>
          ))}
        </dl>
      )

    case 'callout': {
      const tone = {
        note: { box: 'border-blue-100 bg-blue-50/60 text-blue-900', icon: <Info size={15} className="text-blue-500" /> },
        warning: { box: 'border-amber-200 bg-amber-50 text-amber-900', icon: <TriangleAlert size={15} className="text-amber-600" /> },
        legacy: { box: 'border-purple-200 bg-purple-50/70 text-purple-900', icon: <History size={15} className="text-purple-600" /> },
      }[block.tone]
      return (
        <div className={`flex gap-2.5 rounded-lg border p-4 ${tone.box}`}>
          <span className="mt-0.5 shrink-0">{tone.icon}</span>
          <div className="min-w-0">
            {block.title && <p className="mb-1 text-sm font-semibold">{block.title}</p>}
            <p className="text-sm leading-relaxed">{block.text}</p>
          </div>
        </div>
      )
    }

    case 'systemLink':
      return (
        <Link
          href={block.href}
          className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 px-4 py-3 transition-colors hover:border-ocg-gold/40"
        >
          <span className="min-w-0">
            <span className="block text-sm font-medium text-gray-800">{block.label}</span>
            {block.description && <span className="mt-0.5 block text-xs text-gray-400">{block.description}</span>}
          </span>
          <ArrowUpRight size={15} className="shrink-0 text-gray-300" />
        </Link>
      )

    case 'knowledge':
      return (
        <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-4">
          <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            <BookOpen size={12} /> Related Knowledge
          </p>
          <ul className="space-y-1">
            {block.titles.map((title) => {
              const id = knowledgeLinks[title]
              return (
                <li key={title}>
                  {id ? (
                    <Link href={`/knowledge/${id}`} className="inline-flex items-center gap-1 text-sm text-ocg-navy hover:text-ocg-gold">
                      {title} <ChevronRight size={13} className="text-gray-300" />
                    </Link>
                  ) : (
                    // The document is not in this reader's scope, or does not
                    // exist yet. Naming it without a dead link is more honest
                    // than linking somewhere they cannot open.
                    <span className="text-sm text-gray-400">{title} · not available in your scope</span>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )

    case 'dynamic': {
      const section = dynamic[block.source]
      return (
        <div className="rounded-lg border border-gray-100 p-4">
          <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-ocg-gold">
            <Users size={12} /> {block.title}
          </p>
          {block.description && <p className="mb-2.5 text-xs text-gray-400">{block.description}</p>}
          {!section || section.rows.length === 0 ? (
            <p className="rounded bg-gray-50 p-3 text-xs leading-relaxed text-gray-500">
              {section?.emptyMessage ?? 'Nothing recorded yet.'}
            </p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {section.rows.map((row, i) => (
                <li key={i} className="flex flex-wrap items-baseline justify-between gap-2 py-1.5">
                  <span className="text-sm font-medium text-gray-800">{row.label}</span>
                  <span className="text-xs text-gray-500">{row.detail}</span>
                  {row.meta && <span className="text-[11px] text-gray-400">{row.meta}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )
    }
  }
}
