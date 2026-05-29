-- Migration 003: Glitz N' Glim tables

-- ─── PRODUCTS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  short_description TEXT,
  price_ksh DECIMAL(10,2),
  compare_price_ksh DECIMAL(10,2),
  category TEXT,
  images JSONB DEFAULT '[]',
  before_after_images JSONB DEFAULT '[]',
  features JSONB DEFAULT '[]',
  is_in_stock BOOLEAN DEFAULT true,
  is_featured BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── ORDERS ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT UNIQUE NOT NULL DEFAULT
    'OCG-GG-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
    LPAD(FLOOR(RANDOM() * 9999)::TEXT, 4, '0'),
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  customer_phone TEXT NOT NULL,
  delivery_address TEXT,
  delivery_area TEXT,
  total_ksh DECIMAL(10,2),
  status TEXT DEFAULT 'pending',
  channel TEXT DEFAULT 'website',
  notes TEXT,
  promo_code TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── ORDER_ITEMS ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price_ksh DECIMAL(10,2) NOT NULL,
  total_ksh DECIMAL(10,2) NOT NULL
);

-- ─── LEADS ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  source TEXT,
  brand_slug TEXT,
  event_tag TEXT,
  interest TEXT,
  status TEXT DEFAULT 'new',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── ROW LEVEL SECURITY ───────────────────────────────────────────────────────
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "products_public_read" ON products FOR SELECT USING (is_active = true);
CREATE POLICY "products_service" ON products USING (auth.role() = 'service_role') WITH CHECK (true);
CREATE POLICY "orders_service" ON orders USING (auth.role() = 'service_role') WITH CHECK (true);
CREATE POLICY "orders_insert" ON orders FOR INSERT WITH CHECK (true);
CREATE POLICY "order_items_service" ON order_items USING (auth.role() = 'service_role') WITH CHECK (true);
CREATE POLICY "leads_insert" ON leads FOR INSERT WITH CHECK (true);
CREATE POLICY "leads_auth" ON leads FOR SELECT USING (auth.role() = 'authenticated');
