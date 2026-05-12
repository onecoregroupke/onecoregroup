import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { allProducts, getProduct, WHATSAPP, waLink } from '@/lib/products'

export function generateStaticParams() {
  return allProducts.map(p => ({ id: p.id }))
}

const WA_ICON = (
  <svg className="w-5 h-5 shrink-0" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
)

/** Placeholder gallery slot — shown for images not yet available */
function GalleryPlaceholder({ accent, label }: { accent: string; label?: string }) {
  return (
    <div
      className="relative w-full h-full rounded-xl flex flex-col items-center justify-center gap-2 overflow-hidden"
      style={{ background: `linear-gradient(135deg, ${accent}18 0%, ${accent}08 100%)` }}
    >
      <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: `${accent}22` }}>
        <svg className="w-5 h-5" style={{ color: accent }} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
        </svg>
      </div>
      <p className="text-[10px] font-semibold text-gray-400">{label ?? 'Photo coming soon'}</p>
    </div>
  )
}

export default function ProductPage({ params }: { params: { id: string } }) {
  const product = getProduct(params.id)
  if (!product) notFound()

  const { accent } = product
  const displayName = product.variant ? `${product.name} — ${product.variant}` : product.name

  return (
    <div className="min-h-screen bg-[#f7f7f5]">

      {/* ── Top bar ── */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link
            href={`/#${product.categoryId}`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            Catalogue
          </Link>
          <span className="text-gray-300">/</span>
          <span className="text-sm font-medium text-gray-900 truncate">{displayName}</span>
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-14">

          {/* ── Gallery ── */}
          <div className="space-y-3">
            {/* Main image */}
            <div className="relative w-full aspect-[4/5] rounded-2xl overflow-hidden bg-gray-100 shadow-sm">
              <Image
                src={product.image}
                alt={displayName}
                fill
                priority
                className="object-cover object-center"
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
            </div>

            {/* Thumbnail row — placeholders for additional photos */}
            <div className="grid grid-cols-3 gap-3">
              <div className="aspect-square rounded-xl overflow-hidden bg-gray-100">
                <GalleryPlaceholder accent={accent} />
              </div>
              <div className="aspect-square rounded-xl overflow-hidden bg-gray-100">
                <GalleryPlaceholder accent={accent} />
              </div>
              <div className="aspect-square rounded-xl overflow-hidden bg-gray-100">
                <GalleryPlaceholder accent={accent} label="Lifestyle shot" />
              </div>
            </div>
          </div>

          {/* ── Product info ── */}
          <div className="flex flex-col gap-6">

            {/* Category + name */}
            <div>
              <p className="text-xs font-bold tracking-widest uppercase mb-2" style={{ color: accent }}>
                {product.categoryName}
              </p>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 leading-tight tracking-tight">
                {product.name}
              </h1>
              {product.variant && (
                <span
                  className="inline-block mt-2 text-sm font-bold px-3 py-1 rounded-full"
                  style={{ backgroundColor: `${accent}18`, color: accent }}
                >
                  {product.variant}
                </span>
              )}
            </div>

            {/* Price */}
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-gray-900">Ksh 100</span>
              <span className="text-sm text-gray-400 font-medium">/ starting price</span>
            </div>

            {/* Sizes */}
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Available Sizes</p>
              <div className="flex flex-wrap gap-2">
                {product.sizes.map(s => (
                  <span
                    key={s}
                    className="text-sm font-semibold px-3 py-1.5 rounded-lg border-2"
                    style={{ borderColor: `${accent}40`, color: accent, backgroundColor: `${accent}08` }}
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>

            {/* Description */}
            <div>
              <p className="text-sm leading-relaxed text-gray-600">{product.description}</p>
            </div>

            {/* Order CTA */}
            <div className="flex flex-col sm:flex-row gap-3">
              <a
                href={waLink(product.name, product.variant)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 bg-[#25d366] text-white font-bold px-6 py-4 rounded-2xl hover:bg-[#1da851] transition-colors text-base shadow-lg shadow-green-200"
              >
                {WA_ICON}
                Order on WhatsApp
              </a>
              <a
                href={`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(`Hi! I have a question about *${displayName}*.`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 border-2 border-gray-200 text-gray-700 font-semibold px-6 py-4 rounded-2xl hover:border-gray-300 hover:bg-gray-50 transition-colors text-sm"
              >
                Ask a question
              </a>
            </div>

            {/* Divider */}
            <div className="h-px bg-gray-200" />

            {/* Key features */}
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Key Features</p>
              <ul className="space-y-2">
                {product.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-gray-700">
                    <span className="mt-0.5 w-4 h-4 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: `${accent}20` }}>
                      <svg className="w-2.5 h-2.5" style={{ color: accent }} fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            {/* Usage */}
            <div className="rounded-2xl p-4" style={{ backgroundColor: `${accent}08`, borderLeft: `3px solid ${accent}` }}>
              <p className="text-xs font-bold uppercase tracking-wide mb-1.5" style={{ color: accent }}>How to Use</p>
              <p className="text-sm text-gray-700 leading-relaxed">{product.usage}</p>
            </div>

          </div>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="bg-gray-950 text-white py-10 px-6 text-center mt-10">
        <p className="text-lg font-black mb-1">Glitz N&apos; Glim</p>
        <p className="text-amber-400 text-xs mb-4">Iceland Geysers · Premium Cleaning Products</p>
        <a
          href={`https://wa.me/${WHATSAPP}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-[#25d366] font-semibold hover:underline text-sm"
        >
          {WA_ICON}
          +254 792 967822
        </a>
        <p className="text-gray-600 text-xs mt-6">A One Core Group brand · &copy; {new Date().getFullYear()}</p>
      </footer>
    </div>
  )
}
