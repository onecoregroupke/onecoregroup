import Image from 'next/image'

const WHATSAPP = '254792967822'

const WA_ICON = (
  <svg className="w-5 h-5 shrink-0" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
)

function waLink(product: string, variant?: string) {
  const name = variant ? `${product} (${variant})` : product
  const msg = `Hi! I'd like to order *${name}*. Please confirm the price and available sizes.`
  return `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(msg)}`
}

const categories = [
  {
    id: 'handwash',
    name: 'Hand Washing Liquid',
    accent: '#0ea5e9',
    products: [
      { id: 'handwash-lavender',   name: 'Handwash Liquid Soap', variant: 'Lavender',   sizes: ['500ml', '5ltrs', '20ltrs'], image: '/products/handwash-lavender.png' },
      { id: 'handwash-lemon',      name: 'Handwash Liquid Soap', variant: 'Lemon',      sizes: ['500ml', '5ltrs', '20ltrs'], image: '/products/handwash-lemon.png' },
      { id: 'handwash-strawberry', name: 'Handwash Liquid Soap', variant: 'Strawberry', sizes: ['500ml', '5ltrs', '20ltrs'], image: '/products/handwash-strawberry.png' },
      { id: 'handwash-caramel',    name: 'Handwash Liquid Soap', variant: 'Caramel',    sizes: ['500ml', '5ltrs', '20ltrs'], image: '/products/handwash-caramel.png' },
    ],
  },
  {
    id: 'toilet',
    name: 'Toilet Cleaning Detergents',
    accent: '#dc2626',
    products: [
      { id: 'toilet-hawaiian', name: 'Toilet Cleaner', variant: 'Hawaiian Fresh', sizes: ['250ml', '500ml', '1ltr', '5ltrs', '20ltrs'], image: '/products/toilet-cleaner-hawaiian.png' },
      { id: 'toilet-lemon',    name: 'Toilet Cleaner', variant: 'Lemon Fresh',    sizes: ['250ml', '500ml', '1ltr', '5ltrs', '20ltrs'], image: '/products/toilet-cleaner-lemon.png' },
      { id: 'toilet-lavender', name: 'Toilet Cleaner', variant: 'Lavender Fresh', sizes: ['250ml', '500ml', '1ltr', '5ltrs', '20ltrs'], image: '/products/toilet-cleaner-lavender.png' },
    ],
  },
  {
    id: 'dishwash',
    name: 'Dishwashing Liquid Soap',
    accent: '#ca8a04',
    products: [
      { id: 'dishwash', name: 'Dishwashing Liquid Soap', variant: undefined, sizes: ['500ml', '5ltrs', '20ltrs'], image: '/products/dishwashing-soap.png' },
    ],
  },
  {
    id: 'surface',
    name: 'Surface Cleaning Detergents',
    accent: '#16a34a',
    products: [
      { id: 'multipurpose', name: 'Multi-Purpose Cleaner',  variant: undefined, sizes: ['500ml', '1ltr', '5ltrs', '20ltrs'], image: '/products/multipurpose-cleaner.png' },
      { id: 'multisurface', name: 'Multi-Surface Cleaner',  variant: undefined, sizes: ['500ml', '5ltrs', '20ltrs'],         image: '/products/multisurface-cleaner.png' },
      { id: 'floor',        name: 'Floor Cleaner',          variant: undefined, sizes: ['500ml', '5ltrs', '20ltrs'],         image: '/products/floor-cleaner.png' },
      { id: 'glass',        name: 'Glass & Window Cleaner', variant: undefined, sizes: ['500ml', '5ltrs', '20ltrs'],         image: '/products/glass-window-cleaner.png' },
    ],
  },
  {
    id: 'laundry',
    name: 'Fabric & Laundry Care',
    accent: '#1d4ed8',
    products: [
      { id: 'bleach',          name: "Glitz N' Glim Bleach", variant: undefined, sizes: ['70ml', '250ml', '500ml', '1ltr', '5ltrs', '20ltrs'],  image: '/products/bleach.png' },
      { id: 'fabric-softener', name: 'Fabric Softener',      variant: undefined, sizes: ['250ml', '500ml', '1ltr', '2ltrs', '5ltrs', '20ltrs'], image: '/products/fabric-softener.png' },
    ],
  },
  {
    id: 'bodycare',
    name: 'Body & Skin Care',
    accent: '#db2777',
    products: [
      { id: 'shampoo',    name: "Glitz N' Glim Shampoo", variant: undefined, sizes: ['250ml', '500ml', '5ltrs', '20ltrs'],  image: '/products/shampoo.png' },
      { id: 'shower-gel', name: 'Shower Gel',            variant: undefined, sizes: ['400ml', '750ml', '5ltrs', '20ltrs'], image: '/products/shower-gel.png' },
    ],
  },
]

