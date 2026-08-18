// ─── User Permissions (RBAC) ─────────────────────────────────────────────────
export type SectionKey =
  | 'dashboard' | 'input' | 'compliance' | 'properties'
  | 'glitz' | 'npt' | 'reports' | 'brands' | 'users' | 'marketing'
  | 'ops' | 'ops_agents' | 'management' | 'finance' | 'npt_service' | 'rayyan_admin' | 'rhythms_admin'
  | 'darul_admin' | 'nuuranest_admin' | 'glitz_admin' | 'personal' | 'all_tasks'
  | 'meetings' | 'inventory' | 'procurement' | 'forms' | 'forms_responses' | 'forms_approvals'
  // Duties (055): `duties` edit = create/assign/edit/pause/end (brand-scopable),
  // `duties_all` view = see the team's/group's duties, `duties_review` = accept
  // or reopen a submitted occurrence. Viewing and completing your OWN duties
  // needs no grant. See lib/dutyModel.ts for the capability mapping.
  | 'duties' | 'duties_all' | 'duties_review'
  // Calendar (056): `calendar` = personal calendar (implicit for all users),
  // `calendar_team` view = permission-scoped team/brand calendars,
  // `calendar_events` edit = create company/brand events.
  | 'calendar_team' | 'calendar_events'

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
  /** Duty/calendar targeting dimensions (migration 055). */
  team: string
  location: string
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
  attendee_emails: string[]
  attendee_member_ids: string[]
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
  chat_conversation_id: string | null
  notes_updated_by: string
  notes_updated_at: string | null
  meeting_mode: string
  meeting_url: string
  google_calendar_event_id: string
  created_at: string
  updated_at: string
}
type OcgMeetingInsert = Pick<OcgMeetingRow, 'title'> & Partial<OcgMeetingRow>

export interface OcgMeetingTemplateRow {
  id: string
  title: string
  brand_id: string | null
  project_id: string | null
  location: string
  agenda: string
  attendees: string[]
  attendee_emails: string[]
  attendee_member_ids: string[]
  meeting_mode: string
  meeting_url: string
  series_key: string
  created_by: string
  created_by_email: string
  created_at: string
  updated_at: string
}
type OcgMeetingTemplateInsert = Pick<OcgMeetingTemplateRow, 'title'> & Partial<OcgMeetingTemplateRow>

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
  statement_import_id: string | null
  statement_line_id: string | null
  transaction_cost_ksh: number
  created_at: string
  updated_at: string
}
type FinanceTransactionInsert = Partial<FinanceTransactionRow>

export interface FinanceStatementImportRow {
  id: string
  brand_id: string | null
  account_id: string | null
  statement_type: string
  source_filename: string
  storage_bucket: string
  storage_path: string
  parse_status: string
  period_start: string | null
  period_end: string | null
  opening_balance_ksh: number | null
  closing_balance_ksh: number | null
  imported_by: string
  reviewed_by: string
  approved_at: string | null
  extracted_text: string
  notes: string
  created_at: string
  updated_at: string
}
type FinanceStatementImportInsert = Partial<FinanceStatementImportRow>

export interface FinanceStatementLineRow {
  id: string
  import_id: string
  brand_id: string | null
  account_id: string | null
  statement_date: string | null
  raw_description: string
  reference: string
  counterparty_name: string
  counterparty_account_hint: string
  direction: string
  amount_ksh: number
  transaction_cost_ksh: number
  running_balance_ksh: number | null
  suggested_category: string
  suggested_votehead_id: string | null
  suggested_counterparty_brand_id: string | null
  suggested_internal_account_id: string | null
  matched_transaction_id: string | null
  confidence: number
  review_status: string
  ledger_transaction_id: string | null
  notes: string
  raw_payload: Record<string, unknown>
  created_at: string
  updated_at: string
}
type FinanceStatementLineInsert = Pick<FinanceStatementLineRow, 'import_id'> & Partial<FinanceStatementLineRow>

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
  secondary_phone: string
  address: string
  city: string
  send_auto_reminders: boolean
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
  // ── 053: generalised beyond pianos (keyboards, saxophones, guitars, …) ──
  instrument_category: string
  instrument_type_other: string
  colour_finish: string
  /** Where the instrument physically is now; maintained by npt_movements. */
  current_location: string
  current_status: string
  current_repair_case_id: string | null
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

// ─── NPT communications log (migration 041) ──────────────────────────────────
// ─── NPT intake / repair / workshop / movement (053) ────────────────────────

/** Instrument arriving AT the workshop (npt_service_jobs is a visit going OUT). */
export interface NptIntakeRow {
  id: string
  reference: string | null
  brand_id: string | null
  date_received: string
  time_received: string
  received_by: string
  received_by_email: string
  brought_in_by: string
  reception_location: string
  intake_channel: string
  ownership_type: string
  customer_id: string | null
  customer_name: string
  customer_phone: string
  customer_email: string
  customer_location: string
  alternative_contact: string
  preferred_channel: string
  institution_name: string
  institution_contact_person: string
  institution_phone: string
  institution_email: string
  institution_location: string
  status: string
  notes: string
  acknowledged_at: string | null
  created_by: string
  created_at: string
  updated_at: string
}
type NptIntakeInsert = Partial<NptIntakeRow>

export interface NptIntakeItemRow {
  id: string
  intake_id: string
  piano_id: string | null
  instrument_category: string
  instrument_type_other: string
  quantity: number
  brand_make: string
  model: string
  serial_number: string
  colour_finish: string
  /** One structured list — the pad prints the column twice, which is a print artefact. */
  accessories: string[]
  accessories_notes: string
  condition_at_receipt: string
  reported_issue: string
  work_requested: string
  urgency: string
  sort_order: number
  created_at: string
}
type NptIntakeItemInsert = Pick<NptIntakeItemRow, 'intake_id'> & Partial<NptIntakeItemRow>

export interface NptRepairCaseRow {
  id: string
  reference: string | null
  intake_id: string | null
  intake_item_id: string | null
  piano_id: string | null
  customer_id: string | null
  service_job_id: string | null
  ops_task_id: string | null
  status: string
  priority: string
  assigned_technician_id: string | null
  consulting_guide_id: string | null
  reported_issue: string
  assessment_summary: string
  work_completed: string
  parts_used: string
  quoted_amount_ksh: number | null
  approved_amount_ksh: number | null
  current_location: string
  opened_on: string
  expected_completion: string | null
  closed_at: string | null
  notes: string
  created_by: string
  created_at: string
  updated_at: string
}
type NptRepairCaseInsert = Partial<NptRepairCaseRow>

export interface NptRepairCaseStatusHistoryRow {
  id: string
  repair_case_id: string
  previous_status: string
  new_status: string
  changed_by: string
  changed_by_name: string
  comment: string
  created_at: string
}
type NptRepairCaseStatusHistoryInsert = Pick<NptRepairCaseStatusHistoryRow, 'repair_case_id' | 'new_status'> &
  Partial<NptRepairCaseStatusHistoryRow>

export interface NptRepairActivityRow {
  id: string
  repair_case_id: string
  piano_id: string | null
  activity_date: string
  technician_id: string | null
  work_performed: string
  parts_used: string
  hours_spent: number | null
  progress_status: string
  challenges: string
  next_action: string
  expected_completion: string | null
  entered_by: string
  entered_by_name: string
  reviewed_by: string
  reviewed_at: string | null
  created_at: string
}
type NptRepairActivityInsert = Pick<NptRepairActivityRow, 'repair_case_id'> & Partial<NptRepairActivityRow>

export interface NptWorkshopPlanRow {
  id: string
  brand_id: string | null
  plan_date: string
  workshop_clean: string
  workshop_comment: string
  showroom_clean: string
  showroom_comment: string
  manager_comment: string
  manager_ack_by: string
  manager_ack_at: string | null
  director_comment: string
  director_ack_by: string
  director_ack_at: string | null
  status: string
  completed_at: string | null
  created_by: string
  created_at: string
  updated_at: string
}
type NptWorkshopPlanInsert = Partial<NptWorkshopPlanRow>

export interface NptWorkshopPlanRowRow {
  id: string
  plan_id: string
  /** allocation | review | challenge — the paper form's three tables. */
  section: string
  repair_case_id: string | null
  piano_id: string | null
  instrument_label: string
  technician_id: string | null
  consulting_guide_id: string | null
  target_plan: string
  priority: string
  expected_result: string
  due_at: string
  actual_outcome: string
  outcome_status: string
  comment: string
  challenge: string
  required_intervention: string
  responsible_person_id: string | null
  resolution_target: string | null
  sort_order: number
  created_at: string
}
type NptWorkshopPlanRowInsert = Pick<NptWorkshopPlanRowRow, 'plan_id'> & Partial<NptWorkshopPlanRowRow>

export interface NptMovementRow {
  id: string
  reference: string | null
  brand_id: string | null
  movement_type: string
  customer_id: string | null
  customer_label: string
  piano_id: string | null
  repair_case_id: string | null
  instrument_category: string
  instrument_label: string
  serial_number: string
  quantity: number
  origin: string
  destination: string
  scheduled_at: string | null
  departed_at: string | null
  arrived_at: string | null
  crew: string[]
  crew_member_ids: string[]
  vehicle: string
  transport_provider: string
  origin_contact: string
  destination_contact: string
  fee_ksh: number | null
  payment_status: string
  payment_reference: string
  condition_before: string
  condition_after: string
  accessories_moved: string[]
  special_handling: string
  customer_ack_name: string
  customer_ack_at: string | null
  staff_ack_name: string
  staff_ack_at: string | null
  status: string
  incident_note: string
  notes: string
  created_by: string
  created_at: string
  updated_at: string
}
type NptMovementInsert = Partial<NptMovementRow>

/**
 * NOTE: no photograph of the Daily Class Logbook was supplied; these fields come
 * from the written brief only and are unverified against the physical book.
 */
