'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Menu, Bell } from 'lucide-react'
import { usePermissions } from '@/contexts/PermissionsContext'
import { api } from '@/lib/apiClient'

interface TopbarProps {
  onMenuClick: () => void
}

export function Topbar({ onMenuClick }: TopbarProps) {
  const { displayName, email } = usePermissions()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Array<{ id: string; title: string; body: string; href: string; read_at: string | null; created_at: string }>>([])
  const now = new Date()
  const hour = now.getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const who = displayName || email?.split('@')[0] || 'team'
  const initial = (displayName || email || 'O').charAt(0).toUpperCase()

  const dateStr = now.toLocaleDateString('en-KE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Africa/Nairobi',
  })
  const unread = items.filter((item) => !item.read_at).length

  useEffect(() => {
    api<{ notifications?: typeof items }>('/api/notifications').then(({ ok, data }) => {
      if (ok && data.notifications) setItems(data.notifications)
    })
  }, [])

  async function toggleInbox() {
    setOpen((value) => !value)
    if (!open && unread > 0) {
      await api('/api/notifications', { method: 'PATCH' })
      setItems((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? new Date().toISOString() })))
    }
  }

  return (
    <header className="bg-white border-b border-gray-200 px-4 lg:px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuClick}
          className="lg:hidden text-gray-500 hover:text-gray-700 transition-colors"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>
        <div>
          <h1 className="font-semibold text-gray-900 text-sm lg:text-base">
            {greeting}, {who}
          </h1>
          <p className="text-gray-400 text-xs">{dateStr}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={toggleInbox}
          className="relative p-2 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Notifications"
        >
          <Bell size={18} />
          {unread > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-ocg-gold" />}
        </button>
        {open && (
          <div className="absolute right-14 top-14 z-30 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-gray-100 bg-white shadow-xl">
            <div className="border-b border-gray-100 px-4 py-3">
              <p className="text-sm font-semibold text-gray-900">Inbox</p>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {items.length === 0 ? (
                <p className="p-4 text-sm text-gray-400">No notifications yet.</p>
              ) : items.slice(0, 8).map((item) => (
                <Link key={item.id} href={item.href || '#'} onClick={() => setOpen(false)} className="block border-b border-gray-50 px-4 py-3 hover:bg-gray-50">
                  <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                  {item.body && <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs text-gray-500">{item.body}</p>}
                  <p className="mt-1 text-[10px] text-gray-400">
                    {new Date(item.created_at).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        )}
        <div className="w-8 h-8 bg-ocg-navy rounded-full flex items-center justify-center text-white text-xs font-bold">
          {initial}
        </div>
      </div>
    </header>
  )
}
