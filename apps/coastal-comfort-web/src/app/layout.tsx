import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Coastal Comfort — Furnished Coastal Stays',
    template: '%s | Coastal Comfort',
  },
  description:
    'A quiet catalogue of furnished coastal stays in Nyali and Bamburi, Mombasa.',
  keywords: ['Mombasa accommodation', 'Nyali apartment', 'Bamburi short stay', 'Mombasa furnished stays'],
  openGraph: {
    type: 'website',
    locale: 'en_KE',
    siteName: 'Coastal Comfort',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-body antialiased">
        <main>{children}</main>
      </body>
    </html>
  )
}
