// =============================================================================
// Marketing Hub — shared types and enums
// =============================================================================
// Ported from the WM & Co marketing hub. Episodes, CRM, WhatsApp flows, and
// reports types are deferred to later phases and intentionally not included.

// ── Status machine ──────────────────────────────────────────────────────────
export const CONTENT_STATUSES = [
  'idea',
  'draft',
  'review',
  'approved',
  'scheduled',
  'published',
  'reported',
  'archived',
  'publish_failed',
] as const
export type ContentStatus = (typeof CONTENT_STATUSES)[number]

export const CONTENT_STATUS_LABELS: Record<ContentStatus, string> = {
  idea: 'Idea',
  draft: 'Draft',
  review: 'In review',
  approved: 'Approved',
  scheduled: 'Scheduled',
  published: 'Published',
  reported: 'Reported',
  archived: 'Archived',
  publish_failed: 'Publish failed',
}

// Allowed forward transitions. "archived" is reachable from anywhere as the
// soft-cancel terminal. Backward moves go through reopenContent.
export const CONTENT_TRANSITIONS: Record<ContentStatus, ContentStatus[]> = {
  idea: ['draft', 'archived'],
  draft: ['review', 'approved', 'archived'],
  review: ['approved', 'draft', 'archived'],
  approved: ['scheduled', 'draft', 'archived'],
  scheduled: ['published', 'approved', 'publish_failed', 'archived'],
  published: ['reported', 'archived'],
  reported: ['archived'],
  archived: [],
  publish_failed: ['scheduled', 'approved', 'published', 'archived'],
}

// ── Content types ───────────────────────────────────────────────────────────
export const CONTENT_TYPES = [
  'post',
  'story',
  'reel',
  'short',
  'video',
  'thread',
  'channel_message',
  'status',
  'ad',
  'newsletter_issue',
  'blog_post',
] as const
export type ContentType = (typeof CONTENT_TYPES)[number]

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  post: 'Post',
  story: 'Story',
  reel: 'Reel',
  short: 'Short',
  video: 'Video',
  thread: 'Thread',
  channel_message: 'Channel message',
  status: 'WhatsApp Status',
  ad: 'Ad',
  newsletter_issue: 'Newsletter issue',
  blog_post: 'Blog post',
}

// ── Posted via ────────────────────────────────────────────────────────────────
export const POSTED_VIA_VALUES = ['manual', 'buffer', 'api'] as const
export type PostedVia = (typeof POSTED_VIA_VALUES)[number]

export const POSTED_VIA_LABELS: Record<PostedVia, string> = {
  manual: 'Manual',
  buffer: 'Buffer',
  api: 'API',
}

// ── Platforms ──────────────────────────────────────────────────────────────────
export const PLATFORM_KINDS = [
  'linkedin',
  'instagram',
  'x',
  'threads',
  'tiktok',
  'youtube',
  'whatsapp_status',
  'whatsapp_channel',
  'email',
  'blog',
  'podcast',
] as const
export type PlatformKind = (typeof PLATFORM_KINDS)[number]

export const PLATFORM_LABELS: Record<PlatformKind, string> = {
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
  x: 'X',
  threads: 'Threads',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  whatsapp_status: 'WhatsApp Status',
  whatsapp_channel: 'WhatsApp Channel',
  email: 'Email',
  blog: 'Blog',
  podcast: 'Podcast',
}

export const PLATFORM_HEALTH_VALUES = ['healthy', 'needs_attention', 'dormant'] as const
export type PlatformHealth = (typeof PLATFORM_HEALTH_VALUES)[number]

export const PLATFORM_HEALTH_LABELS: Record<PlatformHealth, string> = {
  healthy: 'Healthy',
  needs_attention: 'Needs attention',
  dormant: 'Dormant',
}

export const POSTING_MODES = ['remind_only', 'api_publish'] as const
export type PostingMode = (typeof POSTING_MODES)[number]

export const POSTING_MODE_LABELS: Record<PostingMode, string> = {
  remind_only: 'Remind only',
  api_publish: 'API publish',
}

// ── Domain object types ──────────────────────────────────────────────────────

export interface MarketingBrand {
  id: string
  slug: string
  name: string
  shortName: string | null
  primaryColor: string
  isActive: boolean
  sortOrder: number
}

