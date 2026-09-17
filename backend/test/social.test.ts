import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import request from 'supertest'

const databasePath = resolve(tmpdir(), `mosaic-social-${randomUUID()}.sqlite`)
process.env.DATABASE_PATH = databasePath

const { app } = await import('../src/app.js')
const { db } = await import('../src/db.js')

test.after(() => {
  db.close()
  for (const suffix of ['', '-shm', '-wal']) rmSync(`${databasePath}${suffix}`, { force: true })
})

async function makeCurator() {
  const agent = request.agent(app)
  const email = `curator-${randomUUID()}@example.test`
  const credential = `local-${randomUUID()}`
  const registered = await agent.post('/api/auth/register').send({ name: 'Test Curator', email, password: credential }).expect(201)
  return { agent, id: registered.body.user.id as number }
}

test('following feed is driven by the social graph', async () => {
  const demo = request.agent(app)
  await demo.post('/api/auth/demo').expect(200)
  const curator = await makeCurator()
  const created = await curator.agent.post('/api/collections').send({ name: 'Public test board', description: 'A board for social feed coverage.' }).expect(201)
  const collectionId = created.body.collection.id as number
  const search = await curator.agent.get('/api/search?q=Tokyo').expect(200)
  await curator.agent.post(`/api/collections/${collectionId}/items`).send({ sourceId: search.body.results[0].id, imageUrl: search.body.results[0].imageUrl, sourcePage: search.body.results[0].pageUrl, sourceCreator: search.body.results[0].creator, title: 'Feed test pin' }).expect(201)
  await curator.agent.post(`/api/collections/${collectionId}/share`).expect(200)

  await demo.post(`/api/profiles/${curator.id}/follow`).expect(204)
  const following = await demo.get('/api/explore?mode=following').expect(200)
  assert.ok(following.body.pins.some((pin: { owner_id: number }) => pin.owner_id === curator.id))
})
