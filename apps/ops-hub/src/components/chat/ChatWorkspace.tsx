'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { MessageSquarePlus, MessagesSquare, Send, Users2, X } from 'lucide-react'
import { api } from '@/lib/apiClient'

type Contact = { email: string; name: string }
type Member = { member_email: string; member_name: string }
type Conversation = {
  id: string
  type: string
  name: string
  last_message_at: string
  members: Member[]
  latest: { body: string; sender_name: string } | null
  unread: number
}
type Message = {
  id: string
  conversation_id: string
  sender_email: string
  sender_name: string
  body: string
  created_at: string
}

const POLL_MS = 5000

/**
 * Slack-style internal chat: conversation list on the left, thread on the
 * right, light polling for new messages. Membership and sender identity are
 * enforced server-side — this component is presentation only.
 */
export function ChatWorkspace({
  meEmail,
  meName,
  contacts,
}: {
  meEmail: string
  meName: string
  contacts: Contact[]
}) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  // New conversation modal
  const [showNew, setShowNew] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  const [groupName, setGroupName] = useState('')
  const [starting, setStarting] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)
  const activeIdRef = useRef<string | null>(null)
  activeIdRef.current = activeId

  const loadConversations = useCallback(async () => {
    const { ok, data } = await api<{ conversations?: Conversation[] }>('/api/chat')
    if (ok && data.conversations) setConversations(data.conversations)
    setLoading(false)
  }, [])

  const loadMessages = useCallback(async (conversationId: string, scroll = false) => {
    const { ok, data } = await api<{ messages?: Message[] }>(`/api/chat?conversation=${conversationId}`)
    if (ok && data.messages && activeIdRef.current === conversationId) {
      setMessages((prev) => {
        const changed = prev.length !== data.messages!.length
        if (changed && scroll) setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
        return data.messages!
      })
    }
  }, [])

  useEffect(() => {
    void loadConversations()
    const timer = setInterval(() => {
      void loadConversations()
      if (activeIdRef.current) void loadMessages(activeIdRef.current, true)
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [loadConversations, loadMessages])

  async function openConversation(id: string) {
    setActiveId(id)
    setMessages([])
    await loadMessages(id)
    setTimeout(() => bottomRef.current?.scrollIntoView(), 50)
  }

  async function send() {
    if (!draft.trim() || !activeId) return
    setSending(true); setError('')
    const { ok, data } = await api<{ error?: string; message?: Message }>('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ action: 'send', conversation_id: activeId, body: draft }),
    })
    setSending(false)
    if (!ok) { setError(data?.error ?? 'Failed to send.'); return }
    setDraft('')
    if (data.message) setMessages((prev) => [...prev, data.message!])
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    void loadConversations()
  }

  async function startNew() {
    const members = contacts.filter((c) => picked.includes(c.email))
    if (members.length === 0) return
    setStarting(true); setError('')
    const { ok, data } = await api<{ error?: string; conversation?: { id: string } }>('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ action: 'start', members, name: members.length > 1 ? groupName : '' }),
    })
    setStarting(false)
    if (!ok) { setError(data?.error ?? 'Failed to start conversation.'); return }
    setShowNew(false); setPicked([]); setGroupName('')
    await loadConversations()
    if (data.conversation?.id) await openConversation(data.conversation.id)
  }

  function title(c: Conversation): string {
    if (c.type === 'group') return c.name || c.members.map((m) => m.member_name.split(' ')[0]).join(', ')
    const other = c.members.find((m) => m.member_email !== meEmail.toLowerCase())
    return other?.member_name || other?.member_email || 'Conversation'
  }

  const active = conversations.find((c) => c.id === activeId) ?? null

  return (
    <div className="flex h-[calc(100vh-8.5rem)] flex-col space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ocg-gold">Team communication</p>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900">Chat</h1>
        </div>
        <button onClick={() => setShowNew(true)} className="inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
          <MessageSquarePlus size={16} /> New chat
        </button>
      </div>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[300px_1fr]">
        {/* Conversation list */}
        <aside className={`min-h-0 overflow-y-auto rounded-xl border border-gray-100 bg-white shadow-sm ${activeId ? 'hidden lg:block' : ''}`}>
          {loading ? (
            <p className="p-4 text-sm text-gray-400">Loading…</p>
          ) : conversations.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-gray-400">
              <MessagesSquare size={32} className="text-gray-200" />
              <p className="text-sm">No conversations yet.<br />Start one with a teammate.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {conversations.map((c) => (
                <button key={c.id} onClick={() => openConversation(c.id)}
                  className={`block w-full px-4 py-3 text-left transition-colors ${c.id === activeId ? 'bg-ocg-navy text-white' : 'hover:bg-gray-50'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className={`truncate text-sm font-semibold ${c.id === activeId ? 'text-white' : 'text-gray-900'}`}>
                      {c.type === 'group' && <Users2 size={12} className="mr-1 inline" />}
                      {title(c)}
                    </p>
                    {c.unread > 0 && c.id !== activeId && (
                      <span className="shrink-0 rounded-full bg-ocg-gold px-1.5 py-0.5 text-[10px] font-bold text-white">{c.unread}</span>
                    )}
                  </div>
                  {c.latest && (
                    <p className={`mt-0.5 truncate text-xs ${c.id === activeId ? 'text-white/60' : 'text-gray-400'}`}>
                      {c.latest.sender_name.split(' ')[0]}: {c.latest.body}
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}
        </aside>

        {/* Thread */}
        <section className={`flex min-h-0 flex-col rounded-xl border border-gray-100 bg-white shadow-sm ${!activeId ? 'hidden lg:flex' : ''}`}>
          {!active ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-gray-300">
              <MessagesSquare size={40} />
              <p className="text-sm font-medium text-gray-400">Pick a conversation or start a new one</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{title(active)}</p>
                  <p className="text-xs text-gray-400">{active.members.map((m) => m.member_name.split(' ')[0]).join(', ')}</p>
                </div>
                <button onClick={() => setActiveId(null)} className="text-gray-400 hover:text-gray-700 lg:hidden"><X size={16} /></button>
              </div>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
                {messages.map((m) => {
                  const mine = m.sender_email === meEmail.toLowerCase()
                  return (
                    <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[78%] rounded-2xl px-3.5 py-2 ${mine ? 'rounded-br-sm bg-ocg-navy text-white' : 'rounded-bl-sm bg-gray-100 text-gray-800'}`}>
                        {!mine && active.type === 'group' && (
                          <p className="mb-0.5 text-[11px] font-semibold text-ocg-gold">{m.sender_name}</p>
                        )}
                        <p className="whitespace-pre-wrap text-sm">{m.body}</p>
                        <p className={`mt-1 text-right text-[10px] ${mine ? 'text-white/50' : 'text-gray-400'}`}>
                          {new Date(m.created_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  )
                })}
                <div ref={bottomRef} />
              </div>
              <div className="flex items-end gap-2 border-t border-gray-100 p-3">
                <textarea
                  className="input min-h-[42px] max-h-32 flex-1 resize-none"
                  rows={1}
                  placeholder={`Message ${title(active)}…`}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() }
                  }}
                />
                <button onClick={send} disabled={sending || !draft.trim()}
                  className="rounded-lg bg-ocg-navy p-2.5 text-white hover:bg-slate-800 disabled:opacity-50">
                  <Send size={17} />
                </button>
              </div>
            </>
          )}
        </section>
      </div>

      {/* New conversation modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Start a conversation</h2>
              <button onClick={() => setShowNew(false)} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
            </div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Who with?</p>
            <div className="mb-4 flex max-h-56 flex-wrap gap-2 overflow-y-auto">
              {contacts.length === 0 && <p className="text-sm text-gray-400">No teammates with portal accounts yet.</p>}
              {contacts.map((c) => (
                <button key={c.email} type="button"
                  onClick={() => setPicked((prev) => prev.includes(c.email) ? prev.filter((e) => e !== c.email) : [...prev, c.email])}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium ${picked.includes(c.email) ? 'border-ocg-navy bg-ocg-navy text-white' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                  {c.name}
                </button>
              ))}
            </div>
            {picked.length > 1 && (
              <div className="mb-4">
                <label className="mb-1 block text-xs font-medium text-gray-500">Group name</label>
                <input className="input" value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="e.g. Rayyan ops team" />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowNew(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600">Cancel</button>
              <button onClick={startNew} disabled={starting || picked.length === 0}
                className="rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60">
                {starting ? 'Starting…' : picked.length > 1 ? 'Create group' : 'Start chat'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
