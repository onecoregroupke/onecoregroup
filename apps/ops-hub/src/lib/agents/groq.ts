import Groq from 'groq-sdk'
import { SPECIALIST_PROFILES, type AgentTaskType } from './specialistRegistry'

const MODEL = 'llama-3.3-70b-versatile'

export interface SpecialistContext {
  taskName: string
  taskDescription: string
  projectName: string
  brandName?: string
  projectContext?: string
  priority?: string
  extraNotes?: string
}

/** Run an internal-runtime specialist inline with Groq. Returns markdown.
 *  Throws if GROQ_API_KEY is unset so the caller can fall back to queueing. */
export async function runInternalSpecialist(
  specialist: AgentTaskType,
  ctx: SpecialistContext,
): Promise<string> {
  const key = process.env['GROQ_API_KEY']
  if (!key) throw new Error('GROQ_API_KEY not set')
  const profile = SPECIALIST_PROFILES[specialist]
  const groq = new Groq({ apiKey: key })

  const system = [
    `You are the ${profile.name} for One Core Group, a Kenyan multi-brand group.`,
    profile.brief,
    'Write in clear Kenyan English. Use Markdown. Be concrete and concise.',
    'Use ONLY the provided context. Mark unknown client facts as [TO CONFIRM] and pricing as [PRICING — confirm]. Never fabricate.',
    'This is an internal draft for human review — never address an external recipient as if sending.',
  ].join(' ')

  const user = [
    ctx.brandName ? `Brand: ${ctx.brandName}` : null,
    `Project: ${ctx.projectName}`,
    `Task: ${ctx.taskName}`,
    ctx.priority ? `Priority: ${ctx.priority}` : null,
    ctx.taskDescription ? `\nTask description:\n${ctx.taskDescription}` : null,
    ctx.projectContext ? `\nProject context:\n${ctx.projectContext}` : null,
    ctx.extraNotes ? `\nAdditional context:\n${ctx.extraNotes}` : null,
    `\nProduce: ${profile.expectedOutput}`,
  ]
    .filter(Boolean)
    .join('\n')

  const completion = await groq.chat.completions.create({
    model: MODEL,
    temperature: 0.4,
    max_tokens: 2048,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  })

  return completion.choices[0]?.message?.content?.trim() ?? '(empty draft)'
}
