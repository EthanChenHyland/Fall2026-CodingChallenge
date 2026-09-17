import { Router } from 'express'
import { catalog } from '../catalog.js'

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

type CachedSearch = SearchResponse & { expiresAt: number }

const cache = new Map<string, CachedSearch>()
const CACHE_MS = 10 * 60 * 1000
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
      creator: hit.user,
      imageUrl: hit.webformatURL,
      pageUrl: hit.pageURL,
      tags,
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
      title: titleFromFileName(pageResult.title) || 'Untitled',
      creator: info.user || 'Wikimedia contributor',
      imageUrl,
      pageUrl: info.descriptionurl || info.url || imageUrl,
      tags: [...queryTags.slice(0, 2), 'Wikimedia'],
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

searchRouter.get('/', async (req, res) => {
  const query = String(req.query.q ?? '').trim().toLowerCase()
  const page = readPage(req.query.page)
  const apiKey = process.env.PIXABAY_API_KEY?.trim()

  if (!query) return res.json({ results: localSearch(''), source: 'local' } satisfies SearchResponse)

  const provider = apiKey ? 'pixabay' : 'wikimedia'
  const cacheKey = `${provider}:${query}:${page}`
  const cached = cache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    const { expiresAt: _expiresAt, ...cachedResponse } = cached
    return res.json({ ...cachedResponse, cached: true })
  }

  try {
    let response = apiKey ? await searchPixabay(query, page, apiKey) : null
    if (!response) response = await searchWikimedia(query, page)
    if (response) {
      cache.set(cacheKey, { ...response, expiresAt: Date.now() + CACHE_MS })
      return res.json(response)
    }
  } catch (error) {
    console.warn('Remote image search unavailable; using local catalog.', error)
  }

  return res.json({ results: localSearch(query), source: 'local', fallback: true } satisfies SearchResponse)
})
