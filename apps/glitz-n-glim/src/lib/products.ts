export const WHATSAPP = '254792967822'

export function waLink(product: string, variant?: string) {
  const name = variant ? `${product} (${variant})` : product
  const msg = `Hi! I'd like to order *${name}*. Please confirm the price and available sizes.`
  return `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(msg)}`
}

export interface Product {
  id: string
  name: string
  variant?: string
  sizes: string[]
  image: string
  price: number
  description: string
  features: string[]
  usage: string
  categoryId: string
  categoryName: string
  accent: string
}

export interface Category {
  id: string
  name: string
  accent: string
  products: Product[]
}

export const categories: Category[] = [
  {
    id: 'handwash',
    name: 'Hand Washing Liquid',
    accent: '#0ea5e9',
    products: [
      {
        id: 'handwash-lavender',
        name: 'Handwash Liquid Soap',
        variant: 'Lavender',
        sizes: ['500ml', '5ltrs', '20ltrs'],
        image: '/products/handwash-lavender.png',
        price: 100,
        description: 'A gentle yet effective hand washing liquid enriched with real lavender extracts and Iceland Geyser minerals. The calming lavender scent lingers after washing, leaving your hands feeling soft, clean and beautifully fragranced.',
        features: [
          'Kills 99.9% of germs and bacteria',
          'Enriched with calming lavender extracts',
          'pH-balanced to protect skin',
          'Moisturising formula with glycerine',
          'Suitable for frequent use',
        ],
        usage: 'Apply a small amount to wet hands. Lather well and scrub for at least 20 seconds, then rinse thoroughly with clean water.',
        categoryId: 'handwash',
        categoryName: 'Hand Washing Liquid',
        accent: '#0ea5e9',
      },
      {
        id: 'handwash-lemon',
        name: 'Handwash Liquid Soap',
        variant: 'Lemon',
        sizes: ['500ml', '5ltrs', '20ltrs'],
        image: '/products/handwash-lemon.png',
        price: 100,
        description: 'A refreshing hand washing liquid bursting with zesty lemon freshness. Powered by Iceland Geyser minerals and citrus extracts, it cuts through grease and grime while leaving a bright, clean scent.',
        features: [
          'Kills 99.9% of germs and bacteria',
          'Fresh lemon citrus scent',
          'Grease-cutting formula',
          'pH-balanced to protect skin',
          'Moisturising formula with glycerine',
        ],
        usage: 'Apply a small amount to wet hands. Lather well and scrub for at least 20 seconds, then rinse thoroughly with clean water.',
        categoryId: 'handwash',
        categoryName: 'Hand Washing Liquid',
        accent: '#0ea5e9',
      },
      {
        id: 'handwash-strawberry',
        name: 'Handwash Liquid Soap',
        variant: 'Strawberry',
        sizes: ['500ml', '5ltrs', '20ltrs'],
        image: '/products/handwash-strawberry.png',
        price: 100,
        description: 'A sweet and playful strawberry-scented hand wash that the whole family will love. Gentle enough for children\'s hands while still providing powerful germ protection powered by Iceland Geyser purity.',
        features: [
          'Kills 99.9% of germs and bacteria',
          'Sweet strawberry fragrance',
          'Gentle formula — safe for all the family',
          'pH-balanced to protect skin',
          'Moisturising formula with glycerine',
        ],
        usage: 'Apply a small amount to wet hands. Lather well and scrub for at least 20 seconds, then rinse thoroughly with clean water.',
        categoryId: 'handwash',
        categoryName: 'Hand Washing Liquid',
        accent: '#0ea5e9',
      },
      {
        id: 'handwash-caramel',
        name: 'Handwash Liquid Soap',
        variant: 'Caramel',
        sizes: ['500ml', '5ltrs', '20ltrs'],
        image: '/products/handwash-caramel.png',
        price: 100,
        description: 'A warm, indulgent caramel-scented hand wash that turns a routine wash into a sensory treat. Rich moisturising agents leave hands smooth and softly scented long after washing.',
        features: [
          'Kills 99.9% of germs and bacteria',
          'Warm indulgent caramel fragrance',
          'Extra moisturising formula',
          'pH-balanced to protect skin',
          'Leaves hands soft and smooth',
        ],
        usage: 'Apply a small amount to wet hands. Lather well and scrub for at least 20 seconds, then rinse thoroughly with clean water.',
        categoryId: 'handwash',
        categoryName: 'Hand Washing Liquid',
        accent: '#0ea5e9',
      },
    ],
  },
  {
    id: 'toilet',
    name: 'Toilet Cleaning Detergents',
    accent: '#dc2626',
    products: [
      {
        id: 'toilet-hawaiian',
        name: 'Toilet Cleaner',
        variant: 'Hawaiian Fresh',
        sizes: ['250ml', '500ml', '1ltr', '5ltrs', '20ltrs'],
        image: '/products/toilet-cleaner-hawaiian.png',
        price: 100,
        description: 'Flush away mess and leave only freshness with our Hawaiian Fresh Toilet Cleaner. The tropical fragrance transforms your bathroom while the powerful formula kills 99.9% of germs and removes tough stains effortlessly.',
        features: [
          'Kills 99.9% of germs and bacteria',
          'Removes limescale and tough stains',
          'Long-lasting Hawaiian Fresh fragrance',
          'Thick formula clings to bowl surfaces',
          'Safe for septic systems',
        ],
        usage: 'Apply under the rim and around the bowl. Leave for 5–10 minutes, scrub with a toilet brush, then flush. For heavy stains, leave overnight.',
        categoryId: 'toilet',
        categoryName: 'Toilet Cleaning Detergents',
        accent: '#dc2626',
      },
      {
        id: 'toilet-lemon',
        name: 'Toilet Cleaner',
        variant: 'Lemon Fresh',
        sizes: ['250ml', '500ml', '1ltr', '5ltrs', '20ltrs'],
        image: '/products/toilet-cleaner-lemon.png',
        price: 100,
        description: 'Powerful lemon-scented toilet cleaner that cuts through grime, limescale and bacteria with ease. The bright citrus fragrance leaves your bathroom smelling clean and fresh for hours.',
        features: [
          'Kills 99.9% of germs and bacteria',
          'Removes limescale and tough stains',
          'Bright lemon citrus fragrance',
          'Thick formula clings to bowl surfaces',
          'Safe for septic systems',
        ],
        usage: 'Apply under the rim and around the bowl. Leave for 5–10 minutes, scrub with a toilet brush, then flush. For heavy stains, leave overnight.',
        categoryId: 'toilet',
        categoryName: 'Toilet Cleaning Detergents',
        accent: '#dc2626',
      },
      {
        id: 'toilet-lavender',
        name: 'Toilet Cleaner',
        variant: 'Lavender Fresh',
        sizes: ['250ml', '500ml', '1ltr', '5ltrs', '20ltrs'],
        image: '/products/toilet-cleaner-lavender.png',
        price: 100,
        description: 'Combine powerful cleaning with the calming scent of lavender. This formula tackles germs, limescale and stains while leaving behind a soothing, long-lasting lavender fragrance that makes your whole bathroom feel spa-fresh.',
        features: [
          'Kills 99.9% of germs and bacteria',
          'Removes limescale and tough stains',
          'Calming lavender fragrance',
          'Thick formula clings to bowl surfaces',
          'Safe for septic systems',
        ],
        usage: 'Apply under the rim and around the bowl. Leave for 5–10 minutes, scrub with a toilet brush, then flush. For heavy stains, leave overnight.',
        categoryId: 'toilet',
        categoryName: 'Toilet Cleaning Detergents',
        accent: '#dc2626',
      },
    ],
  },
  {
    id: 'dishwash',
    name: 'Dishwashing Liquid Soap',
    accent: '#ca8a04',
    products: [
      {
        id: 'dishwash',
        name: 'Dishwashing Liquid Soap',
        variant: undefined,
        sizes: ['500ml', '5ltrs', '20ltrs'],
        image: '/products/dishwashing-soap.png',
        price: 100,
        description: 'Cut through grease in seconds with Glitz N\' Glim Dishwashing Liquid. Powered by Iceland Geyser minerals, it tackles the toughest baked-on food and grease while being gentle on your hands. Leaves dishes sparkling clean.',
        features: [
          'Cuts through grease on contact',
          'Tough on stains, gentle on hands',
          'Sparkling streak-free finish',
          'Fresh citrus scent',
          'Highly concentrated — a little goes a long way',
        ],
        usage: 'Add a few drops to warm water or directly on a sponge. Wash dishes as normal and rinse well. For tough grease, apply directly and leave for a few minutes before scrubbing.',
        categoryId: 'dishwash',
        categoryName: 'Dishwashing Liquid Soap',
        accent: '#ca8a04',
      },
    ],
  },
  {
    id: 'surface',
    name: 'Surface Cleaning Detergents',
    accent: '#16a34a',
    products: [
      {
        id: 'multipurpose',
        name: 'Multi-Purpose Cleaner',
        variant: undefined,
        sizes: ['500ml', '1ltr', '5ltrs', '20ltrs'],
        image: '/products/multipurpose-cleaner.png',
        price: 100,
        description: 'One solution for every mess — Glitz N\' Glim Multi-Purpose Cleaner works on all hard surfaces including kitchens, bathrooms, worktops, appliances and more. Saves time, saves money, and delivers total shine every time.',
        features: [
          'Works on all hard surfaces',
          'Powerful formula removes grease and grime',
          'Time-saving and cost-effective',
          'Leaves a sparkling, streak-free shine',
          'Fresh clean fragrance',
        ],
        usage: 'Spray or apply directly to the surface. Wipe clean with a damp cloth or sponge. For tough stains, leave for 2–3 minutes before wiping.',
        categoryId: 'surface',
        categoryName: 'Surface Cleaning Detergents',
        accent: '#16a34a',
      },
      {
        id: 'multisurface',
        name: 'Multi-Surface Cleaner',
        variant: undefined,
        sizes: ['500ml', '5ltrs', '20ltrs'],
        image: '/products/multisurface-cleaner.png',
        price: 100,
        description: 'Specially formulated for multi-surface use, this cleaner is safe on tiles, glass, stainless steel, plastic and painted surfaces. Removes fingerprints, smudges and everyday dirt without scratching or dulling any surface.',
        features: [
          'Safe on tiles, glass, steel and plastics',
          'Removes fingerprints and smudges',
          'Scratch-free formula',
          'Streak-free finish on glass and chrome',
          'Fresh clean fragrance',
        ],
        usage: 'Apply to the surface and wipe with a clean cloth. For glass and shiny surfaces, buff dry with a microfibre cloth for a streak-free finish.',
        categoryId: 'surface',
        categoryName: 'Surface Cleaning Detergents',
        accent: '#16a34a',
      },
      {
        id: 'floor',
        name: 'Floor Cleaner',
        variant: undefined,
        sizes: ['500ml', '5ltrs', '20ltrs'],
        image: '/products/floor-cleaner.png',
        price: 100,
        description: 'Deep-clean every floor in your home with Glitz N\' Glim Floor Cleaner. Specially formulated to work on tiles, vinyl, laminate and sealed hardwood, it lifts dirt and grime while leaving a freshly-cleaned scent throughout the room.',
        features: [
          'Works on tiles, vinyl, laminate and sealed wood',
          'Deep-cleans and deodorises in one step',
          'Leaves a shiny, streak-free finish',
          'Long-lasting fresh fragrance',
          'Safe for homes with children and pets (when dry)',
        ],
        usage: 'Dilute 30–50ml per bucket of water. Mop as normal. No rinsing required. For spot cleaning, apply a small amount directly and scrub.',
        categoryId: 'surface',
        categoryName: 'Surface Cleaning Detergents',
        accent: '#16a34a',
      },
      {
        id: 'glass',
        name: 'Glass & Window Cleaner',
        variant: undefined,
        sizes: ['500ml', '5ltrs', '20ltrs'],
        image: '/products/glass-window-cleaner.png',
        price: 100,
        description: 'Achieve a crystal-clear, streak-free finish on all glass and windows. The fast-streak-free formula cuts through grease, dust and fingerprints, leaving no oily residue — just sparkling transparency.',
        features: [
          'Fast streak-free formula',
          'Cuts through grease and fingerprints',
          'Leaves no oily residue',
          'Safe on tinted glass and mirrors',
          'Works on glass, mirrors and chrome',
        ],
        usage: 'Spray directly onto the glass surface. Wipe clean with a lint-free cloth or microfibre towel using circular motions, then buff dry for a streak-free finish.',
        categoryId: 'surface',
        categoryName: 'Surface Cleaning Detergents',
        accent: '#16a34a',
      },
    ],
  },
  {
    id: 'laundry',
    name: 'Fabric & Laundry Care',
    accent: '#1d4ed8',
    products: [
      {
        id: 'bleach',
        name: "Glitz N' Glim Bleach",
        variant: undefined,
        sizes: ['70ml', '250ml', '500ml', '1ltr', '5ltrs', '20ltrs'],
        image: '/products/bleach.png',
        price: 100,
        description: 'Restore whites to brilliant brightness and fight the toughest stains with Glitz N\' Glim Bleach. The powerful formula whitens, brightens colours and keeps clothes looking newer for longer — wash after wash.',
        features: [
          'Whitens whites and brightens colours',
          'Fights tough stains in one wash',
          'Removes mould and mildew from fabric',
          'Keeps clothes looking new for longer',
          'Safe for washing machines',
        ],
        usage: 'For whites: add 50ml to the wash cycle with your detergent. For stain removal: dilute 1 part bleach in 10 parts water, apply to stain, leave 5 minutes then wash as normal. Always test on a hidden area first.',
        categoryId: 'laundry',
        categoryName: 'Fabric & Laundry Care',
        accent: '#1d4ed8',
      },
      {
        id: 'fabric-softener',
        name: 'Fabric Softener',
        variant: undefined,
        sizes: ['250ml', '500ml', '1ltr', '2ltrs', '5ltrs', '20ltrs'],
        image: '/products/fabric-softener.png',
        price: 100,
        description: 'Give your fabrics the softness they deserve. Glitz N\' Glim Fabric Softener reduces static, minimises wrinkles and wraps every fibre in a long-lasting freshness that keeps clothes feeling soft and smelling wonderful all day.',
        features: [
          'Soft-touch, long-lasting freshness',
          'Reduces static and ironing wrinkles',
          'Keeps clothes fresher for longer',
          'Gentle on all fabric types',
          'Delicate, long-lasting fragrance',
        ],
        usage: 'Add to the fabric softener compartment of your washing machine or during the final rinse cycle. Use 30–50ml per load depending on load size.',
        categoryId: 'laundry',
        categoryName: 'Fabric & Laundry Care',
        accent: '#1d4ed8',
      },
    ],
  },
  {
    id: 'bodycare',
    name: 'Body & Skin Care',
    accent: '#db2777',
    products: [
      {
        id: 'shampoo',
        name: "Glitz N' Glim Shampoo",
        variant: undefined,
        sizes: ['250ml', '500ml', '5ltrs', '20ltrs'],
        image: '/products/shampoo.png',
        price: 100,
        description: 'Nourish and cleanse your hair with the purity of Iceland Geysers. Glitz N\' Glim Shampoo removes impurities and excess oil while strengthening each strand, leaving your hair feeling clean, light and full of natural shine.',
        features: [
          'Deep cleanses without stripping natural oils',
          'Strengthens and nourishes each strand',
          'Leaves hair shiny and manageable',
          'Suitable for all hair types',
          'Gentle enough for daily use',
        ],
        usage: 'Wet hair thoroughly. Apply a coin-sized amount and work into a rich lather. Massage into scalp and hair for 1–2 minutes, then rinse thoroughly. Follow with conditioner if desired.',
        categoryId: 'bodycare',
        categoryName: 'Body & Skin Care',
        accent: '#db2777',
      },
      {
        id: 'shower-gel',
        name: 'Shower Gel',
        variant: undefined,
        sizes: ['400ml', '750ml', '5ltrs', '20ltrs'],
        image: '/products/shower-gel.png',
        price: 100,
        description: 'Step into freshness every morning with Glitz N\' Glim Shower Gel. The rich, creamy lather cleanses and refreshes skin, while Iceland Geyser minerals help maintain your skin\'s natural moisture balance for a smooth, healthy feel.',
        features: [
          'Rich, creamy lather for thorough cleansing',
          'Maintains skin\'s natural moisture balance',
          'Leaves skin feeling smooth and refreshed',
          'Long-lasting fresh fragrance',
          'Suitable for all skin types',
        ],
        usage: 'Apply to wet skin using a loofah, sponge or hands. Lather well and rinse thoroughly. Use daily for best results.',
        categoryId: 'bodycare',
        categoryName: 'Body & Skin Care',
        accent: '#db2777',
      },
    ],
  },
]

// Flat list for easy lookup by ID
export const allProducts: Product[] = categories.flatMap(c => c.products)

export function getProduct(id: string): Product | undefined {
  return allProducts.find(p => p.id === id)
}
