import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import request from 'supertest'
const directory = mkdtempSync(join(tmpdir(), 'mosaic-provider-'))
process.env.DATABASE_PATH = join(directory, 'test.sqlite')
process.env.PIXABAY_API_KEY = 'test-key'
const { app } = await import('../src/app.js')
const { db } = await import('../src/db.js')
const { persistProviderImage, pruneUnusedMedia } = await import('../src/lib/media.js')
const originalFetch = globalThis.fetch
const originalOpenRouterKey = process.env.OPENROUTER_API_KEY
const originalOpenRouterModel = process.env.OPENROUTER_MODEL
test.afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalOpenRouterKey == null) delete process.env.OPENROUTER_API_KEY
  else process.env.OPENROUTER_API_KEY = originalOpenRouterKey
  if (originalOpenRouterModel == null) delete process.env.OPENROUTER_MODEL
  else process.env.OPENROUTER_MODEL = originalOpenRouterModel
})
test.after(() => { db.close(); rmSync(directory, { recursive: true, force: true }) })

test('provider cache lasts 24 hours and saved Pixabay images use durable local media', async () => {
  let searches = 0
  globalThis.fetch = (async (input: URL | RequestInfo) => {
    if (String(input).startsWith('https://pixabay.com/api/')) {
      searches++
      return Response.json({ totalHits: 1, hits: [{ id: 42, tags: 'nature, green', user: 'Photographer', webformatURL: 'https://pixabay.com/get/test.jpg', pageURL: 'https://pixabay.com/photos/test-42/', webformatWidth: 500, webformatHeight: 300 }] })
    }
    if (String(input) === 'https://pixabay.com/get/test.jpg') return new Response('', { status: 302, headers: { location: 'https://cdn.pixabay.com/photo/test.jpg' } })
    if (String(input) === 'https://cdn.pixabay.com/photo/test.jpg') return new Response(new Uint8Array([255, 216, 255, 217]), { headers: { 'content-type': 'image/jpeg' } })
    throw new Error('Unexpected fetch')
  }) as typeof fetch
  const query = randomUUID()
  const first = await request(app).get(`/api/search?q=${query}`).expect(200)
  const second = await request(app).get(`/api/search?q=${query}`).expect(200)
  assert.equal(searches, 1)
  assert.equal(second.body.cached, true)
  const cache = db.prepare('SELECT expires_at FROM search_cache WHERE key = ?').get(`pixabay:${query}:1`) as { expires_at: number }
  assert.ok(cache.expires_at > Date.now() + 23 * 60 * 60 * 1000)
  const owner = request.agent(app)
  await owner.post('/api/auth/demo').expect(200)
  const board = await owner.post('/api/collections').send({ name: 'Provider board' }).expect(201)
  const image = first.body.results[0]
  const saved = await owner.post(`/api/collections/${board.body.collection.id}/items`).send({ sourceId: image.id, imageUrl: image.imageUrl, sourcePage: image.pageUrl, title: image.title }).expect(201)
  assert.match(saved.body.item.image_url, /^\/media\/[a-f0-9]{64}\.jpg$/)
  await request(app).get(saved.body.item.image_url).expect(200).expect('Content-Type', /image\/jpeg/)
})

test('provider media GC preserves live and undo references before removing expired files', async () => {
  const bytes = new Uint8Array([255, 216, 7, 8, 9, 255, 217])
  const filename = `${createHash('sha256').update(bytes).digest('hex')}.jpg`
  globalThis.fetch = (async () => new Response(bytes, { headers: { 'content-type': 'image/jpeg' } })) as typeof fetch
  const owner = request.agent(app)
  await owner.post('/api/auth/demo').expect(200)
  const board = await owner.post('/api/collections').send({ name: `GC board ${randomUUID()}` }).expect(201)
  const saved = await owner.post(`/api/collections/${board.body.collection.id}/items`).send({ sourceId: `gc-${randomUUID()}`, imageUrl: 'https://cdn.pixabay.com/gc.jpg', title: 'GC image' }).expect(201)
  const path = join(directory, 'media', filename)
  assert.equal(saved.body.item.image_url, `/media/${filename}`)
  assert.equal(existsSync(path), true)
  assert.equal(pruneUnusedMedia(), 0)

  await owner.delete(`/api/collections/${board.body.collection.id}/items/${saved.body.item.id}`).expect(204)
  assert.equal(existsSync(path), true)
  assert.equal(pruneUnusedMedia(), 0)

  db.prepare('UPDATE deleted_items SET expires_at = ? WHERE item_id = ?').run(Date.now() - 1, saved.body.item.id)
  assert.equal(pruneUnusedMedia(), 1)
  assert.equal(existsSync(path), false)
})

