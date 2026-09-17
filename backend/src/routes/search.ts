import { Router } from 'express'
import { catalog } from '../catalog.js'
import { db } from '../db.js'
import type { AuthedRequest } from '../middleware/auth.js'

export const searchRouter = Router()

type SearchResult = (typeof catalog)[number]
type SearchSource = 'local' | 'pixabay' | 'wikimedia'
type SearchResponse = {
  results: SearchResult[]
  source: SearchSource
  fallback?: boolean
  cached?: boolean
  nextPage?: number
}

const CACHE_MS = 24 * 60 * 60 * 1000
const PAGE_SIZE = 30
const MAX_PAGE = 10

function localSearch(query: string) {
  return query
    ? catalog.filter((image) => `${image.title} ${image.tags.join(' ')}`.toLowerCase().includes(query))
    : catalog
}

function readPage(value: unknown) {
  const page = Number(value ?? 1)
  if (!Number.isInteger(page) || page < 1) return 1
  return Math.min(page, MAX_PAGE)
}

function titleFromFileName(fileName: string) {
  return fileName
    .replace(/^File:/i, '')
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function searchPixabay(query: string, page: number, apiKey: string): Promise<SearchResponse | null> {
  const url = new URL('https://pixabay.com/api/')
  url.searchParams.set('key', apiKey)
  url.searchParams.set('q', query)
  url.searchParams.set('image_type', 'photo')
  url.searchParams.set('safesearch', 'true')
  url.searchParams.set('per_page', String(PAGE_SIZE))
  url.searchParams.set('page', String(page))

  const response = await fetch(url, { signal: AbortSignal.timeout(6_000) })
  if (!response.ok) throw new Error(`Pixabay returned ${response.status}`)

  const body = (await response.json()) as {
    totalHits?: number
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
      creator: hit.user.slice(0, 120),
      imageUrl: hit.webformatURL,
      pageUrl: hit.pageURL,
      tags: tags.slice(0, 8).map((tag) => tag.slice(0, 40)),
      width: hit.webformatWidth,
      height: hit.webformatHeight,
    }
  })

  if (!results.length) return null
  const totalHits = body.totalHits ?? results.length
  return {
    results,
    source: 'pixabay',
    nextPage: page < MAX_PAGE && page * PAGE_SIZE < totalHits ? page + 1 : undefined,
  }
}

async function searchWikimedia(query: string, page: number): Promise<SearchResponse | null> {
  const url = new URL('https://commons.wikimedia.org/w/api.php')
  url.searchParams.set('action', 'query')
  url.searchParams.set('format', 'json')
  url.searchParams.set('formatversion', '2')
  url.searchParams.set('generator', 'search')
  url.searchParams.set('gsrsearch', query)
  url.searchParams.set('gsrnamespace', '6')
  url.searchParams.set('gsrlimit', String(PAGE_SIZE))
  url.searchParams.set('gsroffset', String((page - 1) * PAGE_SIZE))
  url.searchParams.set('prop', 'imageinfo')
  url.searchParams.set('iiprop', 'url|size|mime|user')
  url.searchParams.set('iiurlwidth', '900')

  const response = await fetch(url, {
    headers: { 'User-Agent': 'MosaicChangePlusPlus/1.0 (educational image discovery app)' },
    signal: AbortSignal.timeout(6_000),
  })
  if (!response.ok) throw new Error(`Wikimedia returned ${response.status}`)

  const body = (await response.json()) as {
    continue?: { gsroffset?: number }
    query?: {
      pages?: Array<{
        pageid: number
        title: string
        imageinfo?: Array<{
          user?: string
          url?: string
          descriptionurl?: string
          thumburl?: string
          width?: number
          height?: number
          thumbwidth?: number
          thumbheight?: number
          mime?: string
        }>
      }>
    }
  }

  const queryTags = query.split(/\s+/).filter(Boolean)
  const results = (body.query?.pages ?? []).flatMap((pageResult) => {
    const info = pageResult.imageinfo?.[0]
    const imageUrl = info?.thumburl ?? info?.url
    const width = info?.thumbwidth ?? info?.width
    const height = info?.thumbheight ?? info?.height
    if (!info?.mime?.startsWith('image/') || info.mime === 'image/svg+xml' || !imageUrl || !width || !height) return []

    return [{
      id: `wikimedia-${pageResult.pageid}`,
      title: (titleFromFileName(pageResult.title) || 'Untitled').slice(0, 120),
      creator: (info.user || 'Wikimedia contributor').slice(0, 120),
      imageUrl,
      pageUrl: info.descriptionurl || info.url || imageUrl,
      tags: [...queryTags.slice(0, 2).map((tag) => tag.slice(0, 40)), 'Wikimedia'],
      width,
      height,
    }]
  })

  if (!results.length) return null
  return {
    results,
    source: 'wikimedia',
    nextPage: page < MAX_PAGE && body.continue?.gsroffset != null ? page + 1 : undefined,
  }
}


