'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'

interface CataloguePhotoSliderProps {
  photos: string[]
  propertyName: string
}

export function CataloguePhotoSlider({ photos, propertyName }: CataloguePhotoSliderProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const main = photos[0] ?? ''
  const small1 = photos[1] ?? null
  const small2 = photos[2] ?? null
  const extra = photos.length > 3 ? photos.length - 3 : 0

  function openLightbox(index: number) {
    setLightboxIndex(index)
  }

  function closeLightbox() {
    setLightboxIndex(null)
  }

  const prev = useCallback(() => {
    setLightboxIndex((i) => (i === null ? 0 : i === 0 ? photos.length - 1 : i - 1))
  }, [photos.length])

  const next = useCallback(() => {
    setLightboxIndex((i) => (i === null ? 0 : i === photos.length - 1 ? 0 : i + 1))
  }, [photos.length])

  useEffect(() => {
    if (lightboxIndex === null) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') prev()
      else if (e.key === 'ArrowRight') next()
      else if (e.key === 'Escape') closeLightbox()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxIndex, prev, next])

  return (
    <>
      {/* Default view */}
      <div className="flex aspect-[4/3] lg:aspect-auto lg:h-full min-h-[280px] gap-0.5">
        {/* Main image */}
        <div
          className="relative flex-1 cursor-pointer overflow-hidden group"
          onClick={() => openLightbox(0)}
        >
          <Image
            src={main}
            alt={`${propertyName} — main photo`}
            fill
            className="object-cover group-hover:brightness-90 transition-all duration-300"
            sizes="(max-width: 1024px) 66vw, 33vw"
            priority
          />
        </div>

        {/* Small images column */}
        {(small1 ?? small2) && (
          <div className="w-[36%] flex flex-col gap-0.5">
            {small1 && (
              <div
                className="relative flex-1 cursor-pointer overflow-hidden group"
                onClick={() => openLightbox(1)}
              >
                <Image
                  src={small1}
                  alt={`${propertyName} — photo 2`}
                  fill
                  className="object-cover group-hover:brightness-90 transition-all duration-300"
                  sizes="(max-width: 1024px) 33vw, 16vw"
                />
              </div>
            )}
            {small2 && (
              <div
                className="relative flex-1 cursor-pointer overflow-hidden group"
                onClick={() => openLightbox(2)}
              >
                <Image
                  src={small2}
                  alt={`${propertyName} — photo 3`}
                  fill
                  className="object-cover group-hover:brightness-90 transition-all duration-300"
                  sizes="(max-width: 1024px) 33vw, 16vw"
                />
                {extra > 0 && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white font-semibold text-xl pointer-events-none">
                    +{extra}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
          onClick={closeLightbox}
        >
          {/* Close */}
          <button
            onClick={closeLightbox}
            className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors z-10"
            aria-label="Close gallery"
          >
            <X size={28} />
          </button>

          {/* Prev */}
          {photos.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); prev() }}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:text-gray-300 p-2 transition-colors z-10"
              aria-label="Previous"
            >
              <ChevronLeft size={36} />
            </button>
          )}

          {/* Image */}
          <div
            className="relative w-full max-w-4xl h-[75vh] mx-16"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={photos[lightboxIndex] ?? ''}
              alt={`${propertyName} — photo ${lightboxIndex + 1}`}
              fill
              className="object-contain"
              sizes="100vw"
            />
          </div>

          {/* Next */}
          {photos.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); next() }}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:text-gray-300 p-2 transition-colors z-10"
              aria-label="Next"
            >
              <ChevronRight size={36} />
            </button>
          )}

          {/* Counter */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white text-sm opacity-70">
            {lightboxIndex + 1} / {photos.length}
          </div>

          {/* Thumbnail strip */}
          {photos.length > 1 && (
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex gap-1.5 max-w-[90vw] overflow-x-auto px-2 pb-1">
              {photos.map((src, i) => (
                <button
                  key={i}
                  onClick={(e) => { e.stopPropagation(); setLightboxIndex(i) }}
                  className={`relative flex-shrink-0 w-14 h-10 rounded overflow-hidden transition-all ${
                    i === lightboxIndex ? 'ring-2 ring-nn-gold' : 'opacity-50 hover:opacity-80'
                  }`}
                >
                  <Image
                    src={src}
                    alt={`thumb ${i + 1}`}
                    fill
                    className="object-cover"
                    sizes="56px"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  )
}
