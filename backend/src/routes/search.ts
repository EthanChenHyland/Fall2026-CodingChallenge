import { Router } from 'express'
import { catalog } from '../catalog.js'

export const searchRouter = Router()

type SearchResult = (typeof catalog)[number]
const cache = new Map<string, { expiresAt: number; results: SearchResult[] }>()
const CACHE_MS = 10 * 60 * 1000

function localSearch(query: string) {
  return query
    ? catalog.filter((image) => `${image.title} ${image.tags.join(' ')}`.toLowerCase().includes(query))
    : catalog
}

searchRouter.get('/', async (req, res) => {
  const query = String(req.query.q ?? '').trim().toLowerCase()
  const apiKey = process.env.PIXABAY_API_KEY?.trim()
  if (!apiKey || !query) return res.json({ results: localSearch(query), source: 'local' })

  const cached = cache.get(query)
  if (cached && cached.expiresAt > Date.now()) {
    return res.json({ results: cached.results, source: 'pixabay', cached: true })
  }

  try {
    const url = new URL('https://pixabay.com/api/')
    url.searchParams.set('key', apiKey)
    url.searchParams.set('q', query)
    url.searchParams.set('image_type', 'photo')
    url.searchParams.set('safesearch', 'true')
    url.searchParams.set('per_page', '30')
    const response = await fetch(url, { signal: AbortSignal.timeout(6_000) })
    if (!response.ok) throw new Error(`Pixabay returned ${response.status}`)
    const body = (await response.json()) as {
      hits?: Array<{
        id: number
        tags: string
        user: string
        webformatURL: string
        pageURL: string
        webformatWidth: number
        webformatHeight: number
      }>
    }
    const results = (body.hits ?? []).map((hit) => {
      const tags = hit.tags.split(',').map((tag) => tag.trim()).filter(Boolean)
      return {
        id: `pixabay-${hit.id}`,
        title: tags[0] ? tags[0].replace(/\b\w/g, (char) => char.toUpperCase()) : 'Untitled',
        creator: hit.user,
        imageUrl: hit.webformatURL,
        pageUrl: hit.pageURL,
        tags,
        width: hit.webformatWidth,
        height: hit.webformatHeight,
      }
    })
    if (results.length) {
      cache.set(query, { expiresAt: Date.now() + CACHE_MS, results })
      return res.json({ results, source: 'pixabay' })
    }
  } catch (error) {
    console.warn('Pixabay search unavailable; using local catalog.', error)
  }

  return res.json({ results: localSearch(query), source: 'local', fallback: true })
})
