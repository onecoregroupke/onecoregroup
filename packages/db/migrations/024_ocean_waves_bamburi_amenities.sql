-- Migration 024: Normalize Ocean Waves as a Bamburi property with Bamburi amenities.

UPDATE properties SET
  name          = 'Ocean Waves by Nuuranest Stays',
  neighbourhood = 'Bamburi',
  amenities     = '["Secure 24/7 Parking", "Walking Distance to Beach", "Daily Room Cleaning (Alternate Days)", "Water & Fan", "Netflix", "High-Speed Internet", "Air Conditioning", "Fully Equipped Kitchen"]'::jsonb,
  highlights    = '["Steps from Bamburi Beach", "Secure 24/7 parking on-site", "Netflix & high-speed internet included", "Room cleaning on alternate days", "Convenient location near restaurants & shops", "Clean, well-maintained rooms"]'::jsonb
WHERE slug IN ('ocean-waves-nuuranest', 'ocean-waves-bamburi')
   OR lower(name) LIKE '%ocean waves%';
