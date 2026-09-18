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

test('followers-only collections require a follower relationship', async () => {
  const demo = request.agent(app)
  await demo.post('/api/auth/demo').expect(200)
  const curator = await makeCurator()
  const created = await curator.agent.post('/api/collections').send({ name: 'Followers test board', description: 'Visible to followers only.' }).expect(201)
  const collectionId = created.body.collection.id as number
  const restricted = await curator.agent.patch(`/api/collections/${collectionId}`).send({ audience: 'followers' }).expect(200)
  const token = restricted.body.collection.share_token as string
  assert.equal(restricted.body.collection.audience, 'followers')
  assert.ok(token)

  await request(app).get(`/api/shared/${token}`).expect(404)
  await demo.get(`/api/shared/${token}`).expect(404)
  const beforeFollow = await demo.get(`/api/profiles/${curator.id}`).expect(200)
  assert.ok(!beforeFollow.body.collections.some((collection: { id: number }) => collection.id === collectionId))

  await demo.post(`/api/profiles/${curator.id}/follow`).expect(204)
  const afterFollow = await demo.get(`/api/profiles/${curator.id}`).expect(200)
  assert.ok(afterFollow.body.collections.some((collection: { id: number; audience: string }) => collection.id === collectionId && collection.audience === 'followers'))
  await demo.get(`/api/shared/${token}`).expect(200)

  await demo.delete(`/api/profiles/${curator.id}/follow`).expect(204)
  await demo.get(`/api/shared/${token}`).expect(404)
})

test('recommendations are derived from saved interests', async () => {
  const demo = request.agent(app)
  await demo.post('/api/auth/demo').expect(200)
  const recommended = await demo.get('/api/explore/recommended').expect(200)
  assert.ok(recommended.body.basedOn.length > 0)
  assert.ok(recommended.body.pins.length > 0)
  assert.ok(recommended.body.pins.every((pin: { owner_name: string }) => pin.owner_name !== 'Demo Curator'))
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

test('social mutations roll back when notifications cannot be written', async () => {
  const demo = request.agent(app)
  const demoLogin = await demo.post('/api/auth/demo').expect(200)
  const demoId = demoLogin.body.user.id as number
  const curator = await makeCurator()
  const explore = await curator.agent.get('/api/explore').expect(200)
  const pinId = explore.body.pins.find((pin: { owner_id: number }) => pin.owner_id === demoId).id as number

  db.exec(`CREATE TRIGGER fail_test_like_notification BEFORE INSERT ON notifications
    WHEN NEW.user_id = ${demoId} AND NEW.message LIKE '%liked “%'
    BEGIN SELECT RAISE(ABORT, 'test like notification failure'); END`)
  await curator.agent.post(`/api/pins/${pinId}/like`).expect(500)
  assert.equal(db.prepare('SELECT 1 FROM item_likes WHERE item_id = ? AND user_id = ?').get(pinId, curator.id), undefined)
  db.exec('DROP TRIGGER fail_test_like_notification')

  db.exec(`CREATE TRIGGER fail_test_comment_notification BEFORE INSERT ON notifications
    WHEN NEW.user_id = ${demoId} AND NEW.message LIKE '%commented on a pin'
    BEGIN SELECT RAISE(ABORT, 'test comment notification failure'); END`)
  await curator.agent.post(`/api/pins/${pinId}/comments`).send({ body: 'Atomic comment should roll back' }).expect(500)
  assert.equal(db.prepare('SELECT 1 FROM comments WHERE item_id = ? AND user_id = ? AND body = ?').get(pinId, curator.id, 'Atomic comment should roll back'), undefined)
  db.exec('DROP TRIGGER fail_test_comment_notification')

  db.exec(`CREATE TRIGGER fail_test_follow_notification BEFORE INSERT ON notifications
    WHEN NEW.user_id = ${curator.id} AND NEW.message LIKE '%followed you'
    BEGIN SELECT RAISE(ABORT, 'test follow notification failure'); END`)
  await demo.post(`/api/profiles/${curator.id}/follow`).expect(500)
  assert.equal(db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?').get(demoId, curator.id), undefined)
  db.exec('DROP TRIGGER fail_test_follow_notification')
})

test('social search finds people and public boards without exposing email', async () => {
  const demo = request.agent(app)
  await demo.post('/api/auth/demo').expect(200)

  const people = await demo.get('/api/search/social?q=demo').expect(200)
  assert.ok(people.body.people.some((person: { name: string }) => person.name === 'Demo Curator'))
  assert.ok(people.body.people.every((person: Record<string, unknown>) => !('email' in person)))

  const boards = await demo.get('/api/search/social?q=museum').expect(200)
  assert.ok(boards.body.collections.some((collection: { name: string }) => collection.name === 'Museum of small things'))
})
