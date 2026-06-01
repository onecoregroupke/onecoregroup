// =============================================================================
// Calendar → Ops Hub bridge. Pushes a content row to the Ops Hub as an agent
// task (brand-scoped, under a per-brand "Content Production" project), links the
// two, and marks the row in production. The approved deliverable returns via the
// ops-callback webhook (see app/api/marketing/ops-callback).
// =============================================================================

import { createServerClient } from '@ocg/db'
import type { Brand, MarketingContentRow, MarketingOpsProjectRow } from '@ocg/db'

function opsConfig(): { base: string; key: string } | null {
  const base = process.env['OPS_OPS_BASE_URL']
  const key = process.env['OPS_AGENT_API_KEY']
  if (!base || !key) return null
  return { base: base.replace(/\/$/, ''), key }
}

async function opsFetch<T>(
  path: string,
  init: RequestInit,
): Promise<{ ok: boolean; data: T }> {
  const cfg = opsConfig()
  if (!cfg) throw new Error('OPS_OPS_BASE_URL / OPS_AGENT_API_KEY not set')
  const res = await fetch(`${cfg.base}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', 'x-ops-agent-key': cfg.key, ...(init.headers ?? {}) },
  })
  const data = (await res.json().catch(() => ({}))) as T
  return { ok: res.ok, data }
}

/** Find (or create) the Ops "Content Production" project for a brand. */
async function getOrCreateProductionProject(brand: Brand): Promise<string> {
  const supabase = createServerClient()
  const { data: existing } = await supabase
    .from('marketing_ops_projects')
    .select('*')
    .eq('brand_id', brand.id)
    .maybeSingle()
  if (existing) return (existing as MarketingOpsProjectRow).ops_project_id

  const { ok, data } = await opsFetch<{ ok: boolean; project_id?: string; error?: string }>(
    '/api/agent/projects',
    {
      method: 'POST',
      body: JSON.stringify({
        project_name: `Content Production — ${brand.name}`,
        brand: brand.slug,
        service_line: 'Marketing content production',
      }),
    },
  )
  if (!ok || !data.project_id) throw new Error(data.error ?? 'Failed to create Ops project')
  await supabase
    .from('marketing_ops_projects')
    .upsert({ brand_id: brand.id, ops_project_id: data.project_id })
  return data.project_id
}

const OUTPUT_TYPE_LABELS: Record<string, string> = {
  poster: 'Poster / static graphic',
  carousel: 'Carousel graphics',
  reel: 'Reel / short video',
  video_edit: 'Video edit',
  animation: 'Animated graphic / motion',
  deck: 'Presentation deck',
  copy: 'Caption / copy only',
}

export interface PushInput {
  contentId: string
  instruction: string
  outputType: string
  priority?: string
  byEmail: string
}

export async function pushContentToTaskAgent(
  input: PushInput,
): Promise<{ ok: true; taskId: string } | { ok: false; error: string }> {
  const supabase = createServerClient()
  const { data: contentRow } = await supabase
    .from('marketing_content')
    .select('*')
    .eq('id', input.contentId)
    .maybeSingle()
  if (!contentRow) return { ok: false, error: 'Content not found.' }
  const content = contentRow as MarketingContentRow

  const { data: brandRow } = await supabase.from('brands').select('*').eq('id', content.brand_id).maybeSingle()
  if (!brandRow) return { ok: false, error: 'Brand not found.' }
  const brand = brandRow as Brand

  // Resolve platform name for context (best-effort).
  let platformName = ''
  if (content.platform_id) {
    const { data: p } = await supabase
      .from('marketing_platforms')
      .select('platform, handle')
      .eq('id', content.platform_id)
      .maybeSingle()
    const pr = p as { platform: string; handle: string | null } | null
    if (pr) platformName = pr.handle ? `${pr.platform} (${pr.handle})` : pr.platform
  }

  let projectId: string
  try {
    projectId = await getOrCreateProductionProject(brand)
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }

  const outputLabel = OUTPUT_TYPE_LABELS[input.outputType] ?? input.outputType
  const description = [
    `Required output: ${outputLabel}.`,
    `Brand: ${brand.name}${platformName ? ` · Platform: ${platformName}` : ''}.`,
    content.title ? `Post title: ${content.title}` : null,
    content.hook ? `Hook: ${content.hook}` : null,
    content.body_markdown ? `Planned caption:\n${content.body_markdown}` : null,
    content.hashtags ? `Hashtags: ${content.hashtags}` : null,
    content.scheduled_at ? `Scheduled for: ${content.scheduled_at}` : null,
    '',
    `Instruction:\n${input.instruction}`,
  ]
    .filter(Boolean)
    .join('\n')

  const taskName = `${outputLabel} — ${content.title || content.hook || 'content piece'}`
  const { ok, data } = await opsFetch<{ ok: boolean; task_id?: string; error?: string }>(
    '/api/agent/tasks',
    {
      method: 'POST',
      body: JSON.stringify({
        task_name: taskName.slice(0, 140),
        project_id: projectId,
        task_description: description,
        category: 'Marketing',
        priority: input.priority ?? 'High',
        agent_eligible: 'Yes',
        source_kind: 'marketing_content',
        source_ref: input.contentId,
      }),
    },
  )
  if (!ok || !data.task_id) return { ok: false, error: data.error ?? 'Failed to create Ops task' }

  await supabase
    .from('marketing_content')
    .update({
      ops_task_id: data.task_id,
      production_status: 'briefing',
      production_brief: input.instruction,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.contentId)

  return { ok: true, taskId: data.task_id }
}

export interface DeliverableInput {
  contentId: string
  deliverable: { artifact_id?: string; title?: string; doc_link?: string | null; summary?: string } | null
}

/** Called by the ops-callback webhook when an Ops task is approved: attach the
 *  deliverable to the content row and auto-schedule it. */
export async function applyApprovedDeliverable(
  input: DeliverableInput,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createServerClient()
  const { data: contentRow } = await supabase
    .from('marketing_content')
    .select('*')
    .eq('id', input.contentId)
    .maybeSingle()
  if (!contentRow) return { ok: false, error: 'content_not_found' }
  const content = contentRow as MarketingContentRow

  const link = input.deliverable?.doc_link ?? null
  const assetUrls = Array.isArray(content.asset_urls) ? [...(content.asset_urls as string[])] : []
  if (link && !assetUrls.includes(link)) assetUrls.push(link)

  // Auto-schedule unless already published/archived. Keep existing time; if none,
  // schedule now so the runner picks it up.
  const terminal = content.status === 'published' || content.status === 'archived'
  const patch: Record<string, unknown> = {
    production_status: 'delivered',
    deliverable_url: link,
    asset_urls: assetUrls,
    updated_at: new Date().toISOString(),
  }
  if (!terminal) {
    patch.status = 'scheduled'
    patch.scheduled_at = content.scheduled_at ?? new Date().toISOString()
    patch.approved_by_email = content.approved_by_email ?? 'ops-agent'
  }

  const { error } = await supabase.from('marketing_content').update(patch).eq('id', input.contentId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