test('portable exports embed local provider media and restore it after the source is deleted', async () => {
  const bytes = new Uint8Array([255, 216, 21, 22, 23, 255, 217])
  const filename = `${createHash('sha256').update(bytes).digest('hex')}.jpg`
  globalThis.fetch = (async () => new Response(bytes, { headers: { 'content-type': 'image/jpeg' } })) as typeof fetch
  const owner = request.agent(app)
  await owner.post('/api/auth/demo').expect(200)
  const board = await owner.post('/api/collections').send({ name: `Portable media ${randomUUID()}` }).expect(201)
  const saved = await owner.post(`/api/collections/${board.body.collection.id}/items`).send({ sourceId: `portable-media-${randomUUID()}`, imageUrl: 'https://cdn.pixabay.com/portable.jpg', title: 'Portable provider image' }).expect(201)
  const mediaUrl = `/media/${filename}`
  assert.equal(saved.body.item.image_url, mediaUrl)

  const exported = await owner.get(`/api/collections/${board.body.collection.id}/export`).expect(200)
  assert.equal(exported.body.version, 2)
  assert.equal(exported.body.media.length, 1)
  assert.equal(exported.body.media[0].path, mediaUrl)
  assert.equal(Buffer.from(exported.body.media[0].data, 'base64').equals(Buffer.from(bytes)), true)

  await owner.delete(`/api/collections/${board.body.collection.id}`).expect(204)
  assert.equal(existsSync(join(directory, 'media', filename)), false)

  const missingMedia = { ...exported.body, media: [] }
  await owner.post('/api/collections/import').send(missingMedia).expect(400)

  const imported = await owner.post('/api/collections/import').send(exported.body).expect(201)
  assert.equal(imported.body.collection.items[0].image_url, mediaUrl)
  await request(app).get(mediaUrl).expect(200).expect('Content-Type', /image\/jpeg/)
  assert.equal(existsSync(join(directory, 'media', filename)), true)
})

test('Pixabay failures fall back to Wikimedia; oversized titles can still be saved', async () => {
  globalThis.fetch = (async (input: URL | RequestInfo) => {
    if (String(input).startsWith('https://pixabay.com/api/')) return new Response('', { status: 503 })
    return Response.json({ query: { pages: [{ pageid: 500, title: 'File:' + 'A'.repeat(200) + '.jpg', imageinfo: [{ mime: 'image/jpeg', user: 'B'.repeat(200), url: 'https://upload.wikimedia.org/test.jpg', width: 600, height: 400 }] }] } })
  }) as typeof fetch
  const result = await request(app).get(`/api/search?q=${randomUUID()}`).expect(200)
  assert.equal(result.body.source, 'wikimedia')
  assert.equal(result.body.results[0].title.length, 120)
  assert.equal(result.body.results[0].creator.length, 120)
})

test('cached Pixabay searches do not consume extra provider requests', async () => {
  let calls = 0
  globalThis.fetch = (async (input: URL | RequestInfo) => {
    if (String(input).startsWith('https://pixabay.com/api/')) {
      calls++
      return Response.json({ totalHits: 1, hits: [{ id: 73, tags: 'design', user: 'Maker', webformatURL: 'https://cdn.pixabay.com/design.jpg', pageURL: 'https://pixabay.com/photos/design-73/', webformatWidth: 640, webformatHeight: 480 }] })
    }
    throw new Error('Unexpected fetch')
  }) as typeof fetch
  const query = `cache-budget-${randomUUID()}`
  await request(app).get(`/api/search?q=${query}`).expect(200)
  await request(app).get(`/api/search?q=${query}`).expect(200)
  await request(app).get(`/api/search?q=${query}`).expect(200)
  assert.equal(calls, 1)
})