export interface NptTrainingSessionRow {
  id: string
  reference: string | null
  brand_id: string | null
  session_date: string
  instructor_id: string | null
  instructor_name: string
  class_group: string
  training_location: string
  objective: string
  topic: string
  subtopics: string
  practical_work: string
  learning_review: string
  questions_asked: string
  instructor_signed_by: string
  instructor_signed_at: string | null
  manager_reviewed_by: string
  manager_reviewed_at: string | null
  status: string
  created_by: string
  created_at: string
  updated_at: string
}
type NptTrainingSessionInsert = Partial<NptTrainingSessionRow>

export interface NptTrainingAttendanceRow {
  id: string
  session_id: string
  trainee_id: string | null
  trainee_name: string
  present: boolean
  absence_reason: string
  created_at: string
}
type NptTrainingAttendanceInsert = Pick<NptTrainingAttendanceRow, 'session_id'> & Partial<NptTrainingAttendanceRow>

export interface NptCommLogRow {
  id: string
  appointment_id: string | null
  customer_id: string | null
  kind: string
  channel: string
  recipient: string
  subject: string
  status: string
  detail: string
  sent_at: string
}
type NptCommLogInsert = Pick<NptCommLogRow, 'kind'> & Partial<NptCommLogRow>

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

// ─── Rayyan academics (migration 043) ─────────────────────────────────────────
export interface RayyanActivityRow {
  id: string
  name: string
  description: string
  is_active: boolean
  created_at: string
}
type RayyanActivityInsert = Pick<RayyanActivityRow, 'name'> & Partial<RayyanActivityRow>

export interface RayyanStudentActivityRow {
  id: string
  student_id: string
  activity_id: string
  joined_on: string | null
  notes: string
  is_active: boolean
  created_at: string
}
type RayyanStudentActivityInsert = Pick<RayyanStudentActivityRow, 'student_id' | 'activity_id'> &
  Partial<RayyanStudentActivityRow>

export interface RayyanAssessmentRow {
  id: string
  student_id: string
  academic_year: string
  term: string
  learning_area: string
  assessment_type: string
  performance_level: string
  score: number | null
  remarks: string
  assessed_on: string | null
  teacher: string
  created_at: string
  updated_at: string
}
type RayyanAssessmentInsert = Pick<RayyanAssessmentRow, 'student_id' | 'learning_area'> &
  Partial<RayyanAssessmentRow>

export interface RayyanStudentHistoryRow {
  id: string
  student_id: string
  event_type: string
  title: string
  details: string
  occurred_on: string
  recorded_by: string
  created_at: string
}
type RayyanStudentHistoryInsert = Pick<RayyanStudentHistoryRow, 'student_id' | 'title'> &
  Partial<RayyanStudentHistoryRow>

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
  frequency: string
  weekdays: number[]
  day_of_month: number | null
  interval_days: number
  time_of_day: string
  timezone: string
  start_date: string | null
  end_date: string | null
  priority: string
  category: string
  requires_proof: boolean
  reminder_minutes: number
  paused: boolean
  created_at: string
  updated_at: string
  // ── Configurable duties (migration 055) ──
  /** employee | team | department | brand | location | role */
  target_kind: string
  target_team: string
  target_department: string
  target_role: string
  target_location: string
  instructions: string
  /** task | checklist | report | form | inspection */
  duty_kind: string
  location: string
  reviewer_id: string | null
  requires_note: boolean
  requires_checklist: boolean
  requires_approval: boolean
  required_form_template_id: string | null
  grace_minutes: number
  escalation_minutes: number
  skip_holidays: boolean
  created_by: string
  updated_by: string
  /** Null until the one-time assignment email has been sent (§4). */
  assignment_email_sent_at: string | null
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
  // ── Occurrence record (migration 055) ──
  due_at: string | null
  completed_on_time: boolean | null
  checklist_done: number
  checklist_total: number
  /** not_required | pending | accepted | reopened */
  review_state: string
  reviewed_by: string
  reviewed_at: string | null
  review_comment: string
  quality_rating: number | null
  form_submission_id: string | null
  attachment_count: number
  /** ops_tasks.task_id — TEXT, e.g. 'TASK-0001'. */
  task_ref: string | null
  escalated_at: string | null
  completed_by: string
}
type OcgDailyDutyLogInsert = Pick<OcgDailyDutyLogRow, 'duty_id'> & Partial<OcgDailyDutyLogRow>

// ─── Duty checklists, results, holidays (migration 055) ──────────────────────
export interface OcgDutyChecklistItemRow {
  id: string
  duty_id: string
  position: number
  label: string
  hint: string
  required: boolean
  active: boolean
  created_at: string
  updated_at: string
}
type OcgDutyChecklistItemInsert = Pick<OcgDutyChecklistItemRow, 'duty_id' | 'label'> & Partial<OcgDutyChecklistItemRow>

export interface OcgDutyChecklistResultRow {
  id: string
  log_id: string
  item_id: string
  checked: boolean
  note: string
  checked_by: string
  checked_at: string | null
  created_at: string
  updated_at: string
}
type OcgDutyChecklistResultInsert = Pick<OcgDutyChecklistResultRow, 'log_id' | 'item_id'> & Partial<OcgDutyChecklistResultRow>

export interface OcgHolidayRow {
  id: string
  /** null = applies group-wide. */
  brand_id: string | null
  holiday_date: string
  name: string
  /** true = a declared working day that would otherwise be off; overrides a holiday. */
  is_working_day: boolean
  notes: string
  created_by: string
  created_at: string
}
type OcgHolidayInsert = Pick<OcgHolidayRow, 'holiday_date' | 'name'> & Partial<OcgHolidayRow>

// ─── Calendar (migration 056) ────────────────────────────────────────────────
export interface OcgCalendarEventRow {
  id: string
  title: string
  description: string
  /** event | meeting | training | stock_count | holiday | maintenance | campaign | production_deadline | leave | reminder */
  event_kind: string
  brand_id: string | null
  starts_at: string
  ends_at: string | null
  all_day: boolean
  timezone: string
  location: string
  /** private | users | team | department | brand | company */
  visibility: string
  visibility_team: string
  visibility_department: string
  visibility_user_ids: string[]
  created_by_id: string | null
  created_by: string
  /** confirmed | tentative | cancelled */
  status: string
  notes: string
  created_at: string
  updated_at: string
}
type OcgCalendarEventInsert = Pick<OcgCalendarEventRow, 'title' | 'starts_at'> & Partial<OcgCalendarEventRow>

export interface OcgCalendarEventAttendeeRow {
  id: string
  event_id: string
  team_member_id: string | null
  email: string
  /** invited | accepted | declined | tentative */
  response: string
  responded_at: string | null
  created_at: string
}
type OcgCalendarEventAttendeeInsert = Pick<OcgCalendarEventAttendeeRow, 'event_id'> & Partial<OcgCalendarEventAttendeeRow>

export interface OcgCalendarRescheduleRow {
  id: string
  /** task | duty | event | meeting */
  entity_type: string
  entity_id: string
  previous_start: string | null
  previous_end: string | null
  new_start: string | null
  new_end: string | null
  previous_date: string | null
  new_date: string | null
  reason: string
  moved_by: string
  moved_by_id: string | null
  /** calendar_drag | form | api */
  source: string
  created_at: string
}
type OcgCalendarRescheduleInsert = Pick<OcgCalendarRescheduleRow, 'entity_type' | 'entity_id'> & Partial<OcgCalendarRescheduleRow>

export interface OcgLeaveRequestRow {
  id: string
  team_member_id: string
  brand_id: string | null
  /** annual | sick | compassionate | unpaid | study | maternity | paternity */
  leave_type: string
  start_date: string
  end_date: string
  half_day: boolean
  days_count: number
  reason: string
  /** requested | approved | rejected | cancelled */
  status: string
  requested_by: string
  approved_by: string
  approved_at: string | null
  decision_note: string
  created_at: string
  updated_at: string
}
type OcgLeaveRequestInsert = Pick<OcgLeaveRequestRow, 'team_member_id' | 'start_date' | 'end_date'> & Partial<OcgLeaveRequestRow>

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
  /** raw_material | packaging | work_in_progress | finished_good
   *  | damaged | returned | sample | consumable  (migration 060) */
  item_type: string
  store_id: string | null
  product_family: string
  size_label: string
  package_config: string
  barcode: string
  selling_price_ksh: number
  minimum_stock: number
  maximum_stock: number | null
  production_threshold: number
  shelf_life_days: number | null
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
  // ── 054: the document that caused this movement ──
  // receipt_item_id / issue_item_id carry partial UNIQUE indexes, so one
  // document line can never post to stock twice.
  goods_receipt_id: string | null
  receipt_item_id: string | null
  goods_issue_id: string | null
  issue_item_id: string | null
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
  is_blacklisted: boolean
  blacklist_reason: string
  blacklisted_by: string
  blacklisted_at: string | null
  created_at: string
  updated_at: string
  // ── 054: full supplier profile (SUPPLIER GENERAL INFORMATION FORM) ──
  legal_name: string
  trading_name: string
  company_type: string
  registration_number: string
  tax_pin: string
  vat_number: string
  postal_address: string
  physical_location: string
  fax: string
  website: string
  nature_of_business: string
  year_commenced_trading: string
  quality_certification: string
  quality_cert_year: string
  directors: { name: string; role?: string; id_number?: string }[]
  shareholders: { name: string; percent_held?: number }[]
  turnover_history: { year: string; turnover_ksh?: number }[]
  trade_references: { name: string; address?: string; contact?: string }[]
  major_customers: string
  management_md: string
  management_finance: string
  management_sales: string
  other_information: string
  /** Restricted — never serialise to a caller without procurement:edit. */
  bank_name: string
  bank_branch: string
  bank_account_name: string
  bank_account_number: string
  bank_postal_address: string
  status: string
  signed_by: string
  signed_position: string
  signed_date: string | null
  reviewed_by: string
  reviewed_at: string | null
}

// ─── Procurement chain (migration 054) ───────────────────────────────────────

