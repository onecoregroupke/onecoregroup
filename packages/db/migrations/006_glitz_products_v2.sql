-- Migration 006: Extend products table with per-size pricing, variant, usage,
--               and category display metadata. Seed all 16 Glitz N' Glim products.

-- ─── ALTER TABLE ──────────────────────────────────────────────────────────────
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS variant               TEXT,
  ADD COLUMN IF NOT EXISTS category_display_name TEXT,
  ADD COLUMN IF NOT EXISTS category_accent       TEXT,
  ADD COLUMN IF NOT EXISTS usage_instructions    TEXT,
  ADD COLUMN IF NOT EXISTS sizes                 JSONB DEFAULT '[]'::jsonb;

-- ─── SEED PRODUCTS ────────────────────────────────────────────────────────────
-- All prices default to 100 Ksh — update via Marketing Hub admin panel.
-- images[0] is always the main/hero image.

INSERT INTO products (
  slug, name, variant,
  category, category_display_name, category_accent,
  description, usage_instructions,
  sizes, features, images,
  is_in_stock, is_active, sort_order
) VALUES

-- ── Hand Washing Liquid ──────────────────────────────────────────────────────
('handwash-lavender', 'Handwash Liquid Soap', 'Lavender',
 'handwash', 'Hand Washing Liquid', '#0ea5e9',
 'A gentle yet effective hand washing liquid enriched with real lavender extracts and Iceland Geyser minerals. Leaves hands soft, clean and beautifully fragranced.',
 'Apply a small amount to wet hands. Lather well and scrub for at least 20 seconds, then rinse thoroughly with clean water.',
 '[{"label":"500ml","price_ksh":100},{"label":"5ltrs","price_ksh":100},{"label":"20ltrs","price_ksh":100}]',
 '["Kills 99.9% of germs","Enriched with lavender extracts","pH-balanced formula","Moisturising with glycerine","Suitable for frequent use"]',
 '["/products/handwash-lavender.png"]',
 true, true, 1),

('handwash-lemon', 'Handwash Liquid Soap', 'Lemon',
 'handwash', 'Hand Washing Liquid', '#0ea5e9',
 'A refreshing hand washing liquid bursting with zesty lemon freshness. Powered by Iceland Geyser minerals and citrus extracts, it cuts through grease and grime while leaving a bright, clean scent.',
 'Apply a small amount to wet hands. Lather well and scrub for at least 20 seconds, then rinse thoroughly with clean water.',
 '[{"label":"500ml","price_ksh":100},{"label":"5ltrs","price_ksh":100},{"label":"20ltrs","price_ksh":100}]',
 '["Kills 99.9% of germs","Fresh lemon citrus scent","Grease-cutting formula","pH-balanced formula","Moisturising with glycerine"]',
 '["/products/handwash-lemon.png"]',
 true, true, 2),

('handwash-strawberry', 'Handwash Liquid Soap', 'Strawberry',
 'handwash', 'Hand Washing Liquid', '#0ea5e9',
 'A sweet and playful strawberry-scented hand wash the whole family will love. Gentle enough for children while providing powerful germ protection powered by Iceland Geyser purity.',
 'Apply a small amount to wet hands. Lather well and scrub for at least 20 seconds, then rinse thoroughly with clean water.',
 '[{"label":"500ml","price_ksh":100},{"label":"5ltrs","price_ksh":100},{"label":"20ltrs","price_ksh":100}]',
 '["Kills 99.9% of germs","Sweet strawberry fragrance","Gentle formula — safe for all the family","pH-balanced formula","Moisturising with glycerine"]',
 '["/products/handwash-strawberry.png"]',
 true, true, 3),

('handwash-caramel', 'Handwash Liquid Soap', 'Caramel',
 'handwash', 'Hand Washing Liquid', '#0ea5e9',
 'A warm, indulgent caramel-scented hand wash that turns a routine wash into a sensory treat. Rich moisturising agents leave hands smooth and softly scented long after washing.',
 'Apply a small amount to wet hands. Lather well and scrub for at least 20 seconds, then rinse thoroughly with clean water.',
 '[{"label":"500ml","price_ksh":100},{"label":"5ltrs","price_ksh":100},{"label":"20ltrs","price_ksh":100}]',
 '["Kills 99.9% of germs","Warm indulgent caramel fragrance","Extra moisturising formula","pH-balanced formula","Leaves hands soft and smooth"]',
 '["/products/handwash-caramel.png"]',
 true, true, 4),

