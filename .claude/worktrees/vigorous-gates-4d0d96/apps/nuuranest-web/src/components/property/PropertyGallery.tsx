'use client'

import { useState } from 'react'
import Image from 'next/image'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'

interface PropertyGalleryProps {
  photos: string[]
  propertyName: string
}

export function PropertyGallery({ photos, propertyName }: PropertyGalleryProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)

  const mainPhoto = photos[0] ?? ''
  const thumbs = photos.slice(1, 3)

  function openLightbox(index: number) {
    setLightboxIndex(index)
    setLightboxOpen(true)
  }

  function prev() {
    setLightboxIndex((i) => (i === 0 ? photos.length - 1 : i - 1))
  }

  function next() {
    setLightboxIndex((i) => (i === photos.length - 1 ? 0 : i + 1))
  }

  return (
    <>
      {/* Gallery grid */}
      <div className="rounded-xl overflow-hidden">
        <div className="grid grid-cols-2 gap-2 h-64 sm:h-80 lg:h-96">
          {/* Main large image */}
          <div
            className="relative col-span-2 sm:col-span-1 cursor-pointer"
            onClick={() => openLightbox(0)}
          >
            <Image
              src={mainPhoto}
              alt={`${propertyName} — main photo`}
              fill
              className="object-cover hover:brightness-90 transition-all"
              sizes="(max-width: 640px) 100vw, 50vw"
              priority
            />
          </div>

          {/* Thumbnails */}
          <div className="hidden sm:grid grid-rows-2 gap-2">
            {thumbs.map((photo, i) => (
              <div
                key={i}
                className="relative cursor-pointer"
                onClick={() => openLightbox(i + 1)}
              >
                <Image
                  src={photo}
                  alt={`${propertyName} photo ${i + 2}`}
                  fill
                  className="object-cover hover:brightness-90 transition-all"
                  sizes="25vw"
                />
                {i === 1 && photos.length > 3 && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white font-medium">
                    +{photos.length - 3} more
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {photos.length > 1 && (
          <button
            onClick={() => openLightbox(0)}
            className="mt-2 text-sm text-nn-green hover:text-green-800 font-medium transition-colors"
          >
            View all {photos.length} photos →
          </button>
        )}
      </div>

      {/* Lightbox */}
      {lightboxOpen && (
        <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center">
          <button
            onClick={() => setLightboxOpen(false)}
            className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors"
            aria-label="Close gallery"
          >
            <X size={28} />
          </button>

          <button
            onClick={prev}
            className="absolute left-4 text-white hover:text-gray-300 p-2 transition-colors"
            aria-label="Previous"
          >
            <ChevronLeft size={36} />
          </button>

          <div className="relative w-full max-w-4xl h-[70vh] mx-16">
            <Image
              src={photos[lightboxIndex] ?? ''}
              alt={`${propertyName} — photo ${lightboxIndex + 1}`}
              fill
              className="object-contain"
              sizes="100vw"
            />
          </div>

          <button
            onClick={next}
            className="absolute right-4 text-white hover:text-gray-300 p-2 transition-colors"
            aria-label="Next"
          >
            <ChevronRight size={36} />
          </button>

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white text-sm opacity-70">
            {lightboxIndex + 1} / {photos.length}
          </div>
        </div>
      )}
    </>
  )
}
