'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { HelpCircle, X, ChevronLeft, ChevronRight, Check } from 'lucide-react'
import { tourForPath, type TourStep } from '@/lib/tours'

export function TourLauncher() {
  const path = usePathname()
  const [steps, setSteps] = useState<TourStep[] | null>(null)
  const [label, setLabel] = useState('')
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)

  const active = steps !== null
  const step = steps?.[i]

  const measure = useCallback(() => {
    if (!step?.target) { setRect(null); return }
    const el = document.querySelector(step.target)
    if (!el) { setRect(null); return }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    // Re-read after the smooth scroll settles.
    setRect(el.getBoundingClientRect())
    window.setTimeout(() => {
      const again = document.querySelector(step.target!)
      if (again) setRect(again.getBoundingClientRect())
    }, 320)
  }, [step])

  useEffect(() => { if (active) measure() }, [active, i, measure])

  useEffect(() => {
    if (!active) return
    const onMove = () => measure()
    window.addEventListener('resize', onMove)
    window.addEventListener('scroll', onMove, true)
    return () => {
      window.removeEventListener('resize', onMove)
      window.removeEventListener('scroll', onMove, true)
    }
  }, [active, measure])

  const close = useCallback(() => { setSteps(null); setI(0); setRect(null) }, [])
  const next = useCallback(() => {
    setI((v) => {
      if (!steps) return v
      if (v + 1 >= steps.length) { setSteps(null); setRect(null); return 0 }
      return v + 1
    })
  }, [steps])
  const prev = useCallback(() => setI((v) => Math.max(0, v - 1)), [])

  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowRight' || e.key === 'Enter') next()
      else if (e.key === 'ArrowLeft') prev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, close, next, prev])

  function start() {
    const tour = tourForPath(path)
    setLabel(tour.label)
    setSteps(tour.steps)
    setI(0)
  }

  if (!active) {
    return (
      <button
        onClick={start}
        aria-label="Take a guided tour of this page"
        className="fixed bottom-20 right-4 z-30 inline-flex items-center gap-2 rounded-full bg-ocg-navy px-4 py-3 text-sm font-medium text-white shadow-lg hover:bg-slate-800 lg:bottom-6"
      >
        <HelpCircle size={18} /> <span className="hidden sm:inline">Take a tour</span>
      </button>
    )
  }

  const isLast = i + 1 >= (steps?.length ?? 0)

  return (
    <>
      {/* Spotlight / dim. Pointer-events none so it never traps the user. */}
      {rect ? (
        <div
          className="fixed z-[60] rounded-xl"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            boxShadow: '0 0 0 9999px rgba(15,23,42,0.55)',
            outline: '2px solid #b07a00',
            pointerEvents: 'none',
            transition: 'all 0.2s ease',
          }}
        />
      ) : (
        <div className="fixed inset-0 z-[60] bg-slate-900/55" />
      )}

      {/* Card — always bottom-anchored so the Next button is visible on every
          device (clears the mobile bottom nav). */}
      <div className="fixed inset-x-4 bottom-20 z-[70] mx-auto max-w-md rounded-2xl bg-white p-5 shadow-2xl sm:inset-x-auto sm:right-6 sm:bottom-6 lg:bottom-6">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ocg-gold">{label} · {i + 1}/{steps?.length}</span>
          <button onClick={close} aria-label="End tour" className="text-gray-400 hover:text-gray-700"><X size={16} /></button>
        </div>
        <h3 className="text-base font-semibold text-gray-900">{step?.title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-gray-600">{step?.body}</p>

        <div className="mt-4 flex items-center justify-between gap-2">
          <button onClick={close} className="text-xs font-medium text-gray-400 hover:text-gray-700">Skip</button>
          <div className="flex items-center gap-2">
            <button
              onClick={prev}
              disabled={i === 0}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            >
              <ChevronLeft size={15} /> Back
            </button>
            <button
              onClick={next}
              className="inline-flex items-center gap-1 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              {isLast ? <>Done <Check size={15} /></> : <>Next <ChevronRight size={15} /></>}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