searchRouter.get('/social', (req: AuthedRequest, res) => {
  const query = String(req.query.q ?? '').trim().toLowerCase().slice(0, 100).slice(0, 80)
  if (query.length < 2) return res.json({ people: [], collections: [] })
  const like = `%${query.replace(/[\\%_]/g, '\\$&')}%`

  const people = db.prepare(`
    SELECT u.id, u.name, u.bio, u.avatar_url,
      (SELECT COUNT(*) FROM follows f WHERE f.following_id = u.id) AS follower_count,
      CASE WHEN EXISTS (
        SELECT 1 FROM follows mine WHERE mine.follower_id = ? AND mine.following_id = u.id
      ) THEN 1 ELSE 0 END AS followed_by_me
    FROM users u
    WHERE LOWER(u.name) LIKE ? ESCAPE '\\' OR LOWER(u.bio) LIKE ? ESCAPE '\\'
    ORDER BY follower_count DESC, u.name ASC
    LIMIT 6
  `).all(req.user?.id ?? -1, like, like)

  const collections = db.prepare(`
    SELECT c.id, c.name, c.description, c.share_token, c.updated_at,
      COUNT(i.id) AS item_count,
      (SELECT image_url FROM items WHERE collection_id = c.id ORDER BY id DESC LIMIT 1) AS cover_url,
      u.id AS owner_id, u.name AS owner_name, u.avatar_url AS owner_avatar
    FROM collections c
    JOIN collection_members m ON m.collection_id = c.id AND m.role = 'owner'
    JOIN users u ON u.id = m.user_id
    LEFT JOIN items i ON i.collection_id = c.id
    WHERE c.visibility = 'public' AND c.share_token IS NOT NULL
      AND (LOWER(c.name) LIKE ? ESCAPE '\\' OR LOWER(c.description) LIKE ? ESCAPE '\\')
    GROUP BY c.id
    ORDER BY c.updated_at DESC
    LIMIT 6
  `).all(like, like)

  return res.json({ people, collections })
})

searchRouter.get('/', async (req, res) => {
  const query = String(req.query.q ?? '').trim().toLowerCase().slice(0, 100)
  const page = readPage(req.query.page)
  const apiKey = process.env.PIXABAY_API_KEY?.trim()

  if (!query) return res.json({ results: localSearch(''), source: 'local' } satisfies SearchResponse)

  const provider = req.query.source === 'wikimedia' ? 'wikimedia' : apiKey ? 'pixabay' : 'wikimedia'
  const cacheKey = `${provider}:${query}:${page}`
  db.prepare('DELETE FROM search_cache WHERE expires_at <= ?').run(Date.now())
  const cached = db.prepare('SELECT payload FROM search_cache WHERE key = ?').get(cacheKey) as { payload: string } | undefined
  if (cached) return res.json({ ...JSON.parse(cached.payload), cached: true })

  const cacheCount = (db.prepare('SELECT COUNT(*) AS count FROM search_cache').get() as { count: number }).count
  if (cacheCount >= 5000) return res.status(503).json({ error: 'Search is busy. Please try again later.' })
  let response: SearchResponse | null = null
  if (provider === 'pixabay' && apiKey) {
    try { response = await searchPixabay(query, page, apiKey) }
    catch { console.warn('Pixabay search unavailable.') }
  }
  // A provider must not change halfway through its page sequence.
  if (!response && (provider === 'wikimedia' || page === 1)) {
    try { response = await searchWikimedia(query, page) }
    catch { console.warn('Wikimedia search unavailable.') }
  }
  response ??= { results: page === 1 ? localSearch(query) : [], source: 'local', fallback: true }
  const expiry = Date.now() + (response.fallback ? 60_000 : CACHE_MS)
  // Bound disk use without evicting live 24-hour provider cache entries.
  db.prepare('INSERT OR REPLACE INTO search_cache VALUES (?, ?, ?)').run(cacheKey, JSON.stringify(response), expiry)
  return res.json(response)
})
