import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import request from 'supertest'
const directory = mkdtempSync(join(tmpdir(), 'mosaic-provider-'))
process.env.DATABASE_PATH = join(directory, 'test.sqlite')
process.env.PIXABAY_API_KEY = 'test-key'
const { app } = await import('../src/app.js')
const { db } = await import('../src/db.js')
const originalFetch = globalThis.fetch
test.afterEach(() => { globalThis.fetch = originalFetch })
test.after(() => { db.close(); rmSync(directory, { recursive: true, force: true }) })

test('provider cache lasts 24 hours and saved Pixabay images use durable local media', async () => {
  let searches = 0
  globalThis.fetch = (async (input: URL | RequestInfo) => {
    if (String(input).startsWith('https://pixabay.com/api/')) {
      searches++
      return Response.json({ totalHits: 1, hits: [{ id: 42, tags: 'nature, green', user: 'Photographer', webformatURL: 'https://cdn.pixabay.com/photo/test.jpg', pageURL: 'https://pixabay.com/photos/test-42/', webformatWidth: 500, webformatHeight: 300 }] })
    }
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

test('provider failure cannot create a half-saved pin', async () => {
  const owner = request.agent(app)
  await owner.post('/api/auth/demo').expect(200)
  const board = await owner.post('/api/collections').send({ name: 'Failed provider board' }).expect(201)
  globalThis.fetch = (async () => new Response('', { status: 302, headers: { location: 'http://127.0.0.1/private' } })) as typeof fetch
  await owner.post(`/api/collections/${board.body.collection.id}/items`).send({ sourceId: 'pixabay-unsafe', imageUrl: 'https://cdn.pixabay.com/test.jpg', title: 'Test' }).expect(502)
  assert.equal((await owner.get(`/api/collections/${board.body.collection.id}`)).body.collection.items.length, 0)
})
