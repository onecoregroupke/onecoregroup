'use client'

import { useState } from 'react'
import Image from 'next/image'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface CataloguePhotoSliderProps {
  photos: string[]
  propertyName: string
}

export function CataloguePhotoSlider({ photos, propertyName }: CataloguePhotoSliderProps) {
  const [active, setActive] = useState(0)

  const prev = () => setActive((i) => (i === 0 ? photos.length - 1 : i - 1))
  const next = () => setActive((i) => (i === photos.length - 1 ? 0 : i + 1))

  const mainPhoto = photos[active] ?? ''
  const thumbs = photos.slice(0, 4)

  return (
    <div>
      {/* Main image */}
      <div className="relative aspect-[4/3] lg:aspect-auto lg:h-full min-h-[280px] group">
        <Image
          src={mainPhoto}
          alt={`${propertyName} — photo ${active + 1}`}
          fill
          className="object-cover transition-opacity duration-300"
          sizes="(max-width: 1024px) 100vw, 50vw"
          priority={active === 0}
        />

        {photos.length > 1 && (
          <>
            <button
              onClick={prev}
              aria-label="Previous photo"
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={next}
              aria-label="Next photo"
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <ChevronRight size={18} />
            </button>
            <div className="absolute bottom-2 right-3 bg-black/40 text-white text-xs px-2 py-0.5 rounded-full">
              {active + 1} / {photos.length}
            </div>
          </>
        )}
      </div>

      {/* Thumbnail strip */}
      {thumbs.length > 1 && (
        <div className={`grid gap-0.5 grid-cols-${thumbs.length}`}>
          {thumbs.map((src, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              className={`relative aspect-[4/3] overflow-hidden ${
                active === i ? 'ring-2 ring-nn-gold ring-inset' : ''
              }`}
            >
              <Image
                src={src}
                alt={`${propertyName} thumbnail ${i + 1}`}
                fill
                className={`object-cover transition-all ${active === i ? 'brightness-100' : 'brightness-75 hover:brightness-90'}`}
                sizes="25vw"
              />
              {i === 3 && photos.length > 4 && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white text-sm font-medium">
                  +{photos.length - 4}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