-- ── Toilet Cleaning Detergents ───────────────────────────────────────────────
('toilet-hawaiian', 'Toilet Cleaner', 'Hawaiian Fresh',
 'toilet', 'Toilet Cleaning Detergents', '#dc2626',
 'Flush away mess and leave only freshness. The tropical fragrance transforms your bathroom while the powerful formula kills 99.9% of germs and removes tough stains effortlessly.',
 'Apply under the rim and around the bowl. Leave for 5–10 minutes, scrub with a toilet brush, then flush. For heavy stains, leave overnight.',
 '[{"label":"250ml","price_ksh":100},{"label":"500ml","price_ksh":100},{"label":"1ltr","price_ksh":100},{"label":"5ltrs","price_ksh":100},{"label":"20ltrs","price_ksh":100}]',
 '["Kills 99.9% of germs","Removes limescale and tough stains","Long-lasting Hawaiian Fresh fragrance","Thick formula clings to bowl surfaces","Safe for septic systems"]',
 '["/products/toilet-cleaner-hawaiian.png"]',
 true, true, 5),

('toilet-lemon', 'Toilet Cleaner', 'Lemon Fresh',
 'toilet', 'Toilet Cleaning Detergents', '#dc2626',
 'Powerful lemon-scented toilet cleaner that cuts through grime, limescale and bacteria with ease. The bright citrus fragrance leaves your bathroom smelling clean and fresh for hours.',
 'Apply under the rim and around the bowl. Leave for 5–10 minutes, scrub with a toilet brush, then flush. For heavy stains, leave overnight.',
 '[{"label":"250ml","price_ksh":100},{"label":"500ml","price_ksh":100},{"label":"1ltr","price_ksh":100},{"label":"5ltrs","price_ksh":100},{"label":"20ltrs","price_ksh":100}]',
 '["Kills 99.9% of germs","Removes limescale and tough stains","Bright lemon citrus fragrance","Thick formula clings to bowl surfaces","Safe for septic systems"]',
 '["/products/toilet-cleaner-lemon.png"]',
 true, true, 6),

('toilet-lavender', 'Toilet Cleaner', 'Lavender Fresh',
 'toilet', 'Toilet Cleaning Detergents', '#dc2626',
 'Combine powerful cleaning with the calming scent of lavender. Tackles germs, limescale and stains while leaving a soothing, long-lasting lavender fragrance.',
 'Apply under the rim and around the bowl. Leave for 5–10 minutes, scrub with a toilet brush, then flush. For heavy stains, leave overnight.',
 '[{"label":"250ml","price_ksh":100},{"label":"500ml","price_ksh":100},{"label":"1ltr","price_ksh":100},{"label":"5ltrs","price_ksh":100},{"label":"20ltrs","price_ksh":100}]',
 '["Kills 99.9% of germs","Removes limescale and tough stains","Calming lavender fragrance","Thick formula clings to bowl surfaces","Safe for septic systems"]',
 '["/products/toilet-cleaner-lavender.png"]',
 true, true, 7),

-- ── Dishwashing Liquid Soap ──────────────────────────────────────────────────
('dishwash', 'Dishwashing Liquid Soap', NULL,
 'dishwash', 'Dishwashing Liquid Soap', '#ca8a04',
 'Cut through grease in seconds. Powered by Iceland Geyser minerals, it tackles the toughest baked-on food and grease while being gentle on your hands. Leaves dishes sparkling clean.',
 'Add a few drops to warm water or directly on a sponge. Wash dishes as normal and rinse well. For tough grease, apply directly and leave for a few minutes before scrubbing.',
 '[{"label":"500ml","price_ksh":100},{"label":"5ltrs","price_ksh":100},{"label":"20ltrs","price_ksh":100}]',
 '["Cuts through grease on contact","Tough on stains, gentle on hands","Sparkling streak-free finish","Fresh citrus scent","Highly concentrated"]',
 '["/products/dishwashing-soap.png"]',
 true, true, 8),

