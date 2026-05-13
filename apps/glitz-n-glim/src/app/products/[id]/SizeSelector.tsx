'use client'

import { useState } from 'react'
import type { ProductSize } from '@ocg/db'

const WHATSAPP = '254792967822'

interface SizeSelectorProps {
  sizes: ProductSize[]
  productName: string
  variant: string | null
  accent: string
}

function WAIcon() {
  return (
    <svg className="w-5 h-5 shrink-0" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  )
}

export function SizeSelector({ sizes, productName, variant, accent }: SizeSelectorProps) {
  const [selected, setSelected] = useState<ProductSize | null>(sizes[0] ?? null)

  const displayName = variant ? `${productName} (${variant})` : productName
  const waOrderMsg = selected
    ? `Hi! I'd like to order *${displayName}* — ${selected.label} @ Ksh ${selected.price_ksh.toLocaleString()}. Please confirm availability.`
    : `Hi! I'd like to order *${displayName}*. Please confirm the price and available sizes.`
  const waQuestionMsg = `Hi! I have a question about *${displayName}*.`

  return (
    <div className="space-y-5">
      {/* Size selector */}
      {sizes.length > 0 && (
        <div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2.5">Select Size</p>
          <div className="flex flex-wrap gap-2">
            {sizes.map(s => {
              const isSelected = selected?.label === s.label
              return (
                <button
                  key={s.label}
                  onClick={() => setSelected(s)}
                  className="text-sm font-semibold px-4 py-2 rounded-xl border-2 transition-all duration-150 cursor-pointer"
                  style={
                    isSelected
                      ? { borderColor: accent, color: '#fff', backgroundColor: accent }
                      : { borderColor: `${accent}40`, color: accent, backgroundColor: `${accent}08` }
                  }
                >
                  {s.label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Dynamic price */}
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-black text-gray-900">
          {selected
            ? `Ksh ${selected.price_ksh.toLocaleString()}`
            : 'Contact for price'}
        </span>
        {selected && sizes.length > 1 && (
          <span className="text-sm text-gray-400 font-medium">/ {selected.label}</span>
        )}
      </div>

      {/* CTA buttons */}
      <div className="flex flex-col sm:flex-row gap-3">
        <a
          href={`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(waOrderMsg)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-2 bg-[#25d366] text-white font-bold px-6 py-4 rounded-2xl hover:bg-[#1da851] transition-colors text-base shadow-lg shadow-green-200"
        >
          <WAIcon />
          Order on WhatsApp
        </a>
        <a
          href={`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(waQuestionMsg)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 border-2 border-gray-200 text-gray-700 font-semibold px-6 py-4 rounded-2xl hover:border-gray-300 hover:bg-gray-50 transition-colors text-sm"
        >
          Ask a question
        </a>
      </div>
    </div>
  )
}
