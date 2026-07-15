// =============================================================================
// Publisher framework — the seam between scheduled content and platform APIs.
// =============================================================================
// Each platform implements PublishHandler. When a brand has an active credential
// for the platform, the handler posts via the live API; otherwise it falls back
// to remind-only (marks the content for a human to post manually). The runner
// (./runner.ts) drives this for content whose scheduled_at is due.
//
// Live API calls per platform are intentionally isolated here so they can be
// wired one platform at a time without touching the runner or the schema.

import { getActiveToken } from '../credentials'

export interface PublishContext {
  brandId: string
  platform: string
  contentId: string
  title: string | null
  hook: string | null
  bodyMarkdown: string
  hashtags: string | null
  assetUrls: string[]
}

export type PublishOutcome =
  | { status: 'published'; externalUrl?: string; externalPostId?: string }
  | { status: 'remind'; reason: string }
  | { status: 'failed'; error: string }

export interface PublishHandler {
  platform: string
  /** Attempt a live publish. Implementations should return 'remind' when no
   *  live API integration is wired yet, so content still surfaces for manual
   *  posting rather than silently failing. */
  publish(ctx: PublishContext, token: { accessToken: string; refreshToken?: string | null }): Promise<PublishOutcome>
}

// Remind-only fallback used when no credential exists or a platform has no live
// integration yet. It never throws; the content is flagged for manual posting.
const remindOnly: PublishHandler = {
  platform: 'remind_only',
  async publish() {
    return { status: 'remind', reason: 'No live integration/credential — post manually.' }
  },
}

// Per-platform handlers. Each currently routes to remind-only until its live
// API client is implemented (the next Workstream-C sub-phase). The structure is
// here so wiring Instagram/LinkedIn/TikTok/YouTube/WhatsApp is a localised change.
function stub(platform: string): PublishHandler {
  return {
    platform,
    async publish() {
      // TODO(live-api): implement the platform's Graph/REST publish call here.
      return { status: 'remind', reason: `${platform} live publishing not yet wired — post manually.` }
    },
  }
}

const HANDLERS: Record<string, PublishHandler> = {
  instagram: stub('instagram'),
  linkedin: stub('linkedin'),
  tiktok: stub('tiktok'),
  youtube: stub('youtube'),
  whatsapp_status: stub('whatsapp_status'),
  whatsapp_channel: stub('whatsapp_channel'),
  x: stub('x'),
  threads: stub('threads'),
  facebook: stub('facebook'),
}

export function handlerFor(platform: string): PublishHandler {
  return HANDLERS[platform] ?? remindOnly
}

/** Publish one content item to one platform. Resolves a live token if present,
 *  otherwise remind-only. Pure orchestration — the runner persists the result. */
export async function publishContent(ctx: PublishContext): Promise<PublishOutcome> {
  const handler = handlerFor(ctx.platform)
  const token = await getActiveToken(ctx.brandId, ctx.platform)
  if (!token) {
    return { status: 'remind', reason: `No active ${ctx.platform} credential for this brand.` }
  }
  try {
    return await handler.publish(ctx, token)
  } catch (e) {
    return { status: 'failed', error: (e as Error).message }
  }
}