export interface MarketingPlatform {
  id: string
  brandId: string
  platform: PlatformKind
  handle: string | null
  externalId: string | null
  monthlyPostTarget: number
  currentHealth: PlatformHealth
  postingMode: PostingMode
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface MarketingPillar {
  id: string
  slug: string
  name: string
  description: string | null
  colorHex: string
  targetSharePct: number | null
  isActive: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface MarketingContent {
  id: string
  brandId: string
  platformId: string | null
  campaignId: string | null
  campaignLabel: string | null
  contentType: ContentType
  status: ContentStatus
  postedVia: PostedVia
  title: string | null
  hook: string | null
  bodyMarkdown: string
  hashtags: string | null
  assetUrls: string[]
  notes: string | null
  scheduledAt: string | null
  publishedAt: string | null
  externalUrl: string | null
  externalPostId: string | null
  publishError: string | null
  ownerEmail: string | null
  createdByEmail: string | null
  approvedByEmail: string | null
  pillarIds: string[]
  createdAt: string
  updatedAt: string
}

// ── Campaigns ─────────────────────────────────────────────────────────────────
export const CAMPAIGN_STATUSES = [
  'planning',
  'live',
  'paused',
  'completed',
  'cancelled',
] as const
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number]

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  planning: 'Planning',
  live: 'Live',
  paused: 'Paused',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

export const CAMPAIGN_TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  planning: ['live', 'cancelled'],
  live: ['paused', 'completed', 'cancelled'],
  paused: ['live', 'completed', 'cancelled'],
  completed: [],
  cancelled: [],
}

export interface MarketingCampaign {
  id: string
  brandId: string
  slug: string
  name: string
  goal: string | null
  audienceSummary: string | null
  primaryChannel: string | null
  secondaryChannels: string[]
  startDate: string | null
  endDate: string | null
  status: CampaignStatus
  utmCampaign: string | null
  budgetKsh: number | null
  targetLeads: number | null
  targetRevenueKsh: number | null
  kpis: Record<string, unknown>
  ownerEmail: string | null
  notes: string | null
  createdByEmail: string | null
  createdAt: string
  updatedAt: string
}

// ── CRM ───────────────────────────────────────────────────────────────────────
export const LIFECYCLE_STAGES = ['subscriber', 'lead', 'prospect', 'client', 'alumni'] as const
export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number]
export const LIFECYCLE_STAGE_LABELS: Record<LifecycleStage, string> = {
  subscriber: 'Subscriber',
  lead: 'Lead',
  prospect: 'Prospect',
  client: 'Client',
  alumni: 'Alumni',
}

export const DEAL_STAGES = ['new', 'qualified', 'proposal', 'negotiation', 'won', 'lost'] as const
export type DealStage = (typeof DEAL_STAGES)[number]
export const DEAL_STAGE_LABELS: Record<DealStage, string> = {
  new: 'New',
  qualified: 'Qualified',
  proposal: 'Proposal',
  negotiation: 'Negotiation',
  won: 'Won',
  lost: 'Lost',
}
export const DEAL_TRANSITIONS: Record<DealStage, DealStage[]> = {
  new: ['qualified', 'lost'],
  qualified: ['proposal', 'lost'],
  proposal: ['negotiation', 'lost'],
  negotiation: ['won', 'lost'],
  won: [],
  lost: ['new'],
}
export const OPEN_DEAL_STAGES: DealStage[] = ['new', 'qualified', 'proposal', 'negotiation']

export const ACTIVITY_KINDS = [
  'call', 'email', 'dm', 'meeting', 'podcast_invite',
  'guide_sent', 'newsletter_sent', 'note', 'system',
] as const
export type ActivityKind = (typeof ACTIVITY_KINDS)[number]
export const ACTIVITY_KIND_LABELS: Record<ActivityKind, string> = {
  call: 'Call',
  email: 'Email',
  dm: 'DM',
  meeting: 'Meeting',
  podcast_invite: 'Podcast invite',
  guide_sent: 'Guide email',
  newsletter_sent: 'Newsletter',
  note: 'Note',
  system: 'System',
}
export const MANUAL_ACTIVITY_KINDS: ActivityKind[] = [
  'note', 'call', 'email', 'dm', 'meeting', 'podcast_invite',
]

