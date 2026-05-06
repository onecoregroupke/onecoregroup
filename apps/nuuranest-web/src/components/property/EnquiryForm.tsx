'use client'

import { useState } from 'react'
import type { Property } from '@ocg/db'
import { WhatsAppButton } from '@/components/ui/WhatsAppButton'
import { CheckCircle, AlertCircle } from 'lucide-react'

interface EnquiryFormProps {
  property: Property
}

interface FormState {
  guest_name: string
  guest_email: string
  guest_phone: string
  check_in: string
  check_out: string
  num_guests: string
  message: string
}

const DEFAULT: FormState = {
  guest_name: '',
  guest_email: '',
  guest_phone: '',
  check_in: '',
  check_out: '',
  num_guests: '2',
  message: '',
}

export function EnquiryForm({ property }: EnquiryFormProps) {
  const [form, setForm] = useState<FormState>(DEFAULT)
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [error, setError] = useState('')

  function update(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.guest_name.trim() || !form.guest_phone.trim()) {
      setError('Name and phone number are required.')
      return
    }
    if (form.check_in && form.check_out && form.check_in >= form.check_out) {
      setError('Check-out date must be after check-in date.')
      return
    }
    setError('')
    setStatus('loading')
    try {
      const res = await fetch('/api/enquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: property.id,
          property_name: property.name,
          ...form,
          num_guests: form.num_guests ? parseInt(form.num_guests) : null,
          source: 'property_page',
        }),
      })
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error ?? 'Something went wrong')
      }
      setStatus('success')
      setForm(DEFAULT)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send enquiry. Please try WhatsApp.')
      setStatus('error')
    }
  }

  const whatsappMessage =
    `Hi! I'd like to book ${property.name}` +
    (form.check_in ? ` from ${form.check_in}` : '') +
    (form.check_out ? ` to ${form.check_out}` : '') +
    (form.num_guests ? ` for ${form.num_guests} guests` : '') +
    '.'

  if (status === 'success') {
    return (
      <div id="enquiry-form" className="bg-white rounded-xl p-6 border border-gray-100">
        <div className="text-center py-6">
          <CheckCircle size={48} className="text-green-500 mx-auto mb-4" />
          <h3 className="font-heading text-xl font-semibold text-nn-dark mb-2">
            Enquiry Sent!
          </h3>
          <p className="text-gray-600 text-sm mb-6">
            We&apos;ll get back to you within a few hours. For the fastest response, WhatsApp us directly.
          </p>
          <WhatsAppButton
            label="Message Us on WhatsApp"
            message={`Hi! I just sent an enquiry for ${property.name}. Can you confirm availability?`}
            size="lg"
          />
        </div>
      </div>
    )
  }

  return (
    <div id="enquiry-form" className="bg-white rounded-xl p-6 border border-gray-100">
      <h2 className="font-heading text-xl font-semibold text-nn-dark mb-5">Send an Enquiry</h2>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Full Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.guest_name}
              onChange={(e) => update('guest_name', e.target.value)}
              placeholder="Jane Doe"
              className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nn-green focus:border-transparent"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone Number <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              value={form.guest_phone}
              onChange={(e) => update('guest_phone', e.target.value)}
              placeholder="+254 7XX XXX XXX"
              className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nn-green focus:border-transparent"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
          <input
            type="email"
            value={form.guest_email}
            onChange={(e) => update('guest_email', e.target.value)}
            placeholder="jane@example.com"
            className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nn-green focus:border-transparent"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Check-in</label>
            <input
              type="date"
              value={form.check_in}
              onChange={(e) => update('check_in', e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nn-green focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Check-out</label>
            <input
              type="date"
              value={form.check_out}
              onChange={(e) => update('check_out', e.target.value)}
              min={form.check_in || new Date().toISOString().split('T')[0]}
              className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nn-green focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Guests</label>
            <select
              value={form.num_guests}
              onChange={(e) => update('num_guests', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nn-green focus:border-transparent bg-white"
            >
              {Array.from({ length: property.max_guests ?? 6 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n} guest{n !== 1 ? 's' : ''}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
          <textarea
            value={form.message}
            onChange={(e) => update('message', e.target.value)}
            placeholder="Any questions or special requests?"
            rows={3}
            className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nn-green focus:border-transparent resize-none"
          />
        </div>

        {(error || status === 'error') && (
          <div className="flex items-start gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            {error || 'Something went wrong. Please try again or use WhatsApp.'}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 pt-1">
          <button
            type="submit"
            disabled={status === 'loading'}
            className="flex-1 bg-nn-green text-white font-medium py-3 rounded-lg hover:bg-green-900 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {status === 'loading' ? 'Sending...' : 'Send Enquiry'}
          </button>
          <WhatsAppButton
            label="WhatsApp Instead"
            message={whatsappMessage}
            size="md"
            variant="outline"
          />
        </div>
      </form>
    </div>
  )
}
