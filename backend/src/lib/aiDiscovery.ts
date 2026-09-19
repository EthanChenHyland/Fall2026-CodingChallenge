const AI_CACHE_MS = 10 * 60 * 1000
const AI_TIMEOUT_MS = 4_500
const DEFAULT_MODEL = 'google/gemini-2.5-flash-lite'

const cache = new Map<string, { expiresAt: number; suggestions: string[] }>()

type OpenRouterResponse = {
  choices?: Array<{ message?: { content?: string } }>
}

function normalizeSuggestions(values: unknown) {
  if (!Array.isArray(values)) return []
  const seen = new Set<string>()
  const suggestions: string[] = []
  for (const value of values) {
    if (typeof value !== 'string') continue
    const normalized = value
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/^["'`]+|["'`]+$/g, '')
      .slice(0, 60)
    if (normalized.length < 2 || normalized.split(/\s+/).length > 7 || seen.has(normalized)) continue
    seen.add(normalized)
    suggestions.push(normalized)
    if (suggestions.length >= 8) break
  }
  return suggestions
}

function parseSuggestions(content: string) {
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try {
    const parsed = JSON.parse(cleaned) as { suggestions?: unknown }
    return normalizeSuggestions(parsed.suggestions)
  } catch {
    return []
  }
}

/**
 * Optional OpenRouter enhancement for visual search phrasing. This deliberately
 * receives only the typed query and public catalog context; private collection
 * names, saved items, and user profile data stay inside Mosaic's local ranking.
 */
export async function aiDiscoverySuggestions(query: string, publicContext: string[]) {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim()
  const normalizedQuery = query.trim().toLowerCase().slice(0, 80)
  if (!apiKey || normalizedQuery.length < 2) return []

  const model = process.env.OPENROUTER_MODEL?.trim() || DEFAULT_MODEL
  const safeContext = [...new Set(publicContext
    .map((value) => value.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 50))
    .filter((value) => value.length >= 2))]
    .slice(0, 12)
  const cacheKey = `${model}:${normalizedQuery}:${safeContext.join('|')}`
  const cached = cache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.suggestions

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Title': 'Mosaic visual discovery',
      },
      body: JSON.stringify({
        model,
        temperature: 0.45,
        max_tokens: 180,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'You expand a visual image-search query into concise related search phrases. Return only JSON in the shape {"suggestions":["phrase"]}. Give 5 to 8 useful phrases, each 2 to 7 words. Stay closely related to the query and avoid explanations.',
          },
          {
            role: 'user',
            content: JSON.stringify({ query: normalizedQuery, publicContext: safeContext }),
          },
        ],
      }),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    })
    if (!response.ok) return []
    const body = await response.json() as OpenRouterResponse
    const content = body.choices?.[0]?.message?.content
    if (!content) return []
    const suggestions = parseSuggestions(content)
    if (suggestions.length) cache.set(cacheKey, { expiresAt: Date.now() + AI_CACHE_MS, suggestions })
    return suggestions
  } catch {
    return []
  }
}
