-- Migration 002: Nuuranest Stays tables

-- ─── PROPERTIES ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  tagline TEXT,
  location TEXT NOT NULL,
  neighbourhood TEXT NOT NULL,
  short_description TEXT,
  full_description TEXT,
  bedrooms INTEGER,
  bathrooms INTEGER,
  max_guests INTEGER,
  size_sqm INTEGER,
  price_per_night_ksh DECIMAL(10,2),
  weekend_price_ksh DECIMAL(10,2),
  photos JSONB DEFAULT '[]',
  amenities JSONB DEFAULT '[]',
  highlights JSONB DEFAULT '[]',
  house_rules JSONB DEFAULT '[]',
  booking_com_url TEXT,
  airbnb_url TEXT,
  whatsapp_number TEXT,
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  is_featured BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── PROPERTY_ENQUIRIES ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS property_enquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id),
  property_name TEXT,
  guest_name TEXT NOT NULL,
  guest_email TEXT,
  guest_phone TEXT NOT NULL,
  check_in DATE,
  check_out DATE,
  num_guests INTEGER,
  num_nights INTEGER GENERATED ALWAYS AS
    (CASE WHEN check_out IS NOT NULL AND check_in IS NOT NULL THEN (check_out - check_in) ELSE NULL END) STORED,
  message TEXT,
  source TEXT DEFAULT 'website',
  status TEXT DEFAULT 'new',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── PROPERTY_REVIEWS ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS property_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id),
  reviewer_name TEXT NOT NULL,
  reviewer_location TEXT,
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  review_text TEXT NOT NULL,
  platform TEXT DEFAULT 'booking_com',
  review_date DATE,
  is_featured BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── ROW LEVEL SECURITY ───────────────────────────────────────────────────────
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_enquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_reviews ENABLE ROW LEVEL SECURITY;

-- Properties + reviews: publicly readable (website needs them without auth)
CREATE POLICY "properties_public_read" ON properties FOR SELECT USING (is_active = true);
CREATE POLICY "property_reviews_public_read" ON property_reviews FOR SELECT USING (true);

-- Enquiries: anyone can insert (contact form), auth or service role can read
CREATE POLICY "property_enquiries_insert" ON property_enquiries FOR INSERT WITH CHECK (true);
CREATE POLICY "property_enquiries_auth_read" ON property_enquiries FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "property_enquiries_service" ON property_enquiries USING (auth.role() = 'service_role') WITH CHECK (true);

-- Properties: service role can write
CREATE POLICY "properties_service" ON properties USING (auth.role() = 'service_role') WITH CHECK (true);
