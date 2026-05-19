-- Migration 006: Update amenities and highlights for Nyali and Bamburi properties

-- ─── NYALI PROPERTIES (Sunset Suite + Palm Retreat) ──────────────────────────
UPDATE properties SET
  amenities  = '["3 Spacious Bedrooms with Master Ensuite", "Air Conditioning", "Ceiling Fans", "Smart TV", "Fast Wi-Fi", "Fully Equipped Kitchenette", "24/7 Security", "CCTV Surveillance"]'::jsonb,
  highlights = '["Spacious 3-bedroom layout with master ensuite", "Air conditioning & ceiling fans in every room", "Smart TV & high-speed Wi-Fi", "Fully equipped kitchenette", "24/7 security & CCTV surveillance", "Secure gated compound in Nyali"]'::jsonb
WHERE neighbourhood = 'Nyali';

-- ─── BAMBURI PROPERTIES (Coastal Haven, Ocean Breeze, Coral View) ────────────
UPDATE properties SET
  amenities  = '["Secure 24/7 Parking", "Walking Distance to Beach", "Daily Room Cleaning (Alternate Days)", "Water & Fan", "Netflix", "High-Speed Internet", "Air Conditioning", "Fully Equipped Kitchen"]'::jsonb,
  highlights = '["Steps from Bamburi Beach", "Secure 24/7 parking on-site", "Netflix & high-speed internet included", "Room cleaning on alternate days", "Convenient location near restaurants & shops", "Clean, well-maintained rooms"]'::jsonb
WHERE neighbourhood = 'Bamburi';
