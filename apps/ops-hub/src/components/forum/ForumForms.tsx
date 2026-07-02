'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MessageSquarePlus, Reply, X } from 'lucide-react'
import { api } from '@/lib/apiClient'

export function NewForumPostButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ title: '', body: '', category: 'general' })

  async function submit() {
    setError('')
    if (!form.title.trim()) return setError('Give your post a title.')
    setSaving(true)
    const { ok, data } = await api<{ error?: string; post?: { id: string } }>('/api/forum', {
      method: 'POST',
      body: JSON.stringify({ action: 'post', ...form }),
    })
    setSaving(false)
    if (!ok) return setError(data?.error ?? 'Failed to post.')
    setOpen(false)
    setForm({ title: '', body: '', category: 'general' })
    if (data.post?.id) router.push(`/forum/${data.post.id}`)
    else router.refresh()
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
        <MessageSquarePlus size={16} /> New post
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">New forum post</h2>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Title *</label>
                <input className="input" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Category</label>
                <select className="input" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
                  <option value="general">General</option>
                  <option value="announcements">Announcement</option>
                  <option value="ideas">Idea</option>
                  <option value="questions">Question</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Message</label>
                <textarea className="input min-h-[120px]" value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600">Cancel</button>
              <button onClick={submit} disabled={saving} className="rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60">
                {saving ? 'Posting…' : 'Post to forum'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export function ForumReplyForm({ postId }: { postId: string }) {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    if (!body.trim()) return
    setSaving(true); setError('')
    const { ok, data } = await api<{ error?: string }>('/api/forum', {
      method: 'POST',
      body: JSON.stringify({ action: 'reply', post_id: postId, body }),
    })
    setSaving(false)
    if (!ok) { setError(data?.error ?? 'Failed to reply.'); return }
    setBody('')
    router.refresh()
  }

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <label className="mb-1 block text-xs font-medium text-gray-500">Add a reply</label>
      <textarea className="input min-h-[80px]" value={body} onChange={(e) => setBody(e.target.value)} />
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-3 flex justify-end">
        <button onClick={submit} disabled={saving || !body.trim()}
          className="inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60">
          <Reply size={14} /> {saving ? 'Replying…' : 'Reply'}
        </button>
      </div>
    </div>
  )
}