export interface MarketingContact {
  id: string
  fullName: string | null
  email: string | null
  phone: string | null
  company: string | null
  role: string | null
  linkedinUrl: string | null
  source: string | null
  sourceDetail: string | null
  lifecycleStage: LifecycleStage
  ownerEmail: string | null
  tags: string[]
  lastContactAt: string | null
  nextContactAt: string | null
  notes: string | null
  leadId: string | null
  createdByEmail: string | null
  createdAt: string
  updatedAt: string
}

export interface MarketingDeal {
  id: string
  contactId: string
  campaignId: string | null
  brandId: string | null
  name: string
  valueKsh: number | null
  stage: DealStage
  expectedCloseDate: string | null
  closedAt: string | null
  lostReason: string | null
  ownerEmail: string | null
  notes: string | null
  createdByEmail: string | null
  createdAt: string
  updatedAt: string
}

export interface MarketingActivity {
  id: string
  contactId: string
  dealId: string | null
  kind: ActivityKind
  subject: string | null
  body: string | null
  occurredAt: string
  byEmail: string | null
  createdAt: string
}

export interface LeadToPromote {
  leadId: string
  name: string | null
  email: string | null
  phone: string | null
  source: string | null
  brandSlug: string | null
  interest: string | null
  leadStatus: string
  capturedAt: string
}

// ── WhatsApp flows ──────────────────────────────────────────────────────────
export const WHATSAPP_FLOW_STATUSES = ['drafting', 'active', 'paused', 'archived'] as const
export type WhatsappFlowStatus = (typeof WHATSAPP_FLOW_STATUSES)[number]
export const WHATSAPP_FLOW_STATUS_LABELS: Record<WhatsappFlowStatus, string> = {
  drafting: 'Drafting',
  active: 'Active',
  paused: 'Paused',
  archived: 'Archived',
}
export const WHATSAPP_FLOW_TRANSITIONS: Record<WhatsappFlowStatus, WhatsappFlowStatus[]> = {
  drafting: ['active', 'archived'],
  active: ['paused', 'archived'],
  paused: ['active', 'archived'],
  archived: [],
}
export const WHATSAPP_TRIGGER_TYPES = ['keyword', 'new_contact', 'manual_broadcast', 'webhook'] as const
export type WhatsappTriggerType = (typeof WHATSAPP_TRIGGER_TYPES)[number]
export const WHATSAPP_TRIGGER_LABELS: Record<WhatsappTriggerType, string> = {
  keyword: 'Keyword match',
  new_contact: 'New contact',
  manual_broadcast: 'Manual broadcast',
  webhook: 'Webhook',
}

export interface WhatsappFlow {
  id: string
  brandId: string
  slug: string
  name: string
  description: string | null
  triggerKeywords: string[]
  triggerType: WhatsappTriggerType
  triggerConfig: Record<string, unknown>
  flowDefinition: Record<string, unknown>
  status: WhatsappFlowStatus
  lastTriggeredAt: string | null
  triggeredCount: number
  ownerEmail: string | null
  notes: string | null
  createdByEmail: string | null
  createdAt: string
  updatedAt: string
}

// ── Executive reports ─────────────────────────────────────────────────────────
export const REPORT_STATUSES = ['drafting', 'approved', 'sending', 'sent', 'cancelled'] as const
export type ReportStatus = (typeof REPORT_STATUSES)[number]
export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  drafting: 'Drafting',
  approved: 'Approved',
  sending: 'Sending',
  sent: 'Sent',
  cancelled: 'Cancelled',
}

export interface ExecutiveReport {
  id: string
  periodStart: string
  periodEnd: string
  subject: string
  preheader: string | null
  bodyMarkdown: string
  aiNarrative: string | null
  metricsJson: Record<string, unknown>
  status: ReportStatus
  scheduledFor: string | null
  sentAt: string | null
  sentCount: number
  failedCount: number
  recipients: string[]
  createdByEmail: string | null
  approvedByEmail: string | null
  createdAt: string
  updatedAt: string
}

// ── Calendar feed ─────────────────────────────────────────────────────────────
// One row per content item that lands inside the calendar window.
export interface CalendarContentRow {
  id: string
  brandId: string
  brandSlug: string
  brandName: string
  brandColor: string
  platformId: string | null
  platform: PlatformKind | null
  platformHandle: string | null
  contentType: ContentType
  status: ContentStatus
  postedVia: PostedVia
  title: string | null
  hook: string | null
  scheduledAt: string
  publishedAt: string | null
  externalUrl: string | null
  primaryPillarId: string | null
  primaryPillarColor: string | null
}
