-- Migration 005: Update property names, slugs, and photos for Nuuranest Stays

-- ─── THE SUNSET SUITE (Nyali, 3BR) — formerly nuuranest-nyali-one ─────────────
UPDATE properties SET
  slug               = 'sunset-suite-nuuranest',
  name               = 'The Sunset Suite by Nuuranest Stays',
  tagline            = 'Luxury 3Br Family Apartment in Nyali',
  neighbourhood      = 'Nyali',
  bedrooms           = 3,
  bathrooms          = 2,
  max_guests         = 6,
  price_per_night_ksh = 15000,
  is_featured        = true,
  sort_order         = 1,
  highlights         = '["Spacious 3-bedroom family layout", "Upmarket Nyali location", "Close to Nyali Beach", "Secure gated compound"]'::jsonb,
  photos             = '["https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?w=800", "https://images.unsplash.com/photo-1560185007-cde436f6a4d0?w=800"]'::jsonb
WHERE slug = 'nuuranest-nyali-one';

-- ─── THE PALM RETREAT (Nyali, 3BR) — formerly nuuranest-nyali-two ────────────
UPDATE properties SET
  slug               = 'palm-retreat-nuuranest',
  name               = 'The Palm Retreat by Nuuranest Stays',
  tagline            = 'Stylish 3 Br Apartment in Nyali',
  neighbourhood      = 'Nyali',
  bedrooms           = 3,
  bathrooms          = 2,
  max_guests         = 6,
  price_per_night_ksh = 14000,
  is_featured        = false,
  sort_order         = 2,
  highlights         = '["Stylish modern interiors", "Family-friendly layout", "Close to Nyali Centre Mall", "Secure compound"]'::jsonb,
  photos             = '["https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800", "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800"]'::jsonb
WHERE slug = 'nuuranest-nyali-two';

-- ─── THE COASTAL HAVEN (Bamburi, 1BR) — formerly nuuranest-nyali-three ───────
UPDATE properties SET
  slug               = 'coastal-haven-nuuranest',
  name               = 'The Coastal Haven by Nuuranest Stays',
  tagline            = 'Cozy 1 Br Apartment in Bamburi',
  neighbourhood      = 'Bamburi',
  bedrooms           = 1,
  bathrooms          = 1,
  max_guests         = 2,
  price_per_night_ksh = 7500,
  is_featured        = true,
  sort_order         = 3,
  highlights         = '["Cosy coastal retreat", "Steps from Bamburi Beach", "Modern interiors", "Ideal for couples"]'::jsonb,
  photos             = '["/properties/coastal-haven/01.jpg", "/properties/coastal-haven/02.png", "/properties/coastal-haven/03.png", "/properties/coastal-haven/04.png", "/properties/coastal-haven/05.png"]'::jsonb
WHERE slug = 'nuuranest-nyali-three';

-- ─── OCEAN BREEZE (Bamburi, 1BR) — formerly nuuranest-bamburi-one ────────────
UPDATE properties SET
  slug               = 'ocean-breeze-nuuranest',
  name               = 'Ocean Breeze by Nuuranest Stays',
  tagline            = 'Elegant 1 Br Apartment in Bamburi',
  neighbourhood      = 'Bamburi',
  bedrooms           = 1,
  bathrooms          = 1,
  max_guests         = 2,
  price_per_night_ksh = 8500,
  is_featured        = false,
  sort_order         = 4,
  highlights         = '["Elegant furnishings", "Ocean breeze location", "Close to Haller Park", "Quiet and secure"]'::jsonb,
  photos             = '["/properties/ocean-breeze/01.png", "/properties/ocean-breeze/02.png", "/properties/ocean-breeze/03.png", "/properties/ocean-breeze/04.png"]'::jsonb
WHERE slug = 'nuuranest-bamburi-one';

-- ─── THE CORAL VIEW (Bamburi, 1BR) — formerly nuuranest-bamburi-two ──────────
UPDATE properties SET
  slug               = 'coral-view-nuuranest',
  name               = 'The Coral View by Nuuranest Stays',
  tagline            = 'Modern 1 Br Apartment in Bamburi',
  neighbourhood      = 'Bamburi',
  bedrooms           = 1,
  bathrooms          = 1,
  max_guests         = 2,
  price_per_night_ksh = 7000,
  is_featured        = false,
  sort_order         = 5,
  highlights         = '["Modern design", "Coral-inspired decor", "Near Bamburi Beach", "Great for weekend getaways"]'::jsonb,
  photos             = '["/properties/coral-view/01.png", "/properties/coral-view/02.png", "/properties/coral-view/03.png", "/properties/coral-view/04.png", "/properties/coral-view/05.png"]'::jsonb
WHERE slug = 'nuuranest-bamburi-two';
