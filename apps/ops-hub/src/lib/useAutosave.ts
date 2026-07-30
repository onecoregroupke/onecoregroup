'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Reusable autosave hook (Part 10). Debounced saves with clear status states,
 * local-draft recovery across refresh/close, retry after a transient failure,
 * and duplicate-submit protection. It saves DRAFTS — committing a draft to a
 * posted ledger is a separate, explicit action.
 */
export type AutosaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved' | 'offline' | 'error'

export interface UseAutosaveResult<T> {
  status: AutosaveStatus
  lastSavedAt: Date | null
  /** Call whenever the edited value changes. Schedules a debounced save. */
  onChange: (value: T) => void
  /** Force an immediate save (e.g. on blur / explicit Save). */
  flush: () => Promise<void>
  /** A locally-persisted draft found on mount (offer "restore"). */
  recovered: T | null
  clearRecovered: () => void
}

export function useAutosave<T>(opts: {
  onSave: (value: T) => Promise<void>
  /** localStorage key for offline draft recovery; omit to disable. */
  storageKey?: string
  debounceMs?: number
  /** Compare to detect no-op saves. Defaults to JSON equality. */
  isEqual?: (a: T, b: T) => boolean
}): UseAutosaveResult<T> {
  const { onSave, storageKey, debounceMs = 1200 } = opts
  const [status, setStatus] = useState<AutosaveStatus>('idle')
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [recovered, setRecovered] = useState<T | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<T | null>(null)
  const saving = useRef(false)
  const lastSaved = useRef<string>('')

  const eq = opts.isEqual ?? ((a: T, b: T) => JSON.stringify(a) === JSON.stringify(b))

  // Recover a local draft on mount.
  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(storageKey)
      if (raw) setRecovered(JSON.parse(raw) as T)
    } catch { /* ignore */ }
  }, [storageKey])

  const doSave = useCallback(async (value: T) => {
    if (saving.current) { pending.current = value; return }
    const serialized = JSON.stringify(value)
    if (serialized === lastSaved.current) { setStatus('saved'); return }
    if (typeof navigator !== 'undefined' && !navigator.onLine) { setStatus('offline'); persist(storageKey, value); return }
    saving.current = true
    setStatus('saving')
    try {
      await onSave(value)
      lastSaved.current = serialized
      setLastSavedAt(new Date())
      setStatus('saved')
      clearPersist(storageKey)
    } catch {
      setStatus('error')
      persist(storageKey, value) // keep a recoverable copy
    } finally {
      saving.current = false
      if (pending.current && !eq(pending.current, value)) {
        const next = pending.current
        pending.current = null
        void doSave(next)
      } else {
        pending.current = null
      }
    }
  }, [onSave, storageKey, eq])

  const onChange = useCallback((value: T) => {
    setStatus('unsaved')
    persist(storageKey, value)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void doSave(value), debounceMs)
  }, [doSave, debounceMs, storageKey])

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current)
    if (pending.current) await doSave(pending.current)
  }, [doSave])

  const clearRecovered = useCallback(() => { setRecovered(null); clearPersist(storageKey) }, [storageKey])

  // Warn before unload if there are unsaved changes.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (status === 'unsaved' || status === 'saving') { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [status])

  return { status, lastSavedAt, onChange, flush, recovered, clearRecovered }
}

function persist<T>(key: string | undefined, value: T) {
  if (!key || typeof window === 'undefined') return
  try { window.localStorage.setItem(key, JSON.stringify(value)) } catch { /* quota */ }
}
function clearPersist(key: string | undefined) {
  if (!key || typeof window === 'undefined') return
  try { window.localStorage.removeItem(key) } catch { /* ignore */ }
}

/** Small status label for the autosave indicator. */
export function autosaveLabel(status: AutosaveStatus): { text: string; tone: string } {
  switch (status) {
    case 'saving': return { text: 'Saving…', tone: 'text-amber-600' }
    case 'saved': return { text: 'Saved', tone: 'text-emerald-600' }
    case 'unsaved': return { text: 'Unsaved changes', tone: 'text-gray-500' }
    case 'offline': return { text: 'Offline — will retry', tone: 'text-amber-600' }
    case 'error': return { text: 'Save failed — retrying', tone: 'text-red-600' }
    default: return { text: '', tone: 'text-gray-400' }
  }
}
