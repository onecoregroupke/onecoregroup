// =============================================================================
// Publish runner — posts (or flags) content whose scheduled_at is due.
// =============================================================================
// Driven by the nightly cron (/api/mhub/cron/nightly). For each due, API-mode content
// row it resolves the platform handler, attempts a publish, and records the
// outcome on both the content row and a marketing_publish_jobs row.

import { createServerClient } from '@ocg/db'
import type { MarketingContentRow, MarketingPlatformRow } from '@ocg/db'
import { publishContent } from './index'

export interface RunnerResult {
  considered: number
  published: number
  reminded: number
  failed: number
}

export async function runDuePublishes(now = new Date()): Promise<RunnerResult> {
  const supabase = createServerClient()
  const result: RunnerResult = { considered: 0, published: 0, reminded: 0, failed: 0 }

  // Scheduled content whose time has arrived.
  const { data: due } = await supabase
    .from('marketing_content')
    .select('*')
    .eq('status', 'scheduled')
    .lte('scheduled_at', now.toISOString())
    .limit(100)
  const rows = (due as MarketingContentRow[] | null) ?? []
  if (rows.length === 0) return result

  // Resolve platform names for the rows in one query.
  const platformIds = [...new Set(rows.map((r) => r.platform_id).filter(Boolean))] as string[]
  const platformName = new Map<string, string>()
  if (platformIds.length > 0) {
    const { data: plats } = await supabase
      .from('marketing_platforms')
      .select('id, platform')
      .in('id', platformIds)
    for (const p of (plats as Pick<MarketingPlatformRow, 'id' | 'platform'>[] | null) ?? []) {
      platformName.set(p.id, p.platform)
    }
  }

  for (const row of rows) {
    result.considered += 1
    const platform = row.platform_id ? platformName.get(row.platform_id) ?? 'remind_only' : 'remind_only'

    // API-mode only: remind-mode content is left for humans (it still shows in
    // the dashboard "needs posting" list).
    if (row.posted_via !== 'api') {
      result.reminded += 1
      continue
    }

    const { data: jobRow } = await supabase
      .from('marketing_publish_jobs')
      .insert({
        content_id: row.id,
        brand_id: row.brand_id,
        platform,
        status: 'running',
        attempts: 1,
        scheduled_at: row.scheduled_at,
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    const jobId = (jobRow as { id: string } | null)?.id

    const outcome = await publishContent({
      brandId: row.brand_id,
      platform,
      contentId: row.id,
      title: row.title,
      hook: row.hook,
      bodyMarkdown: row.body_markdown,
      hashtags: row.hashtags,
      assetUrls: (row.asset_urls as string[]) ?? [],
    })

    if (outcome.status === 'published') {
      result.published += 1
      await supabase
        .from('marketing_content')
        .update({
          status: 'published',
          published_at: new Date().toISOString(),
          external_url: outcome.externalUrl ?? null,
          external_post_id: outcome.externalPostId ?? null,
          publish_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)
      if (jobId) {
        await supabase
          .from('marketing_publish_jobs')
          .update({
            status: 'published',
            completed_at: new Date().toISOString(),
            external_url: outcome.externalUrl ?? null,
            external_post_id: outcome.externalPostId ?? null,
          })
          .eq('id', jobId)
      }
    } else if (outcome.status === 'remind') {
      result.reminded += 1
      if (jobId) {
        await supabase
          .from('marketing_publish_jobs')
          .update({ status: 'cancelled', completed_at: new Date().toISOString(), error_message: outcome.reason })
          .eq('id', jobId)
      }
    } else {
      result.failed += 1
      await supabase
        .from('marketing_content')
        .update({ status: 'publish_failed', publish_error: outcome.error, updated_at: new Date().toISOString() })
        .eq('id', row.id)
      if (jobId) {
        await supabase
          .from('marketing_publish_jobs')
          .update({ status: 'failed', completed_at: new Date().toISOString(), error_message: outcome.error })
          .eq('id', jobId)
      }
    }
  }

  return result
}
