import React from 'react'
import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Heading,
  Text,
  Button,
  Hr,
  Preview,
} from '@react-email/components'

interface BrandSummary {
  name: string
  shortName: string
  color: string
  compliancePct: number
  reach: number
  engagement: number
  dmInquiries: number
}

interface DailySummaryProps {
  date: string
  brands: BrandSummary[]
  dashboardUrl: string
}

export function DailySummary({ date, brands, dashboardUrl }: DailySummaryProps) {
  const alertBrands = brands.filter((b) => b.compliancePct < 80)

  return (
    <Html>
      <Head />
      <Preview>OCG Daily Marketing Report — {date}</Preview>
      <Body style={{ fontFamily: 'system-ui, sans-serif', backgroundColor: '#f1f5f9' }}>
        <Container style={{ maxWidth: '600px', margin: '40px auto' }}>
          {/* Header */}
          <Section style={{ backgroundColor: '#1a1a2e', borderRadius: '12px 12px 0 0', padding: '24px' }}>
            <Heading style={{ color: '#ffffff', fontSize: '18px', margin: 0 }}>
              OCG Daily Marketing Report
            </Heading>
            <Text style={{ color: '#b07a00', margin: '4px 0 0', fontSize: '14px' }}>{date}</Text>
          </Section>

          {/* Alerts */}
          {alertBrands.length > 0 && (
            <Section style={{ backgroundColor: '#fef2f2', padding: '16px 24px', border: '1px solid #fecaca' }}>
              <Text style={{ color: '#dc2626', fontWeight: '600', margin: '0 0 8px', fontSize: '14px' }}>
                ⚠ Brands Below 80% Compliance This Week
              </Text>
              {alertBrands.map((b) => (
                <Text key={b.shortName} style={{ color: '#b91c1c', margin: '2px 0', fontSize: '13px' }}>
                  • {b.name}: {b.compliancePct}%
                </Text>
              ))}
            </Section>
          )}

          {/* Brand rows */}
          <Section style={{ backgroundColor: '#ffffff', padding: '24px', border: '1px solid #e5e7eb', borderTop: 'none' }}>
            {brands.map((brand, i) => (
              <React.Fragment key={brand.shortName}>
                {i > 0 && <Hr style={{ borderColor: '#f3f4f6', margin: '12px 0' }} />}
                <Section>
                  <Text style={{ fontWeight: '700', fontSize: '14px', color: '#111827', margin: '0 0 6px' }}>
                    <span style={{ display: 'inline-block', width: '10px', height: '10px', backgroundColor: brand.color, borderRadius: '50%', marginRight: '8px' }} />
                    {brand.name}
                  </Text>
                  <Text style={{ color: '#6b7280', fontSize: '13px', margin: '2px 0' }}>
                    Compliance: <strong style={{ color: brand.compliancePct >= 80 ? '#16a34a' : brand.compliancePct >= 67 ? '#d97706' : '#dc2626' }}>{brand.compliancePct}%</strong>
                    {'  ·  '}Reach: <strong>{brand.reach.toLocaleString()}</strong>
                    {'  ·  '}Engagement: <strong>{brand.engagement.toLocaleString()}</strong>
                    {'  ·  '}DMs: <strong>{brand.dmInquiries}</strong>
                  </Text>
                </Section>
              </React.Fragment>
            ))}
          </Section>

          {/* CTA */}
          <Section style={{ backgroundColor: '#ffffff', padding: '16px 24px 24px', borderRadius: '0 0 12px 12px', border: '1px solid #e5e7eb', borderTop: 'none', textAlign: 'center' as const }}>
            <Button
              href={dashboardUrl}
              style={{
                backgroundColor: '#1a1a2e',
                color: '#ffffff',
                fontSize: '14px',
                fontWeight: '600',
                padding: '12px 24px',
                borderRadius: '8px',
                textDecoration: 'none',
              }}
            >
              View Full Dashboard
            </Button>
          </Section>

          <Text style={{ color: '#9ca3af', fontSize: '12px', textAlign: 'center' as const, marginTop: '16px' }}>
            One Core Group Marketing Hub · Auto-generated report
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export default DailySummary