-- ── Surface Cleaning Detergents ──────────────────────────────────────────────
('multipurpose', 'Multi-Purpose Cleaner', NULL,
 'surface', 'Surface Cleaning Detergents', '#16a34a',
 'One solution for every mess. Works on all hard surfaces including kitchens, bathrooms, worktops, and appliances. Saves time, saves money, and delivers total shine every time.',
 'Spray or apply directly to the surface. Wipe clean with a damp cloth or sponge. For tough stains, leave for 2–3 minutes before wiping.',
 '[{"label":"500ml","price_ksh":100},{"label":"1ltr","price_ksh":100},{"label":"5ltrs","price_ksh":100},{"label":"20ltrs","price_ksh":100}]',
 '["Works on all hard surfaces","Removes grease and grime","Time-saving and cost-effective","Sparkling streak-free shine","Fresh clean fragrance"]',
 '["/products/multipurpose-cleaner.png"]',
 true, true, 9),

('multisurface', 'Multi-Surface Cleaner', NULL,
 'surface', 'Surface Cleaning Detergents', '#16a34a',
 'Safe on tiles, glass, stainless steel, plastic and painted surfaces. Removes fingerprints, smudges and everyday dirt without scratching or dulling any surface.',
 'Apply to the surface and wipe with a clean cloth. For glass and shiny surfaces, buff dry with a microfibre cloth for a streak-free finish.',
 '[{"label":"500ml","price_ksh":100},{"label":"5ltrs","price_ksh":100},{"label":"20ltrs","price_ksh":100}]',
 '["Safe on tiles, glass, steel and plastics","Removes fingerprints and smudges","Scratch-free formula","Streak-free finish on glass","Fresh clean fragrance"]',
 '["/products/multisurface-cleaner.png"]',
 true, true, 10),

('floor', 'Floor Cleaner', NULL,
 'surface', 'Surface Cleaning Detergents', '#16a34a',
 'Deep-clean every floor in your home. Works on tiles, vinyl, laminate and sealed hardwood, lifting dirt and grime while leaving a freshly-cleaned scent throughout the room.',
 'Dilute 30–50ml per bucket of water. Mop as normal. No rinsing required. For spot cleaning, apply a small amount directly and scrub.',
 '[{"label":"500ml","price_ksh":100},{"label":"5ltrs","price_ksh":100},{"label":"20ltrs","price_ksh":100}]',
 '["Works on tiles, vinyl, laminate and sealed wood","Deep-cleans and deodorises in one step","Leaves a shiny streak-free finish","Long-lasting fresh fragrance","Safe when dry"]',
 '["/products/floor-cleaner.png"]',
 true, true, 11),

('glass', 'Glass & Window Cleaner', NULL,
 'surface', 'Surface Cleaning Detergents', '#16a34a',
 'Achieve a crystal-clear, streak-free finish on all glass and windows. The fast-streak-free formula cuts through grease, dust and fingerprints, leaving no oily residue.',
 'Spray directly onto the glass surface. Wipe clean with a lint-free cloth using circular motions, then buff dry for a streak-free finish.',
 '[{"label":"500ml","price_ksh":100},{"label":"5ltrs","price_ksh":100},{"label":"20ltrs","price_ksh":100}]',
 '["Fast streak-free formula","Cuts through grease and fingerprints","Leaves no oily residue","Safe on tinted glass and mirrors","Works on glass, mirrors and chrome"]',
 '["/products/glass-window-cleaner.png"]',
 true, true, 12),