test('unfiltered Pixabay browse mixes general results with rotating visual themes', async () => {
  const urls: URL[] = []
  globalThis.fetch = (async (input: URL | RequestInfo) => {
    const url = new URL(String(input))
    if (url.hostname !== 'pixabay.com') throw new Error('Unexpected fetch')
    urls.push(url)
    const page = Number(url.searchParams.get('page') ?? 1)
    const query = url.searchParams.get('q')
    const label = query || 'general'
    const idOffset = query ? urls.length * 100 : 0
    return Response.json({
      totalHits: 10_000,
      hits: Array.from({ length: 4 }, (_, index) => ({
        id: 9000 + idOffset + page * 10 + index,
        tags: `${label}, visual ${index}, discovery`,
        user: 'Variety Maker',
        webformatURL: `https://cdn.pixabay.com/${encodeURIComponent(label)}-${page}-${index}.jpg`,
        pageURL: `https://pixabay.com/images/id-${9000 + idOffset + page * 10 + index}/`,
        webformatWidth: 640,
        webformatHeight: 480,
      })),
    })
  }) as typeof fetch

  const first = await request(app).get('/api/search?seed=1234&page=1').expect(200)
  const cachedSamePool = await request(app).get('/api/search?seed=1276&page=1').expect(200)
  const second = await request(app).get('/api/search?seed=1234&page=2').expect(200)

  assert.equal(urls.length, 6)
  const firstRequests = urls.slice(0, 3)
  const secondRequests = urls.slice(3, 6)
  assert.equal(firstRequests.every((url) => url.searchParams.get('image_type') === 'all'), true)
  assert.equal(firstRequests.filter((url) => !url.searchParams.has('q')).length, 1)
  assert.equal(firstRequests.find((url) => !url.searchParams.has('q'))?.searchParams.get('page'), '17')
  assert.equal(firstRequests.find((url) => !url.searchParams.has('q'))?.searchParams.get('order'), 'latest')
  assert.deepEqual(firstRequests.filter((url) => url.searchParams.has('q')).map((url) => url.searchParams.get('q')), ['science', 'sports'])
  assert.equal(firstRequests.filter((url) => url.searchParams.has('q')).every((url) => url.searchParams.get('order') === 'popular'), true)
  assert.equal(secondRequests.find((url) => !url.searchParams.has('q'))?.searchParams.get('page'), '18')
  assert.deepEqual(secondRequests.filter((url) => url.searchParams.has('q')).map((url) => url.searchParams.get('q')), ['music', 'technology'])
  assert.equal(first.body.nextPage, 2)
  assert.equal(second.body.nextPage, 3)
  assert.equal(first.body.results.slice(0, 6).map((result: { tags: string[] }) => result.tags[0]).filter((tag: string) => tag === 'general').length <= 2, true)
  assert.equal(new Set(first.body.results.slice(0, 6).map((result: { tags: string[] }) => result.tags[0])).size, 3)
  assert.equal(cachedSamePool.body.cached, true)
  assert.equal(new Set(cachedSamePool.body.results.slice(0, 6).map((result: { tags: string[] }) => result.tags[0])).size, 3)
  assert.equal(first.body.results.some((result: Record<string, unknown>) => '__browseGroup' in result), false)
  assert.equal(cachedSamePool.body.results.some((result: Record<string, unknown>) => '__browseGroup' in result), false)
})

test('a later Pixabay browse outage is retryable instead of being cached as the end', async () => {
  db.prepare("DELETE FROM search_cache WHERE key LIKE 'pixabay:diverse-v3:%'").run()
  let unavailable = true
  let calls = 0
  globalThis.fetch = (async (input: URL | RequestInfo) => {
    const url = new URL(String(input))
    if (url.hostname !== 'pixabay.com') throw new Error('Unexpected fetch')
    calls++
    if (unavailable) return new Response('', { status: 503 })
    const query = url.searchParams.get('q') || 'general'
    const page = Number(url.searchParams.get('page') ?? 1)
    return Response.json({
      totalHits: 10_000,
      hits: [{ id: calls * 1000 + page, tags: `${query}, retry`, user: 'Retry Maker', webformatURL: `https://cdn.pixabay.com/retry-${calls}.jpg`, pageURL: `https://pixabay.com/images/id-${calls}/`, webformatWidth: 640, webformatHeight: 480 }],
    })
  }) as typeof fetch

  const failed = await request(app).get('/api/search?seed=9012&page=2').expect(503)
  assert.equal(failed.headers['retry-after'], '15')
  assert.match(failed.body.error, /retry loading more/i)

  unavailable = false
  const retried = await request(app).get('/api/search?seed=9012&page=2').expect(200)
  assert.equal(retried.body.source, 'pixabay')
  assert.equal(retried.body.nextPage, 3)
  assert.ok(retried.body.results.length > 0)
  assert.equal(calls, 6)
})

