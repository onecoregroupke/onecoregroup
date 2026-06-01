'use client'

import { Menu, Bell } from 'lucide-react'
import { usePermissions } from '@/contexts/PermissionsContext'

interface TopbarProps {
  onMenuClick: () => void
}

export function Topbar({ onMenuClick }: TopbarProps) {
  const { displayName, email } = usePermissions()
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
          className="relative p-2 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Notifications"
        >
          <Bell size={18} />
        </button>
        <div className="w-8 h-8 bg-ocg-navy rounded-full flex items-center justify-center text-white text-xs font-bold">
          {initial}
        </div>
      </div>
    </header>
  )
}