export interface ProcurementCreditApplicationRow {
  id: string
  reference: string | null
  vendor_id: string | null
  brand_id: string | null
  full_business_name: string
  company_type: string
  postal_address: string
  physical_address: string
  telephone: string
  fax: string
  chief_executive: string
  nature_of_business: string
  tax_pin: string
  vat_number: string
  bank_name: string
  bank_branch: string
  bank_postal_address: string
  trade_references: { name: string; address?: string }[]
  credit_limit_requested_ksh: number | null
  credit_terms_requested: string
  status: string
  decision_note: string
  approved_limit_ksh: number | null
  approved_terms_days: number | null
  decided_by: string
  decided_at: string | null
  created_by: string
  created_at: string
  updated_at: string
}
type ProcurementCreditApplicationInsert = Partial<ProcurementCreditApplicationRow>

export interface ProcurementRequisitionRow {
  id: string
  reference: string | null
  brand_id: string
  scope: string
  shared_brand_ids: string[]
  department: string
  requested_by: string
  requested_by_name: string
  date_requested: string
  required_by: string | null
  purpose: string
  linked_task_id: string | null
  linked_repair_case_id: string | null
  status: string
  prepared_by: string
  /** Never equal to requested_by unless self-approval was explicitly granted. */
  approved_by: string
  approved_by_name: string
  approved_at: string | null
  approval_comment: string
  notes: string
  created_at: string
  updated_at: string
}
type ProcurementRequisitionInsert = Pick<ProcurementRequisitionRow, 'brand_id'> & Partial<ProcurementRequisitionRow>

export interface ProcurementRequisitionItemRow {
  id: string
  requisition_id: string
  inventory_item_id: string | null
  description: string
  unit: string
  quantity_requested: number
  stock_at_request: number | null
  quantity_approved: number
  quantity_issued: number
  notes: string
  sort_order: number
  created_at: string
}
type ProcurementRequisitionItemInsert = Pick<ProcurementRequisitionItemRow, 'requisition_id'> &
  Partial<ProcurementRequisitionItemRow>

export interface ProcurementGoodsReceiptRow {
  id: string
  reference: string | null
  brand_id: string
  scope: string
  shared_brand_ids: string[]
  purchase_id: string | null
  requisition_id: string | null
  vendor_id: string | null
  received_date: string
  received_time: string
  received_by: string
  received_by_email: string
  delivery_person: string
  delivery_note_number: string
  lpo_number: string
  invoice_number: string
  vehicle_number: string
  receiving_location: string
  stock_card_number: string
  amount_in_words: string
  variance_notes: string
  damage_notes: string
  remarks: string
  checked_by: string
  authorised_by: string
  entered_by: string
  supplier_ack_name: string
  receiver_ack_name: string
  status: string
  posted_at: string | null
  posted_by: string
  created_by: string
  created_at: string
  updated_at: string
}
type ProcurementGoodsReceiptInsert = Pick<ProcurementGoodsReceiptRow, 'brand_id'> &
  Partial<ProcurementGoodsReceiptRow>

export interface ProcurementGoodsReceiptItemRow {
  id: string
  receipt_id: string
  purchase_item_id: string | null
  inventory_item_id: string | null
  description: string
  unit: string
  quantity_ordered: number
  quantity_delivered: number
  /** Only this quantity ever reaches inventory. */
  quantity_accepted: number
  quantity_rejected: number
  unit_cost_ksh: number
  batch_number: string
  expiry_date: string | null
  condition: string
  rejection_reason: string
  remarks: string
  disposition: string
  sort_order: number
  created_at: string
}
type ProcurementGoodsReceiptItemInsert = Pick<ProcurementGoodsReceiptItemRow, 'receipt_id'> &
  Partial<ProcurementGoodsReceiptItemRow>

export interface ProcurementGoodsIssueRow {
  id: string
  reference: string | null
  /** issue = GIN (goods leave to a recipient) · transfer = GTN (store to store). */
  kind: string
  brand_id: string
  requisition_id: string | null
  issue_date: string
  issued_to_type: string
  issued_to_member_id: string | null
  issued_to_label: string
  transfer_to_brand_id: string | null
  transfer_to_location: string
  store_location: string
  issued_by: string
  issued_by_email: string
  received_by: string
  receiver_ack_at: string | null
  variance_notes: string
  remarks: string
  status: string
  posted_at: string | null
  posted_by: string
  created_by: string
  created_at: string
  updated_at: string
}
type ProcurementGoodsIssueInsert = Pick<ProcurementGoodsIssueRow, 'brand_id'> & Partial<ProcurementGoodsIssueRow>

export interface ProcurementGoodsIssueItemRow {
  id: string
  issue_id: string
  requisition_item_id: string | null
  inventory_item_id: string | null
  description: string
  unit: string
  quantity_approved: number
  quantity_issued: number
  batch_number: string
  store_location: string
  remarks: string
  sort_order: number
  created_at: string
}
type ProcurementGoodsIssueItemInsert = Pick<ProcurementGoodsIssueItemRow, 'issue_id'> &
  Partial<ProcurementGoodsIssueItemRow>
type ProcurementVendorInsert = Pick<ProcurementVendorRow, 'name'> & Partial<ProcurementVendorRow>

