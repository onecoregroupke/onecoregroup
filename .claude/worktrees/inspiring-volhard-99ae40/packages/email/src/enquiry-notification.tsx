import React from 'react'
import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Row,
  Column,
  Heading,
  Text,
  Button,
  Hr,
  Preview,
} from '@react-email/components'

interface EnquiryNotificationProps {
  propertyName: string
  guestName: string
  guestPhone: string
  guestEmail?: string | null
  checkIn?: string | null
  checkOut?: string | null
  numGuests?: number | null
  message?: string | null
}

export function EnquiryNotification({
  propertyName,
  guestName,
  guestPhone,
  guestEmail,
  checkIn,
  checkOut,
  numGuests,
  message,
}: EnquiryNotificationProps) {
  const dateRange =
    checkIn && checkOut ? `${checkIn} to ${checkOut}` : 'Dates not specified'

  const waLink = `https://wa.me/${guestPhone.replace(/[^0-9]/g, '')}`

  return (
    <Html>
      <Head />
      <Preview>New Booking Enquiry — {propertyName}</Preview>
      <Body style={{ fontFamily: 'system-ui, sans-serif', backgroundColor: '#f8f5f0' }}>
        <Container style={{ maxWidth: '560px', margin: '40px auto' }}>
          {/* Header */}
          <Section style={{ backgroundColor: '#1a4a30', borderRadius: '12px 12px 0 0', padding: '24px' }}>
            <Heading style={{ color: '#ffffff', fontSize: '20px', margin: 0 }}>
              New Booking Enquiry
            </Heading>
            <Text style={{ color: '#c9a84c', margin: '4px 0 0', fontSize: '14px' }}>
              {propertyName}
            </Text>
          </Section>

          {/* Body */}
          <Section style={{ backgroundColor: '#ffffff', padding: '24px', border: '1px solid #e5e7eb', borderTop: 'none', borderRadius: '0 0 12px 12px' }}>
            <Row>
              <Column><Text style={{ color: '#6b7280', fontSize: '13px', margin: '6px 0', width: '140px' }}>Guest Name</Text></Column>
              <Column><Text style={{ color: '#111827', fontSize: '13px', fontWeight: '600', margin: '6px 0' }}>{guestName}</Text></Column>
            </Row>
            <Hr style={{ borderColor: '#f3f4f6', margin: '4px 0' }} />
            <Row>
              <Column><Text style={{ color: '#6b7280', fontSize: '13px', margin: '6px 0', width: '140px' }}>Phone</Text></Column>
              <Column><Text style={{ color: '#111827', fontSize: '13px', fontWeight: '600', margin: '6px 0' }}>{guestPhone}</Text></Column>
            </Row>
            {guestEmail && (
              <>
                <Hr style={{ borderColor: '#f3f4f6', margin: '4px 0' }} />
                <Row>
                  <Column><Text style={{ color: '#6b7280', fontSize: '13px', margin: '6px 0', width: '140px' }}>Email</Text></Column>
                  <Column><Text style={{ color: '#111827', fontSize: '13px', margin: '6px 0' }}>{guestEmail}</Text></Column>
                </Row>
              </>
            )}
            <Hr style={{ borderColor: '#f3f4f6', margin: '4px 0' }} />
            <Row>
              <Column><Text style={{ color: '#6b7280', fontSize: '13px', margin: '6px 0', width: '140px' }}>Dates</Text></Column>
              <Column><Text style={{ color: '#111827', fontSize: '13px', margin: '6px 0' }}>{dateRange}</Text></Column>
            </Row>
            {numGuests && (
              <>
                <Hr style={{ borderColor: '#f3f4f6', margin: '4px 0' }} />
                <Row>
                  <Column><Text style={{ color: '#6b7280', fontSize: '13px', margin: '6px 0', width: '140px' }}>Guests</Text></Column>
                  <Column><Text style={{ color: '#111827', fontSize: '13px', margin: '6px 0' }}>{numGuests}</Text></Column>
                </Row>
              </>
            )}
            {message && (
              <>
                <Hr style={{ borderColor: '#f3f4f6', margin: '12px 0' }} />
                <Text style={{ color: '#6b7280', fontSize: '13px', margin: '0 0 6px' }}>Message:</Text>
                <Text style={{ color: '#374151', fontSize: '14px', lineHeight: '1.6', margin: 0 }}>
                  {message}
                </Text>
              </>
            )}

            <Section style={{ marginTop: '24px', textAlign: 'center' as const }}>
              <Button
                href={waLink}
                style={{
                  backgroundColor: '#25d366',
                  color: '#ffffff',
                  fontSize: '14px',
                  fontWeight: '600',
                  padding: '12px 24px',
                  borderRadius: '8px',
                  textDecoration: 'none',
                }}
              >
                Reply on WhatsApp
              </Button>
            </Section>
          </Section>

          <Text style={{ color: '#9ca3af', fontSize: '12px', textAlign: 'center' as const, marginTop: '16px' }}>
            Nuuranest Stays · Managed by One Core Group
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export default EnquiryNotification
