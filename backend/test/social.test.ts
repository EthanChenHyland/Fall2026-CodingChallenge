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

test('likes and comment moderation stay consistent', async () => {
  const demo = request.agent(app)
  await demo.post('/api/auth/demo').expect(200)
  const curator = await makeCurator()
  const explore = await curator.agent.get('/api/explore').expect(200)
  const pinId = explore.body.pins.find((pin: { owner_name: string }) => pin.owner_name === 'Demo Curator').id as number

  await curator.agent.post(`/api/pins/${pinId}/like`).expect(204)
  const liked = await curator.agent.get(`/api/pins/${pinId}`).expect(200)
  assert.equal(liked.body.pin.liked_by_me, true)
  assert.ok(liked.body.pin.like_count >= 1)

  const posted = await curator.agent.post(`/api/pins/${pinId}/comments`).send({ body: 'This belongs on my reference wall.' }).expect(201)
  const commentId = posted.body.comment.id as number
  const ownerView = await demo.get(`/api/pins/${pinId}/comments`).expect(200)
  const comment = ownerView.body.comments.find((entry: { id: number }) => entry.id === commentId)
  assert.equal(comment.can_delete, true)
  await demo.delete(`/api/pins/${pinId}/comments/${commentId}`).expect(204)

  await curator.agent.delete(`/api/pins/${pinId}/like`).expect(204)
  const unliked = await curator.agent.get(`/api/pins/${pinId}`).expect(200)
  assert.equal(unliked.body.pin.liked_by_me, false)
})
