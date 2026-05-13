-- Migration 004: Nairobi Piano Technicians catalogue

-- ─── PIANO CATALOGUE ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS piano_catalogue (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT        UNIQUE NOT NULL,
  name        TEXT        NOT NULL,
  model       TEXT,
  serial      TEXT,
  category    TEXT        NOT NULL DEFAULT 'Upright', -- Upright | Grand | Digital
  condition   TEXT,
  price       TEXT        NOT NULL DEFAULT 'Enquire',
  status      TEXT        NOT NULL DEFAULT 'Available', -- Available | Reserved | Sold
  description TEXT,
  highlights  TEXT[]      DEFAULT '{}'::TEXT[],
  finish      TEXT,
  size        TEXT,
  images      TEXT[]      DEFAULT '{}'::TEXT[],
  featured    BOOLEAN     DEFAULT false,
  is_active   BOOLEAN     DEFAULT true,
  sort_order  INTEGER     DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ─── ROW LEVEL SECURITY ───────────────────────────────────────────────────────
ALTER TABLE piano_catalogue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "piano_catalogue_public_read"
  ON piano_catalogue FOR SELECT
  USING (is_active = true);

CREATE POLICY "piano_catalogue_service"
  ON piano_catalogue
  USING (auth.role() = 'service_role')
  WITH CHECK (true);

-- ─── SEED: 24 existing pianos ─────────────────────────────────────────────────
INSERT INTO piano_catalogue (slug, name, model, serial, category, price, description, images, sort_order) VALUES

('paterson-sons',
 'Paterson & Sons',
 NULL, NULL, 'Grand', 'KSh 100,000',
 'A Scottish music company known for selling quality pianos in the late 19th and early 20th century. Their pianos are now considered vintage instruments, valued for their classic craftsmanship, elegant wooden designs, and rich traditional sound.',
 ARRAY['/images/catalogue/slide01_img1.jpg'], 0),

('john-broadwood-sons',
 'John Broadwood & Sons',
 NULL, NULL, 'Grand', 'KSh 100,000',
 'One of the oldest and most respected piano makers in the world, founded in London in 1728. Famous for producing high-quality pianos known for their rich tone, durability, and elegant craftsmanship.',
 ARRAY['/images/catalogue/slide02_img1.jpg'], 1),

('yamaha-g3-a',
 'Yamaha G3',
 'G3', NULL, 'Grand', 'KSh 100,000',
 'A popular 6''1" grand piano from Yamaha, known for its rich tone, responsive touch, and durable build. Widely used in homes, music schools, studios, and performance spaces because of its powerful sound and reliable quality.',
 ARRAY['/images/catalogue/slide03_img1.jpg'], 2),

('yamaha-g3-b',
 'Yamaha G3',
 'G3', '414772', 'Grand', 'KSh 100,000',
 'A vintage Yamaha grand piano believed to have been manufactured around the early 1970s. Well known for its rich tone, responsive touch, and durable craftsmanship, making it popular in homes, studios, and music schools.',
 ARRAY['/images/catalogue/slide04_img1.jpg'], 3),

('yamaha-u1-a',
 'Yamaha U1',
 'U1', 'M3418257', 'Upright', 'KSh 100,000',
 'A vintage Yamaha upright piano believed to have been manufactured around 1981 in Japan. Highly respected for its rich tone, responsive touch, and durable craftsmanship — a popular choice for homes, schools, churches, and professional musicians.',
 ARRAY['/images/catalogue/slide05_img1.jpg'], 4),

('yamaha-u1-b',
 'Yamaha U1',
 'U1', '765075', 'Upright', 'KSh 100,000',
 'A vintage Yamaha upright piano believed to have been manufactured around 1967 in Japan. Known for its rich sound, responsive touch, and durable craftsmanship — a trusted choice for homes, schools, churches, and professional pianists.',
 ARRAY['/images/catalogue/slide06_img1.jpg'], 5),

('nobel-tn-125',
 'Nobel TN-125',
 'TN-125', '5012668', 'Upright', 'KSh 100,000',
 'A Japanese upright piano known for its warm tone, responsive touch, and durable build. Suitable for homes, churches, schools, and music practice, offering a balanced sound with elegant upright design.',
 ARRAY['/images/catalogue/slide07_img1.jpg'], 6),

('kawai-bl-12',
 'Kawai BL-12',
 'BL-12', 'M106293', 'Upright', 'KSh 100,000',
 'A classic Japanese upright from Kawai''s BL Series, produced mainly in the late 1970s to early 1980s. Known for its strong craftsmanship, warm rich tone, and reliable touch. Standing about 48 inches tall, the BL-12 offers a deep, balanced sound despite its compact size.',
 ARRAY['/images/catalogue/slide08_img1.jpg'], 7),

('marchen',
 'Märchen',
 NULL, NULL, 'Upright', 'KSh 100,000',
 'A Japanese-made upright piano designed mainly for students and home use. Known for being affordable, durable, and having a soft, pleasant tone — a good choice for beginners learning the piano.',
 ARRAY['/images/catalogue/slide09_img1.jpg'], 8),

('apollo-ec21',
 'Apollo EC.21',
 'EC.21', '162368', 'Upright', 'KSh 100,000',
 'A compact Japanese upright piano made for homes and learning environments. Part of the Apollo EC series, known for its reliable build, simple design, and warm, soft tone.',
 ARRAY['/images/catalogue/slide10_img1.jpg'], 9),

('stein-bells-126s',
 'Stein Bells 126S',
 '126S', '113681', 'Upright', 'KSh 100,000',
 'A Japanese-style upright standing around 126 cm tall, designed for home, school, and student use. Known for its solid build, stable tuning, and warm, rounded tone that makes it suitable for beginners and intermediate players.',
 ARRAY['/images/catalogue/slide11_img1.jpg'], 10),

('kawai-kl601',
 'Kawai KL.601',
 'KL.601', 'K1313059', 'Upright', 'KSh 100,000',
 'A high-quality Japanese upright from Kawai''s KL series, made mainly in the late 1970s to early 1980s. Known for its deep, warm sound, strong wooden build, and smooth playing touch — a reliable vintage piano that still delivers a powerful and expressive musical experience.',
 ARRAY['/images/catalogue/slide12_img1.jpg'], 11),

('castle',
 'Castle',
 NULL, NULL, 'Upright', 'KSh 100,000',
 'A budget-friendly upright piano brand produced for home practice and beginner learners. Designed to be simple, durable, and affordable. Known for its basic but functional build, offering a soft, steady tone suitable for learning and daily practice.',
 ARRAY['/images/catalogue/slide13_img1.jpg'], 12),

('koeber',
 'Koeber',
 NULL, NULL, 'Upright', 'KSh 100,000',
 'A lesser-known upright piano brand built to be affordable and practical, offering a decent tone and reliable touch for beginners. Often found in schools and homes, valued more for learning and practice than professional concert use.',
 ARRAY['/images/catalogue/slide14_img1.jpg'], 13),

('kawai-ku3',
 'Kawai KU-3',
 'KU-3', '357137', 'Upright', 'KSh 100,000',
 'A classic Kawai upright piano known for its warm tone, smooth touch, and durable craftsmanship. Popular among music schools, churches, and home pianists for its reliable performance and elegant design.',
 ARRAY['/images/catalogue/slide15_img1.jpg'], 14),

('kraus-ksie',
 'Kraus K.S.I.E',
 'K.S.I.E', '60396', 'Upright', 'KSh 100,000',
 'Admired for its classic European-inspired craftsmanship and elegant traditional design. Known for producing a warm, balanced tone — a trusted choice for homes and music learners who valued both style and dependable performance.',
 ARRAY['/images/catalogue/slide16_img1.jpg'], 15),

('zauber',
 'Zauber',
 NULL, NULL, 'Upright', 'KSh 100,000',
 'Known for its elegant craftsmanship and rich musical character. Designed to deliver a warm, expressive tone, Zauber pianos became appreciated by families, students, and music enthusiasts looking for both beauty and reliability.',
 ARRAY['/images/catalogue/slide17_img1.jpg'], 16),

('apollo',
 'Apollo',
 NULL, NULL, 'Upright', 'KSh 100,000',
 'A respected Japanese-made instrument known for its quality craftsmanship, clear tone, and dependable performance. Popular in homes, schools, and studios, built to offer a smooth playing experience while maintaining elegant traditional styling.',
 ARRAY['/images/catalogue/slide18_img1.jpg'], 17),

('brockner',
 'Brockner',
 NULL, NULL, 'Upright', 'KSh 100,000',
 'Admired for its classic design and rich, mellow tone that brings warmth to every performance. Built with a focus on durability and musical expression — a lovely choice for homes and practice spaces where both elegance and sound quality matter.',
 ARRAY['/images/catalogue/slide19_img1.jpg'], 18),

('earl-windsor-w115',
 'Earl Windsor W115',
 'W115', '141004', 'Upright', 'KSh 100,000',
 'Known for its elegant traditional styling and warm, balanced sound. Designed for both learning and enjoyment, it became a popular choice for homes, schools, and music lovers who appreciated dependable performance and classic beauty.',
 ARRAY['/images/catalogue/slide20_img1.jpg'], 19),

('earl-windsor-w112',
 'Earl Windsor W112',
 'W112', '141004', 'Upright', 'KSh 100,000',
 'A classic upright piano known for its simple design, strong build, and reliable performance. Made for home and student use, it offers a warm, balanced tone and a smooth touch — a dependable choice for learning and everyday practice.',
 ARRAY['/images/catalogue/slide21_img1.jpg'], 20),

('kawai-ku2b',
 'Kawai KU-2B',
 'KU-2B', 'K440992', 'Upright', 'KSh 100,000',
 'A Kawai upright with a strong reputation for careful craftsmanship and smooth, expressive sound. Popular in homes, schools, and studios, combining durability with a warm, rich tone that suits both beginners and professional players.',
 ARRAY['/images/catalogue/slide22_img1.jpg'], 21),

('brother-gu125',
 'Brother GU-125',
 'GU-125', 'B922002', 'Upright', 'KSh 100,000',
 'A simple and reliable upright instrument popular for home and beginner use. Known for its practical design and steady performance, built to help students learn music comfortably. Its tone is warm and modest, with a sturdy build ideal for everyday practice.',
 ARRAY['/images/catalogue/slide23_img1.jpg'], 22),

('rolex-kr27',
 'Rolex KR-27',
 'KR-27', '61584', 'Upright', 'KSh 100,000',
 'A compact upright piano known for its elegant design and warm sound quality. Made for home, school, and beginner-to-intermediate use, offering a balance between affordability and reliable performance. Features a sturdy wooden cabinet, responsive keyboard action, and a rich tone suitable for practice and small performances.',
 ARRAY['/images/catalogue/slide24_img1.jpg'], 23);
