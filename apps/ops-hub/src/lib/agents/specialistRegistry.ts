// Specialist registry for the Ops Hub agent stack. Adapted from WM Task Ops.
//
// Runtime rules:
//   internal — run inline in Next.js with Groq (fast, analysis-shaped work).
//   hermes   — queue into ops_agent_jobs for a worker/skill to execute later
//              (heavyweight drafts). The job sits 'pending' until claimed.
//   none     — manual review only; no automation.

export type AgentTaskType =
  | 'analysis'
  | 'research'
  | 'report'
  | 'proposal'
  | 'content'
  | 'video_clipping'
  | 'design_deck'
  | 'client_communication'
  | 'email_draft'
  | 'project_admin'
  | 'finance'
  | 'manual'

export type SpecialistProfile = {
  name: string
  runtime: 'internal' | 'hermes' | 'none'
  outputTypes: string[]
  riskLevel: string
  expectedOutput: string
  /** System prompt fragment describing the specialist's job. */
  brief: string
}

export const SPECIALIST_PROFILES: Record<AgentTaskType, SpecialistProfile> = {
  analysis: {
    name: 'Analysis Specialist',
    runtime: 'internal',
    outputTypes: ['analysis_note', 'recommendations'],
    riskLevel: 'draft_only',
    expectedOutput: 'Structured analysis with facts, assumptions, risks, gaps, recommendations, next actions.',
    brief: 'Produce a structured analysis using only the provided context. Separate facts from assumptions and flag gaps.',
  },
  research: {
    name: 'Research Specialist',
    runtime: 'internal',
    outputTypes: ['research_note'],
    riskLevel: 'research_only',
    expectedOutput: 'Research plan or summary using provided context. Do not invent sources.',
    brief: 'Plan or summarise research using provided context. Never fabricate sources or figures.',
  },
  report: {
    name: 'Reporting Specialist',
    runtime: 'internal',
    outputTypes: ['report', 'executive_summary'],
    riskLevel: 'draft_only',
    expectedOutput: 'Structured report or executive summary from provided context only.',
    brief: 'Write a clear report or executive summary from the context. Lead with the headline, then detail.',
  },
  proposal: {
    name: 'Proposal Specialist',
    runtime: 'hermes',
    outputTypes: ['proposal_outline', 'strategy_note'],
    riskLevel: 'draft_only',
    expectedOutput: 'Proposal draft with scope, assumptions, deliverables, timeline, risks, pricing placeholders, next steps.',
    brief: 'Draft a proposal: scope, deliverables, timeline, assumptions, risks, next steps. Mark all pricing as [PRICING — confirm] and unknown facts as [TO CONFIRM].',
  },
  content: {
    name: 'Content Operations Specialist',
    runtime: 'hermes',
    outputTypes: ['content_plan', 'shoot_plan'],
    riskLevel: 'draft_only',
    expectedOutput: 'Content plan, shoot plan, production task list, social breakdown, or campaign notes.',
    brief: 'Draft a content/shoot plan in the brand voice: hooks, captions, CTAs, cadence, and a per-post breakdown ready to push into the marketing calendar.',
  },
  video_clipping: {
    name: 'Video Clipping Specialist',
    runtime: 'hermes',
    outputTypes: ['clip_plan', 'editing_notes'],
    riskLevel: 'draft_only',
    expectedOutput: 'Clip plan, edit decision list, hook ideas, captions, formats, editor handoff notes.',
    brief: 'Produce a clip plan and edit decision list with hooks, captions, aspect ratios, and an editor handoff.',
  },
  design_deck: {
    name: 'Design Deck Specialist',
    runtime: 'hermes',
    outputTypes: ['deck_outline', 'presentation_copy'],
    riskLevel: 'draft_only',
    expectedOutput: 'Deck outline, slide copy, presentation structure, and design direction notes.',
    brief: 'Outline a deck slide-by-slide with copy and design direction.',
  },
  client_communication: {
    name: 'Client Communication Specialist',
    runtime: 'hermes',
    outputTypes: ['client_update', 'message_draft'],
    riskLevel: 'external_communication_draft_only',
    expectedOutput: 'Client-ready message draft for human review. Never send externally.',
    brief: 'Draft a client-ready message for human review. Never send. Keep it warm, concise, and specific.',
  },
  email_draft: {
    name: 'Email Draft Specialist',
    runtime: 'hermes',
    outputTypes: ['email_draft'],
    riskLevel: 'external_communication_draft_only',
    expectedOutput: 'Subject line and email body as a draft artifact. Never send externally.',
    brief: 'Draft a subject line and email body. Never send. Output is a draft for review.',
  },
  project_admin: {
    name: 'Project Admin Specialist',
    runtime: 'hermes',
    outputTypes: ['task_breakdown', 'project_update'],
    riskLevel: 'internal_draft',
    expectedOutput: 'Internal task breakdown, blocker analysis, daily brief draft, operational next steps.',
    brief: 'Break the work into tasks with owners and a sequence, surface blockers, and propose next steps.',
  },
  finance: {
    name: 'Finance/Admin Specialist',
    runtime: 'hermes',
    outputTypes: ['finance_brief', 'invoice_followup_draft'],
    riskLevel: 'financial_draft_only',
    expectedOutput: 'Finance/admin brief, invoice follow-up draft, payment status summary, or checklist.',
    brief: 'Draft a finance/admin brief or invoice follow-up. Never assert figures not in the context.',
  },
  manual: {
    name: 'Manual Review Specialist',
    runtime: 'none',
    outputTypes: ['manual_note'],
    riskLevel: 'human_only',
    expectedOutput: 'Manual review note explaining why the task needs a human.',
    brief: 'Explain why this task needs a human and what they should decide.',
  },
}

export const ALL_SPECIALISTS = Object.keys(SPECIALIST_PROFILES) as AgentTaskType[]

export const HERMES_SPECIALIST_TYPES = ALL_SPECIALISTS.filter(
  (t) => SPECIALIST_PROFILES[t].runtime === 'hermes',
)

export function isSpecialist(value: string): value is AgentTaskType {
  return value in SPECIALIST_PROFILES
}