test('a later typed Pixabay page is retryable after a provider outage', async () => {
  const query = `retry-${randomUUID()}`
  let unavailable = true
  globalThis.fetch = (async (input: URL | RequestInfo) => {
    const url = new URL(String(input))
    if (url.hostname !== 'pixabay.com') throw new Error('Unexpected fetch')
    if (unavailable) return new Response('', { status: 503 })
    return Response.json({
      totalHits: 90,
      hits: [{ id: 777, tags: 'retry, city', user: 'Retry Maker', webformatURL: 'https://cdn.pixabay.com/retry-city.jpg', pageURL: 'https://pixabay.com/images/id-777/', webformatWidth: 640, webformatHeight: 480 }],
    })
  }) as typeof fetch

  const failed = await request(app).get(`/api/search?q=${query}&page=2&source=pixabay`).expect(503)
  assert.equal(failed.headers['retry-after'], '15')
  unavailable = false
  const retried = await request(app).get(`/api/search?q=${query}&page=2&source=pixabay`).expect(200)
  assert.equal(retried.body.source, 'pixabay')
  assert.equal(retried.body.results[0].id, 'pixabay-777')
})

test('typed Pixabay search preserves provider relevance order', async () => {
  let requestedUrl: URL | null = null
  globalThis.fetch = (async (input: URL | RequestInfo) => {
    requestedUrl = new URL(String(input))
    return Response.json({
      totalHits: 3,
      hits: [
        { id: 301, tags: 'best match', user: 'A', webformatURL: 'https://cdn.pixabay.com/301.jpg', pageURL: 'https://pixabay.com/images/id-301/', webformatWidth: 640, webformatHeight: 480 },
        { id: 302, tags: 'second match', user: 'B', webformatURL: 'https://cdn.pixabay.com/302.jpg', pageURL: 'https://pixabay.com/images/id-302/', webformatWidth: 640, webformatHeight: 480 },
        { id: 303, tags: 'third match', user: 'C', webformatURL: 'https://cdn.pixabay.com/303.jpg', pageURL: 'https://pixabay.com/images/id-303/', webformatWidth: 640, webformatHeight: 480 },
      ],
    })
  }) as typeof fetch

  const result = await request(app).get('/api/search?q=city&seed=1234').expect(200)
  assert.equal(requestedUrl?.searchParams.get('q'), 'city')
  assert.equal(requestedUrl?.searchParams.get('order'), 'popular')
  assert.deepEqual(result.body.results.map((item: { id: string }) => item.id), ['pixabay-301', 'pixabay-302', 'pixabay-303'])
})

test('provider failure cannot create a half-saved pin', async () => {
  const owner = request.agent(app)
  await owner.post('/api/auth/demo').expect(200)
  const board = await owner.post('/api/collections').send({ name: 'Failed provider board' }).expect(201)
  globalThis.fetch = (async () => new Response('', { status: 302, headers: { location: 'http://127.0.0.1/private' } })) as typeof fetch
  await owner.post(`/api/collections/${board.body.collection.id}/items`).send({ sourceId: 'pixabay-unsafe', imageUrl: 'https://cdn.pixabay.com/test.jpg', title: 'Test' }).expect(502)
  assert.equal((await owner.get(`/api/collections/${board.body.collection.id}`)).body.collection.items.length, 0)
})

test('Pixabay redirects cannot escape the approved provider hosts', async () => {
  const owner = request.agent(app)
  await owner.post('/api/auth/demo').expect(200)
  const board = await owner.post('/api/collections').send({ name: 'Unsafe redirect board' }).expect(201)
  globalThis.fetch = (async () => new Response('', { status: 302, headers: { location: 'https://example.com/private.jpg' } })) as typeof fetch
  await owner.post(`/api/collections/${board.body.collection.id}/items`).send({ sourceId: 'pixabay-escaped', imageUrl: 'https://pixabay.com/get/escaped.jpg', title: 'Escaped' }).expect(502)
  assert.equal((await owner.get(`/api/collections/${board.body.collection.id}`)).body.collection.items.length, 0)
})

