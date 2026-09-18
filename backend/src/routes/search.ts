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
const PIXABAY_WINDOW_MS = 60_000
const PIXABAY_REQUEST_LIMIT = 90
let pixabayRequestTimes: number[] = []
const recommendationStopWords = new Set(['about', 'after', 'again', 'also', 'and', 'from', 'have', 'into', 'more', 'saved', 'that', 'the', 'this', 'with', 'your'])

function recommendationTerms(value: string) {
  return value.toLowerCase().match(/[a-z0-9]{3,}/g)?.filter((term) => !recommendationStopWords.has(term)) ?? []
}

function searchInterests(userId?: number) {
  if (!userId) return [] as Array<[string, number]>
  const saved = db.prepare(`
    SELECT i.title, i.tags, c.name AS collection_name
    FROM items i
    JOIN collections c ON c.id = i.collection_id
    JOIN collection_members m ON m.collection_id = c.id AND m.user_id = ?
    ORDER BY i.created_at DESC
    LIMIT 200
  `).all(userId) as Array<{ title: string; tags: string; collection_name: string }>
  const weights = new Map<string, number>()
  for (const item of saved) {
    for (const tag of item.tags.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean)) {
      weights.set(tag, (weights.get(tag) ?? 0) + 5)
    }
    for (const term of recommendationTerms(`${item.title} ${item.collection_name}`)) {
      weights.set(term, (weights.get(term) ?? 0) + 1)
    }
  }
  const feedback = db.prepare(`
    SELECT rf.signal, i.title, i.tags, c.name AS collection_name
    FROM recommendation_feedback rf
    JOIN items i ON i.id = rf.item_id
    JOIN collections c ON c.id = i.collection_id
    WHERE rf.user_id = ?
    ORDER BY rf.created_at DESC
    LIMIT 100
  `).all(userId) as Array<{ signal: 'more' | 'not_interested'; title: string; tags: string; collection_name: string }>
  for (const item of feedback) {
    const multiplier = item.signal === 'more' ? 8 : -6
    for (const term of recommendationTerms(`${item.tags} ${item.title} ${item.collection_name}`)) {
      weights.set(term, (weights.get(term) ?? 0) + multiplier)
    }
  }
  return [...weights.entries()].sort((a, b) => b[1] - a[1])
}

function reservePixabayRequest() {
  const cutoff = Date.now() - PIXABAY_WINDOW_MS
  pixabayRequestTimes = pixabayRequestTimes.filter((time) => time > cutoff)
  if (pixabayRequestTimes.length >= PIXABAY_REQUEST_LIMIT) return false
  pixabayRequestTimes.push(Date.now())
  return true
}

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

function readSeed(value: unknown) {
  const seed = Number(value)
  if (!Number.isInteger(seed) || seed < 0) return null
  return seed >>> 0
}

function mixSeed(seed: number, value: string) {
  let mixed = seed >>> 0
  for (let index = 0; index < value.length; index += 1) {
    mixed = Math.imul(mixed ^ value.charCodeAt(index), 16777619) >>> 0
  }
  return mixed
}

function shuffledResults(results: SearchResult[], seed: number | null, salt: string) {
  if (seed == null || results.length < 2) return results
  const shuffled = [...results]
  let state = mixSeed(seed, salt) || 0x6d2b79f5
  const random = () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    ;[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]]
  }
  return shuffled
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
  // Pixabay's published limit is per API key, not per visitor. Keep a small
  // safety margin so concurrent users on this single production instance
  // cannot collectively exhaust the provider allowance.
  if (!reservePixabayRequest()) throw new Error('Pixabay request budget is temporarily exhausted.')
  const url = new URL('https://pixabay.com/api/')
  url.searchParams.set('key', apiKey)
  if (query) url.searchParams.set('q', query)
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
    SELECT u.id, u.username, u.name, u.bio, u.avatar_url,
      (SELECT COUNT(*) FROM follows f WHERE f.following_id = u.id) AS follower_count,
      CASE WHEN EXISTS (
        SELECT 1 FROM follows mine WHERE mine.follower_id = ? AND mine.following_id = u.id
      ) THEN 1 ELSE 0 END AS followed_by_me
    FROM users u
    WHERE LOWER(u.name) LIKE ? ESCAPE '\\' OR LOWER(u.username) LIKE ? ESCAPE '\\' OR LOWER(u.bio) LIKE ? ESCAPE '\\'
    ORDER BY follower_count DESC, u.name ASC
    LIMIT 6
  `).all(req.user?.id ?? -1, like, like, like)

  const collections = db.prepare(`
    SELECT c.id, c.name, c.description, c.share_token, c.updated_at,
      COUNT(i.id) AS item_count,
      (SELECT image_url FROM items WHERE collection_id = c.id ORDER BY id DESC LIMIT 1) AS cover_url,
      u.id AS owner_id, u.username AS owner_username, u.name AS owner_name, u.avatar_url AS owner_avatar
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

