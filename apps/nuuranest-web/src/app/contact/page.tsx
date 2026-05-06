import { Metadata } from 'next'
import { MessageCircle, Mail, MapPin } from 'lucide-react'
import { ContactForm } from './ContactForm'

export const metadata: Metadata = {
  title: 'Contact Us',
  description: 'Get in touch with Nuuranest Stays — WhatsApp, email, or our contact form.',
}

const phone =
  process.env['NEXT_PUBLIC_NUURANEST_WHATSAPP']?.replace(/[^0-9]/g, '') ?? '254XXXXXXXXX'

const contactOptions = [
  {
    icon: MessageCircle,
    title: 'WhatsApp',
    label: 'Primary contact — fastest response',
    value: process.env['NEXT_PUBLIC_NUURANEST_WHATSAPP'] ?? '+254 XXX XXX XXX',
    action: {
      href: `https://wa.me/${phone}?text=${encodeURIComponent("Hi Nuuranest! I'd like to get in touch.")}`,
      label: 'Open WhatsApp',
      color: 'bg-[#25d366] hover:bg-[#1da851]',
    },
  },
  {
    icon: Mail,
    title: 'Email',
    label: 'For detailed enquiries',
    value: 'hello@nuuranest.com',
    action: {
      href: 'mailto:hello@nuuranest.com',
      label: 'Send Email',
      color: 'bg-nn-green hover:bg-green-900',
    },
  },
  {
    icon: MapPin,
    title: 'Location',
    label: 'Where to find us',
    value: 'Nyali and Bamburi, Mombasa County, Kenya',
    action: null,
  },
]

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-nn-bg">
      {/* Header */}
      <div className="bg-nn-green text-white pt-28 pb-16 lg:pt-36 lg:pb-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-nn-gold font-medium text-sm uppercase tracking-wider mb-3">
            Reach Out
          </p>
          <h1 className="font-heading text-4xl lg:text-5xl font-bold mb-4">Get in Touch</h1>
          <p className="text-green-200 text-lg leading-relaxed">
            WhatsApp is the fastest way to reach us. We typically respond within 2 hours.
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16 space-y-10">
        {/* Contact options */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {contactOptions.map((opt) => {
            const Icon = opt.icon
            return (
              <div
                key={opt.title}
                className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm"
              >
                <div className="w-12 h-12 bg-nn-bg rounded-full flex items-center justify-center mb-4">
                  <Icon size={20} className="text-nn-green" />
                </div>
                <h3 className="font-semibold text-nn-dark mb-1">{opt.title}</h3>
                <p className="text-nn-gold text-xs font-medium mb-2">{opt.label}</p>
                <p className="text-gray-600 text-sm mb-4">{opt.value}</p>
                {opt.action && (
                  <a
                    href={opt.action.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-block text-white text-sm font-medium px-4 py-2 rounded-full transition-colors ${opt.action.color}`}
                  >
                    {opt.action.label}
                  </a>
                )}
              </div>
            )
          })}
        </div>

        {/* Contact form */}
        <div>
          <h2 className="font-heading text-2xl font-semibold text-nn-dark mb-2">
            Send a Message
          </h2>
          <p className="text-gray-500 text-sm mb-6">
            Fill in the form below and we&apos;ll get back to you as soon as possible.
          </p>
          <ContactForm />
        </div>
      </div>
    </div>
  )
}
