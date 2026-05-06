import React from 'react'

type BadgeVariant = 'green' | 'yellow' | 'red' | 'gold' | 'navy' | 'gray'

interface BadgeProps {
  variant?: BadgeVariant
  children: React.ReactNode
  className?: string
}

const variantClasses: Record<BadgeVariant, string> = {
  green: 'bg-green-100 text-green-700',
  yellow: 'bg-yellow-100 text-yellow-700',
  red: 'bg-red-100 text-red-700',
  gold: 'bg-amber-100 text-amber-700',
  navy: 'bg-blue-950 text-white',
  gray: 'bg-gray-100 text-gray-600',
}

export function Badge({ variant = 'gray', children, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center text-xs font-medium px-2.5 py-0.5 rounded-full ${variantClasses[variant]} ${className}`}
    >
      {children}
    </span>
  )
}
