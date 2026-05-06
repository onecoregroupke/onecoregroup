'use client'

import { useState } from 'react'
import { CheckCircle, AlertCircle } from 'lucide-react'

export function ContactForm() {
  const [form, setForm] = useState({
    guest_name: '',
    guest_email: '',
    guest_phone: '',
    subject: '',
    message: '',
  })
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [error, setError] = useState('')

  function update(field: keyof typeof form, value: string) {
    setForm((p) => ({ ...p, [field]: value }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.guest_name.trim() || !form.guest_phone.trim()) {
      setError('Name and phone number are required.')
      return
    }
    setError('')
    setStatus('loading')
    try {
      const res = await fetch('/api/enquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guest_name: form.guest_name,
          guest_email: form.guest_email || null,
          guest_phone: form.guest_phone,
          message: [form.subject && `Subject: ${form.subject}`, form.message].filter(Boolean).join('\n'),
          source: 'contact_form',
          property_id: null,
          property_name: null,
        }),
      })
      if (!res.ok) {
        const d = (await res.json()) as { error?: string }
        throw new Error(d.error ?? 'Something went wrong')
      }
      setStatus('success')
      setForm({ guest_name: '', guest_email: '', guest_phone: '', subject: '', message: '' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send. Please try WhatsApp.')
      setStatus('error')
    }
  }

  if (status === 'success') {
    return (
      <div className="bg-white rounded-xl p-8 border border-gray-100 text-center">
        <CheckCircle size={40} className="text-green-500 mx-auto mb-3" />
        <h3 className="font-semibold text-nn-dark mb-2">Message sent!</h3>
        <p className="text-gray-600 text-sm">
          {"We'll get back to you as soon as possible. For urgent enquiries, WhatsApp is fastest."}
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="bg-white rounded-xl p-6 border border-gray-100 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={form.guest_name}
            onChange={(e) => update('guest_name', e.target.value)}
            placeholder="Jane Doe"
            className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nn-green"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Phone <span className="text-red-500">*</span>
          </label>
          <input
            type="tel"
            value={form.guest_phone}
            onChange={(e) => update('guest_phone', e.target.value)}
            placeholder="+254 7XX XXX XXX"
            className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nn-green"
            required
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
        <input
          type="email"
          value={form.guest_email}
          onChange={(e) => update('guest_email', e.target.value)}
          placeholder="jane@example.com"
          className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nn-green"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
        <input
          type="text"
          value={form.subject}
          onChange={(e) => update('subject', e.target.value)}
          placeholder="Booking enquiry, general question..."
          className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nn-green"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
        <textarea
          value={form.message}
          onChange={(e) => update('message', e.target.value)}
          placeholder="How can we help you?"
          rows={4}
          className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nn-green resize-none"
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-600 text-sm">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={status === 'loading'}
        className="w-full bg-nn-green text-white font-medium py-3 rounded-lg hover:bg-green-900 transition-colors disabled:opacity-60"
      >
        {status === 'loading' ? 'Sending...' : 'Send Message'}
      </button>
    </form>
  )
}
