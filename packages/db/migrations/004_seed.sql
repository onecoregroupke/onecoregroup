-- Migration 004: Seed data

-- ─── BRANDS ──────────────────────────────────────────────────────────────────
INSERT INTO brands (slug, name, short_name, color_hex, whatsapp_number) VALUES
('nairobi-piano-technicians', 'Nairobi Piano Technicians', 'NPT', '#1a1a2e', NULL),
('glitz-n-glim', 'Glitz N'' Glim', 'Glitz', '#b07a00', NULL),
('nuuranest-stays', 'Nuuranest Stays', 'Nuura', '#1a6b42', NULL),
('ar-rayyan-playhouse', 'Ar-Rayyan Playhouse & Daycare', 'Ar-Rayyan', '#2c45a0', NULL),
('rhythms-college', 'Rhythms College', 'Rhythms', '#9a2a2a', NULL),
('darul-swafa', 'Darul Swafa', 'Darul', '#2a6a2a', NULL)
ON CONFLICT (slug) DO NOTHING;

-- ─── PLACEHOLDER PROPERTIES ──────────────────────────────────────────────────
INSERT INTO properties (
  slug, name, tagline, location, neighbourhood, short_description,
  bedrooms, bathrooms, max_guests, price_per_night_ksh, is_featured, sort_order,
  amenities, highlights, house_rules,
  photos
) VALUES
(
  'nuuranest-nyali-one',
  'Nuuranest Nyali One',
  'Coastal comfort in the heart of Nyali',
  'Mombasa, Kenya', 'Nyali',
  'A beautifully appointed short-stay unit in Nyali with modern amenities and coastal charm.',
  2, 1, 4, 8000, true, 1,
  '["WiFi", "Air Conditioning", "Kitchen", "Hot Shower", "TV", "Parking"]'::jsonb,
  '["Modern furnishings", "Prime Nyali location", "Quiet neighbourhood", "Fast WiFi"]'::jsonb,
  '["No smoking indoors", "No parties or events", "Check-in from 2PM", "Check-out by 11AM"]'::jsonb,
  '["https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?w=800", "https://images.unsplash.com/photo-1560185007-cde436f6a4d0?w=800"]'::jsonb
),
(
  'nuuranest-nyali-two',
  'Nuuranest Nyali Two',
  'Your home by the coast',
  'Mombasa, Kenya', 'Nyali',
  'Spacious and comfortable unit ideal for families and business travellers in Nyali.',
  2, 1, 4, 8500, false, 2,
  '["WiFi", "Air Conditioning", "Kitchen", "Hot Shower", "TV", "Parking", "Washing Machine"]'::jsonb,
  '["Spacious layout", "Family-friendly", "Close to Nyali Centre Mall", "Secure compound"]'::jsonb,
  '["No smoking indoors", "No parties or events", "Check-in from 2PM", "Check-out by 11AM", "Pets not allowed"]'::jsonb,
  '["https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800", "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800"]'::jsonb
),
(
  'nuuranest-nyali-three',
  'Nuuranest Nyali Three',
  'Modern living, coastal style',
  'Mombasa, Kenya', 'Nyali',
  'A stylish unit in Nyali with full amenities for the discerning traveller.',
  1, 1, 2, 6500, false, 3,
  '["WiFi", "Air Conditioning", "Kitchenette", "Hot Shower", "Smart TV"]'::jsonb,
  '["Modern design", "Ideal for couples or solo travellers", "Walking distance to restaurants"]'::jsonb,
  '["No smoking indoors", "Check-in from 2PM", "Check-out by 11AM"]'::jsonb,
  '["https://images.unsplash.com/photo-1598928506311-c55ded91a20c?w=800", "https://images.unsplash.com/photo-1484154218962-a197022b5858?w=800"]'::jsonb
),
(
  'nuuranest-bamburi-one',
  'Nuuranest Bamburi One',
  'Wake up to the sound of the ocean',
  'Mombasa, Kenya', 'Bamburi',
  'A serene retreat in Bamburi, steps from the beach and Mombasa''s best restaurants.',
  2, 1, 4, 9000, true, 4,
  '["WiFi", "Air Conditioning", "Full Kitchen", "Hot Shower", "TV", "Parking", "Balcony"]'::jsonb,
  '["Steps from Bamburi Beach", "Ocean views from balcony", "Near Haller Park", "Quiet and secure"]'::jsonb,
  '["No smoking indoors", "No parties", "Respect quiet hours (10PM–7AM)", "Check-in from 2PM", "Check-out by 11AM"]'::jsonb,
  '["https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?w=800", "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=800"]'::jsonb
),
(
  'nuuranest-bamburi-two',
  'Nuuranest Bamburi Two',
  'A peaceful escape in Bamburi',
  'Mombasa, Kenya', 'Bamburi',
  'Comfortable and well-equipped unit in Bamburi, perfect for a relaxing coastal stay.',
  1, 1, 2, 7000, false, 5,
  '["WiFi", "Air Conditioning", "Kitchen", "Hot Shower", "TV"]'::jsonb,
  '["Cosy and well-maintained", "Near Bamburi Beach Hotel", "Great for weekend getaways"]'::jsonb,
  '["No smoking", "Check-in from 2PM", "Check-out by 11AM"]'::jsonb,
  '["https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=800", "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=800"]'::jsonb
)
ON CONFLICT (slug) DO NOTHING;

-- ─── PLACEHOLDER REVIEWS ─────────────────────────────────────────────────────
INSERT INTO property_reviews (property_id, reviewer_name, reviewer_location, rating, review_text, platform, review_date, is_featured)
SELECT
  p.id,
  r.reviewer_name,
  r.reviewer_location,
  r.rating,
  r.review_text,
  r.platform,
  r.review_date::DATE,
  r.is_featured
FROM properties p
CROSS JOIN (
  VALUES
    ('Amina W.', 'Nairobi, Kenya', 5, 'Absolutely loved our stay! The apartment was spotless, the AC worked perfectly, and the host was responsive. Will definitely book again.', 'booking_com', '2025-03-15', true),
    ('David M.', 'Kampala, Uganda', 5, 'Perfect location, great value for money. Felt right at home. The kitchen was well-stocked and the WiFi was fast.', 'airbnb', '2025-02-20', true),
    ('Fatima A.', 'Dubai, UAE', 4, 'Lovely apartment in a quiet neighbourhood. Very clean and comfortable. Easy check-in process.', 'booking_com', '2025-01-10', true)
) AS r(reviewer_name, reviewer_location, rating, review_text, platform, review_date, is_featured)
WHERE p.slug = 'nuuranest-nyali-one'
ON CONFLICT DO NOTHING;
