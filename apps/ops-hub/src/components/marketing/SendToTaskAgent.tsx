'use client'

import { useState } from 'react'
import { Bot, Send } from 'lucide-react'
import { apiFetch } from '@/lib/marketing/client'

const OUTPUT_TYPES: { value: string; label: string }[] = [
  { value: 'poster', label: 'Poster / static graphic' },
  { value: 'carousel', label: 'Carousel graphics' },
  { value: 'reel', label: 'Reel / short video' },
  { value: 'video_edit', label: 'Video edit' },
  { value: 'animation', label: 'Animated / motion graphic' },
  { value: 'deck', label: 'Presentation deck' },
  { value: 'copy', label: 'Caption / copy only' },
]

export default function SendToTaskAgent({ contentId }: { contentId: string }) {
  const [outputType, setOutputType] = useState('poster')
  const [instruction, setInstruction] = useState('')
  const [priority, setPriority] = useState('High')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)

  async function send() {
    setResult(null)
    if (!instruction.trim()) {
      setResult({ kind: 'err', msg: 'Add an instruction describing the output you need.' })
      return
    }
    setSending(true)
    try {
      const r = await apiFetch<{ taskId: string }>(`/api/mhub/marketing/content/${contentId}/push-to-ops`, {
        method: 'POST',
        body: JSON.stringify({ instruction, outputType, priority }),
      })
      setResult({ kind: 'ok', msg: `Sent to the Task Agent (${r.taskId}). The approved deliverable will return here and auto-schedule.` })
      setInstruction('')
    } catch (e) {
      setResult({ kind: 'err', msg: e instanceof Error ? e.message : 'Failed to send.' })
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Bot size={18} className="text-ocg-navy" />
        <h2 className="font-semibold text-gray-900">Send to Task Agent</h2>
      </div>
      <p className="mb-4 text-sm text-gray-500">
        Hand this post to the Ops Hub agents to produce the asset. The brief includes this
        post's hook, caption, platform and brand. When the draft is approved in Ops, the
        deliverable comes back here and the post auto-schedules.
      </p>

      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Output needed</label>
          <select
            value={outputType}
            onChange={(e) => setOutputType(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocg-navy"
          >
            {OUTPUT_TYPES.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Priority</label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocg-navy"
          >
            {['Low', 'Medium', 'High', 'Urgent'].map((p) => <option key={p}>{p}</option>)}
          </select>
        </div>
      </div>

      <label className="mb-1 mt-3 block text-xs font-medium text-gray-500">Instruction</label>
      <textarea
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        rows={4}
        placeholder="e.g. Design a bold Instagram poster: brand gold on navy, headline 'December Tuning Special', show a grand piano, include the WhatsApp CTA. Square 1080×1080."
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocg-navy"
      />

      {result && (
        <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${result.kind === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {result.msg}
        </p>
      )}

      <button
        onClick={send}
        disabled={sending}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        <Send size={15} /> {sending ? 'Sending…' : 'Send to Task Agent'}
      </button>
    </section>
  )
}
