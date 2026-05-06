import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: "Glitz N' Glim — Coming Soon",
  description: "Iceland Geysers cleaning products. Coming soon.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased bg-gray-900">{children}</body>
    </html>
  )
}
