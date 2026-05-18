import Image from 'next/image'
import Link from 'next/link'
import { fetchActiveProducts, groupByCategory, WHATSAPP } from '@/lib/products'
import type { Product } from '@/lib/products'

// Always render server-side so the catalogue reflects the latest DB state
export const dynamic = 'force-dynamic'

const WA_ICON = (
  <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
)

function ProductCard({ p, accent }: { p: Product; accent: string }) {
  const mainImage = p.images?.[0] ?? null
  const waMsg = `Hi! I'd like to order *${p.variant ? `${p.name} (${p.variant})` : p.name}*. Please confirm the price and available sizes.`
  const startingPrice = p.sizes?.[0]?.price_ksh ?? p.price_ksh ?? null

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 group">
      {/* Clickable area → product page */}
      <Link href={`/products/${p.slug}`} className="flex flex-col flex-1">
        {/* Image */}
        <div className="relative w-full aspect-[3/4] sm:aspect-[2/3] bg-gray-50">
          {mainImage ? (
            <Image
              src={mainImage}
              alt={p.variant ? `${p.name} ${p.variant}` : p.name}
              fill
              className="object-cover object-center group-hover:scale-[1.02] transition-transform duration-300"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            />
          ) : (
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{ background: `linear-gradient(135deg, ${accent}18 0%, ${accent}08 100%)` }}
            >
              <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 18h16.5M21 12V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12" />
              </svg>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="p-3 sm:p-4 flex flex-col gap-2">
          {/* Name + variant */}
          <div className="space-y-1.5">
            <h3 className="text-xs sm:text-sm font-bold text-gray-900 leading-tight">{p.name}</h3>
            {p.variant && (
              <span
                className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ backgroundColor: `${accent}18`, color: accent }}
              >
                {p.variant}
              </span>
            )}
          </div>

          {/* Sizes */}
          {p.sizes && p.sizes.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {p.sizes.map(s => (
                <span key={s.label} className="text-[10px] font-medium px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-md">
                  {s.label}
                </span>
              ))}
            </div>
          )}

          {/* Price */}
          <div className="pt-1 border-t border-gray-100">
            <p className="text-[9px] text-gray-400 uppercase tracking-wide leading-none mb-0.5">
              {p.sizes && p.sizes.length > 1 ? 'From' : 'Price'}
            </p>
            <p className="text-sm font-extrabold text-gray-900">
              {startingPrice != null ? `Ksh ${startingPrice.toLocaleString()}` : 'Contact for price'}
            </p>
          </div>
        </div>
      </Link>

      {/* WhatsApp CTA — outside the Link to avoid nested <a> */}
      <div className="px-3 sm:px-4 pb-3 sm:pb-4">
        <a
          href={`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(waMsg)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 bg-[#25d366] text-white text-xs font-bold w-full py-2.5 rounded-xl hover:bg-[#1da851] transition-colors"
        >
          {WA_ICON}
          Order on WhatsApp
        </a>
      </div>
    </div>
  )
}

export default async function CataloguePage() {
  const products = await fetchActiveProducts()
  const categories = groupByCategory(products)

  return (
    <div className="min-h-screen bg-[#f7f7f5]">

      {/* ── Hero image — fully visible, no overlay ── */}
      <header className="w-full bg-[#a8dff0]">
        <Image
          src="/hero.png"
          alt="Glitz N' Glim product range"
          width={1500}
          height={630}
          priority
          className="w-full h-auto object-contain"
          sizes="100vw"
        />
      </header>

      {/* ── Brand intro — below the hero ── */}
      <div className="bg-white border-b border-gray-100 py-8 px-6 text-center">
        <p className="text-[#1a8abf] text-[11px] font-black tracking-[0.35em] uppercase mb-2">Iceland Geysers</p>
        <h1 className="text-4xl sm:text-5xl font-black text-gray-900 tracking-tight leading-tight mb-3">
          Glitz N&apos; Glim
        </h1>
        <p className="text-gray-500 text-sm sm:text-base max-w-sm mx-auto leading-relaxed mb-6">
          Premium cleaning &amp; personal care — powered by the purity of Iceland Geysers.
        </p>
        <div className="flex flex-wrap gap-3 items-center justify-center">
          <a
            href={`https://wa.me/${WHATSAPP}?text=${encodeURIComponent("Hi! I'd like to browse the Glitz N' Glim product catalogue.")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-[#25d366] text-white font-bold px-6 py-3 rounded-full hover:bg-[#1da851] transition-colors text-sm shadow-lg shadow-green-900/30"
          >
            {WA_ICON}
            Order on WhatsApp
          </a>
          {categories.length > 0 && (
            <a href={`#${categories[0].id}`} className="text-gray-500 text-sm font-medium hover:text-gray-800 transition-colors underline underline-offset-4">
              Browse catalogue ↓
            </a>
          )}
        </div>
      </div>

      {/* ── Category nav ── */}
      {categories.length > 0 && (
        <nav className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-gray-200 shadow-sm">
          <div className="max-w-7xl mx-auto flex overflow-x-auto gap-1 px-4 py-2.5 no-scrollbar">
            {categories.map(cat => (
              <a
                key={cat.id}
                href={`#${cat.id}`}
                className="whitespace-nowrap text-sm font-bold px-4 py-2 rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors flex-shrink-0"
              >
                {cat.name}
              </a>
            ))}
          </div>
        </nav>
      )}

      {/* ── Catalogue ── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-12 space-y-16">
        {categories.length === 0 ? (
          <div className="text-center py-24 text-gray-400">
            <p className="text-lg font-semibold mb-2">Catalogue coming soon</p>
            <p className="text-sm">Check back shortly or reach us on WhatsApp.</p>
          </div>
        ) : (
          categories.map((cat) => (
            <section key={cat.id} id={cat.id} className="scroll-mt-14">
              {/* Category divider */}
              <div className="flex items-stretch gap-5 mb-7">
                <div className="w-1 sm:w-[3px] rounded-full shrink-0" style={{ backgroundColor: cat.accent }} />
                <div className="flex-1 min-w-0 py-1">
                  <h2 className="text-3xl sm:text-4xl font-black text-gray-900 leading-tight tracking-tight">
                    {cat.name}
                  </h2>
                </div>
                <div className="self-center shrink-0">
                  <span
                    className="text-xs font-bold px-3 py-1 rounded-full"
                    style={{ backgroundColor: `${cat.accent}18`, color: cat.accent }}
                  >
                    {cat.products.length} item{cat.products.length !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
              <div className="h-px bg-gray-200 mb-7" />

              {/* Product grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
                {cat.products.map(p => (
                  <ProductCard key={p.id} p={p} accent={cat.accent} />
                ))}
              </div>
            </section>
          ))
        )}
      </main>

      {/* ── Footer ── */}
      <footer className="relative overflow-hidden bg-gray-950 text-white py-16 px-6 text-center mt-10">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-900/10 via-transparent to-transparent pointer-events-none" />
        <div className="relative z-10">
          <p className="text-2xl font-black tracking-tight mb-1">Glitz N&apos; Glim</p>
          <p className="text-amber-400 text-xs font-semibold tracking-widest uppercase mb-6">Iceland Geysers · Premium Cleaning Products</p>
          <a
            href={`https://wa.me/${WHATSAPP}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-[#25d366] text-white font-bold px-6 py-3 rounded-full hover:bg-[#1da851] transition-colors text-sm shadow-lg"
          >
            {WA_ICON}
            +254 792 967822
          </a>
          <p className="text-gray-600 text-xs mt-8">A One Core Group brand · &copy; {new Date().getFullYear()}</p>
        </div>
      </footer>
    </div>
  )
}
