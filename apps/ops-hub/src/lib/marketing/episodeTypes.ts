// Pure episode types/labels — safe to import from client components (no server
// or @ocg/db imports). The data-access layer in episodes.ts builds on these.

export const EPISODE_STATUSES = [
  'idea',
  'recording',
  'editing',
  'scheduled',
  'published',
  'archived',
] as const
export type EpisodeStatus = (typeof EPISODE_STATUSES)[number]

export const EPISODE_STATUS_LABELS: Record<EpisodeStatus, string> = {
  idea: 'Idea',
  recording: 'Recording',
  editing: 'Editing',
  scheduled: 'Scheduled',
  published: 'Published',
  archived: 'Archived',
}

export const EPISODE_EDIT_STATUSES = ['none', 'in_edit', 'review', 'done'] as const
export type EpisodeEditStatus = (typeof EPISODE_EDIT_STATUSES)[number]

export interface MarketingEpisode {
  id: string
  brandId: string
  number: number | null
  slug: string | null
  title: string
  hook: string | null
  guestName: string | null
  guestOrg: string | null
  summaryMarkdown: string
  recordDate: string | null
  publishDate: string | null
  editStatus: EpisodeEditStatus
  status: EpisodeStatus
  youtubeUrl: string | null
  podcastUrl: string | null
  durationSeconds: number | null
  campaignId: string | null
  createdByEmail: string | null
  createdAt: string
  updatedAt: string
}