export default function CataloguePage() {
  return (
    <div className="min-h-screen bg-[#f7f7f5]">

      {/* ── Hero ── */}
      <header className="relative min-h-[72vh] flex items-end overflow-hidden bg-gray-950">
        <Image
          src="/hero.jpg"
          alt="Glitz N' Glim product range"
          fill
          priority
          className="object-cover object-center"
          sizes="100vw"
        />
        {/* Layered gradient: strong at bottom for text legibility, subtle vignette top */}
        <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-950/55 to-gray-950/10" />
        <div className="absolute inset-0 bg-gradient-to-r from-gray-950/50 to-transparent" />

        <div className="relative z-10 w-full max-w-3xl px-6 sm:px-10 pb-14 pt-24">
          <p className="text-amber-400 text-[10px] font-black tracking-[0.35em] uppercase mb-4">
            Iceland Geysers
          </p>
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black text-white tracking-tight leading-[0.95] mb-5">
            Glitz N&apos;<br />Glim
          </h1>
          <p className="text-gray-300 text-sm sm:text-base max-w-xs leading-relaxed mb-8">
            Premium cleaning &amp; personal care — powered by the purity of Iceland Geysers.
          </p>
          <div className="flex flex-wrap gap-3 items-center">
            <a
              href={`https://wa.me/${WHATSAPP}?text=${encodeURIComponent("Hi! I'd like to browse the Glitz N' Glim product catalogue.")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-[#25d366] text-white font-bold px-6 py-3 rounded-full hover:bg-[#1da851] transition-colors text-sm shadow-lg shadow-green-900/30"
            >
              {WA_ICON}
              Order on WhatsApp
            </a>
            <a href="#handwash" className="text-white/70 text-sm font-medium hover:text-white transition-colors underline underline-offset-4">
              Browse catalogue ↓
            </a>
          </div>
        </div>
      </header>

      {/* ── Category nav ── */}
      <nav className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto flex overflow-x-auto gap-1 px-4 py-2.5 no-scrollbar">
          {categories.map(cat => (
            <a
              key={cat.id}
              href={`#${cat.id}`}
              className="whitespace-nowrap text-xs font-semibold px-3.5 py-1.5 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors flex-shrink-0"
            >
              {cat.name}
            </a>
          ))}
        </div>
      </nav>

      {/* ── Catalogue ── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-12 space-y-16">
        {categories.map((cat, index) => (
          <section key={cat.id} id={cat.id} className="scroll-mt-14">

            {/* ── Category divider ── */}
            <div className="flex items-stretch gap-5 mb-7">
              {/* Accent bar */}
              <div className="w-[3px] rounded-full shrink-0" style={{ backgroundColor: cat.accent }} />

              <div className="flex-1 min-w-0 py-1">
                <p className="text-[10px] font-black tracking-[0.3em] uppercase mb-1" style={{ color: cat.accent }}>
                  {String(index + 1).padStart(2, '0')} · Category
                </p>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 leading-tight tracking-tight">
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

            {/* Thin separator */}
            <div className="h-px bg-gray-200 mb-7" />

            {/* Product grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
              {cat.products.map(p => (
                <div
                  key={p.id}
                  className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
                >
                  {/* Image */}
                  <div className="relative w-full aspect-[3/4] bg-gray-50">
                    <Image
                      src={p.image}
                      alt={p.variant ? `${p.name} ${p.variant}` : p.name}
                      fill
                      className="object-cover object-top"
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    />
                    {/* Variant badge overlaid on image */}
                    {p.variant && (
                      <span
                        className="absolute top-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded-full text-white shadow"
                        style={{ backgroundColor: cat.accent }}
                      >
                        {p.variant}
                      </span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-3.5 flex flex-col flex-1 gap-2.5">
                    <div>
                      <h3 className="text-sm font-bold text-gray-900 leading-tight">{p.name}</h3>
                    </div>

                    {/* Sizes */}
                    <div className="flex flex-wrap gap-1">
                      {p.sizes.map(s => (
                        <span key={s} className="text-[10px] font-medium px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-md">
                          {s}
                        </span>
                      ))}
                    </div>

                    {/* Price + CTA */}
                    <div className="mt-auto flex items-center justify-between pt-2.5 border-t border-gray-100">
                      <div>
                        <p className="text-[9px] text-gray-400 uppercase tracking-wide leading-none mb-0.5">From</p>
                        <p className="text-base font-extrabold text-gray-900 leading-none">Ksh 100</p>
                      </div>
                      <a
                        href={waLink(p.name, p.variant)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-white text-xs font-bold px-3 py-2 rounded-full hover:opacity-90 transition-opacity shadow-sm"
                        style={{ backgroundColor: cat.accent }}
                      >
                        <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                        </svg>
                        Order
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </main>

      {/* ── Footer ── */}
      <footer className="relative overflow-hidden bg-gray-950 text-white py-16 px-6 text-center mt-10">
        {/* Subtle background glow */}
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
