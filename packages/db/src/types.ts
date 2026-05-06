// ─── Brands ─────────────────────────────────────────────────────────────────
export interface Brand {
  id: string
  slug: string
  name: string
  short_name: string
  instagram_handle: string | null
  instagram_account_id: string | null
  youtube_channel_id: string | null
  tiktok_handle: string | null
  facebook_page_id: string | null
  whatsapp_number: string | null
  color_hex: string
  is_active: boolean
  created_at: string
}

// ─── Daily Metrics ───────────────────────────────────────────────────────────
export interface DailyMetric {
  id: string
  brand_id: string
  metric_date: string
  feed_posts_count: number
  stories_count: number
  reach: number
  impressions: number
  engagement: number
  likes: number
  comments: number
  dm_inquiries: number
  follower_count: number
  follower_change: number
  youtube_views: number
  youtube_subscribers: number
  source: string
  team_notes: string | null
  challenges: string | null
  plan_tomorrow: string | null
  created_at: string
  updated_at: string
}

export type DailyMetricInsert = Omit<DailyMetric, 'id' | 'created_at' | 'updated_at'>

// ─── Compliance Log ──────────────────────────────────────────────────────────
export interface ComplianceLog {
  id: string
  brand_id: string
  week_start: string
  week_end: string
  days_posted: number
  target_days: number
  compliance_pct: number
  stories_days: number
  status: string
  escalated: boolean
  escalation_note: string | null
  created_at: string
}

// ─── Weekly Summaries ────────────────────────────────────────────────────────
export interface WeeklySummary {
  id: string
  brand_id: string
  week_start: string
  total_reach: number
  total_engagement: number
  total_posts: number
  total_stories: number
  total_dm_inquiries: number
  follower_start: number
  follower_end: number
  follower_change: number
  reach_wow_pct: number | null
  engagement_wow_pct: number | null
  created_at: string
}

// ─── Reports ─────────────────────────────────────────────────────────────────
export interface Report {
  id: string
  report_type: string
  period_start: string
  period_end: string
  title: string
  content_html: string | null
  content_json: Record<string, unknown> | null
  ai_narrative: string | null
  status: string
  sent_at: string | null
  approved_by: string | null
  approved_at: string | null
  created_at: string
}

// ─── Properties ──────────────────────────────────────────────────────────────
export interface Property {
  id: string
  slug: string
  name: string
  tagline: string | null
  location: string
  neighbourhood: string
  short_description: string | null
  full_description: string | null
  bedrooms: number | null
  bathrooms: number | null
  max_guests: number | null
  size_sqm: number | null
  price_per_night_ksh: number | null
  weekend_price_ksh: number | null
  photos: string[]
  amenities: string[]
  highlights: string[]
  house_rules: string[]
  booking_com_url: string | null
  airbnb_url: string | null
  whatsapp_number: string | null
  latitude: number | null
  longitude: number | null
  is_featured: boolean
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

// ─── Property Enquiries ──────────────────────────────────────────────────────
export interface PropertyEnquiry {
  id: string
  property_id: string | null
  property_name: string | null
  guest_name: string
  guest_email: string | null
  guest_phone: string
  check_in: string | null
  check_out: string | null
  num_guests: number | null
  num_nights: number | null
  message: string | null
  source: string
  status: string
  created_at: string
}

export type PropertyEnquiryInsert = Omit<PropertyEnquiry, 'id' | 'num_nights' | 'created_at' | 'status'>

// ─── Property Reviews ─────────────────────────────────────────────────────────
export interface PropertyReview {
  id: string
  property_id: string | null
  reviewer_name: string
  reviewer_location: string | null
  rating: number
  review_text: string
  platform: string
  review_date: string | null
  is_featured: boolean
  created_at: string
}

// ─── Products ────────────────────────────────────────────────────────────────
export interface Product {
  id: string
  slug: string
  name: string
  description: string | null
  short_description: string | null
  price_ksh: number | null
  compare_price_ksh: number | null
  category: string | null
  images: string[]
  before_after_images: string[]
  features: string[]
  is_in_stock: boolean
  is_featured: boolean
  is_active: boolean
  sort_order: number
  created_at: string
}

// ─── Orders ──────────────────────────────────────────────────────────────────
export interface Order {
  id: string
  order_number: string
  customer_name: string
  customer_email: string | null
  customer_phone: string
  delivery_address: string | null
  delivery_area: string | null
  total_ksh: number | null
  status: string
  channel: string
  notes: string | null
  promo_code: string | null
  created_at: string
}

export interface OrderItem {
  id: string
  order_id: string
  product_id: string | null
  product_name: string
  quantity: number
  unit_price_ksh: number
  total_ksh: number
}

// ─── Leads ───────────────────────────────────────────────────────────────────
export interface Lead {
  id: string
  name: string
  email: string | null
  phone: string | null
  source: string | null
  brand_slug: string | null
  event_tag: string | null
  interest: string | null
  status: string
  created_at: string
}

// ─── Supabase DB type map (for typed client) ──────────────────────────────────
export interface Database {
  public: {
    Tables: {
      brands: { Row: Brand; Insert: Omit<Brand, 'id' | 'created_at'>; Update: Partial<Omit<Brand, 'id'>> }
      daily_metrics: { Row: DailyMetric; Insert: DailyMetricInsert; Update: Partial<DailyMetricInsert> }
      compliance_log: { Row: ComplianceLog; Insert: Omit<ComplianceLog, 'id' | 'created_at' | 'compliance_pct'>; Update: Partial<Omit<ComplianceLog, 'id' | 'compliance_pct'>> }
      weekly_summaries: { Row: WeeklySummary; Insert: Omit<WeeklySummary, 'id' | 'created_at'>; Update: Partial<Omit<WeeklySummary, 'id'>> }
      reports: { Row: Report; Insert: Omit<Report, 'id' | 'created_at'>; Update: Partial<Omit<Report, 'id'>> }
      properties: { Row: Property; Insert: Omit<Property, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Omit<Property, 'id'>> }
      property_enquiries: { Row: PropertyEnquiry; Insert: PropertyEnquiryInsert; Update: Partial<PropertyEnquiryInsert> }
      property_reviews: { Row: PropertyReview; Insert: Omit<PropertyReview, 'id' | 'created_at'>; Update: Partial<Omit<PropertyReview, 'id'>> }
      products: { Row: Product; Insert: Omit<Product, 'id' | 'created_at'>; Update: Partial<Omit<Product, 'id'>> }
      orders: { Row: Order; Insert: Omit<Order, 'id' | 'order_number' | 'created_at'>; Update: Partial<Omit<Order, 'id' | 'order_number'>> }
      order_items: { Row: OrderItem; Insert: Omit<OrderItem, 'id'>; Update: Partial<Omit<OrderItem, 'id'>> }
      leads: { Row: Lead; Insert: Omit<Lead, 'id' | 'created_at'>; Update: Partial<Omit<Lead, 'id'>> }
    }
  }
}
