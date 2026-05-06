import type { Metadata } from 'next'
import './globals.css'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'

export const metadata: Metadata = {
  title: {
    default: 'Nuuranest Stays — Your Home on the Coast',
    template: '%s | Nuuranest Stays',
  },
  description:
    'Five beautifully appointed short-stay properties in Nyali and Bamburi, Mombasa. Book direct for the best rates.',
  keywords: ['Mombasa accommodation', 'Nyali apartment', 'Bamburi short stay', 'Mombasa holiday rental'],
  openGraph: {
    type: 'website',
    locale: 'en_KE',
    siteName: 'Nuuranest Stays',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-body antialiased">
        <Navbar />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  )
}
