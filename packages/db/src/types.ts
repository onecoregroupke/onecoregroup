// ─── User Permissions (RBAC) ─────────────────────────────────────────────────
export type SectionKey =
  | 'dashboard' | 'input' | 'compliance' | 'properties'
  | 'glitz' | 'npt' | 'reports' | 'brands' | 'users' | 'marketing'

export type AccessLevel = 'none' | 'view' | 'edit'

export type PermissionsMap = Partial<Record<SectionKey, AccessLevel>>

export interface UserPermission {
  id: string
  user_id: string
  display_name: string | null
  permissions: PermissionsMap
  is_active: boolean
  created_at: string
  updated_at: string
}

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
  sort_order?: number
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
export interface ProductSize {
  label: string
  price_ksh: number
}

export interface Product {
  id: string
  slug: string
  name: string
  variant: string | null
  description: string | null
  short_description: string | null
  usage_instructions: string | null
  price_ksh: number | null
  compare_price_ksh: number | null
  category: string | null
  category_display_name: string | null
  category_accent: string | null
  sizes: ProductSize[]
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

// ─── Piano Catalogue ─────────────────────────────────────────────────────────
export interface PianoCatalogue {
  id: string
  slug: string
  name: string
  model: string | null
  serial: string | null
  category: string           // 'Upright' | 'Grand' | 'Digital'
  condition: string | null
  price: string
  status: string             // 'Available' | 'Reserved' | 'Sold'
  description: string | null
  highlights: string[]
  finish: string | null
  size: string | null
  images: string[]
  featured: boolean
  is_active: boolean
  sort_order: number
  created_at: string
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

// ─── Marketing: Platforms ─────────────────────────────────────────────────────
export interface MarketingPlatformRow {
  id: string
  brand_id: string
  platform: string
  handle: string | null
  external_id: string | null
  monthly_post_target: number
  current_health: string
  posting_mode: string
  is_active: boolean
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

// ─── Marketing: Pillars ───────────────────────────────────────────────────────
export interface MarketingPillarRow {
  id: string
  slug: string
  name: string
  description: string | null
  color_hex: string
  target_share_pct: number | null
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

// ─── Marketing: Content ───────────────────────────────────────────────────────
export interface MarketingContentRow {
  id: string
  brand_id: string
  platform_id: string | null
  campaign_id: string | null
  campaign_label: string | null
  content_type: string
  status: string
  posted_via: string
  title: string | null
  hook: string | null
  body_markdown: string
  hashtags: string | null
  asset_urls: string[]
  notes: string | null
  scheduled_at: string | null
  published_at: string | null
  external_url: string | null
  external_post_id: string | null
  publish_error: string | null
  owner_email: string | null
  created_by_email: string | null
  approved_by_email: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface MarketingContentPillarRow {
  content_id: string
  pillar_id: string
  created_at: string
}

// ─── Marketing: Campaigns ─────────────────────────────────────────────────────
export interface MarketingCampaignRow {
  id: string
  brand_id: string
  slug: string
  name: string
  goal: string | null
  audience_summary: string | null
  primary_channel: string | null
  secondary_channels: string[]
  start_date: string | null
  end_date: string | null
  status: string
  utm_campaign: string | null
  budget_ksh: number | null
  target_leads: number | null
  target_revenue_ksh: number | null
  kpis: Record<string, unknown>
  owner_email: string | null
  notes: string | null
  created_by_email: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

// Insert shapes: only truly-required columns are mandatory; everything else has
// a database default and is optional.
type MarketingPlatformInsert = Pick<MarketingPlatformRow, 'brand_id' | 'platform'> &
  Partial<MarketingPlatformRow>
type MarketingPillarInsert = Pick<MarketingPillarRow, 'slug' | 'name'> & Partial<MarketingPillarRow>
type MarketingContentInsert = Pick<MarketingContentRow, 'brand_id'> & Partial<MarketingContentRow>
type MarketingContentPillarInsert = Pick<MarketingContentPillarRow, 'content_id' | 'pillar_id'> &
  Partial<MarketingContentPillarRow>
type MarketingCampaignInsert = Pick<MarketingCampaignRow, 'brand_id' | 'slug' | 'name'> &
  Partial<MarketingCampaignRow>

// ─── Marketing: CRM ───────────────────────────────────────────────────────────
export interface MarketingContactRow {
  id: string
  full_name: string | null
  email: string | null
  phone: string | null
  company: string | null
  role: string | null
  linkedin_url: string | null
  source: string | null
  source_detail: string | null
  lifecycle_stage: string
  owner_email: string | null
  tags: string[]
  last_contact_at: string | null
  next_contact_at: string | null
  notes: string | null
  lead_id: string | null
  metadata: Record<string, unknown>
  created_by_email: string | null
  created_at: string
  updated_at: string
}
type MarketingContactInsert = Partial<MarketingContactRow>

export interface MarketingDealRow {
  id: string
  contact_id: string
  campaign_id: string | null
  brand_id: string | null
  name: string
  value_ksh: number | null
  stage: string
  expected_close_date: string | null
  closed_at: string | null
  lost_reason: string | null
  order_id: string | null
  owner_email: string | null
  notes: string | null
  created_by_email: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}
type MarketingDealInsert = Pick<MarketingDealRow, 'contact_id' | 'name'> & Partial<MarketingDealRow>

export interface MarketingActivityRow {
  id: string
  contact_id: string
  deal_id: string | null
  kind: string
  subject: string | null
  body: string | null
  occurred_at: string
  by_email: string | null
  metadata: Record<string, unknown>
  created_at: string
}
type MarketingActivityInsert = Pick<MarketingActivityRow, 'contact_id' | 'kind'> &
  Partial<MarketingActivityRow>

// ─── Marketing: WhatsApp flows ──────────────────────────────────────────────
export interface MarketingWhatsappFlowRow {
  id: string
  brand_id: string
  slug: string
  name: string
  description: string | null
  trigger_keywords: string[]
  trigger_type: string
  trigger_config: Record<string, unknown>
  flow_definition: Record<string, unknown>
  status: string
  last_triggered_at: string | null
  triggered_count: number
  owner_email: string | null
  notes: string | null
  created_by_email: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}
type MarketingWhatsappFlowInsert = Pick<MarketingWhatsappFlowRow, 'brand_id' | 'slug' | 'name'> &
  Partial<MarketingWhatsappFlowRow>

// ─── Marketing: Executive reports ───────────────────────────────────────────
export interface MarketingExecutiveReportRow {
  id: string
  period_start: string
  period_end: string
  subject: string
  preheader: string | null
  body_markdown: string
  ai_narrative: string | null
  metrics_json: Record<string, unknown>
  status: string
  scheduled_for: string | null
  sent_at: string | null
  sent_count: number
  failed_count: number
  recipients: string[]
  created_by_email: string | null
  approved_by_email: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}
type MarketingExecutiveReportInsert = Pick<
  MarketingExecutiveReportRow,
  'period_start' | 'period_end' | 'subject'
> &
  Partial<MarketingExecutiveReportRow>

type DbTable<Row, Insert, Update> = {
  Row: Row & Record<string, unknown>
  Insert: Insert & Record<string, unknown>
  Update: Update & Record<string, unknown>
  Relationships: []
}

// ─── Supabase DB type map (for typed client) ──────────────────────────────────
export interface Database {
  public: {
    Tables: {
      brands: DbTable<Brand, Omit<Brand, 'id' | 'created_at'>, Partial<Omit<Brand, 'id'>>>
      daily_metrics: DbTable<DailyMetric, DailyMetricInsert, Partial<DailyMetricInsert>>
      compliance_log: DbTable<ComplianceLog, Omit<ComplianceLog, 'id' | 'created_at' | 'compliance_pct'>, Partial<Omit<ComplianceLog, 'id' | 'compliance_pct'>>>
      weekly_summaries: DbTable<WeeklySummary, Omit<WeeklySummary, 'id' | 'created_at'>, Partial<Omit<WeeklySummary, 'id'>>>
      reports: DbTable<Report, Omit<Report, 'id' | 'created_at'>, Partial<Omit<Report, 'id'>>>
      properties: DbTable<Property, Omit<Property, 'id' | 'created_at' | 'updated_at'>, Partial<Omit<Property, 'id'>>>
      property_enquiries: DbTable<PropertyEnquiry, PropertyEnquiryInsert, Partial<PropertyEnquiryInsert>>
      property_reviews: DbTable<PropertyReview, Omit<PropertyReview, 'id' | 'created_at'>, Partial<Omit<PropertyReview, 'id'>>>
      products: DbTable<Product, Omit<Product, 'id' | 'created_at'>, Partial<Omit<Product, 'id' | 'created_at'>>>
      orders: DbTable<Order, Omit<Order, 'id' | 'order_number' | 'created_at'>, Partial<Omit<Order, 'id' | 'order_number'>>>
      order_items: DbTable<OrderItem, Omit<OrderItem, 'id'>, Partial<Omit<OrderItem, 'id'>>>
      leads: DbTable<Lead, Omit<Lead, 'id' | 'created_at'>, Partial<Omit<Lead, 'id'>>>
      piano_catalogue: DbTable<PianoCatalogue, Omit<PianoCatalogue, 'id' | 'created_at'>, Partial<Omit<PianoCatalogue, 'id' | 'created_at'>>>
      marketing_platforms: DbTable<MarketingPlatformRow, MarketingPlatformInsert, Partial<MarketingPlatformRow>>
      marketing_pillars: DbTable<MarketingPillarRow, MarketingPillarInsert, Partial<MarketingPillarRow>>
      marketing_content: DbTable<MarketingContentRow, MarketingContentInsert, Partial<MarketingContentRow>>
      marketing_content_pillars: DbTable<MarketingContentPillarRow, MarketingContentPillarInsert, Partial<MarketingContentPillarRow>>
      marketing_campaigns: DbTable<MarketingCampaignRow, MarketingCampaignInsert, Partial<MarketingCampaignRow>>
      marketing_contacts: DbTable<MarketingContactRow, MarketingContactInsert, Partial<MarketingContactRow>>
      marketing_deals: DbTable<MarketingDealRow, MarketingDealInsert, Partial<MarketingDealRow>>
      marketing_activities: DbTable<MarketingActivityRow, MarketingActivityInsert, Partial<MarketingActivityRow>>
      marketing_whatsapp_flows: DbTable<MarketingWhatsappFlowRow, MarketingWhatsappFlowInsert, Partial<MarketingWhatsappFlowRow>>
      marketing_executive_reports: DbTable<MarketingExecutiveReportRow, MarketingExecutiveReportInsert, Partial<MarketingExecutiveReportRow>>
    }
    Views: Record<string, never>
    Functions: Record<string, never>
  }
}
