import Image from 'next/image'
import { Sparkles } from 'lucide-react'

export default function ComingSoonPage() {
  const whatsapp = process.env['NEXT_PUBLIC_GLITZ_WHATSAPP']?.replace(/[^0-9]/g, '') ?? '254XXXXXXXXX'

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
      <div className="text-center max-w-lg">
        {/* Logo mark */}
        <div className="inline-flex items-center justify-center w-20 h-20 bg-amber-500 rounded-2xl mb-8">
          <Sparkles size={36} className="text-white" />
        </div>

        {/* Brand */}
        <h1 className="text-4xl sm:text-5xl font-bold text-white mb-3">
          Glitz N&apos; Glim
        </h1>
        <p className="text-amber-400 font-medium text-lg mb-6">Iceland Geysers</p>
        <p className="text-gray-400 leading-relaxed mb-8">
          Premium cleaning products powered by the purity of Iceland Geysers.
          Something exceptional is coming — our full store launches soon.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            href={`https://wa.me/${whatsapp}?text=${encodeURIComponent("Hi! I'm interested in Glitz N' Glim products. Can you tell me more?")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-[#25d366] text-white font-medium px-6 py-3 rounded-full hover:bg-[#1da851] transition-colors"
          >
            Pre-order via WhatsApp
          </a>
        </div>

        <div className="mt-12 pt-8 border-t border-gray-800">
          <p className="text-gray-600 text-sm">
            A One Core Group brand · &copy; {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </div>
  )
}
