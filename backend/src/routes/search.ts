import { Router } from 'express'
import { catalog } from '../catalog.js'
import { db } from '../db.js'
import { aiDiscoverySuggestions } from '../lib/aiDiscovery.js'
import type { AuthedRequest } from '../middleware/auth.js'

export const searchRouter = Router()

type SearchResult = (typeof catalog)[number]
type SearchSource = 'local' | 'pixabay' | 'wikimedia'
type SearchResponse = {
  results: SearchResult[]
  source: SearchSource
  fallback?: boolean
  cached?: boolean
  providerUnavailable?: boolean
  nextPage?: number
}

const CACHE_MS = 24 * 60 * 60 * 1000
const PAGE_SIZE = 30
const PIXABAY_MAX_RESULTS = 500
const PIXABAY_SEARCH_MAX_PAGE = Math.ceil(PIXABAY_MAX_RESULTS / PAGE_SIZE)
const WIKIMEDIA_MAX_PAGE = 10
const BROWSE_GENERAL_SIZE = 12
const BROWSE_THEME_SIZE = 9
const BROWSE_GENERAL_MAX_PAGE = Math.ceil(PIXABAY_MAX_RESULTS / BROWSE_GENERAL_SIZE)
const BROWSE_THEME_MAX_PAGE = Math.ceil(PIXABAY_MAX_RESULTS / BROWSE_THEME_SIZE)
const BROWSE_LOGICAL_MAX_PAGE = 1000
const REQUEST_PAGE_LIMIT = 10_000
const PIXABAY_WINDOW_MS = 60_000
const PIXABAY_REQUEST_LIMIT = 90
const SUGGESTION_CACHE_MS = 5 * 60 * 1000
const DISCOVERY_THEME_PAIRS = [
  ['digital art', 'cars'],
  ['anime illustration', 'interior design'],
  ['fashion', 'food'],
  ['animals', 'architecture'],
  ['space', 'street photography'],
  ['gaming', 'travel'],
  ['science', 'sports'],
  ['music', 'technology'],
  ['fantasy art', 'transportation'],
  ['people', 'abstract art'],
] as const
let pixabayRequestTimes: number[] = []
const suggestionProviderCache = new Map<string, { expiresAt: number; terms: string[] }>()
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
      AND (
        c.visibility = 'public'
        OR EXISTS (
          SELECT 1 FROM collection_members viewer_member
          WHERE viewer_member.collection_id = c.id AND viewer_member.user_id = ?
        )
        OR (
          c.audience = 'followers'
          AND EXISTS (
            SELECT 1
            FROM collection_members owner_member
            JOIN follows viewer_follow ON viewer_follow.following_id = owner_member.user_id
            WHERE owner_member.collection_id = c.id
              AND owner_member.role = 'owner'
              AND viewer_follow.follower_id = ?
          )
        )
      )
    ORDER BY rf.created_at DESC
    LIMIT 100
  `).all(userId, userId, userId) as Array<{ signal: 'more' | 'not_interested'; title: string; tags: string; collection_name: string }>
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
  return Math.min(page, REQUEST_PAGE_LIMIT)
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

function shuffledResults<T>(results: T[], seed: number | null, salt: string) {
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

type BrowseSearchResult = SearchResult & { __browseGroup?: string }

function diversifiedBrowseResults(results: SearchResult[], seed: number | null, salt: string) {
  const grouped = new Map<string, BrowseSearchResult[]>()
  for (const result of results as BrowseSearchResult[]) {
    const group = result.__browseGroup ?? 'general'
    const current = grouped.get(group) ?? []
    current.push(result)
    grouped.set(group, current)
  }

  const groupNames = shuffledResults([...grouped.keys()], seed, `${salt}:groups`)
  const queues = new Map(groupNames.map((group) => [
    group,
    shuffledResults(grouped.get(group) ?? [], seed, `${salt}:${group}`),
  ]))
  const balanced: BrowseSearchResult[] = []
  let added = true
  while (added) {
    added = false
    for (const group of groupNames) {
      const next = queues.get(group)?.shift()
      if (!next) continue
      balanced.push(next)
      added = true
    }
  }

  return balanced.map(({ __browseGroup: _group, ...result }) => result as SearchResult)
}

function titleFromFileName(fileName: string) {
  return fileName
    .replace(/^File:/i, '')
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function searchPixabay(
  query: string,
  page: number,
  apiKey: string,
  options: { perPage?: number; order?: 'popular' | 'latest'; browseGroup?: string } = {},
): Promise<SearchResponse | null> {
  // Pixabay's published limit is per API key, not per visitor. Keep a small
  // safety margin so concurrent users on this single production instance
  // cannot collectively exhaust the provider allowance.
  if (!reservePixabayRequest()) throw new Error('Pixabay request budget is temporarily exhausted.')
  const url = new URL('https://pixabay.com/api/')
  url.searchParams.set('key', apiKey)
  if (query) url.searchParams.set('q', query)
  // Discovery should be broad enough to include illustrations, vectors,
  // cars, art, anime-style work, and other non-photo results. Explicit
  // searches still stay relevant because Pixabay ranks by `q`.
  url.searchParams.set('image_type', 'all')
  const order = options.order ?? (query ? 'popular' : 'latest')
  url.searchParams.set('order', order)
  url.searchParams.set('safesearch', 'true')
  const perPage = options.perPage ?? PAGE_SIZE
  url.searchParams.set('per_page', String(perPage))
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
      ...(options.browseGroup ? { __browseGroup: options.browseGroup } : {}),
    }
  }) as BrowseSearchResult[]

  if (!results.length) return null
  const totalHits = body.totalHits ?? results.length
  const providerMaxPage = Math.ceil(PIXABAY_MAX_RESULTS / perPage)
  return {
    results,
    source: 'pixabay',
    nextPage: page < providerMaxPage && page * perPage < totalHits ? page + 1 : undefined,
  }
}

async function pixabaySuggestionTerms(query: string, apiKey: string) {
  const cacheKey = query.trim().toLowerCase()
  const cached = suggestionProviderCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.terms

  try {
    const response = await searchPixabay(cacheKey, 1, apiKey, { perPage: 16, order: 'popular' })
    const terms = [...new Set((response?.results ?? []).flatMap((result) => result.tags)
      .map((term) => term.trim().toLowerCase().replace(/\s+/g, ' '))
      .filter((term) => term.length >= 2 && term.length <= 40))]
      .slice(0, 40)
    suggestionProviderCache.set(cacheKey, { expiresAt: Date.now() + SUGGESTION_CACHE_MS, terms })
    return terms
  } catch {
    return []
  }
}

async function searchDiversePixabayBrowse(generalPage: number, themePage: number, apiKey: string): Promise<SearchResponse | null> {
  const themes = DISCOVERY_THEME_PAIRS[(generalPage - 1) % DISCOVERY_THEME_PAIRS.length]
  const searches = await Promise.allSettled([
    searchPixabay('', generalPage, apiKey, { perPage: BROWSE_GENERAL_SIZE, order: 'latest', browseGroup: 'general' }),
    searchPixabay(themes[0], themePage, apiKey, { perPage: BROWSE_THEME_SIZE, order: 'popular', browseGroup: `theme:${themes[0]}` }),
    searchPixabay(themes[1], themePage, apiKey, { perPage: BROWSE_THEME_SIZE, order: 'popular', browseGroup: `theme:${themes[1]}` }),
  ])
  const responses = searches.flatMap((search) => search.status === 'fulfilled' && search.value ? [search.value] : [])
  if (!responses.length) return null

  const unique = new Map<string, SearchResult>()
  for (const response of responses) {
    for (const result of response.results) {
      if (!unique.has(result.id)) unique.set(result.id, result)
    }
  }
  if (!unique.size) return null
  return { results: [...unique.values()], source: 'pixabay' }
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
    nextPage: page < WIKIMEDIA_MAX_PAGE && body.continue?.gsroffset != null ? page + 1 : undefined,
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

searchRouter.get('/recommendations', async (req: AuthedRequest, res) => {
  const query = String(req.query.q ?? '').trim().toLowerCase().slice(0, 80)
  const userId = req.user?.id
  const interests = searchInterests(userId)
  const interestMap = new Map(interests)
  const queryTerms = recommendationTerms(query)

  const suggestionScores = new Map<string, number>()
  const publicAiContext = new Set<string>()
  const addSuggestion = (value: string, score: number, trustedRelated = false) => {
    const suggestion = value.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 60)
    if (suggestion.length < 2 || suggestion === query) return
    if (query && !trustedRelated) {
      const suggestionTerms = recommendationTerms(suggestion)
      const overlaps = queryTerms.some((term) => suggestionTerms.some((candidate) => candidate.includes(term) || term.includes(candidate)))
      if (!suggestion.includes(query) && !query.includes(suggestion) && !overlaps) return
    }
    suggestionScores.set(suggestion, Math.max(suggestionScores.get(suggestion) ?? 0, score))
  }

  for (const [interest, weight] of interests.filter(([, weight]) => weight > 0).slice(0, 20)) addSuggestion(interest, 100 + weight)
  const publicTerms = db.prepare(`
    SELECT i.title, i.tags, c.name AS collection_name
    FROM items i
    JOIN collections c ON c.id = i.collection_id
    WHERE c.visibility = 'public' AND c.share_token IS NOT NULL
    ORDER BY c.updated_at DESC, i.id DESC
    LIMIT 250
  `).all() as Array<{ title: string; tags: string; collection_name: string }>
  for (const item of publicTerms) {
    for (const tag of item.tags.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean)) {
      const affinity = [...interestMap.entries()].reduce((score, [interest, weight]) => score + (tag.includes(interest) || interest.includes(tag) ? weight : 0), 0)
      addSuggestion(tag, 35 + affinity)
      if (!query || tag.includes(query) || queryTerms.some((term) => tag.includes(term) || term.includes(tag))) publicAiContext.add(tag)
    }
    for (const term of recommendationTerms(`${item.title} ${item.collection_name}`)) {
      addSuggestion(term, 18)
      if (queryTerms.some((queryTerm) => term.includes(queryTerm) || queryTerm.includes(term))) publicAiContext.add(term)
    }
  }
  for (const image of catalog) {
    for (const tag of image.tags) {
      const normalized = tag.trim().toLowerCase()
      const affinity = [...interestMap.entries()].reduce((score, [interest, weight]) => score + (normalized.includes(interest) || interest.includes(normalized) ? weight : 0), 0)
      addSuggestion(normalized, 20 + affinity)
      if (!query || normalized.includes(query) || queryTerms.some((term) => normalized.includes(term) || term.includes(normalized))) publicAiContext.add(normalized)
    }
  }

  const pixabayKey = process.env.PIXABAY_API_KEY?.trim()
  const shouldUseAi = query.length >= 2 || Boolean(userId)
  const aiQuery = query.length >= 2 ? query : 'visual inspiration'
  const [providerTerms, aiTerms] = await Promise.all([
    query.length >= 2 && pixabayKey ? pixabaySuggestionTerms(query, pixabayKey) : Promise.resolve([]),
    shouldUseAi ? aiDiscoverySuggestions(aiQuery, [...publicAiContext].slice(0, 12)) : Promise.resolve([]),
  ])
  for (const term of providerTerms) {
    if (term.includes(query) || query.includes(term)) addSuggestion(term, 90, true)
    else addSuggestion(`${query} ${term}`, 70, true)
  }
  for (const term of aiTerms) {
    if (query) {
      addSuggestion(term, 115, true)
      continue
    }
    const normalized = term.toLowerCase()
    const affinity = interests.slice(0, 16).reduce((score, [interest, weight]) => (
      normalized.includes(interest) || interest.includes(normalized) ? score + weight : score
    ), 0)
    // OpenRouter only sees public discovery context here. Private saves remain
    // local and influence the final ordering through this affinity score.
    addSuggestion(term, 110 + Math.min(40, affinity), true)
  }

  if (!query) {
    for (const [index, topic] of DISCOVERY_THEME_PAIRS.flat().entries()) addSuggestion(topic, 12 - Math.floor(index / 4))
  }
  const suggestions = [...suggestionScores.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([value]) => value)

  if (!userId) return res.json({ suggestions, pins: [], basedOn: [], aiEnhanced: aiTerms.length > 0 })

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

  return res.json({ suggestions, pins: ranked.map((entry) => entry.pin), basedOn: interests.filter(([, weight]) => weight > 0).slice(0, 4).map(([term]) => term), aiEnhanced: aiTerms.length > 0 })
})

searchRouter.get('/', async (req, res) => {
  const query = String(req.query.q ?? '').trim().toLowerCase().slice(0, 100)
  const requestedPage = readPage(req.query.page)
  const seed = readSeed(req.query.seed)
  const apiKey = process.env.PIXABAY_API_KEY?.trim()

  if (!query && !apiKey) return res.json({ results: localSearch(''), source: 'local' } satisfies SearchResponse)

  const provider = req.query.source === 'wikimedia' ? 'wikimedia' : apiKey ? 'pixabay' : 'wikimedia'
  // Treat the browser's page number as a logical page. For an unfiltered
  // Pixabay browse session, rotate the logical feed across the provider's
  // accessible result window. Theme pages advance independently so a long
  // scroll keeps finding new material instead of looping the first slice.
  const isPixabayBrowse = provider === 'pixabay' && !query
  if (provider === 'pixabay' && query && requestedPage > PIXABAY_SEARCH_MAX_PAGE) {
    return res.json({ results: [], source: 'pixabay' } satisfies SearchResponse)
  }
  const page = isPixabayBrowse && seed != null
    ? 1 + ((requestedPage - 1 + (seed % BROWSE_GENERAL_MAX_PAGE)) % BROWSE_GENERAL_MAX_PAGE)
    : requestedPage
  const browseThemePage = isPixabayBrowse
    ? 1 + (Math.floor((requestedPage - 1) / DISCOVERY_THEME_PAIRS.length) % BROWSE_THEME_MAX_PAGE)
    : 1
  const cacheKey = isPixabayBrowse
    ? `${provider}:diverse-v3:${page}:${browseThemePage}`
    : `${provider}:${query}:${page}`
  const logicalNextPage = isPixabayBrowse
    ? (requestedPage < BROWSE_LOGICAL_MAX_PAGE ? requestedPage + 1 : undefined)
    : undefined
  db.prepare('DELETE FROM search_cache WHERE expires_at <= ?').run(Date.now())
  const cached = db.prepare('SELECT payload FROM search_cache WHERE key = ?').get(cacheKey) as { payload: string } | undefined
  if (cached) {
    const payload = JSON.parse(cached.payload) as SearchResponse
    return res.json({
      ...payload,
      nextPage: isPixabayBrowse ? logicalNextPage : payload.nextPage,
      results: isPixabayBrowse
        ? diversifiedBrowseResults(payload.results, seed, `${requestedPage}:${page}`)
        : payload.results,
      cached: true,
    })
  }

  const cacheCount = (db.prepare('SELECT COUNT(*) AS count FROM search_cache').get() as { count: number }).count
  if (cacheCount >= 5000) return res.status(503).json({ error: 'Search is busy. Please try again later.' })
  let response: SearchResponse | null = null
  if (provider === 'pixabay' && apiKey) {
    try { response = isPixabayBrowse ? await searchDiversePixabayBrowse(page, browseThemePage, apiKey) : await searchPixabay(query, page, apiKey) }
    catch { console.warn('Pixabay search unavailable.') }
  }
  if (!response && isPixabayBrowse) {
    if (requestedPage > 1) {
      res.setHeader('Retry-After', '15')
      return res.status(503).json({ error: 'Pixabay is temporarily busy. Retry loading more in a moment.' })
    }
    return res.json({
      results: localSearch(''),
      source: 'local',
      fallback: true,
      providerUnavailable: true,
      nextPage: 2,
    } satisfies SearchResponse)
  }
  if (!response && provider === 'pixabay' && query && requestedPage > 1) {
    res.setHeader('Retry-After', '15')
    return res.status(503).json({ error: 'Pixabay is temporarily busy. Retry loading more in a moment.' })
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
  return res.json({
    ...response,
    nextPage: isPixabayBrowse ? logicalNextPage : response.nextPage,
    results: isPixabayBrowse
      ? diversifiedBrowseResults(response.results, seed, `${requestedPage}:${page}`)
      : response.results,
  })
})