test('failed database saves discard newly downloaded Pixabay media', async () => {
  const owner = request.agent(app)
  await owner.post('/api/auth/demo').expect(200)
  const board = await owner.post('/api/collections').send({ name: 'Provider rollback board' }).expect(201)
  const bytes = new Uint8Array([255, 216, 1, 2, 3, 255, 217])
  const filename = `${createHash('sha256').update(bytes).digest('hex')}.jpg`
  globalThis.fetch = (async () => new Response(bytes, { headers: { 'content-type': 'image/jpeg' } })) as typeof fetch
  db.exec(`CREATE TRIGGER fail_test_provider_activity BEFORE INSERT ON activity
    WHEN NEW.message LIKE '%saved “Provider rollback”'
    BEGIN SELECT RAISE(ABORT, 'test provider activity failure'); END`)
  await owner.post(`/api/collections/${board.body.collection.id}/items`).send({ sourceId: 'pixabay-provider-rollback', imageUrl: 'https://cdn.pixabay.com/provider-rollback.jpg', title: 'Provider rollback' }).expect(500)
  assert.equal(existsSync(join(directory, 'media', filename)), false)
  assert.equal((await owner.get(`/api/collections/${board.body.collection.id}`)).body.collection.items.length, 0)
  db.exec('DROP TRIGGER fail_test_provider_activity')
})

test('discarding one overlapping media save cannot remove another committed reference', async () => {
  const bytes = new Uint8Array([255, 216, 31, 32, 33, 255, 217])
  const filename = `${createHash('sha256').update(bytes).digest('hex')}.jpg`
  const path = join(directory, 'media', filename)
  globalThis.fetch = (async () => new Response(bytes, { headers: { 'content-type': 'image/jpeg' } })) as typeof fetch

  const first = await persistProviderImage('https://cdn.pixabay.com/overlap.jpg')
  const second = await persistProviderImage('https://cdn.pixabay.com/overlap.jpg')
  assert.equal(first.imageUrl, second.imageUrl)

  const owner = request.agent(app)
  await owner.post('/api/auth/demo').expect(200)
  const board = await owner.post('/api/collections').send({ name: `Overlap media ${randomUUID()}` }).expect(201)
  db.prepare('INSERT INTO items (collection_id, source_id, image_url, title) VALUES (?, ?, ?, ?)').run(
    board.body.collection.id,
    `overlap-${randomUUID()}`,
    second.imageUrl,
    'Overlapping provider media',
  )
  second.commit()
  first.discard()
  assert.equal(existsSync(path), true)
  assert.equal(pruneUnusedMedia(), 0)
})

test('search suggestions expand from Pixabay tags and cache provider lookups', async () => {
  let calls = 0
  globalThis.fetch = (async (input: URL | RequestInfo) => {
    if (!String(input).startsWith('https://pixabay.com/api/')) throw new Error('Unexpected fetch')
    calls++
    return Response.json({
      totalHits: 20,
      hits: [{
        id: 99123,
        tags: 'tokyo, night city, street photography, neon',
        user: 'Suggestion Maker',
        webformatURL: 'https://cdn.pixabay.com/suggestion.jpg',
        pageURL: 'https://pixabay.com/photos/suggestion-99123/',
        webformatWidth: 640,
        webformatHeight: 480,
      }],
    })
  }) as typeof fetch

  const query = `tokyo-${randomUUID().slice(0, 8)}`
  const first = await request(app).get(`/api/search/recommendations?q=${encodeURIComponent(query)}`).expect(200)
  const second = await request(app).get(`/api/search/recommendations?q=${encodeURIComponent(query)}`).expect(200)
  assert.ok(first.body.suggestions.some((suggestion: string) => suggestion.includes('night city')))
  assert.deepEqual(second.body.suggestions, first.body.suggestions)
  assert.equal(calls, 1)
})