-- ── Fabric & Laundry Care ─────────────────────────────────────────────────────
('bleach', 'Glitz N'' Glim Bleach', NULL,
 'laundry', 'Fabric & Laundry Care', '#1d4ed8',
 'Restore whites to brilliant brightness and fight the toughest stains. The powerful formula whitens, brightens and keeps clothes looking newer for longer — wash after wash.',
 'For whites: add 50ml to the wash cycle with your detergent. For stains: dilute 1 part bleach in 10 parts water, apply, leave 5 minutes then wash. Always test on a hidden area first.',
 '[{"label":"70ml","price_ksh":100},{"label":"250ml","price_ksh":100},{"label":"500ml","price_ksh":100},{"label":"1ltr","price_ksh":100},{"label":"5ltrs","price_ksh":100},{"label":"20ltrs","price_ksh":100}]',
 '["Whitens whites and brightens colours","Fights tough stains in one wash","Removes mould and mildew from fabric","Keeps clothes looking new","Safe for washing machines"]',
 '["/products/bleach.png"]',
 true, true, 13),

('fabric-softener', 'Fabric Softener', NULL,
 'laundry', 'Fabric & Laundry Care', '#1d4ed8',
 'Give your fabrics the softness they deserve. Reduces static, minimises wrinkles and wraps every fibre in a long-lasting freshness that keeps clothes feeling soft and smelling wonderful all day.',
 'Add to the fabric softener compartment of your washing machine or during the final rinse cycle. Use 30–50ml per load.',
 '[{"label":"250ml","price_ksh":100},{"label":"500ml","price_ksh":100},{"label":"1ltr","price_ksh":100},{"label":"2ltrs","price_ksh":100},{"label":"5ltrs","price_ksh":100},{"label":"20ltrs","price_ksh":100}]',
 '["Soft-touch long-lasting freshness","Reduces static and ironing wrinkles","Keeps clothes fresher for longer","Gentle on all fabric types","Delicate long-lasting fragrance"]',
 '["/products/fabric-softener.png"]',
 true, true, 14),

-- ── Body & Skin Care ─────────────────────────────────────────────────────────
('shampoo', 'Glitz N'' Glim Shampoo', NULL,
 'bodycare', 'Body & Skin Care', '#db2777',
 'Nourish and cleanse your hair with the purity of Iceland Geysers. Removes impurities and excess oil while strengthening each strand, leaving hair clean, light and full of natural shine.',
 'Wet hair thoroughly. Apply a coin-sized amount and work into a rich lather. Massage into scalp and hair for 1–2 minutes, then rinse thoroughly.',
 '[{"label":"250ml","price_ksh":100},{"label":"500ml","price_ksh":100},{"label":"5ltrs","price_ksh":100},{"label":"20ltrs","price_ksh":100}]',
 '["Deep cleanses without stripping natural oils","Strengthens and nourishes each strand","Leaves hair shiny and manageable","Suitable for all hair types","Gentle enough for daily use"]',
 '["/products/shampoo.png"]',
 true, true, 15),

('shower-gel', 'Shower Gel', NULL,
 'bodycare', 'Body & Skin Care', '#db2777',
 'Step into freshness every morning. The rich, creamy lather cleanses and refreshes skin, while Iceland Geyser minerals help maintain your skin''s natural moisture balance.',
 'Apply to wet skin using a loofah, sponge or hands. Lather well and rinse thoroughly. Use daily for best results.',
 '[{"label":"400ml","price_ksh":100},{"label":"750ml","price_ksh":100},{"label":"5ltrs","price_ksh":100},{"label":"20ltrs","price_ksh":100}]',
 '["Rich creamy lather for thorough cleansing","Maintains skin''s natural moisture balance","Leaves skin smooth and refreshed","Long-lasting fresh fragrance","Suitable for all skin types"]',
 '["/products/shower-gel.png"]',
 true, true, 16)

ON CONFLICT (slug) DO UPDATE SET
  variant               = EXCLUDED.variant,
  category              = EXCLUDED.category,
  category_display_name = EXCLUDED.category_display_name,
  category_accent       = EXCLUDED.category_accent,
  description           = EXCLUDED.description,
  usage_instructions    = EXCLUDED.usage_instructions,
  sizes                 = EXCLUDED.sizes,
  features              = EXCLUDED.features,
  images                = EXCLUDED.images,
  is_active             = EXCLUDED.is_active,
  sort_order            = EXCLUDED.sort_order;
