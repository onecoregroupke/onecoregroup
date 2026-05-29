import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: "Glitz N' Glim — Product Catalogue",
  description: "Premium cleaning & personal care products powered by Iceland Geysers. Order via WhatsApp.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased bg-gray-900">{children}</body>
    </html>
  )
}
