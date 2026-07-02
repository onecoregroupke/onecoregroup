// ─── User Permissions (RBAC) ─────────────────────────────────────────────────
export type SectionKey =
  | 'dashboard' | 'input' | 'compliance' | 'properties'
  | 'glitz' | 'npt' | 'reports' | 'brands' | 'users' | 'marketing'
  | 'ops' | 'ops_agents' | 'management' | 'finance' | 'npt_service' | 'rayyan_admin' | 'rhythms_admin'
  | 'darul_admin' | 'personal' | 'all_tasks'
  | 'meetings' | 'inventory' | 'procurement'

export type AccessLevel = 'none' | 'view' | 'edit'

export type PermissionsMap = Partial<Record<SectionKey, AccessLevel>>

/**
 * Per-section brand restriction: section → array of brand UUIDs the user is
 * limited to. Missing key or empty array = no brand restriction. Used to make
 * e.g. a finance user who only ever sees one brand's money.
 */
export type BrandAccessMap = Partial<Record<SectionKey, string[]>>

export interface UserPermission {
  id: string
  user_id: string
  display_name: string | null
  permissions: PermissionsMap
  brand_access: BrandAccessMap
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
  episode_id: string | null
  ops_task_id: string | null
  production_status: string
  production_brief: string | null
  deliverable_url: string | null
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

// ─── Marketing: episodes & clipping (migration 019) ──────────────────────────
export interface MarketingEpisodeRow {
  id: string
  brand_id: string
  number: number | null
  slug: string | null
  title: string
  hook: string | null
  guest_name: string | null
  guest_org: string | null
  summary_markdown: string
  record_date: string | null
  publish_date: string | null
  edit_status: string
  status: string
  youtube_url: string | null
  podcast_url: string | null
  transcript_storage_path: string | null
  cover_storage_path: string | null
  duration_seconds: number | null
  campaign_id: string | null
  created_by_email: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}
type MarketingEpisodeInsert = Pick<MarketingEpisodeRow, 'brand_id' | 'title'> &
  Partial<MarketingEpisodeRow>

export interface MarketingEpisodeClipRow {
  id: string
  episode_id: string
  content_id: string
  hook: string | null
  start_seconds: number | null
  end_seconds: number | null
  aspect_ratio: string | null
  storage_path: string | null
  created_at: string
  updated_at: string
}
type MarketingEpisodeClipInsert = Pick<MarketingEpisodeClipRow, 'episode_id' | 'content_id'> &
  Partial<MarketingEpisodeClipRow>

// ─── Marketing: per-content metrics (migration 020) ──────────────────────────
export interface MarketingContentMetricRow {
  id: string
  content_id: string
  brand_id: string
  captured_at: string
  reach: number
  impressions: number
  likes: number
  comments: number
  shares: number
  saves: number
  clicks: number
  video_views: number
  followers_delta: number
  source: string
  metadata: Record<string, unknown>
  created_at: string
}
type MarketingContentMetricInsert = Pick<MarketingContentMetricRow, 'content_id' | 'brand_id'> &
  Partial<MarketingContentMetricRow>

// ─── Marketing: platform credentials & publish jobs (migration 021) ──────────
export interface MarketingPlatformCredentialRow {
  id: string
  brand_id: string
  platform_id: string | null
  platform: string
  account_handle: string | null
  external_user_id: string | null
  encrypted_payload: string
  refresh_payload: string | null
  key_version: number
  scopes: string[]
  expires_at: string | null
  last_validated_at: string | null
  status: string
  metadata: Record<string, unknown>
  created_by_email: string | null
  created_at: string
  updated_at: string
}
type MarketingPlatformCredentialInsert = Pick<
  MarketingPlatformCredentialRow,
  'brand_id' | 'platform' | 'encrypted_payload'
> &
  Partial<MarketingPlatformCredentialRow>

export interface MarketingPublishJobRow {
  id: string
  content_id: string
  brand_id: string
  platform: string
  status: string
  attempts: number
  scheduled_at: string | null
  started_at: string | null
  completed_at: string | null
  external_url: string | null
  external_post_id: string | null
  error_message: string | null
  metadata: Record<string, unknown>
  created_at: string
}
type MarketingPublishJobInsert = Pick<
  MarketingPublishJobRow,
  'content_id' | 'brand_id' | 'platform'
> &
  Partial<MarketingPublishJobRow>

// ─── Marketing: Ops production-project map (migration 022) ───────────────────
export interface MarketingOpsProjectRow {
  brand_id: string
  ops_project_id: string
  created_at: string
}
type MarketingOpsProjectInsert = Pick<MarketingOpsProjectRow, 'brand_id' | 'ops_project_id'> &
  Partial<MarketingOpsProjectRow>

// ─── Ops Hub: task delivery & assignment (migration 017) ─────────────────────
export interface OpsClientRow {
  client_id: string
  client_name: string
  industry: string
  country_city: string
  relationship_status: string
  drive_folder_id: string | null
  folder_status: string
  created_at: string
  updated_at: string
}
type OpsClientInsert = Pick<OpsClientRow, 'client_id' | 'client_name'> & Partial<OpsClientRow>

export interface OpsProjectRow {
  project_id: string
  project_name: string
  brand_id: string | null
  client_id: string | null
  client_name: string
  service_line: string
  status: string
  start_date: string
  notes: string
  drive_folder_id: string | null
  folder_status: string
  parent_project_id: string | null
  created_at: string
  updated_at: string
}
type OpsProjectInsert = Pick<OpsProjectRow, 'project_id' | 'project_name'> & Partial<OpsProjectRow>

export interface OpsTeamMemberRow {
  id: string
  name: string
  email: string | null
  role: string
  brand_ids: string[]
  active: boolean
  phone: string
  job_title: string
  department: string
  start_date: string | null
  notes: string
  created_at: string
}
type OpsTeamMemberInsert = Pick<OpsTeamMemberRow, 'name'> & Partial<OpsTeamMemberRow>

export interface OpsTaskRow {
  task_id: string
  dropdown_label: string
  project_id: string
  project_name: string
  brand_id: string | null
  client_id: string
  task_name: string
  task_description: string
  assigned_to: string
  category: string
  priority: string
  start_date: string
  target_date: string
  current_status: string
  last_updated_by: string
  last_updated_date: string
  latest_work_comment: string
  active: string
  notes: string
  hmac_token: string | null
  agent_eligible: string
  source_kind: string | null
  source_ref: string | null
  created_at: string
  updated_at: string
}
type OpsTaskInsert = Pick<OpsTaskRow, 'task_id' | 'project_id' | 'task_name'> & Partial<OpsTaskRow>

export interface OpsProjectContextRow {
  project_id: string
  content: string
  updated_by: string
  updated_at: string
}

export interface OpsCompletionRecordRow {
  id: string
  task_id: string
  completion_date: string
  status: string
  summary: string
  outcome: string
  blockers_notes: string
  file_urls: string[]
  submitted_by: string
  submitted_at: string
}
type OpsCompletionRecordInsert = Pick<OpsCompletionRecordRow, 'task_id' | 'completion_date'> &
  Partial<OpsCompletionRecordRow>

// ─── Ops Hub: agent orchestration (migration 018) ────────────────────────────
export interface OpsAgentRunRow {
  id: string
  mode: string
  requested_agent_type: string | null
  brand_id: string | null
  project_id: string | null
  task_ids: string[]
  status: string
  started_by: string | null
  started_at: string
  completed_at: string | null
  summary: Record<string, unknown>
}
type OpsAgentRunInsert = Pick<OpsAgentRunRow, 'id'> & Partial<OpsAgentRunRow>

export interface OpsAgentJobRow {
  id: string
  run_id: string
  task_id: string
  task_name: string
  task_type: string
  brand_id: string | null
  project_id: string | null
  client_id: string | null
  status: string
  runtime: string
  output: string | null
  input_needed: string | null
  input_provided: string | null
  respond_token: string | null
  error_message: string | null
  assigned_agent: string | null
  classification: Record<string, unknown> | null
  payload_json: Record<string, unknown> | null
  output_artifacts: unknown[]
  delivery_status: string
  review_status: string
  approval_required: boolean
  claimed_by: string | null
  claimed_at: string | null
  started_at: string | null
  failed_at: string | null
  created_at: string
  completed_at: string | null
}
type OpsAgentJobInsert = Pick<OpsAgentJobRow, 'run_id' | 'task_id' | 'task_name' | 'task_type'> &
  Partial<OpsAgentJobRow>

export interface OpsAgentArtifactRow {
  id: string
  run_id: string
  job_id: string | null
  task_id: string
  artifact_type: string
  title: string
  content: string | null
  url: string | null
  delivery: Record<string, unknown> | null
  metadata: Record<string, unknown>
  created_at: string
}
type OpsAgentArtifactInsert = Pick<OpsAgentArtifactRow, 'run_id' | 'task_id' | 'artifact_type' | 'title'> &
  Partial<OpsAgentArtifactRow>

export interface OpsAgentContextSourceRow {
  id: string
  scope_type: string
  project_id: string | null
  task_id: string | null
  client_id: string | null
  brand_id: string | null
  title: string
  source_type: string
  url: string | null
  notes: string | null
  include_in_agent: boolean
  created_by: string
  created_at: string
  updated_at: string
}
type OpsAgentContextSourceInsert = Pick<OpsAgentContextSourceRow, 'title'> &
  Partial<OpsAgentContextSourceRow>

export interface OpsAgentArtifactDestinationRow {
  id: string
  agent_type: string
  artifact_type: string | null
  destination_label: string
  destination_type: string
  destination_ref: string | null
  instructions: string | null
  active: boolean
  created_at: string
  updated_at: string
}
type OpsAgentArtifactDestinationInsert = Pick<
  OpsAgentArtifactDestinationRow,
  'agent_type' | 'destination_label'
> &
  Partial<OpsAgentArtifactDestinationRow>

export interface OpsReviewQueueRow {
  id: string
  source: string
  source_detail: string
  brand_id: string | null
  inquiry_type: string
  status: string
  proposed_fields: Record<string, unknown>
  original_content: string
  reviewed_by: string | null
  reviewed_at: string | null
  rejection_note: string | null
  message_id: string | null
  created_at: string
}
type OpsReviewQueueInsert = Pick<OpsReviewQueueRow, 'source'> & Partial<OpsReviewQueueRow>

export interface OpsReportLogRow {
  id: string
  report_type: string
  subject: string
  html: string
  recipient: string
  generated_at: string
  triggered_by: string
}
type OpsReportLogInsert = Pick<OpsReportLogRow, 'report_type' | 'subject' | 'html'> &
  Partial<OpsReportLogRow>

// ─── One Core Management OS (migration 025) ─────────────────────────────────
export interface OcgApprovalRow {
  id: string
  brand_id: string | null
  related_task_id: string | null
  related_project_id: string | null
  approval_type: string
  title: string
  description: string
  requested_by: string
  approver_id: string | null
  status: string
  priority: string
  due_date: string | null
  decision_notes: string
  created_at: string
  updated_at: string
}
type OcgApprovalInsert = Pick<OcgApprovalRow, 'title'> & Partial<OcgApprovalRow>

export interface OcgBlockerRow {
  id: string
  brand_id: string | null
  task_id: string | null
  project_id: string | null
  title: string
  description: string
  blocker_type: string
  severity: string
  owner_id: string | null
  escalation_owner_id: string | null
  status: string
  next_action: string
  blocked_since: string
  resolved_at: string | null
  created_at: string
  updated_at: string
}
type OcgBlockerInsert = Pick<OcgBlockerRow, 'title'> & Partial<OcgBlockerRow>

export interface OcgMeetingRow {
  id: string
  brand_id: string | null
  title: string
  meeting_date: string
  attendees: string[]
  notes: string
  summary: string
  created_by: string
  project_id: string | null
  status: string
  location: string
  agenda: string
  series_key: string
  prep_brief: string
  prep_generated_at: string | null
  created_at: string
  updated_at: string
}
type OcgMeetingInsert = Pick<OcgMeetingRow, 'title'> & Partial<OcgMeetingRow>

export interface OcgMeetingActionItemRow {
  id: string
  meeting_id: string
  brand_id: string | null
  description: string
  owner: string
  due_date: string | null
  status: string
  ops_task_id: string | null
  notes: string
  created_at: string
  updated_at: string
}
type OcgMeetingActionItemInsert = Pick<OcgMeetingActionItemRow, 'meeting_id' | 'description'> &
  Partial<OcgMeetingActionItemRow>

export interface OcgDecisionRow {
  id: string
  brand_id: string | null
  project_id: string | null
  meeting_id: string | null
  title: string
  decision: string
  owner_id: string | null
  due_date: string | null
  status: string
  created_at: string
  updated_at: string
}
type OcgDecisionInsert = Pick<OcgDecisionRow, 'title'> & Partial<OcgDecisionRow>

export interface OcgRecurringTaskRow {
  id: string
  brand_id: string | null
  title: string
  description: string
  recurrence_rule: string
  default_assignee_id: string | null
  department: string
  priority: string
  next_run_at: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}
type OcgRecurringTaskInsert = Pick<OcgRecurringTaskRow, 'title'> & Partial<OcgRecurringTaskRow>

// ─── Finance operations cockpit (migration 034) ─────────────────────────────
export interface FinanceAccountRow {
  id: string
  brand_id: string | null
  account_name: string
  account_type: string
  provider: string
  account_identifier: string
  legal_owner: string
  owner_person: string
  business_use_notes: string
  opening_balance_ksh: number
  current_balance_ksh: number
  reconciliation_status: string
  is_active: boolean
  notes: string
  created_at: string
  updated_at: string
}
type FinanceAccountInsert = Pick<FinanceAccountRow, 'account_name'> & Partial<FinanceAccountRow>

export interface FinanceTransactionRow {
  id: string
  brand_id: string | null
  account_id: string | null
  counterparty_brand_id: string | null
  transaction_date: string
  direction: string
  category: string
  description: string
  amount_ksh: number
  payment_channel: string
  reference: string
  counterparty_name: string
  owner_person: string
  reconciliation_status: string
  source_document_url: string
  notes: string
  votehead_id: string | null
  balance_after_ksh: number | null
  recorded_by: string
  created_at: string
  updated_at: string
}
type FinanceTransactionInsert = Partial<FinanceTransactionRow>

export interface FinanceVoteheadRow {
  id: string
  brand_id: string
  name: string
  kind: string
  description: string
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}
type FinanceVoteheadInsert = Pick<FinanceVoteheadRow, 'brand_id' | 'name'> & Partial<FinanceVoteheadRow>

export interface FinanceInterbrandTransferRow {
  id: string
  from_brand_id: string | null
  to_brand_id: string | null
  from_account_id: string | null
  to_account_id: string | null
  transfer_date: string
  amount_ksh: number
  purpose: string
  reference: string
  status: string
  recorded_by: string
  notes: string
  created_at: string
  updated_at: string
}
type FinanceInterbrandTransferInsert = Partial<FinanceInterbrandTransferRow>

export interface FinanceReconciliationBatchRow {
  id: string
  account_id: string | null
  brand_id: string | null
  period_start: string | null
  period_end: string | null
  statement_source: string
  statement_reference: string
  opening_balance_ksh: number | null
  closing_balance_ksh: number | null
  imported_count: number
  matched_count: number
  exception_count: number
  status: string
  reviewed_by: string
  notes: string
  created_at: string
  updated_at: string
}
type FinanceReconciliationBatchInsert = Partial<FinanceReconciliationBatchRow>

export interface FinanceReconciliationMatchRow {
  id: string
  batch_id: string | null
  transaction_id: string | null
  statement_date: string | null
  statement_description: string
  statement_amount_ksh: number
  statement_reference: string
  match_status: string
  confidence: number | null
  notes: string
  created_at: string
  updated_at: string
}
type FinanceReconciliationMatchInsert = Partial<FinanceReconciliationMatchRow>

export interface FinanceExceptionRow {
  id: string
  brand_id: string | null
  account_id: string | null
  transaction_id: string | null
  transfer_id: string | null
  exception_type: string
  severity: string
  title: string
  description: string
  owner_id: string | null
  status: string
  due_date: string | null
  resolution_notes: string
  created_at: string
  updated_at: string
}
type FinanceExceptionInsert = Pick<FinanceExceptionRow, 'title'> & Partial<FinanceExceptionRow>

export interface NptCustomerRow {
  id: string
  full_name: string
  phone: string | null
  email: string | null
  location: string
  area_estate: string
  customer_type: string
  lead_source: string
  preferred_communication_channel: string
  notes: string
  last_contacted_at: string | null
  next_follow_up_date: string | null
  company_name: string
  preferred_technician_id: string | null
  referred_by: string
  tax_exempt: boolean
  tags: string[]
  created_at: string
  updated_at: string
}
type NptCustomerInsert = Pick<NptCustomerRow, 'full_name'> & Partial<NptCustomerRow>

export interface NptPianoRow {
  id: string
  customer_id: string | null
  make: string
  model: string | null
  serial_number: string | null
  piano_type: string
  location: string
  condition: string
  last_tuning_date: string | null
  last_repair_date: string | null
  recommended_next_service_date: string | null
  media_urls: string[]
  technician_notes: string
  sales_status: string
  tuning_interval_months: number
  tags: string[]
  created_at: string
  updated_at: string
}
type NptPianoInsert = Partial<NptPianoRow>

export interface NptServiceJobRow {
  id: string
  customer_id: string | null
  piano_id: string | null
  ops_task_id: string | null
  service_type: string
  requested_date: string | null
  scheduled_at: string | null
  technician_id: string | null
  location: string
  job_notes: string
  internal_notes: string
  customer_facing_notes: string
  status: string
  priority: string
  estimated_cost_ksh: number | null
  final_cost_ksh: number | null
  required_tools: string[]
  completion_summary: string
  created_at: string
  updated_at: string
}
type NptServiceJobInsert = Partial<NptServiceJobRow>

export interface NptServiceHistoryRow {
  id: string
  customer_id: string | null
  piano_id: string | null
  service_job_id: string | null
  technician_id: string | null
  service_date: string
  work_done: string
  recommendations: string
  next_service_date: string | null
  created_at: string
}
type NptServiceHistoryInsert = Partial<NptServiceHistoryRow>

export interface NptQuoteInvoiceRow {
  id: string
  customer_id: string | null
  service_job_id: string | null
  record_type: string
  quote_amount_ksh: number | null
  invoice_amount_ksh: number | null
  status: string
  payment_status: string
  sent_date: string | null
  paid_date: string | null
  notes: string
  created_at: string
  updated_at: string
}
type NptQuoteInvoiceInsert = Partial<NptQuoteInvoiceRow>

export interface NptReminderRow {
  id: string
  customer_id: string | null
  piano_id: string | null
  service_job_id: string | null
  reminder_type: string
  title: string
  due_at: string | null
  channel: string
  status: string
  notes: string
  created_at: string
  updated_at: string
}
type NptReminderInsert = Pick<NptReminderRow, 'title'> & Partial<NptReminderRow>

// ─── NPT Gazelle layer (migration 032) ────────────────────────────────────────
export interface NptContactRow {
  id: string
  customer_id: string | null
  name: string
  phone: string | null
  email: string | null
  role: string
  is_primary: boolean
  is_billing: boolean
  notes: string
  created_at: string
  updated_at: string
}
type NptContactInsert = Pick<NptContactRow, 'name'> & Partial<NptContactRow>

export interface NptAppointmentRow {
  id: string
  customer_id: string | null
  piano_id: string | null
  technician_id: string | null
  service_job_id: string | null
  title: string
  location: string
  start_at: string | null
  end_at: string | null
  status: string
  notes: string
  created_by: string
  completed_at: string | null
  created_at: string
  updated_at: string
}
type NptAppointmentInsert = Partial<NptAppointmentRow>

export interface NptPianoMeasurementRow {
  id: string
  piano_id: string | null
  technician_id: string | null
  measured_at: string
  temperature_c: number | null
  humidity_pct: number | null
  notes: string
  created_at: string
}
type NptPianoMeasurementInsert = Partial<NptPianoMeasurementRow>

export interface NptTimelineEventRow {
  id: string
  customer_id: string | null
  piano_id: string | null
  appointment_id: string | null
  event_type: string
  title: string
  body: string
  actor: string
  occurred_at: string
  created_at: string
}
type NptTimelineEventInsert = Partial<NptTimelineEventRow>

export interface RayyanGuardianRow {
  id: string
  full_name: string
  phone: string | null
  email: string | null
  relationship_to_child: string
  preferred_communication_channel: string
  notes: string
  created_at: string
  updated_at: string
}
type RayyanGuardianInsert = Pick<RayyanGuardianRow, 'full_name'> & Partial<RayyanGuardianRow>

export interface RayyanStudentRow {
  id: string
  full_name: string
  admission_number: string | null
  schoolpay_code: string | null
  class_level: string
  guardian_id: string | null
  enrollment_status: string
  start_date: string | null
  notes: string
  created_at: string
  updated_at: string
}
type RayyanStudentInsert = Pick<RayyanStudentRow, 'full_name'> & Partial<RayyanStudentRow>

export interface RayyanAdmissionRow {
  id: string
  student_id: string | null
  guardian_id: string | null
  pipeline_status: string
  source: string
  tour_date: string | null
  documents_status: string
  schoolpay_status: string
  next_follow_up_date: string | null
  notes: string
  created_at: string
  updated_at: string
}
type RayyanAdmissionInsert = Partial<RayyanAdmissionRow>

export interface RayyanFeeFollowupRow {
  id: string
  student_id: string | null
  schoolpay_code: string
  expected_fee_item: string
  follow_up_status: string
  parent_contacted_date: string | null
  last_known_fee_status: string
  next_follow_up_date: string | null
  notes: string
  created_at: string
  updated_at: string
}
type RayyanFeeFollowupInsert = Partial<RayyanFeeFollowupRow>

export interface RayyanSchoolpayImportBatchRow {
  id: string
  source_label: string
  imported_by: string
  imported_at: string
  row_count: number
  notes: string
  metadata: Record<string, unknown>
}
type RayyanSchoolpayImportBatchInsert = Partial<RayyanSchoolpayImportBatchRow>

export interface RayyanSchoolpayPaymentSnapshotRow {
  id: string
  batch_id: string | null
  student_id: string | null
  schoolpay_code: string
  admission_number: string
  student_name: string
  fee_item: string
  amount_expected_ksh: number | null
  amount_paid_ksh: number | null
  balance_ksh: number | null
  payment_status: string
  raw_payload: Record<string, unknown>
  captured_at: string
}
type RayyanSchoolpayPaymentSnapshotInsert = Partial<RayyanSchoolpayPaymentSnapshotRow>

export interface RayyanFeeInvoiceRow {
  id: string
  student_id: string | null
  schoolpay_snapshot_id: string | null
  schoolpay_code: string
  fee_item: string
  term: string
  amount_expected_ksh: number
  amount_paid_ksh: number
  balance_ksh: number | null
  status: string
  due_date: string | null
  notes: string
  created_at: string
  updated_at: string
}
type RayyanFeeInvoiceInsert = Partial<RayyanFeeInvoiceRow>

export interface RayyanFeePaymentRow {
  id: string
  invoice_id: string | null
  student_id: string | null
  schoolpay_snapshot_id: string | null
  amount_ksh: number
  method: string
  reference: string
  paid_on: string
  recorded_by: string
  notes: string
  created_at: string
}
type RayyanFeePaymentInsert = Partial<RayyanFeePaymentRow>

export interface RayyanClassRow {
  id: string
  name: string
  level: string
  teacher_id: string | null
  notes: string
  is_active: boolean
  created_at: string
  updated_at: string
}
type RayyanClassInsert = Pick<RayyanClassRow, 'name'> & Partial<RayyanClassRow>

export interface RayyanAttendanceNoteRow {
  id: string
  student_id: string | null
  class_id: string | null
  attendance_date: string
  status: string
  notes: string
  created_by: string
  created_at: string
}
type RayyanAttendanceNoteInsert = Partial<RayyanAttendanceNoteRow>

export interface RayyanAdminTaskRow {
  id: string
  student_id: string | null
  guardian_id: string | null
  ops_task_id: string | null
  task_type: string
  title: string
  status: string
  priority: string
  due_date: string | null
  notes: string
  created_at: string
  updated_at: string
}
type RayyanAdminTaskInsert = Pick<RayyanAdminTaskRow, 'title'> & Partial<RayyanAdminTaskRow>

export interface RhythmsStudentRow {
  id: string
  full_name: string
  admission_number: string | null
  schoolpay_code: string | null
  programme: string
  cohort: string
  guardian_name: string | null
  guardian_id: string | null
  class_id: string | null
  phone: string | null
  email: string | null
  enrollment_status: string
  start_date: string | null
  notes: string
  created_at: string
  updated_at: string
}
type RhythmsStudentInsert = Pick<RhythmsStudentRow, 'full_name'> & Partial<RhythmsStudentRow>

export interface RhythmsSchoolpayImportBatchRow {
  id: string
  source_label: string
  imported_by: string
  imported_at: string
  row_count: number
  notes: string
  metadata: Record<string, unknown>
}
type RhythmsSchoolpayImportBatchInsert = Partial<RhythmsSchoolpayImportBatchRow>

export interface RhythmsSchoolpayPaymentSnapshotRow {
  id: string
  batch_id: string | null
  student_id: string | null
  schoolpay_code: string
  admission_number: string
  student_name: string
  fee_item: string
  amount_expected_ksh: number | null
  amount_paid_ksh: number | null
  balance_ksh: number | null
  payment_status: string
  raw_payload: Record<string, unknown>
  captured_at: string
}
type RhythmsSchoolpayPaymentSnapshotInsert = Partial<RhythmsSchoolpayPaymentSnapshotRow>

export interface RhythmsFeeInvoiceRow {
  id: string
  student_id: string | null
  schoolpay_snapshot_id: string | null
  schoolpay_code: string
  fee_item: string
  term: string
  amount_expected_ksh: number
  amount_paid_ksh: number
  balance_ksh: number | null
  status: string
  due_date: string | null
  notes: string
  created_at: string
  updated_at: string
}
type RhythmsFeeInvoiceInsert = Partial<RhythmsFeeInvoiceRow>

export interface RhythmsFeePaymentRow {
  id: string
  invoice_id: string | null
  student_id: string | null
  schoolpay_snapshot_id: string | null
  amount_ksh: number
  method: string
  reference: string
  paid_on: string
  recorded_by: string
  notes: string
  created_at: string
}
type RhythmsFeePaymentInsert = Partial<RhythmsFeePaymentRow>

// ─── Private personal/home tasks (migration 031) ──────────────────────────────
export interface OcgPersonalTaskRow {
  id: string
  owner_email: string
  title: string
  notes: string
  category: string
  priority: string
  status: string
  due_date: string | null
  created_at: string
  updated_at: string
}
type OcgPersonalTaskInsert = Pick<OcgPersonalTaskRow, 'owner_email' | 'title'> & Partial<OcgPersonalTaskRow>

// ─── Daily duties per individual (migration 030) ──────────────────────────────
export interface OcgDailyDutyRow {
  id: string
  assignee_id: string | null
  brand_id: string | null
  title: string
  description: string
  department: string
  sort_order: number
  active: boolean
  created_at: string
  updated_at: string
}
type OcgDailyDutyInsert = Pick<OcgDailyDutyRow, 'title'> & Partial<OcgDailyDutyRow>

export interface OcgDailyDutyLogRow {
  id: string
  duty_id: string
  assignee_id: string | null
  duty_date: string
  status: string
  note: string
  completed_at: string
}
type OcgDailyDutyLogInsert = Pick<OcgDailyDutyLogRow, 'duty_id'> & Partial<OcgDailyDutyLogRow>

// ─── Ops task comments / progress updates (migration 029) ─────────────────────
export interface OpsTaskCommentRow {
  id: string
  task_id: string
  author: string
  body: string
  kind: string
  status_at: string
  created_at: string
}
type OpsTaskCommentInsert = Pick<OpsTaskCommentRow, 'task_id' | 'body'> & Partial<OpsTaskCommentRow>

// ─── Rhythms College — full admin parity (migration 028) ──────────────────────
export interface RhythmsGuardianRow {
  id: string
  full_name: string
  phone: string | null
  email: string | null
  relationship_to_child: string
  preferred_communication_channel: string
  notes: string
  created_at: string
  updated_at: string
}
type RhythmsGuardianInsert = Pick<RhythmsGuardianRow, 'full_name'> & Partial<RhythmsGuardianRow>

export interface RhythmsClassRow {
  id: string
  name: string
  level: string
  teacher_id: string | null
  notes: string
  is_active: boolean
  created_at: string
  updated_at: string
}
type RhythmsClassInsert = Pick<RhythmsClassRow, 'name'> & Partial<RhythmsClassRow>

export interface RhythmsAdmissionRow {
  id: string
  student_id: string | null
  guardian_id: string | null
  pipeline_status: string
  source: string
  tour_date: string | null
  documents_status: string
  schoolpay_status: string
  next_follow_up_date: string | null
  notes: string
  created_at: string
  updated_at: string
}
type RhythmsAdmissionInsert = Partial<RhythmsAdmissionRow>

export interface RhythmsFeeFollowupRow {
  id: string
  student_id: string | null
  schoolpay_code: string
  expected_fee_item: string
  follow_up_status: string
  parent_contacted_date: string | null
  last_known_fee_status: string
  next_follow_up_date: string | null
  notes: string
  created_at: string
  updated_at: string
}
type RhythmsFeeFollowupInsert = Partial<RhythmsFeeFollowupRow>

export interface RhythmsAttendanceNoteRow {
  id: string
  student_id: string | null
  class_id: string | null
  attendance_date: string
  status: string
  notes: string
  created_by: string
  created_at: string
}
type RhythmsAttendanceNoteInsert = Partial<RhythmsAttendanceNoteRow>

export interface RhythmsAdminTaskRow {
  id: string
  student_id: string | null
  guardian_id: string | null
  ops_task_id: string | null
  task_type: string
  title: string
  status: string
  priority: string
  due_date: string | null
  notes: string
  created_at: string
  updated_at: string
}
type RhythmsAdminTaskInsert = Pick<RhythmsAdminTaskRow, 'title'> & Partial<RhythmsAdminTaskRow>

// ─── Darul Swafa Madrassa (migration 027) ─────────────────────────────────────
export interface DarulGuardianRow {
  id: string
  full_name: string
  phone: string | null
  email: string | null
  relationship_to_child: string
  preferred_communication_channel: string
  notes: string
  created_at: string
  updated_at: string
}
type DarulGuardianInsert = Pick<DarulGuardianRow, 'full_name'> & Partial<DarulGuardianRow>

export interface DarulClassRow {
  id: string
  name: string
  level: string
  teacher_id: string | null
  notes: string
  is_active: boolean
  created_at: string
  updated_at: string
}
type DarulClassInsert = Pick<DarulClassRow, 'name'> & Partial<DarulClassRow>

export interface DarulStudentRow {
  id: string
  full_name: string
  admission_number: string | null
  guardian_id: string | null
  class_id: string | null
  halaqa_level: string
  hifz_juz_completed: number
  current_surah: string
  enrollment_status: string
  start_date: string | null
  notes: string
  created_at: string
  updated_at: string
}
type DarulStudentInsert = Pick<DarulStudentRow, 'full_name'> & Partial<DarulStudentRow>

export interface DarulAdmissionRow {
  id: string
  student_id: string | null
  guardian_id: string | null
  pipeline_status: string
  source: string
  tour_date: string | null
  documents_status: string
  next_follow_up_date: string | null
  notes: string
  created_at: string
  updated_at: string
}
type DarulAdmissionInsert = Partial<DarulAdmissionRow>

export interface DarulHifzProgressRow {
  id: string
  student_id: string | null
  juz_number: number | null
  surah: string
  ayah_range: string
  status: string
  assessed_on: string | null
  assessor_id: string | null
  notes: string
  created_at: string
  updated_at: string
}
type DarulHifzProgressInsert = Partial<DarulHifzProgressRow>

export interface DarulAttendanceNoteRow {
  id: string
  student_id: string | null
  class_id: string | null
  attendance_date: string
  status: string
  notes: string
  created_by: string
  created_at: string
}
type DarulAttendanceNoteInsert = Partial<DarulAttendanceNoteRow>

export interface DarulFeeInvoiceRow {
  id: string
  student_id: string | null
  fee_item: string
  term: string
  amount_expected_ksh: number
  amount_paid_ksh: number
  balance_ksh: number | null
  status: string
  due_date: string | null
  notes: string
  created_at: string
  updated_at: string
}
type DarulFeeInvoiceInsert = Partial<DarulFeeInvoiceRow>

export interface DarulFeePaymentRow {
  id: string
  invoice_id: string | null
  student_id: string | null
  amount_ksh: number
  method: string
  reference: string
  paid_on: string
  recorded_by: string
  notes: string
  created_at: string
}
type DarulFeePaymentInsert = Partial<DarulFeePaymentRow>

export interface DarulFeeFollowupRow {
  id: string
  student_id: string | null
  expected_fee_item: string
  follow_up_status: string
  parent_contacted_date: string | null
  last_known_fee_status: string
  next_follow_up_date: string | null
  notes: string
  created_at: string
  updated_at: string
}
type DarulFeeFollowupInsert = Partial<DarulFeeFollowupRow>

export interface DarulAdminTaskRow {
  id: string
  student_id: string | null
  guardian_id: string | null
  ops_task_id: string | null
  task_type: string
  title: string
  status: string
  priority: string
  due_date: string | null
  notes: string
  created_at: string
  updated_at: string
}
type DarulAdminTaskInsert = Pick<DarulAdminTaskRow, 'title'> & Partial<DarulAdminTaskRow>

// ─── Inventory (migration 035) ────────────────────────────────────────────────
export interface InventoryItemRow {
  id: string
  brand_id: string
  name: string
  sku: string
  category: string
  unit: string
  quantity: number
  unit_value_ksh: number
  reorder_level: number
  location: string
  notes: string
  is_active: boolean
  created_at: string
  updated_at: string
}
type InventoryItemInsert = Pick<InventoryItemRow, 'brand_id' | 'name'> & Partial<InventoryItemRow>

export interface InventoryMovementRow {
  id: string
  item_id: string
  brand_id: string | null
  direction: string
  quantity: number
  unit_value_ksh: number
  movement_date: string
  reason: string
  reference: string
  source: string
  purchase_id: string | null
  quantity_after: number | null
  recorded_by: string
  notes: string
  created_at: string
}
type InventoryMovementInsert = Pick<InventoryMovementRow, 'item_id'> & Partial<InventoryMovementRow>

// ─── Procurement (migration 035) ─────────────────────────────────────────────
export interface ProcurementVendorRow {
  id: string
  name: string
  contact_person: string
  phone: string
  email: string
  brand_id: string | null
  payment_terms: string
  notes: string
  is_active: boolean
  created_at: string
  updated_at: string
}
type ProcurementVendorInsert = Pick<ProcurementVendorRow, 'name'> & Partial<ProcurementVendorRow>

export interface ProcurementPurchaseRow {
  id: string
  brand_id: string
  vendor_id: string | null
  purchase_date: string
  reference: string
  receipt_url: string
  status: string
  payment_status: string
  total_cost_ksh: number
  finance_transaction_id: string | null
  received_at: string | null
  recorded_by: string
  notes: string
  created_at: string
  updated_at: string
}
type ProcurementPurchaseInsert = Pick<ProcurementPurchaseRow, 'brand_id'> & Partial<ProcurementPurchaseRow>

export interface ProcurementPurchaseItemRow {
  id: string
  purchase_id: string
  inventory_item_id: string | null
  description: string
  quantity: number
  unit: string
  unit_cost_ksh: number
  created_at: string
}
type ProcurementPurchaseItemInsert = Pick<ProcurementPurchaseItemRow, 'purchase_id' | 'description'> &
  Partial<ProcurementPurchaseItemRow>

// ─── Chat + forum (migration 035) ────────────────────────────────────────────
export interface OcgConversationRow {
  id: string
  type: string
  name: string
  created_by: string
  last_message_at: string
  created_at: string
  updated_at: string
}
type OcgConversationInsert = Partial<OcgConversationRow>

export interface OcgConversationMemberRow {
  id: string
  conversation_id: string
  member_email: string
  member_name: string
  last_read_at: string | null
  joined_at: string
}
type OcgConversationMemberInsert = Pick<OcgConversationMemberRow, 'conversation_id' | 'member_email'> &
  Partial<OcgConversationMemberRow>

export interface OcgMessageRow {
  id: string
  conversation_id: string
  sender_email: string
  sender_name: string
  body: string
  created_at: string
}
type OcgMessageInsert = Pick<OcgMessageRow, 'conversation_id' | 'sender_email' | 'body'> &
  Partial<OcgMessageRow>

export interface OcgForumPostRow {
  id: string
  author_email: string
  author_name: string
  title: string
  body: string
  category: string
  pinned: boolean
  created_at: string
  updated_at: string
}
type OcgForumPostInsert = Pick<OcgForumPostRow, 'title'> & Partial<OcgForumPostRow>

export interface OcgForumReplyRow {
  id: string
  post_id: string
  author_email: string
  author_name: string
  body: string
  created_at: string
}
type OcgForumReplyInsert = Pick<OcgForumReplyRow, 'post_id' | 'body'> & Partial<OcgForumReplyRow>

// ─── Day close (migration 035) ───────────────────────────────────────────────
export interface OcgDayCloseRow {
  id: string
  close_date: string
  status: string
  closed_by: string
  summary: Record<string, unknown>
  narrative: string
  report_sent: boolean
  notes: string
  created_at: string
}
type OcgDayCloseInsert = Pick<OcgDayCloseRow, 'close_date'> & Partial<OcgDayCloseRow>

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
      marketing_episodes: DbTable<MarketingEpisodeRow, MarketingEpisodeInsert, Partial<MarketingEpisodeRow>>
      marketing_episode_clips: DbTable<MarketingEpisodeClipRow, MarketingEpisodeClipInsert, Partial<MarketingEpisodeClipRow>>
      marketing_content_metrics: DbTable<MarketingContentMetricRow, MarketingContentMetricInsert, Partial<MarketingContentMetricRow>>
      marketing_platform_credentials: DbTable<MarketingPlatformCredentialRow, MarketingPlatformCredentialInsert, Partial<MarketingPlatformCredentialRow>>
      marketing_publish_jobs: DbTable<MarketingPublishJobRow, MarketingPublishJobInsert, Partial<MarketingPublishJobRow>>
      marketing_ops_projects: DbTable<MarketingOpsProjectRow, MarketingOpsProjectInsert, Partial<MarketingOpsProjectRow>>
      ops_clients: DbTable<OpsClientRow, OpsClientInsert, Partial<OpsClientRow>>
      ops_projects: DbTable<OpsProjectRow, OpsProjectInsert, Partial<OpsProjectRow>>
      ops_team_members: DbTable<OpsTeamMemberRow, OpsTeamMemberInsert, Partial<OpsTeamMemberRow>>
      ops_tasks: DbTable<OpsTaskRow, OpsTaskInsert, Partial<OpsTaskRow>>
      ops_project_context: DbTable<OpsProjectContextRow, OpsProjectContextRow, Partial<OpsProjectContextRow>>
      ops_completion_records: DbTable<OpsCompletionRecordRow, OpsCompletionRecordInsert, Partial<OpsCompletionRecordRow>>
      ops_agent_runs: DbTable<OpsAgentRunRow, OpsAgentRunInsert, Partial<OpsAgentRunRow>>
      ops_agent_jobs: DbTable<OpsAgentJobRow, OpsAgentJobInsert, Partial<OpsAgentJobRow>>
      ops_agent_artifacts: DbTable<OpsAgentArtifactRow, OpsAgentArtifactInsert, Partial<OpsAgentArtifactRow>>
      ops_agent_context_sources: DbTable<OpsAgentContextSourceRow, OpsAgentContextSourceInsert, Partial<OpsAgentContextSourceRow>>
      ops_agent_artifact_destinations: DbTable<OpsAgentArtifactDestinationRow, OpsAgentArtifactDestinationInsert, Partial<OpsAgentArtifactDestinationRow>>
      ops_review_queue: DbTable<OpsReviewQueueRow, OpsReviewQueueInsert, Partial<OpsReviewQueueRow>>
      ops_report_logs: DbTable<OpsReportLogRow, OpsReportLogInsert, Partial<OpsReportLogRow>>
      ops_task_comments: DbTable<OpsTaskCommentRow, OpsTaskCommentInsert, Partial<OpsTaskCommentRow>>
      ocg_daily_duties: DbTable<OcgDailyDutyRow, OcgDailyDutyInsert, Partial<OcgDailyDutyRow>>
      ocg_daily_duty_logs: DbTable<OcgDailyDutyLogRow, OcgDailyDutyLogInsert, Partial<OcgDailyDutyLogRow>>
      ocg_personal_tasks: DbTable<OcgPersonalTaskRow, OcgPersonalTaskInsert, Partial<OcgPersonalTaskRow>>
      ocg_approvals: DbTable<OcgApprovalRow, OcgApprovalInsert, Partial<OcgApprovalRow>>
      ocg_blockers: DbTable<OcgBlockerRow, OcgBlockerInsert, Partial<OcgBlockerRow>>
      ocg_meetings: DbTable<OcgMeetingRow, OcgMeetingInsert, Partial<OcgMeetingRow>>
      ocg_decisions: DbTable<OcgDecisionRow, OcgDecisionInsert, Partial<OcgDecisionRow>>
      ocg_recurring_tasks: DbTable<OcgRecurringTaskRow, OcgRecurringTaskInsert, Partial<OcgRecurringTaskRow>>
      ocg_meeting_action_items: DbTable<OcgMeetingActionItemRow, OcgMeetingActionItemInsert, Partial<OcgMeetingActionItemRow>>
      ocg_conversations: DbTable<OcgConversationRow, OcgConversationInsert, Partial<OcgConversationRow>>
      ocg_conversation_members: DbTable<OcgConversationMemberRow, OcgConversationMemberInsert, Partial<OcgConversationMemberRow>>
      ocg_messages: DbTable<OcgMessageRow, OcgMessageInsert, Partial<OcgMessageRow>>
      ocg_forum_posts: DbTable<OcgForumPostRow, OcgForumPostInsert, Partial<OcgForumPostRow>>
      ocg_forum_replies: DbTable<OcgForumReplyRow, OcgForumReplyInsert, Partial<OcgForumReplyRow>>
      ocg_day_closes: DbTable<OcgDayCloseRow, OcgDayCloseInsert, Partial<OcgDayCloseRow>>
      inventory_items: DbTable<InventoryItemRow, InventoryItemInsert, Partial<InventoryItemRow>>
      inventory_movements: DbTable<InventoryMovementRow, InventoryMovementInsert, Partial<InventoryMovementRow>>
      procurement_vendors: DbTable<ProcurementVendorRow, ProcurementVendorInsert, Partial<ProcurementVendorRow>>
      procurement_purchases: DbTable<ProcurementPurchaseRow, ProcurementPurchaseInsert, Partial<ProcurementPurchaseRow>>
      procurement_purchase_items: DbTable<ProcurementPurchaseItemRow, ProcurementPurchaseItemInsert, Partial<ProcurementPurchaseItemRow>>
      finance_voteheads: DbTable<FinanceVoteheadRow, FinanceVoteheadInsert, Partial<FinanceVoteheadRow>>
      finance_accounts: DbTable<FinanceAccountRow, FinanceAccountInsert, Partial<FinanceAccountRow>>
      finance_transactions: DbTable<FinanceTransactionRow, FinanceTransactionInsert, Partial<FinanceTransactionRow>>
      finance_interbrand_transfers: DbTable<FinanceInterbrandTransferRow, FinanceInterbrandTransferInsert, Partial<FinanceInterbrandTransferRow>>
      finance_reconciliation_batches: DbTable<FinanceReconciliationBatchRow, FinanceReconciliationBatchInsert, Partial<FinanceReconciliationBatchRow>>
      finance_reconciliation_matches: DbTable<FinanceReconciliationMatchRow, FinanceReconciliationMatchInsert, Partial<FinanceReconciliationMatchRow>>
      finance_exceptions: DbTable<FinanceExceptionRow, FinanceExceptionInsert, Partial<FinanceExceptionRow>>
      npt_customers: DbTable<NptCustomerRow, NptCustomerInsert, Partial<NptCustomerRow>>
      npt_pianos: DbTable<NptPianoRow, NptPianoInsert, Partial<NptPianoRow>>
      npt_service_jobs: DbTable<NptServiceJobRow, NptServiceJobInsert, Partial<NptServiceJobRow>>
      npt_service_history: DbTable<NptServiceHistoryRow, NptServiceHistoryInsert, Partial<NptServiceHistoryRow>>
      npt_quote_invoice_records: DbTable<NptQuoteInvoiceRow, NptQuoteInvoiceInsert, Partial<NptQuoteInvoiceRow>>
      npt_reminders: DbTable<NptReminderRow, NptReminderInsert, Partial<NptReminderRow>>
      npt_contacts: DbTable<NptContactRow, NptContactInsert, Partial<NptContactRow>>
      npt_appointments: DbTable<NptAppointmentRow, NptAppointmentInsert, Partial<NptAppointmentRow>>
      npt_piano_measurements: DbTable<NptPianoMeasurementRow, NptPianoMeasurementInsert, Partial<NptPianoMeasurementRow>>
      npt_timeline_events: DbTable<NptTimelineEventRow, NptTimelineEventInsert, Partial<NptTimelineEventRow>>
      rayyan_guardians: DbTable<RayyanGuardianRow, RayyanGuardianInsert, Partial<RayyanGuardianRow>>
      rayyan_students: DbTable<RayyanStudentRow, RayyanStudentInsert, Partial<RayyanStudentRow>>
      rayyan_admissions: DbTable<RayyanAdmissionRow, RayyanAdmissionInsert, Partial<RayyanAdmissionRow>>
      rayyan_fee_followups: DbTable<RayyanFeeFollowupRow, RayyanFeeFollowupInsert, Partial<RayyanFeeFollowupRow>>
      rayyan_schoolpay_import_batches: DbTable<RayyanSchoolpayImportBatchRow, RayyanSchoolpayImportBatchInsert, Partial<RayyanSchoolpayImportBatchRow>>
      rayyan_schoolpay_payment_snapshots: DbTable<RayyanSchoolpayPaymentSnapshotRow, RayyanSchoolpayPaymentSnapshotInsert, Partial<RayyanSchoolpayPaymentSnapshotRow>>
      rayyan_fee_invoices: DbTable<RayyanFeeInvoiceRow, RayyanFeeInvoiceInsert, Partial<RayyanFeeInvoiceRow>>
      rayyan_fee_payments: DbTable<RayyanFeePaymentRow, RayyanFeePaymentInsert, Partial<RayyanFeePaymentRow>>
      rayyan_classes: DbTable<RayyanClassRow, RayyanClassInsert, Partial<RayyanClassRow>>
      rayyan_attendance_notes: DbTable<RayyanAttendanceNoteRow, RayyanAttendanceNoteInsert, Partial<RayyanAttendanceNoteRow>>
      rayyan_admin_tasks: DbTable<RayyanAdminTaskRow, RayyanAdminTaskInsert, Partial<RayyanAdminTaskRow>>
      rhythms_students: DbTable<RhythmsStudentRow, RhythmsStudentInsert, Partial<RhythmsStudentRow>>
      rhythms_schoolpay_import_batches: DbTable<RhythmsSchoolpayImportBatchRow, RhythmsSchoolpayImportBatchInsert, Partial<RhythmsSchoolpayImportBatchRow>>
      rhythms_schoolpay_payment_snapshots: DbTable<RhythmsSchoolpayPaymentSnapshotRow, RhythmsSchoolpayPaymentSnapshotInsert, Partial<RhythmsSchoolpayPaymentSnapshotRow>>
      rhythms_fee_invoices: DbTable<RhythmsFeeInvoiceRow, RhythmsFeeInvoiceInsert, Partial<RhythmsFeeInvoiceRow>>
      rhythms_fee_payments: DbTable<RhythmsFeePaymentRow, RhythmsFeePaymentInsert, Partial<RhythmsFeePaymentRow>>
      rhythms_guardians: DbTable<RhythmsGuardianRow, RhythmsGuardianInsert, Partial<RhythmsGuardianRow>>
      rhythms_classes: DbTable<RhythmsClassRow, RhythmsClassInsert, Partial<RhythmsClassRow>>
      rhythms_admissions: DbTable<RhythmsAdmissionRow, RhythmsAdmissionInsert, Partial<RhythmsAdmissionRow>>
      rhythms_fee_followups: DbTable<RhythmsFeeFollowupRow, RhythmsFeeFollowupInsert, Partial<RhythmsFeeFollowupRow>>
      rhythms_attendance_notes: DbTable<RhythmsAttendanceNoteRow, RhythmsAttendanceNoteInsert, Partial<RhythmsAttendanceNoteRow>>
      rhythms_admin_tasks: DbTable<RhythmsAdminTaskRow, RhythmsAdminTaskInsert, Partial<RhythmsAdminTaskRow>>
      darul_guardians: DbTable<DarulGuardianRow, DarulGuardianInsert, Partial<DarulGuardianRow>>
      darul_classes: DbTable<DarulClassRow, DarulClassInsert, Partial<DarulClassRow>>
      darul_students: DbTable<DarulStudentRow, DarulStudentInsert, Partial<DarulStudentRow>>
      darul_admissions: DbTable<DarulAdmissionRow, DarulAdmissionInsert, Partial<DarulAdmissionRow>>
      darul_hifz_progress: DbTable<DarulHifzProgressRow, DarulHifzProgressInsert, Partial<DarulHifzProgressRow>>
      darul_attendance_notes: DbTable<DarulAttendanceNoteRow, DarulAttendanceNoteInsert, Partial<DarulAttendanceNoteRow>>
      darul_fee_invoices: DbTable<DarulFeeInvoiceRow, DarulFeeInvoiceInsert, Partial<DarulFeeInvoiceRow>>
      darul_fee_payments: DbTable<DarulFeePaymentRow, DarulFeePaymentInsert, Partial<DarulFeePaymentRow>>
      darul_fee_followups: DbTable<DarulFeeFollowupRow, DarulFeeFollowupInsert, Partial<DarulFeeFollowupRow>>
      darul_admin_tasks: DbTable<DarulAdminTaskRow, DarulAdminTaskInsert, Partial<DarulAdminTaskRow>>
    }
    Views: Record<string, never>
    Functions: Record<string, never>
  }
}
