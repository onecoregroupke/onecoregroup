import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@ocg/db'
import type { PropertyEnquiryInsert } from '@ocg/db'
import { Resend } from 'resend'

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<PropertyEnquiryInsert> & {
      num_guests?: number | string | null
    }

    const { guest_name, guest_phone } = body
    if (!guest_name?.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }
    if (!guest_phone?.trim()) {
      return NextResponse.json({ error: 'Phone number is required' }, { status: 400 })
    }
    if (body.check_in && body.check_out && body.check_in >= body.check_out) {
      return NextResponse.json(
        { error: 'Check-out must be after check-in' },
        { status: 400 }
      )
    }

    const supabase = createServerClient()

    const insertData: PropertyEnquiryInsert = {
      property_id: body.property_id ?? null,
      property_name: body.property_name ?? null,
      guest_name: guest_name.trim(),
      guest_email: body.guest_email?.trim() ?? null,
      guest_phone: guest_phone.trim(),
      check_in: body.check_in ?? null,
      check_out: body.check_out ?? null,
      num_guests: body.num_guests ? Number(body.num_guests) : null,
      message: body.message?.trim() ?? null,
      source: body.source ?? 'website',
    }

    const { data, error } = await supabase
      .from('property_enquiries')
      .insert(insertData)
      .select('id')
      .single()

    if (error) {
      console.error('Supabase insert error:', error)
      return NextResponse.json({ error: 'Failed to save enquiry' }, { status: 500 })
    }

    // Send notification email (non-blocking)
    const hostEmail = process.env['NUURANEST_HOST_EMAIL']
    const resendKey = process.env['RESEND_API_KEY']

    if (hostEmail && resendKey) {
      try {
        const resend = new Resend(resendKey)
        const dateRange =
          insertData.check_in && insertData.check_out
            ? `${insertData.check_in} to ${insertData.check_out}`
            : 'Dates not specified'

        await resend.emails.send({
          from: process.env['EMAIL_FROM'] ?? 'noreply@nuuranest.com',
          to: hostEmail,
          subject: `New Booking Enquiry — ${insertData.property_name ?? 'General'} | ${dateRange}`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: #1a4a30; color: white; padding: 24px; border-radius: 8px 8px 0 0;">
                <h1 style="margin: 0; font-size: 20px;">New Booking Enquiry</h1>
                <p style="margin: 8px 0 0; opacity: 0.8;">${insertData.property_name ?? 'Nuuranest Stays'}</p>
              </div>
              <div style="background: white; padding: 24px; border: 1px solid #e5e7eb; border-top: 0; border-radius: 0 0 8px 8px;">
                <table style="width: 100%; border-collapse: collapse;">
                  <tr><td style="padding: 8px 0; color: #6b7280; width: 140px;">Guest Name</td><td style="padding: 8px 0; font-weight: 600;">${insertData.guest_name}</td></tr>
                  <tr><td style="padding: 8px 0; color: #6b7280;">Phone</td><td style="padding: 8px 0; font-weight: 600;">${insertData.guest_phone}</td></tr>
                  ${insertData.guest_email ? `<tr><td style="padding: 8px 0; color: #6b7280;">Email</td><td style="padding: 8px 0;">${insertData.guest_email}</td></tr>` : ''}
                  <tr><td style="padding: 8px 0; color: #6b7280;">Check-in</td><td style="padding: 8px 0;">${insertData.check_in ?? '—'}</td></tr>
                  <tr><td style="padding: 8px 0; color: #6b7280;">Check-out</td><td style="padding: 8px 0;">${insertData.check_out ?? '—'}</td></tr>
                  <tr><td style="padding: 8px 0; color: #6b7280;">Guests</td><td style="padding: 8px 0;">${insertData.num_guests ?? '—'}</td></tr>
                  ${insertData.message ? `<tr><td style="padding: 8px 0; color: #6b7280;">Message</td><td style="padding: 8px 0;">${insertData.message}</td></tr>` : ''}
                </table>
                ${insertData.guest_phone ? `<a href="https://wa.me/${insertData.guest_phone.replace(/[^0-9]/g, '')}" style="display: inline-block; margin-top: 20px; background: #25d366; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Reply on WhatsApp</a>` : ''}
              </div>
            </div>
          `,
        })
      } catch (emailErr) {
        console.error('Email send error (non-fatal):', emailErr)
      }
    }

    return NextResponse.json({ success: true, enquiry_id: (data as { id: string }).id })
  } catch (err) {
    console.error('Enquiry API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
