import { MessageCircle } from 'lucide-react'

interface WhatsAppButtonProps {
  label?: string
  message?: string
  size?: 'sm' | 'md' | 'lg'
  fullWidth?: boolean
  variant?: 'green' | 'outline'
}

export function WhatsAppButton({
  label = 'WhatsApp Us',
  message = '',
  size = 'md',
  fullWidth = false,
  variant = 'green',
}: WhatsAppButtonProps) {
  const phone = process.env['NEXT_PUBLIC_NUURANEST_WHATSAPP']?.replace(/[^0-9]/g, '') ?? '254XXXXXXXXX'
  const url = `https://wa.me/${phone}${message ? `?text=${encodeURIComponent(message)}` : ''}`

  const sizeClasses = {
    sm: 'text-sm px-4 py-2 gap-1.5',
    md: 'text-base px-5 py-2.5 gap-2',
    lg: 'text-lg px-6 py-3 gap-2',
  }

  const iconSize = { sm: 16, md: 18, lg: 20 }[size]

  const variantClasses =
    variant === 'green'
      ? 'bg-[#25d366] hover:bg-[#1da851] text-white'
      : 'border-2 border-[#25d366] text-[#25d366] hover:bg-[#25d366] hover:text-white'

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center justify-center rounded-full font-medium transition-colors ${sizeClasses[size]} ${variantClasses} ${fullWidth ? 'w-full' : ''}`}
    >
      <MessageCircle size={iconSize} />
      {label}
    </a>
  )
}