test('optional AI expands typed search suggestions through OpenRouter', async () => {
  process.env.OPENROUTER_API_KEY = 'test-openrouter-key'
  process.env.OPENROUTER_MODEL = 'test/model'
  let openRouterBody = ''
  let openRouterAuthorization = ''
  globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = String(input)
    if (url.startsWith('https://pixabay.com/api/')) {
      return Response.json({
        totalHits: 20,
        hits: [{
          id: 99124,
          tags: 'tokyo, night city, street photography',
          user: 'Suggestion Maker',
          webformatURL: 'https://cdn.pixabay.com/suggestion-ai.jpg',
          pageURL: 'https://pixabay.com/photos/suggestion-ai-99124/',
          webformatWidth: 640,
          webformatHeight: 480,
        }],
      })
    }
    if (url === 'https://openrouter.ai/api/v1/chat/completions') {
      openRouterBody = String(init?.body ?? '')
      openRouterAuthorization = new Headers(init?.headers).get('Authorization') ?? ''
      return Response.json({ choices: [{ message: { content: '{"suggestions":["tokyo neon alleys","tokyo night markets","tokyo rainy streets"]}' } }] })
    }
    throw new Error(`Unexpected fetch: ${url}`)
  }) as typeof fetch

  const query = `tokyo-${randomUUID().slice(0, 8)}`
  const result = await request(app).get(`/api/search/recommendations?q=${encodeURIComponent(query)}`).expect(200)
  assert.equal(result.body.aiEnhanced, true)
  assert.ok(result.body.suggestions.includes('tokyo neon alleys'))
  assert.equal(openRouterAuthorization, 'Bearer test-openrouter-key')
  assert.match(openRouterBody, /"model":"test\/model"/)
  assert.match(openRouterBody, new RegExp(query))
  assert.doesNotMatch(openRouterBody, /test-openrouter-key/)
})

test('one-character search suggestions stay local and relevant', async () => {
  process.env.OPENROUTER_API_KEY = 'test-openrouter-key'
  globalThis.fetch = (async (input: URL | RequestInfo) => {
    throw new Error(`One-character suggestions should not call an external provider: ${String(input)}`)
  }) as typeof fetch

  const owner = request.agent(app)
  await owner.post('/api/auth/demo').expect(200)
  const result = await owner.get('/api/search/recommendations?q=t').expect(200)
  assert.equal(result.body.aiEnhanced, false)
  assert.ok(result.body.suggestions.length > 0)
  assert.ok(result.body.suggestions.every((suggestion: string) => suggestion.includes('t')))
})

test('homepage suggested searches can be AI-assisted without sending private saves', async () => {
  process.env.OPENROUTER_API_KEY = 'test-openrouter-key'
  process.env.OPENROUTER_MODEL = 'test/model'
  let openRouterBody = ''
  globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = String(input)
    if (url === 'https://openrouter.ai/api/v1/chat/completions') {
      openRouterBody = String(init?.body ?? '')
      return Response.json({ choices: [{ message: { content: '{"suggestions":["editorial color studies","quiet architectural details","night street textures"]}' } }] })
    }
    throw new Error(`Unexpected fetch: ${url}`)
  }) as typeof fetch

  const owner = request.agent(app)
  await owner.post('/api/auth/demo').expect(200)
  const result = await owner.get('/api/search/recommendations').expect(200)
  assert.equal(result.body.aiEnhanced, true)
  assert.ok(result.body.suggestions.includes('editorial color studies'))
  const requestBody = JSON.parse(openRouterBody) as { messages: Array<{ role: string; content: string }> }
  const userPayload = JSON.parse(requestBody.messages.find((message) => message.role === 'user')!.content) as { query: string; publicContext: string[] }
  assert.equal(userPayload.query, 'visual inspiration')
  assert.ok(userPayload.publicContext.length > 0)
  assert.doesNotMatch(openRouterBody, /demo@mosaic\.local/)
  assert.doesNotMatch(openRouterBody, /test-openrouter-key/)
})

test('AI provider failures preserve normal search suggestions', async () => {
  process.env.OPENROUTER_API_KEY = 'test-openrouter-key'
  globalThis.fetch = (async (input: URL | RequestInfo) => {
    const url = String(input)
    if (url.startsWith('https://pixabay.com/api/')) {
      return Response.json({
        totalHits: 20,
        hits: [{
          id: 99125,
          tags: 'fallback topic, night city, street photography',
          user: 'Fallback Maker',
          webformatURL: 'https://cdn.pixabay.com/suggestion-fallback.jpg',
          pageURL: 'https://pixabay.com/photos/suggestion-fallback-99125/',
          webformatWidth: 640,
          webformatHeight: 480,
        }],
      })
    }
    if (url === 'https://openrouter.ai/api/v1/chat/completions') return new Response('', { status: 503 })
    throw new Error(`Unexpected fetch: ${url}`)
  }) as typeof fetch

  const query = `fallback-${randomUUID().slice(0, 8)}`
  const result = await request(app).get(`/api/search/recommendations?q=${encodeURIComponent(query)}`).expect(200)
  assert.equal(result.body.aiEnhanced, false)
  assert.ok(result.body.suggestions.some((suggestion: string) => suggestion.includes('night city')))
})
