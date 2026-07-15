// =============================================================================
// Groq chat completion — thin wrapper over the OpenAI-compatible endpoint.
// =============================================================================
// Server-only. Reads GROQ_API_KEY (and optional GROQ_MODEL). Returns null when
// unconfigured so callers can degrade gracefully (report still saves, just
// without an AI narrative).

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const DEFAULT_MODEL = 'llama-3.3-70b-versatile'

export function isGroqConfigured(): boolean {
  return Boolean(process.env['GROQ_API_KEY'])
}

export async function groqComplete(
  system: string,
  user: string,
  opts: { maxTokens?: number; temperature?: number } = {},
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const key = process.env['GROQ_API_KEY']
  if (!key) return { ok: false, error: 'GROQ_API_KEY is not configured.' }
  const model = process.env['GROQ_MODEL'] || DEFAULT_MODEL
  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        temperature: opts.temperature ?? 0.5,
        max_tokens: opts.maxTokens ?? 1200,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      return { ok: false, error: `Groq request failed (${res.status}). ${detail.slice(0, 200)}` }
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const text = json.choices?.[0]?.message?.content?.trim()
    if (!text) return { ok: false, error: 'Groq returned an empty response.' }
    return { ok: true, text }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Groq network error.' }
  }
}