searchRouter.get('/recommendations', (req: AuthedRequest, res) => {
  const query = String(req.query.q ?? '').trim().toLowerCase().slice(0, 80)
  const userId = req.user?.id
  const interests = searchInterests(userId)
  const interestMap = new Map(interests)
  const queryTerms = recommendationTerms(query)

  const suggestionScores = new Map<string, number>()
  const addSuggestion = (value: string, score: number) => {
    const suggestion = value.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 60)
    if (suggestion.length < 2 || suggestion === query) return
    if (query && !suggestion.includes(query) && !query.includes(suggestion)) return
    suggestionScores.set(suggestion, Math.max(suggestionScores.get(suggestion) ?? 0, score))
  }

  for (const [interest, weight] of interests.filter(([, weight]) => weight > 0).slice(0, 20)) addSuggestion(interest, 100 + weight)
  for (const image of catalog) {
    for (const tag of image.tags) {
      const normalized = tag.trim().toLowerCase()
      const affinity = [...interestMap.entries()].reduce((score, [interest, weight]) => score + (normalized.includes(interest) || interest.includes(normalized) ? weight : 0), 0)
      addSuggestion(normalized, 20 + affinity)
    }
  }
  if (query && interests.length) {
    for (const [interest, weight] of interests.slice(0, 8)) {
      if (!query.includes(interest) && !interest.includes(query)) addSuggestion(`${query} ${interest}`, 10 + weight)
    }
  }
  const suggestions = [...suggestionScores.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([value]) => value)

  if (!userId) return res.json({ suggestions, pins: [], basedOn: [] })

  const candidates = db.prepare(`
    SELECT i.*, c.name AS collection_name, c.share_token, c.updated_at,
      u.id AS owner_id, u.username AS owner_username, u.name AS owner_name, u.avatar_url AS owner_avatar,
      (SELECT COUNT(*) FROM item_likes likes WHERE likes.item_id = i.id) AS like_count,
      (SELECT COUNT(*) FROM comments comments WHERE comments.item_id = i.id) AS comment_count
    FROM items i
    JOIN collections c ON c.id = i.collection_id
    JOIN collection_members owner ON owner.collection_id = c.id AND owner.role = 'owner'
    JOIN users u ON u.id = owner.user_id
    WHERE c.visibility = 'public' AND c.share_token IS NOT NULL AND u.id != ?
      AND NOT EXISTS (
        SELECT 1 FROM recommendation_feedback rf
        WHERE rf.user_id = ? AND rf.item_id = i.id AND rf.signal = 'not_interested'
      )
    ORDER BY c.updated_at DESC, i.id DESC
    LIMIT 250
  `).all(userId, userId) as Array<Record<string, unknown>>

  const ranked = candidates.map((pin) => {
    const haystack = `${String(pin.title ?? '')} ${String(pin.tags ?? '')} ${String(pin.collection_name ?? '')} ${String(pin.source_creator ?? '')}`.toLowerCase()
    const queryScore = queryTerms.reduce((score, term) => score + (haystack.includes(term) ? 12 : 0), 0)
    const affinity = interests.slice(0, 16).reduce((score, [term, weight]) => score + (haystack.includes(term) ? weight : 0), 0)
    const social = Math.min(8, Number(pin.like_count ?? 0) * 0.5 + Number(pin.comment_count ?? 0) * 0.75)
    return { pin, queryScore, score: queryScore + affinity + social }
  }).filter((entry) => query ? entry.queryScore > 0 : entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)

  return res.json({ suggestions, pins: ranked.map((entry) => entry.pin), basedOn: interests.filter(([, weight]) => weight > 0).slice(0, 4).map(([term]) => term) })
})

searchRouter.get('/', async (req, res) => {
  const query = String(req.query.q ?? '').trim().toLowerCase().slice(0, 100)
  const requestedPage = readPage(req.query.page)
  const seed = readSeed(req.query.seed)
  const apiKey = process.env.PIXABAY_API_KEY?.trim()

  if (!query && !apiKey) return res.json({ results: localSearch(''), source: 'local' } satisfies SearchResponse)

  const provider = req.query.source === 'wikimedia' ? 'wikimedia' : apiKey ? 'pixabay' : 'wikimedia'
  // Pixabay defaults to a fixed popularity order. For the unfiltered browse
  // feed, start each client session on one of the first five provider pages so
  // returning visitors see a different pool while still leaving room to load
  // more pages. Search queries stay on their requested page, then get a stable
  // per-session shuffle below so narrow searches cannot accidentally land on
  // an empty random page.
  const page = provider === 'pixabay' && !query && requestedPage === 1 && seed != null
    ? 1 + (seed % Math.min(5, MAX_PAGE))
    : requestedPage
  const cacheKey = `${provider}:${query}:${page}`
  db.prepare('DELETE FROM search_cache WHERE expires_at <= ?').run(Date.now())
  const cached = db.prepare('SELECT payload FROM search_cache WHERE key = ?').get(cacheKey) as { payload: string } | undefined
  if (cached) {
    const payload = JSON.parse(cached.payload) as SearchResponse
    return res.json({ ...payload, results: shuffledResults(payload.results, seed, `${query}:${page}`), cached: true })
  }

  const cacheCount = (db.prepare('SELECT COUNT(*) AS count FROM search_cache').get() as { count: number }).count
  if (cacheCount >= 5000) return res.status(503).json({ error: 'Search is busy. Please try again later.' })
  let response: SearchResponse | null = null
  if (provider === 'pixabay' && apiKey) {
    try { response = await searchPixabay(query, page, apiKey) }
    catch { console.warn('Pixabay search unavailable.') }
  }
  // A provider must not change halfway through its page sequence.
  if (!response && query && (provider === 'wikimedia' || page === 1)) {
    try { response = await searchWikimedia(query, page) }
    catch { console.warn('Wikimedia search unavailable.') }
  }
  response ??= { results: requestedPage === 1 ? localSearch(query) : [], source: 'local', fallback: true }
  const expiry = Date.now() + (response.fallback ? 60_000 : CACHE_MS)
  // Bound disk use without evicting live 24-hour provider cache entries.
  db.prepare('INSERT OR REPLACE INTO search_cache VALUES (?, ?, ?)').run(cacheKey, JSON.stringify(response), expiry)
  return res.json({ ...response, results: shuffledResults(response.results, seed, `${query}:${page}`) })
})