export interface ProcurementPurchaseRow {
  id: string
  brand_id: string
  vendor_id: string | null
  purchase_date: string
  reference: string
  receipt_url: string
  category: string
  status: string
  payment_status: string
  total_cost_ksh: number
  finance_transaction_id: string | null
  received_at: string | null
  recorded_by: string
  notes: string
  scope: string
  cost_centre: string
  beneficiary_brand_ids: string[]
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
  item_type: string
  disposition: string
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
  attachment_path: string
  attachment_name: string
  attachment_type: string
  attachment_size: number
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

// ─── Audit, inbox, attendance (migration 036) ───────────────────────────────
export interface OcgAuditEventRow {
  id: string
  actor_user_id: string | null
  actor_email: string
  actor_name: string
  action: string
  entity_table: string
  entity_id: string
  entity_label: string
  before_data: Record<string, unknown> | null
  after_data: Record<string, unknown> | null
  changed_fields: string[]
  undo_event_id: string | null
  request_id: string
  created_at: string
}
type OcgAuditEventInsert = Partial<OcgAuditEventRow>

export interface OcgNotificationRow {
  id: string
  recipient_email: string
  recipient_name: string
  sender_email: string
  sender_name: string
  kind: string
  title: string
  body: string
  href: string
  metadata: Record<string, unknown>
  read_at: string | null
  created_at: string
}
type OcgNotificationInsert = Pick<OcgNotificationRow, 'recipient_email' | 'title'> & Partial<OcgNotificationRow>

// ─── Custom forms (migration 042) ─────────────────────────────────────────────
/** One field in a custom form template. */
export interface OcgFormFieldDef {
  key: string
  label: string
  type: 'text' | 'textarea' | 'number' | 'date' | 'time' | 'select' | 'checkbox'
  required?: boolean
  options?: string[]
  placeholder?: string
}

/** Publication state of a form template. Only `published` forms can be filled. */
export type OcgFormTemplateState = 'draft' | 'published' | 'archived'

export interface OcgFormTemplateRow {
  id: string
  brand_id: string | null
  module: string
  name: string
  description: string
  frequency: string
  fields: OcgFormFieldDef[]
  is_active: boolean
  sort_order: number
  created_by: string
  created_at: string
  updated_at: string
  // ── 052 lifecycle ──
  state: OcgFormTemplateState
  version: number
  category: string
  reference_prefix: string
  requires_approval: boolean
  allow_self_correction: boolean
  requires_signature: boolean
  linked_entity_table: string
  published_at: string | null
  published_by: string
  updated_by: string
}
type OcgFormTemplateInsert = Pick<OcgFormTemplateRow, 'name'> & Partial<OcgFormTemplateRow>

export interface OcgFormTemplateVersionRow {
  id: string
  template_id: string
  version: number
  name: string
  description: string
  fields: OcgFormFieldDef[]
  published_by: string
  created_at: string
}
type OcgFormTemplateVersionInsert = Pick<OcgFormTemplateVersionRow, 'template_id' | 'version'> &
  Partial<OcgFormTemplateVersionRow>

/**
 * Submission lifecycle. `draft` is the only editable state for a respondent;
 * `correction_requested` re-opens editing for the original submitter without
 * losing the submitted history.
 */
export type OcgFormSubmissionStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'correction_requested'

export interface OcgFormSubmissionRow {
  id: string
  template_id: string
  brand_id: string | null
  submitted_by: string
  submitted_by_name: string
  submission_date: string
  values: Record<string, unknown>
  notes: string
  created_at: string
  updated_at: string
  // ── 052 lifecycle ──
  status: OcgFormSubmissionStatus
  template_version: number
  reference: string | null
  submitted_at: string | null
  autosaved_at: string | null
  reviewed_by: string
  reviewed_at: string | null
  review_comment: string
  correction_note: string
  signature_name: string
  signed_at: string | null
  linked_entity_table: string
  linked_entity_id: string
}
type OcgFormSubmissionInsert = Pick<OcgFormSubmissionRow, 'template_id'> & Partial<OcgFormSubmissionRow>

/** How restricted an attachment is, beyond ordinary module access. */
export type AttachmentConfidentiality = 'normal' | 'restricted' | 'confidential'

/**
 * One attachment table for every module (§28) — form submissions, NPT intakes,
 * repair activity, movements, goods receipts, issue notes, requisitions,
 * inspections, supplier and employee documents. Identified by entity_table +
 * entity_id. Files live in the private `ops-attachments` bucket; only the path
 * is stored, never a public URL.
 */
export interface OcgRecordAttachmentRow {
  id: string
  entity_table: string
  entity_id: string
  domain: string
  brand_id: string | null
  storage_path: string
  file_name: string
  mime_type: string
  size_bytes: number
  caption: string
  confidentiality: AttachmentConfidentiality
  uploaded_by: string
  created_at: string
}
type OcgRecordAttachmentInsert = Pick<OcgRecordAttachmentRow, 'entity_table' | 'entity_id' | 'storage_path'> &
  Partial<OcgRecordAttachmentRow>

/**
 * Legal identity printed on generated documents, kept separate from the
 * marketing `brands` row. Iceland Geyser Ltd is the company behind the
 * `glitz-n-glim` brand, so printed identity cannot be derived from brands.name.
 * `document_scope` is 'default' plus optional per-document overrides.
 */
export interface OcgBrandPrintIdentityRow {
  id: string
  brand_id: string
  document_scope: string
  legal_name: string
  trading_name: string
  postal_address: string
  physical_address: string
  email: string
  phone: string
  website: string
  tax_pin: string
  vat_number: string
  logo_url: string
  accent_hex: string
  footer_note: string
  extra_lines: string[]
  is_active: boolean
  updated_by: string
  created_at: string
  updated_at: string
}
type OcgBrandPrintIdentityInsert = Pick<OcgBrandPrintIdentityRow, 'brand_id' | 'legal_name'> &
  Partial<OcgBrandPrintIdentityRow>

export interface OpsAttendanceRecordRow {
  id: string
  team_member_id: string | null
  employee_code: string
  employee_name: string
  employee_email: string
  attendance_date: string
  check_in_at: string | null
  check_out_at: string | null
  source: string
  device_name: string
  raw_payload: Record<string, unknown>
  imported_by: string
  notes: string
  created_at: string
  updated_at: string
}
type OpsAttendanceRecordInsert = Pick<OpsAttendanceRecordRow, 'attendance_date'> & Partial<OpsAttendanceRecordRow>

type DbTable<Row, Insert, Update> = {
  Row: Row & Record<string, unknown>
  Insert: Insert & Record<string, unknown>
  Update: Update & Record<string, unknown>
  Relationships: []
}

// ─── Supabase DB type map (for typed client) ──────────────────────────────────
// ─── School finance foundation (migration 044) ───────────────────────────────
export type School = 'rayyan' | 'rhythms' | 'darul'

export interface SchoolChargeCategoryRow {
  id: string
  school: School
  brand_id: string | null
  section: string
  programme_id: string | null
  code: string
  name: string
  kind: string
  billing_cadence: string
  is_active: boolean
  sort_order: number
  notes: string
  created_at: string
  updated_at: string
}
type SchoolChargeCategoryInsert = Pick<SchoolChargeCategoryRow, 'school' | 'name'> & Partial<SchoolChargeCategoryRow>

export interface SchoolProgrammeRow {
  id: string
  school: School
  brand_id: string | null
  parent_id: string | null
  kind: string
  code: string
  name: string
  duration_label: string
  applies_to: string
  completion_requirements: string
  is_active: boolean
  sort_order: number
  notes: string
  created_at: string
  updated_at: string
}
type SchoolProgrammeInsert = Pick<SchoolProgrammeRow, 'school' | 'name'> & Partial<SchoolProgrammeRow>

export interface SchoolFeeStructureRow {
  id: string
  school: School
  brand_id: string | null
  programme_id: string | null
  version: number
  name: string
  academic_year: string
  effective_from: string | null
  effective_to: string | null
  status: string
  currency: string
  notes: string
  created_at: string
  updated_at: string
}
type SchoolFeeStructureInsert = Pick<SchoolFeeStructureRow, 'school'> & Partial<SchoolFeeStructureRow>

export interface SchoolFeeStructureItemRow {
  id: string
  fee_structure_id: string
  category_id: string | null
  label: string
  amount_ksh: number
  billing_cadence: string
  is_required: boolean
  is_completion_req: boolean
  sort_order: number
  notes: string
  created_at: string
}
type SchoolFeeStructureItemInsert = Pick<SchoolFeeStructureItemRow, 'fee_structure_id' | 'label'> & Partial<SchoolFeeStructureItemRow>

export interface SchoolEnrollmentRow {
  id: string
  school: School
  brand_id: string | null
  student_id: string
  student_admission_no: string
  programme_id: string | null
  fee_structure_id: string | null
  section: string
  academic_year: string
  term: string
  status: string
  start_date: string | null
  end_date: string | null
  notes: string
  created_at: string
  updated_at: string
}
type SchoolEnrollmentInsert = Pick<SchoolEnrollmentRow, 'school' | 'student_id'> & Partial<SchoolEnrollmentRow>

export type SchoolLedgerEntryType =
  | 'charge' | 'payment' | 'adjustment' | 'opening_balance' | 'reversal' | 'write_off' | 'refund'
export type SchoolLedgerState = 'draft' | 'posted' | 'reversed'

export interface SchoolLedgerEntryRow {
  id: string
  school: School
  brand_id: string | null
  student_id: string
  student_admission_no: string
  enrollment_id: string | null
  category_id: string | null
  category_label: string
  section: string
  entry_type: SchoolLedgerEntryType
  entry_date: string
  academic_year: string
  term: string
  description: string
  amount_ksh: number
  currency: string
  method: string
  receipt_no: string
  mpesa_code: string
  receiving_account_id: string | null
  state: SchoolLedgerState
  reverses_entry_id: string | null
  source_balance: number | null
  source_workbook: string
  source_sheet: string
  source_row: number | null
  import_id: string | null
  notes: string
  comment: string
  recorded_by: string
  posted_by: string
  posted_at: string | null
  created_at: string
  updated_at: string
}
type SchoolLedgerEntryInsert = Pick<SchoolLedgerEntryRow, 'school' | 'student_id'> & Partial<SchoolLedgerEntryRow>

export interface SchoolAssessmentRow {
  id: string
  school: School
  brand_id: string | null
  student_id: string
  student_admission_no: string
  subject: string
  academic_year: string
  term: string
  assessment_type: string
  score: number | null
  max_score: number
  grade: string
  status: string
  remarks: string
  teacher: string
  assessed_on: string | null
  recorded_by: string
  created_at: string
  updated_at: string
}
type SchoolAssessmentInsert = Pick<SchoolAssessmentRow, 'school' | 'student_id'> & Partial<SchoolAssessmentRow>

export interface SchoolPaymentAllocationRow {
  id: string
  payment_entry_id: string
  charge_entry_id: string
  amount_ksh: number
  created_at: string
}
type SchoolPaymentAllocationInsert = Pick<SchoolPaymentAllocationRow, 'payment_entry_id' | 'charge_entry_id' | 'amount_ksh'> & Partial<SchoolPaymentAllocationRow>

export interface SchoolStudentRequirementRow {
  id: string
  school: School
  brand_id: string | null
  student_id: string
  student_admission_no: string
  enrollment_id: string | null
  requirement_code: string
  requirement_label: string
  status: string
  status_date: string | null
  notes: string
  source_workbook: string
  source_sheet: string
  source_row: number | null
  import_id: string | null
  created_at: string
  updated_at: string
}
type SchoolStudentRequirementInsert = Pick<SchoolStudentRequirementRow, 'school' | 'student_id' | 'requirement_label'> & Partial<SchoolStudentRequirementRow>

// ─── Petty cash (migration 045) ──────────────────────────────────────────────
export interface PettyCashAccountRow {
  id: string
  brand_id: string | null
  operating_unit: string
  department: string
  branch: string
  custodian: string
  name: string
  currency: string
  opening_float_ksh: number
  current_balance_ksh: number
  is_active: boolean
  notes: string
  created_at: string
  updated_at: string
}
type PettyCashAccountInsert = Pick<PettyCashAccountRow, 'name'> & Partial<PettyCashAccountRow>

export type PettyCashEntryKind = 'opening' | 'income' | 'expense'
export type PettyCashState = 'draft' | 'submitted' | 'reviewed' | 'approved' | 'rejected' | 'reconciled' | 'closed'

export interface PettyCashTransactionRow {
  id: string
  // Added by migration 062 — float linkage, source documents and the
  // QuickBooks reconciliation state, kept separate from the operational status.
  float_id?: string | null
  supplier_invoice_no?: string
  receipt_no?: string
  requisition_id?: string | null
  goods_receipt_id?: string | null
  inventory_item_id?: string | null
  cost_centre?: string
  reconciliation_status?: string
  account_id: string | null
  brand_id: string | null
  department: string
  branch: string
  custodian: string
  entry_kind: PettyCashEntryKind
  transaction_date: string
  opening_float_ksh: number
  cash_received_ksh: number
  source_of_funds: string
  expense_amount_ksh: number
  expense_category: string
  payee: string
  description: string
  transaction_charge_ksh: number
  withdrawal_charge_ksh: number
  secondary_charge_ksh: number
  secondary_charge_label: string
  total_cash_out_ksh: number
  running_balance_ksh: number | null
  reference: string
  receipt_url: string
  state: PettyCashState
  notes: string
  source_workbook: string
  source_sheet: string
  source_row: number | null
  import_id: string | null
  created_by: string
  modified_by: string
  approved_by: string
  approved_at: string | null
  created_at: string
  updated_at: string
}
type PettyCashTransactionInsert = Pick<PettyCashTransactionRow, 'entry_kind'> & Partial<PettyCashTransactionRow>

export interface PettyCashReconciliationRow {
  id: string
  account_id: string | null
  brand_id: string | null
  period_start: string | null
  period_end: string | null
  opening_float_ksh: number
  total_received_ksh: number
  total_expenses_ksh: number
  total_charges_ksh: number
  expected_closing_ksh: number
  physical_count_ksh: number
  difference_ksh: number
  status: string
  reviewed_by: string
  notes: string
  created_at: string
  updated_at: string
}
type PettyCashReconciliationInsert = Partial<PettyCashReconciliationRow>

// ─── Import framework + versions (migration 046) ─────────────────────────────
export type DataImportStatus =
  | 'uploaded' | 'parsed' | 'validated' | 'committed' | 'partially_committed' | 'failed' | 'rolled_back'
export type DataImportRowState =
  | 'pending' | 'valid' | 'warning' | 'error' | 'skipped' | 'committed' | 'rolled_back'
export type DataImportDupStatus =
  | 'exact_duplicate' | 'probable_duplicate' | 'possible_duplicate' | 'new' | 'update_candidate' | 'conflict'

export interface DataImportRow {
  id: string
  import_type: string
  brand_id: string | null
  school: string
  source_filename: string
  file_hash: string
  storage_bucket: string
  storage_path: string
  sheets_available: unknown[]
  sheets_processed: unknown[]
  field_mappings: Record<string, unknown>
  dedupe_strategy: Record<string, unknown>
  rows_scanned: number
  records_created: number
  records_updated: number
  records_skipped: number
  duplicates_found: number
  warnings_count: number
  failed_count: number
  status: DataImportStatus
  rollback_status: 'none' | 'partial' | 'complete' | 'blocked'
  error_report_path: string
  uploaded_by: string
  committed_by: string
  committed_at: string | null
  notes: string
  created_at: string
  updated_at: string
}
type DataImportInsert = Partial<DataImportRow>

export interface DataImportStagingRow {
  id: string
  import_id: string
  sheet_name: string
  source_row: number | null
  raw_payload: Record<string, unknown>
  mapped_payload: Record<string, unknown>
  record_kind: string
  dup_status: DataImportDupStatus
  dup_target_id: string | null
  row_state: DataImportRowState
  target_table: string
  target_id: string | null
  messages: unknown[]
  created_at: string
  updated_at: string
}
type DataImportStagingInsert = Pick<DataImportStagingRow, 'import_id'> & Partial<DataImportStagingRow>

export interface RecordVersionRow {
  id: string
  record_type: string
  record_id: string
  version_no: number
  action: 'create' | 'update' | 'delete' | 'reverse' | 'restore' | 'post'
  snapshot: Record<string, unknown>
  previous_snapshot: Record<string, unknown> | null
  brand_id: string | null
  changed_by: string
  reason: string
  import_id: string | null
  created_at: string
}
type RecordVersionInsert = Pick<RecordVersionRow, 'record_type' | 'record_id'> & Partial<RecordVersionRow>

// ─── Inventory stores, production & stock counts (migration 060) ─────────────

export interface InventoryStoreRow {
  id: string
  brand_id: string | null
  name: string
  code: string
  /** raw | packaging | production | finished_goods | quarantine | field_sales | general */
  store_type: string
  location: string
  keeper_id: string | null
  active: boolean
  notes: string
  created_at: string
}
export type InventoryStoreInsert = Pick<InventoryStoreRow, 'name'> & Partial<InventoryStoreRow>

export interface ProductionBomLineRow {
  id: string
  product_item_id: string
  component_item_id: string
  quantity_per_unit: number
  unit: string
  wastage_percent: number
  notes: string
  active: boolean
  created_at: string
}
export type ProductionBomLineInsert =
  Pick<ProductionBomLineRow, 'product_item_id' | 'component_item_id' | 'quantity_per_unit'> & Partial<ProductionBomLineRow>

export interface ProductionRunRow {
  id: string
  run_ref: string
  batch_number: string
  brand_id: string | null
  product_item_id: string | null
  planned_quantity: number
  actual_quantity: number
  rejected_quantity: number
  waste_quantity: number
  unit: string
  started_at: string | null
  completed_at: string | null
  supervisor_id: string | null
  production_team: string
  /** planned | materials_requested | materials_issued | in_production | awaiting_quality
   *  | completed | partially_completed | rejected | closed | cancelled */
  status: string
  quality_result: string
  quality_approved_by: string
  quality_approved_at: string | null
  expiry_date: string | null
  notes: string
  approved_by: string
  approved_at: string | null
  created_by: string
  created_at: string
  updated_at: string
}
export type ProductionRunInsert = Pick<ProductionRunRow, 'run_ref'> & Partial<ProductionRunRow>

export interface ProductionRunMaterialRow {
  id: string
  run_id: string
  item_id: string
  goods_issue_id: string | null
  issue_item_id: string | null
  expected_quantity: number
  issued_quantity: number
  returned_quantity: number
  consumed_quantity: number
  waste_quantity: number
  unit: string
  /** GENERATED: issued - returned - consumed - waste. */
  variance_quantity: number
  notes: string
  created_at: string
}
export type ProductionRunMaterialInsert =
  Pick<ProductionRunMaterialRow, 'run_id' | 'item_id'> & Partial<Omit<ProductionRunMaterialRow, 'variance_quantity'>>

export interface ProductionFgTransferRow {
  id: string
  transfer_ref: string
  run_id: string | null
  brand_id: string | null
  item_id: string
  batch_number: string
  produced_quantity: number
  accepted_quantity: number
  rejected_quantity: number
  transferred_quantity: number
  unit: string
  source_store_id: string | null
  destination_store_id: string | null
  supervisor: string
  receiver: string
  quality_approved_by: string
  production_date: string | null
  expiry_date: string | null
  /** draft | posted | reversed */
  status: string
  posted_by: string
  posted_at: string | null
  remarks: string
  created_at: string
  updated_at: string
}
export type ProductionFgTransferInsert =
  Pick<ProductionFgTransferRow, 'transfer_ref' | 'item_id'> & Partial<ProductionFgTransferRow>

export interface InventoryStockCountRow {
  id: string
  count_ref: string
  brand_id: string | null
  store_id: string | null
  count_date: string
  counted_by: string
  counted_by_id: string | null
  /** draft | submitted | approved | posted | rejected */
  status: string
  approved_by: string
  approved_at: string | null
  posted_at: string | null
  notes: string
  created_at: string
  updated_at: string
}
export type InventoryStockCountInsert =
  Pick<InventoryStockCountRow, 'count_ref'> & Partial<InventoryStockCountRow>

export interface InventoryStockCountItemRow {
  id: string
  count_id: string
  item_id: string
  batch_number: string
  system_quantity: number
  counted_quantity: number
  /** GENERATED: counted - system. */
  variance_quantity: number
  reason: string
  movement_id: string | null
  created_at: string
}
export type InventoryStockCountItemInsert =
  Pick<InventoryStockCountItemRow, 'count_id' | 'item_id'> & Partial<Omit<InventoryStockCountItemRow, 'variance_quantity'>>

// ─── Reorder alerts (migration 059) ─────────────────────────────────────────

export interface InventoryReorderAlertRow {
  id: string
  item_id: string
  brand_id: string | null
  store_id: string | null
  alert_type: string
  severity: string
  quantity_at_alert: number
  threshold_at_alert: number
  /** open | acknowledged | actioned | dismissed | resolved */
  status: string
  acknowledged_by: string
  acknowledged_at: string | null
  dismissed_by: string
  dismissed_at: string | null
  dismissal_reason: string
  resolved_at: string | null
  requisition_id: string | null
  notes: string
  created_at: string
  updated_at: string
}
export type InventoryReorderAlertInsert =
  Pick<InventoryReorderAlertRow, 'item_id'> & Partial<InventoryReorderAlertRow>

export interface InventoryReorderAlertEventRow {
  id: string
  alert_id: string
  event_type: string
  actor: string
  note: string
  created_at: string
}
export type InventoryReorderAlertEventInsert =
  Pick<InventoryReorderAlertEventRow, 'alert_id' | 'event_type'> & Partial<InventoryReorderAlertEventRow>

export interface InventoryAlertRecipientRow {
  id: string
  brand_id: string | null
  store_id: string | null
  team_member_id: string | null
  email: string
  alert_types: string[]
  active: boolean
  created_at: string
}
export type InventoryAlertRecipientInsert = Partial<InventoryAlertRecipientRow>

// ─── Field-sales custody (migration 061) ────────────────────────────────────

export interface FieldSalesAllocationRow {
  id: string
  allocation_ref: string
  delivery_note_no: string
  brand_id: string | null
  week_start: string
  week_end: string
  sales_team: string
  salesperson_id: string | null
  vehicle_route: string
  source_store_id: string | null
  custody_location: string
  issued_by: string
  issued_by_id: string | null
  issued_at: string | null
  received_by: string
  received_at: string | null
  /** draft | prepared | issued | active | partially_reconciled | awaiting_returns
   *  | reconciled | closed | variance_under_review | cancelled */
  status: string
  variance_approved_by: string
  variance_reason: string
  closed_by: string
  closed_at: string | null
  notes: string
  created_at: string
  updated_at: string
}
export type FieldSalesAllocationInsert =
  Pick<FieldSalesAllocationRow, 'allocation_ref' | 'week_start' | 'week_end'> & Partial<FieldSalesAllocationRow>

export interface FieldSalesAllocationItemRow {
  id: string
  allocation_id: string
  item_id: string
  batch_number: string
  quantity_issued: number
  unit: string
  selling_price_ksh: number
  notes: string
  created_at: string
}
export type FieldSalesAllocationItemInsert =
  Pick<FieldSalesAllocationItemRow, 'allocation_id' | 'item_id'> & Partial<FieldSalesAllocationItemRow>

export interface FieldSalesCustodyMovementRow {
  id: string
  allocation_id: string | null
  salesperson_id: string | null
  item_id: string
  brand_id: string | null
  batch_number: string
  /** issue | sale | return | damage | sample | adjustment | transfer */
  movement_kind: string
  direction: string
  quantity: number
  balance_after: number
  movement_date: string
  reference: string
  source_table: string
  source_id: string | null
  allocation_item_id: string | null
  recorded_by: string
  notes: string
  created_at: string
}
export type FieldSalesCustodyMovementInsert =
  Pick<FieldSalesCustodyMovementRow, 'item_id' | 'movement_kind' | 'quantity'> & Partial<FieldSalesCustodyMovementRow>

export interface FieldSalesDailyReturnRow {
  id: string
  return_ref: string
  allocation_id: string | null
  brand_id: string | null
  return_date: string
  sales_team: string
  salesperson_id: string | null
  cash_received_ksh: number
  mobile_money_ksh: number
  bank_ksh: number
  credit_sales_ksh: number
  amount_submitted_ksh: number
  payment_references: string
  /** draft | submitted | invoiced | reconciled | disputed */
  status: string
  submitted_by: string
  submitted_at: string | null
  reviewed_by: string
  source_upload_id: string | null
  notes: string
  created_at: string
  updated_at: string
}
export type FieldSalesDailyReturnInsert =
  Pick<FieldSalesDailyReturnRow, 'return_ref' | 'return_date'> & Partial<FieldSalesDailyReturnRow>

export interface FieldSalesDailyReturnItemRow {
  id: string
  daily_return_id: string
  item_id: string
  batch_number: string
  quantity_sold: number
  quantity_damaged: number
  quantity_sample: number
  quantity_on_hand: number
  selling_price_ksh: number
  /** GENERATED: quantity_sold * selling_price_ksh. */
  line_total_ksh: number
  customer: string
  notes: string
  created_at: string
}
export type FieldSalesDailyReturnItemInsert =
  Pick<FieldSalesDailyReturnItemRow, 'daily_return_id' | 'item_id'> & Partial<Omit<FieldSalesDailyReturnItemRow, 'line_total_ksh'>>

export interface FieldSalesReturnNoteRow {
  id: string
  note_ref: string
  allocation_id: string | null
  brand_id: string | null
  return_date: string
  salesperson_id: string | null
  destination_store_id: string | null
  received_by: string
  received_at: string | null
  /** draft | submitted | received | posted | disputed */
  status: string
  posted_at: string | null
  posted_by: string
  notes: string
  created_at: string
  updated_at: string
}
export type FieldSalesReturnNoteInsert =
  Pick<FieldSalesReturnNoteRow, 'note_ref' | 'return_date'> & Partial<FieldSalesReturnNoteRow>

export interface FieldSalesReturnNoteItemRow {
  id: string
  return_note_id: string
  item_id: string
  batch_number: string
  quantity_returned: number
  quantity_accepted: number
  quantity_rejected: number
  condition: string
  reason: string
  notes: string
  created_at: string
}
export type FieldSalesReturnNoteItemInsert =
  Pick<FieldSalesReturnNoteItemRow, 'return_note_id' | 'item_id'> & Partial<FieldSalesReturnNoteItemRow>

// ─── Petty-cash floats (migration 062) ──────────────────────────────────────

export interface PettyCashFloatRow {
  id: string
  float_ref: string
  account_id: string | null
  brand_id: string | null
  custodian: string
  custodian_id: string | null
  opened_on: string
  opening_amount_ksh: number
  funding_source: string
  funding_reference: string
  previous_float_id: string | null
  succeeding_float_id: string | null
  balance_brought_forward_ksh: number
  additional_funding_ksh: number
  /** GENERATED: opening + brought forward + additional. */
  total_available_ksh: number
  purpose: string
  /** draft | open | active | awaiting_documents | awaiting_review
   *  | reconciled | closed | reopened | cancelled */
  status: string
  closed_on: string | null
  calculated_balance_ksh: number | null
  physical_balance_ksh: number | null
  variance_ksh: number | null
  variance_explanation: string
  amount_reimbursed_ksh: number
  amount_returned_ksh: number
  /** carried | returned | reimbursed | written_off */
  carry_forward_decision: string
  reviewed_by: string
  reviewed_at: string | null
  approved_by: string
  approved_at: string | null
  reopened_by: string
  reopened_reason: string
  closure_notes: string
  reconciliation_status: string
  created_by: string
  created_at: string
  updated_at: string
}
export type PettyCashFloatInsert =
  Pick<PettyCashFloatRow, 'float_ref'> & Partial<Omit<PettyCashFloatRow, 'total_available_ksh'>>

export interface PettyCashDocumentRow {
  id: string
  transaction_id: string | null
  float_id: string | null
  document_type: string
  status: string
  file_url: string
  file_name: string
  storage_bucket: string
  storage_path: string
  uploaded_by: string
  uploaded_at: string | null
  notes: string
  created_at: string
}
export type PettyCashDocumentInsert =
  Pick<PettyCashDocumentRow, 'document_type'> & Partial<PettyCashDocumentRow>

export interface PettyCashDocumentRuleRow {
  id: string
  brand_id: string | null
  category: string
  required_documents: string[]
  minimum_amount_ksh: number
  active: boolean
  created_at: string
}
export type PettyCashDocumentRuleInsert =
  Pick<PettyCashDocumentRuleRow, 'category'> & Partial<PettyCashDocumentRuleRow>

// ─── QuickBooks reconciliation (migration 063) ──────────────────────────────

export interface QuickbooksImportRow {
  id: string
  import_ref: string
  brand_id: string | null
  export_type: string
  source_format: string
  file_name: string
  file_url: string
  file_checksum: string
  file_size_bytes: number | null
  period_start: string | null
  period_end: string | null
  /** uploaded | mapped | validated | previewed | committed | rolled_back | failed */
  status: string
  field_mapping: Record<string, unknown>
  detected_headers: string[]
  total_rows: number
  successful_rows: number
  rejected_rows: number
  duplicate_rows: number
  auto_matched_rows: number
  review_rows: number
  new_entities: number
  total_amount_ksh: number
  reconciliation_difference_ksh: number
  error_summary: string
  imported_by: string
  committed_by: string
  committed_at: string | null
  rolled_back_by: string
  rolled_back_at: string | null
  notes: string
  created_at: string
}
export type QuickbooksImportInsert =
  Pick<QuickbooksImportRow, 'import_ref' | 'export_type'> & Partial<QuickbooksImportRow>

export interface QuickbooksTransactionRow {
  id: string
  import_id: string | null
  brand_id: string | null
  export_type: string
  qb_id: string
  qb_doc_number: string
  transaction_date: string | null
  transaction_type: string
  account_name: string
  customer_name: string
  supplier_name: string
  description: string
  reference: string
  mpesa_code: string
  amount_ksh: number
  tax_ksh: number
  currency: string
  raw: Record<string, unknown>
  row_number: number | null
  /** unmatched | suggested | matched | partially_matched | difference | reconciled | rejected */
  match_state: string
  created_at: string
}
export type QuickbooksTransactionInsert = Partial<QuickbooksTransactionRow>

export interface QuickbooksMatchRow {
  id: string
  qb_transaction_id: string
  entity_table: string
  entity_id: string
  matched_amount_ksh: number
  difference_ksh: number
  /** suggested | accepted | rejected */
  decision: string
  confidence: number
  /** At least TWO signals are required for an accepted match (DB CHECK). */
  match_basis: string[]
  note: string
  decided_by: string
  decided_at: string | null
  created_at: string
}
export type QuickbooksMatchInsert =
  Pick<QuickbooksMatchRow, 'qb_transaction_id' | 'entity_table' | 'entity_id'> & Partial<QuickbooksMatchRow>

export interface QuickbooksMatchEventRow {
  id: string
  match_id: string | null
  qb_transaction_id: string | null
  event_type: string
  actor: string
  note: string
  created_at: string
}
export type QuickbooksMatchEventInsert =
  Pick<QuickbooksMatchEventRow, 'event_type'> & Partial<QuickbooksMatchEventRow>

// ─── Iceland sales + document series (migration 066) ────────────────────────

export interface DocumentSeriesRow {
  id: string
  brand_id: string | null
  /** invoice | delivery_note | grn | gin | gtn | requisition | lpo | receipt */
  doc_type: string
  label: string
  prefix: string
  suffix: string
  pad_width: number
  /** The last number USED on paper; the next suggestion is this + 1. */
  current_number: number
  system_assigned: boolean
  notes: string
  active: boolean
  updated_by: string
  created_at: string
  updated_at: string
}
export type DocumentSeriesInsert = Pick<DocumentSeriesRow, 'doc_type'> & Partial<DocumentSeriesRow>

export interface SalesCustomerRow {
  id: string
  customer_ref: string
  brand_id: string | null
  business_name: string
  trading_name: string
  location_street: string
  postal_address: string
  telephone: string
  mobile: string
  email: string
  /** sole_proprietor | partnership | limited_company */
  business_type: string
  br_number: string
  vat_pin_number: string
  nature_of_business: string
  nature_other: string
  contact_person: string
  credit_approved: boolean
  credit_limit_ksh: number
  payment_terms_days: number
  purchase_frequency: string
  intended_monthly_purchase_ksh: number
  /** One legal entity may also be an NPT service client — linked, never copied. */
  npt_customer_id: string | null
  status: string
  notes: string
  created_by: string
  created_at: string
  updated_at: string
}
export type SalesCustomerInsert =
  Pick<SalesCustomerRow, 'customer_ref' | 'business_name'> & Partial<SalesCustomerRow>

export interface SalesAccountApplicationRow {
  id: string
  application_ref: string
  customer_id: string | null
  brand_id: string | null
  application_date: string
  business_name: string
  location_street: string
  postal_address: string
  telephone: string
  mobile: string
  email: string
  directors: Array<{ name?: string; id_number?: string }>
  business_type: string
  br_number: string
  vat_pin_number: string
  nature_of_business: string
  amount_intended_ksh: number
  frequency: string
  terms_accepted: boolean
  customer_signature_name: string
  customer_stamped: boolean
  company_rep_name: string
  company_rep_date: string | null
  verified_by: string
  verified_date: string | null
  approved_by: string
  approved_date: string | null
  approved_terms_days: number | null
  /** draft | submitted | verified | approved | rejected */
  status: string
  rejection_reason: string
  notes: string
  created_by: string
  created_at: string
  updated_at: string
}
export type SalesAccountApplicationInsert =
  Pick<SalesAccountApplicationRow, 'application_ref'> & Partial<SalesAccountApplicationRow>

export interface SalesInvoiceRow {
  id: string
  /** Minted system reference. Never derived from the pad. */
  invoice_ref: string
  /** The number printed on the physical pad. Gaps are legal. */
  invoice_number: string
  brand_id: string | null
  customer_id: string | null
  /** "M/s" as written, kept verbatim even when a customer row is linked. */
  bill_to_name: string
  invoice_date: string
  due_date: string | null
  vat_rate_percent: number
  /** DECISION: the pad's rates are VAT-INCLUSIVE. Stored per invoice AND per
   *  line so a rate change cannot restate history. */
  prices_include_vat: boolean
  net_amount_ksh: number
  vat_amount_ksh: number
  total_amount_ksh: number
  amount_paid_ksh: number
  /** draft | issued | part_paid | paid | cancelled | credited */
  status: string
  /** cash | credit */
  sale_type: string
  salesperson_id: string | null
  allocation_id: string | null
  daily_return_id: string | null
  source_store_id: string | null
  delivery_note_no: string
  lpo_number: string
  posted_at: string | null
  posted_by: string
  reconciliation_status: string
  notes: string
  created_by: string
  created_at: string
  updated_at: string
}
export type SalesInvoiceInsert = Pick<SalesInvoiceRow, 'invoice_ref'> & Partial<SalesInvoiceRow>

export interface SalesInvoiceItemRow {
  id: string
  invoice_id: string
  item_id: string | null
  /** "CODE" on the pad. */
  item_code: string
  description: string
  /** The pad's UNIT column (pack count, e.g. "8PC") — verbatim, for printing. */
  pad_unit_text: string
  /** The pad's QTY column (pack size, e.g. "1ltr") — verbatim, for printing. */
  pad_qty_text: string
  /** The real numeric quantity arithmetic uses. */
  quantity: number
  uom: string
  rate_ksh: number
  vat_rate_percent: number
  prices_include_vat: boolean
  /** GENERATED. */
  line_total_ksh: number
  line_vat_ksh: number
  line_net_ksh: number
  batch_number: string
  sort_order: number
  created_at: string
}
export type SalesInvoiceItemInsert =
  Pick<SalesInvoiceItemRow, 'invoice_id'> &
  Partial<Omit<SalesInvoiceItemRow, 'line_total_ksh' | 'line_vat_ksh' | 'line_net_ksh'>>

export interface SalesPaymentRow {
  id: string
  payment_ref: string
  brand_id: string | null
  customer_id: string | null
  payment_date: string
  /** cash | mpesa | bank | cheque | credit_note */
  method: string
  amount_ksh: number
  reference: string
  mpesa_code: string
  received_by: string
  daily_return_id: string | null
  reconciliation_status: string
  notes: string
  created_by: string
  created_at: string
}
export type SalesPaymentInsert = Pick<SalesPaymentRow, 'payment_ref'> & Partial<SalesPaymentRow>

export interface SalesPaymentAllocationRow {
  id: string
  payment_id: string
  invoice_id: string
  amount_ksh: number
  created_at: string
}
export type SalesPaymentAllocationInsert =
  Pick<SalesPaymentAllocationRow, 'payment_id' | 'invoice_id' | 'amount_ksh'> &
  Partial<SalesPaymentAllocationRow>

export interface QbAccountMapRow {
  id: string
  brand_id: string | null
  event_type: string
  debit_account: string
  credit_account: string
  tax_account: string
  qb_class: string
  active: boolean
  notes: string
  created_at: string
}
export type QbAccountMapInsert = Pick<QbAccountMapRow, 'event_type'> & Partial<QbAccountMapRow>

/**
 * A row of `qb_expected_entries` — every operational document projected into
 * the shape a QuickBooks export arrives in. Read-only VIEW: this is what
 * reconciliation compares against quickbooks_transactions, and it works before
 * any export exists because it is built from documents we already hold.
 */
export interface QbExpectedEntryRow {
  event_type: string
  entity_id: string
  entity_table: string
  brand_id: string | null
  entry_date: string
  doc_number: string
  party_name: string
  transaction_type: string
  amount_ksh: number
  tax_ksh: number
  mpesa_code: string
  memo: string
  reconciliation_status: string
}

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
      ocg_duty_checklist_items: DbTable<OcgDutyChecklistItemRow, OcgDutyChecklistItemInsert, Partial<OcgDutyChecklistItemRow>>
      ocg_duty_checklist_results: DbTable<OcgDutyChecklistResultRow, OcgDutyChecklistResultInsert, Partial<OcgDutyChecklistResultRow>>
      ocg_holidays: DbTable<OcgHolidayRow, OcgHolidayInsert, Partial<OcgHolidayRow>>
      ocg_calendar_events: DbTable<OcgCalendarEventRow, OcgCalendarEventInsert, Partial<OcgCalendarEventRow>>
      ocg_calendar_event_attendees: DbTable<OcgCalendarEventAttendeeRow, OcgCalendarEventAttendeeInsert, Partial<OcgCalendarEventAttendeeRow>>
      ocg_calendar_reschedules: DbTable<OcgCalendarRescheduleRow, OcgCalendarRescheduleInsert, Partial<OcgCalendarRescheduleRow>>
      ocg_leave_requests: DbTable<OcgLeaveRequestRow, OcgLeaveRequestInsert, Partial<OcgLeaveRequestRow>>
      ocg_personal_tasks: DbTable<OcgPersonalTaskRow, OcgPersonalTaskInsert, Partial<OcgPersonalTaskRow>>
      ocg_approvals: DbTable<OcgApprovalRow, OcgApprovalInsert, Partial<OcgApprovalRow>>
      ocg_blockers: DbTable<OcgBlockerRow, OcgBlockerInsert, Partial<OcgBlockerRow>>
      ocg_meetings: DbTable<OcgMeetingRow, OcgMeetingInsert, Partial<OcgMeetingRow>>
      ocg_meeting_templates: DbTable<OcgMeetingTemplateRow, OcgMeetingTemplateInsert, Partial<OcgMeetingTemplateRow>>
      ocg_decisions: DbTable<OcgDecisionRow, OcgDecisionInsert, Partial<OcgDecisionRow>>
      ocg_recurring_tasks: DbTable<OcgRecurringTaskRow, OcgRecurringTaskInsert, Partial<OcgRecurringTaskRow>>
      ocg_meeting_action_items: DbTable<OcgMeetingActionItemRow, OcgMeetingActionItemInsert, Partial<OcgMeetingActionItemRow>>
      ocg_conversations: DbTable<OcgConversationRow, OcgConversationInsert, Partial<OcgConversationRow>>
      ocg_conversation_members: DbTable<OcgConversationMemberRow, OcgConversationMemberInsert, Partial<OcgConversationMemberRow>>
      ocg_messages: DbTable<OcgMessageRow, OcgMessageInsert, Partial<OcgMessageRow>>
      ocg_forum_posts: DbTable<OcgForumPostRow, OcgForumPostInsert, Partial<OcgForumPostRow>>
      ocg_forum_replies: DbTable<OcgForumReplyRow, OcgForumReplyInsert, Partial<OcgForumReplyRow>>
      ocg_day_closes: DbTable<OcgDayCloseRow, OcgDayCloseInsert, Partial<OcgDayCloseRow>>
      ocg_audit_events: DbTable<OcgAuditEventRow, OcgAuditEventInsert, Partial<OcgAuditEventRow>>
      ocg_notifications: DbTable<OcgNotificationRow, OcgNotificationInsert, Partial<OcgNotificationRow>>
      ocg_form_templates: DbTable<OcgFormTemplateRow, OcgFormTemplateInsert, Partial<OcgFormTemplateRow>>
      ocg_form_submissions: DbTable<OcgFormSubmissionRow, OcgFormSubmissionInsert, Partial<OcgFormSubmissionRow>>
      ocg_form_template_versions: DbTable<OcgFormTemplateVersionRow, OcgFormTemplateVersionInsert, Partial<OcgFormTemplateVersionRow>>
      ocg_record_attachments: DbTable<OcgRecordAttachmentRow, OcgRecordAttachmentInsert, Partial<OcgRecordAttachmentRow>>
      ocg_brand_print_identities: DbTable<OcgBrandPrintIdentityRow, OcgBrandPrintIdentityInsert, Partial<OcgBrandPrintIdentityRow>>
      ops_attendance_records: DbTable<OpsAttendanceRecordRow, OpsAttendanceRecordInsert, Partial<OpsAttendanceRecordRow>>
      inventory_items: DbTable<InventoryItemRow, InventoryItemInsert, Partial<InventoryItemRow>>
      inventory_movements: DbTable<InventoryMovementRow, InventoryMovementInsert, Partial<InventoryMovementRow>>
      procurement_vendors: DbTable<ProcurementVendorRow, ProcurementVendorInsert, Partial<ProcurementVendorRow>>
      procurement_purchases: DbTable<ProcurementPurchaseRow, ProcurementPurchaseInsert, Partial<ProcurementPurchaseRow>>
      procurement_purchase_items: DbTable<ProcurementPurchaseItemRow, ProcurementPurchaseItemInsert, Partial<ProcurementPurchaseItemRow>>
      procurement_credit_applications: DbTable<ProcurementCreditApplicationRow, ProcurementCreditApplicationInsert, Partial<ProcurementCreditApplicationRow>>
      procurement_requisitions: DbTable<ProcurementRequisitionRow, ProcurementRequisitionInsert, Partial<ProcurementRequisitionRow>>
      procurement_requisition_items: DbTable<ProcurementRequisitionItemRow, ProcurementRequisitionItemInsert, Partial<ProcurementRequisitionItemRow>>
      procurement_goods_receipts: DbTable<ProcurementGoodsReceiptRow, ProcurementGoodsReceiptInsert, Partial<ProcurementGoodsReceiptRow>>
      procurement_goods_receipt_items: DbTable<ProcurementGoodsReceiptItemRow, ProcurementGoodsReceiptItemInsert, Partial<ProcurementGoodsReceiptItemRow>>
      procurement_goods_issues: DbTable<ProcurementGoodsIssueRow, ProcurementGoodsIssueInsert, Partial<ProcurementGoodsIssueRow>>
      procurement_goods_issue_items: DbTable<ProcurementGoodsIssueItemRow, ProcurementGoodsIssueItemInsert, Partial<ProcurementGoodsIssueItemRow>>
      finance_voteheads: DbTable<FinanceVoteheadRow, FinanceVoteheadInsert, Partial<FinanceVoteheadRow>>
      finance_accounts: DbTable<FinanceAccountRow, FinanceAccountInsert, Partial<FinanceAccountRow>>
      finance_transactions: DbTable<FinanceTransactionRow, FinanceTransactionInsert, Partial<FinanceTransactionRow>>
      finance_statement_imports: DbTable<FinanceStatementImportRow, FinanceStatementImportInsert, Partial<FinanceStatementImportRow>>
      finance_statement_lines: DbTable<FinanceStatementLineRow, FinanceStatementLineInsert, Partial<FinanceStatementLineRow>>
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
      npt_comm_logs: DbTable<NptCommLogRow, NptCommLogInsert, Partial<NptCommLogRow>>
      npt_intakes: DbTable<NptIntakeRow, NptIntakeInsert, Partial<NptIntakeRow>>
      npt_intake_items: DbTable<NptIntakeItemRow, NptIntakeItemInsert, Partial<NptIntakeItemRow>>
      npt_repair_cases: DbTable<NptRepairCaseRow, NptRepairCaseInsert, Partial<NptRepairCaseRow>>
      npt_repair_case_status_history: DbTable<NptRepairCaseStatusHistoryRow, NptRepairCaseStatusHistoryInsert, Partial<NptRepairCaseStatusHistoryRow>>
      npt_repair_activities: DbTable<NptRepairActivityRow, NptRepairActivityInsert, Partial<NptRepairActivityRow>>
      npt_workshop_plans: DbTable<NptWorkshopPlanRow, NptWorkshopPlanInsert, Partial<NptWorkshopPlanRow>>
      npt_workshop_plan_rows: DbTable<NptWorkshopPlanRowRow, NptWorkshopPlanRowInsert, Partial<NptWorkshopPlanRowRow>>
      npt_movements: DbTable<NptMovementRow, NptMovementInsert, Partial<NptMovementRow>>
      npt_training_sessions: DbTable<NptTrainingSessionRow, NptTrainingSessionInsert, Partial<NptTrainingSessionRow>>
      npt_training_attendance: DbTable<NptTrainingAttendanceRow, NptTrainingAttendanceInsert, Partial<NptTrainingAttendanceRow>>
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
      rayyan_activities: DbTable<RayyanActivityRow, RayyanActivityInsert, Partial<RayyanActivityRow>>
      rayyan_student_activities: DbTable<RayyanStudentActivityRow, RayyanStudentActivityInsert, Partial<RayyanStudentActivityRow>>
      rayyan_assessments: DbTable<RayyanAssessmentRow, RayyanAssessmentInsert, Partial<RayyanAssessmentRow>>
      rayyan_student_history: DbTable<RayyanStudentHistoryRow, RayyanStudentHistoryInsert, Partial<RayyanStudentHistoryRow>>
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
      school_charge_categories: DbTable<SchoolChargeCategoryRow, SchoolChargeCategoryInsert, Partial<SchoolChargeCategoryRow>>
      school_programmes: DbTable<SchoolProgrammeRow, SchoolProgrammeInsert, Partial<SchoolProgrammeRow>>
      school_fee_structures: DbTable<SchoolFeeStructureRow, SchoolFeeStructureInsert, Partial<SchoolFeeStructureRow>>
      school_fee_structure_items: DbTable<SchoolFeeStructureItemRow, SchoolFeeStructureItemInsert, Partial<SchoolFeeStructureItemRow>>
      school_enrollments: DbTable<SchoolEnrollmentRow, SchoolEnrollmentInsert, Partial<SchoolEnrollmentRow>>
      school_ledger_entries: DbTable<SchoolLedgerEntryRow, SchoolLedgerEntryInsert, Partial<SchoolLedgerEntryRow>>
      school_assessments: DbTable<SchoolAssessmentRow, SchoolAssessmentInsert, Partial<SchoolAssessmentRow>>
      school_payment_allocations: DbTable<SchoolPaymentAllocationRow, SchoolPaymentAllocationInsert, Partial<SchoolPaymentAllocationRow>>
      school_student_requirements: DbTable<SchoolStudentRequirementRow, SchoolStudentRequirementInsert, Partial<SchoolStudentRequirementRow>>
      petty_cash_accounts: DbTable<PettyCashAccountRow, PettyCashAccountInsert, Partial<PettyCashAccountRow>>
      petty_cash_transactions: DbTable<PettyCashTransactionRow, PettyCashTransactionInsert, Partial<PettyCashTransactionRow>>
      petty_cash_reconciliations: DbTable<PettyCashReconciliationRow, PettyCashReconciliationInsert, Partial<PettyCashReconciliationRow>>
      data_imports: DbTable<DataImportRow, DataImportInsert, Partial<DataImportRow>>
      data_import_rows: DbTable<DataImportStagingRow, DataImportStagingInsert, Partial<DataImportStagingRow>>
      inventory_stores: DbTable<InventoryStoreRow, InventoryStoreInsert, Partial<InventoryStoreRow>>
      production_bom_lines: DbTable<ProductionBomLineRow, ProductionBomLineInsert, Partial<ProductionBomLineRow>>
      production_runs: DbTable<ProductionRunRow, ProductionRunInsert, Partial<ProductionRunRow>>
      production_run_materials: DbTable<ProductionRunMaterialRow, ProductionRunMaterialInsert, Partial<ProductionRunMaterialRow>>
      production_fg_transfers: DbTable<ProductionFgTransferRow, ProductionFgTransferInsert, Partial<ProductionFgTransferRow>>
      inventory_stock_counts: DbTable<InventoryStockCountRow, InventoryStockCountInsert, Partial<InventoryStockCountRow>>
      inventory_stock_count_items: DbTable<InventoryStockCountItemRow, InventoryStockCountItemInsert, Partial<InventoryStockCountItemRow>>
      inventory_reorder_alerts: DbTable<InventoryReorderAlertRow, InventoryReorderAlertInsert, Partial<InventoryReorderAlertRow>>
      inventory_reorder_alert_events: DbTable<InventoryReorderAlertEventRow, InventoryReorderAlertEventInsert, Partial<InventoryReorderAlertEventRow>>
      inventory_alert_recipients: DbTable<InventoryAlertRecipientRow, InventoryAlertRecipientInsert, Partial<InventoryAlertRecipientRow>>
      field_sales_allocations: DbTable<FieldSalesAllocationRow, FieldSalesAllocationInsert, Partial<FieldSalesAllocationRow>>
      field_sales_allocation_items: DbTable<FieldSalesAllocationItemRow, FieldSalesAllocationItemInsert, Partial<FieldSalesAllocationItemRow>>
      field_sales_custody_movements: DbTable<FieldSalesCustodyMovementRow, FieldSalesCustodyMovementInsert, Partial<FieldSalesCustodyMovementRow>>
      field_sales_daily_returns: DbTable<FieldSalesDailyReturnRow, FieldSalesDailyReturnInsert, Partial<FieldSalesDailyReturnRow>>
      field_sales_daily_return_items: DbTable<FieldSalesDailyReturnItemRow, FieldSalesDailyReturnItemInsert, Partial<FieldSalesDailyReturnItemRow>>
      field_sales_return_notes: DbTable<FieldSalesReturnNoteRow, FieldSalesReturnNoteInsert, Partial<FieldSalesReturnNoteRow>>
      field_sales_return_note_items: DbTable<FieldSalesReturnNoteItemRow, FieldSalesReturnNoteItemInsert, Partial<FieldSalesReturnNoteItemRow>>
      petty_cash_floats: DbTable<PettyCashFloatRow, PettyCashFloatInsert, Partial<PettyCashFloatRow>>
      petty_cash_documents: DbTable<PettyCashDocumentRow, PettyCashDocumentInsert, Partial<PettyCashDocumentRow>>
      petty_cash_document_rules: DbTable<PettyCashDocumentRuleRow, PettyCashDocumentRuleInsert, Partial<PettyCashDocumentRuleRow>>
      quickbooks_imports: DbTable<QuickbooksImportRow, QuickbooksImportInsert, Partial<QuickbooksImportRow>>
      quickbooks_transactions: DbTable<QuickbooksTransactionRow, QuickbooksTransactionInsert, Partial<QuickbooksTransactionRow>>
      quickbooks_matches: DbTable<QuickbooksMatchRow, QuickbooksMatchInsert, Partial<QuickbooksMatchRow>>
      quickbooks_match_events: DbTable<QuickbooksMatchEventRow, QuickbooksMatchEventInsert, Partial<QuickbooksMatchEventRow>>
      document_series: DbTable<DocumentSeriesRow, DocumentSeriesInsert, Partial<DocumentSeriesRow>>
      sales_customers: DbTable<SalesCustomerRow, SalesCustomerInsert, Partial<SalesCustomerRow>>
      sales_account_applications: DbTable<SalesAccountApplicationRow, SalesAccountApplicationInsert, Partial<SalesAccountApplicationRow>>
      sales_invoices: DbTable<SalesInvoiceRow, SalesInvoiceInsert, Partial<SalesInvoiceRow>>
      sales_invoice_items: DbTable<SalesInvoiceItemRow, SalesInvoiceItemInsert, Partial<SalesInvoiceItemRow>>
      sales_payments: DbTable<SalesPaymentRow, SalesPaymentInsert, Partial<SalesPaymentRow>>
      sales_payment_allocations: DbTable<SalesPaymentAllocationRow, SalesPaymentAllocationInsert, Partial<SalesPaymentAllocationRow>>
      qb_account_map: DbTable<QbAccountMapRow, QbAccountMapInsert, Partial<QbAccountMapRow>>
      record_versions: DbTable<RecordVersionRow, RecordVersionInsert, Partial<RecordVersionRow>>
    }
    Views: Record<string, never>
    Functions: Record<string, never>
  }
}
