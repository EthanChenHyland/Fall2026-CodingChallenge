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

test('public pins can be saved into another collection without exposing private pins', async () => {
  const demo = request.agent(app)
  await demo.post('/api/auth/demo').expect(200)
  const curator = await makeCurator()
  const publicExplore = await curator.agent.get('/api/explore').expect(200)
  const publicPin = publicExplore.body.pins.find((pin: { owner_name: string }) => pin.owner_name === 'Demo Curator') as { id: number; source_id: string }
  assert.ok(publicPin)

  const target = await curator.agent.post('/api/collections').send({ name: 'Repins', description: 'Saved from Mosaic.' }).expect(201)
  const targetId = target.body.collection.id as number
  const beforeSavedIn = await curator.agent.get(`/api/pins/${publicPin.id}/saved-in`).expect(200)
  assert.ok(!beforeSavedIn.body.collections.some((collection: { id: number }) => collection.id === targetId))
  const saved = await curator.agent.post(`/api/pins/${publicPin.id}/save`).send({ collectionId: targetId, note: 'Reference for the lobby palette.' }).expect(201)
  assert.equal(saved.body.item.collection_id, targetId)
  assert.equal(saved.body.item.source_id, publicPin.source_id)
  assert.equal(saved.body.item.note, 'Reference for the lobby palette.')
  const afterSavedIn = await curator.agent.get(`/api/pins/${publicPin.id}/saved-in`).expect(200)
  assert.ok(afterSavedIn.body.collections.some((collection: { id: number }) => collection.id === targetId))
  await curator.agent.post(`/api/pins/${publicPin.id}/save`).send({ collectionId: targetId }).expect(409)

  const privateBoard = await curator.agent.post('/api/collections').send({ name: 'Private source' }).expect(201)
  const search = await curator.agent.get('/api/search?q=private').expect(200)
  const result = search.body.results[0]
  const privatePin = await curator.agent.post(`/api/collections/${privateBoard.body.collection.id}/items`).send({
    sourceId: result.id,
    imageUrl: result.imageUrl,
    sourcePage: result.pageUrl,
    sourceCreator: result.creator,
    title: 'Private pin',
  }).expect(201)
  const demoTarget = await demo.post('/api/collections').send({ name: `Private copy target ${randomUUID()}` }).expect(201)
  await demo.post(`/api/pins/${privatePin.body.item.id}/save`).send({ collectionId: demoTarget.body.collection.id }).expect(404)
})

test('collection sections organize pins and bulk copy preserves the source board', async () => {
  const curator = await makeCurator()
  const source = await curator.agent.post('/api/collections').send({ name: 'Section source' }).expect(201)
  const target = await curator.agent.post('/api/collections').send({ name: 'Section target' }).expect(201)
  const sourceId = source.body.collection.id as number
  const targetId = target.body.collection.id as number
  const search = await curator.agent.get('/api/search?q=materials').expect(200)
  const result = search.body.results[0]
  const saved = await curator.agent.post(`/api/collections/${sourceId}/items`).send({
    sourceId: result.id,
    imageUrl: result.imageUrl,
    sourcePage: result.pageUrl,
    sourceCreator: result.creator,
    title: 'Section test pin',
    note: 'Keep this note when copied.',
  }).expect(201)
  const itemId = saved.body.item.id as number

  const createdSection = await curator.agent.post(`/api/collections/${sourceId}/sections`).send({ name: 'Textures' }).expect(201)
  const sectionId = createdSection.body.section.id as number
  await curator.agent.post(`/api/collections/${sourceId}/items/bulk`).send({ action: 'section', itemIds: [itemId], sectionId }).expect(200)
  let sourceView = await curator.agent.get(`/api/collections/${sourceId}`).expect(200)
  assert.equal(sourceView.body.collection.items.find((item: { id: number }) => item.id === itemId).section_id, sectionId)

  await curator.agent.patch(`/api/collections/${sourceId}/sections/${sectionId}`).send({ name: 'Surfaces' }).expect(200)
  sourceView = await curator.agent.get(`/api/collections/${sourceId}`).expect(200)
  assert.ok(sourceView.body.collection.sections.some((section: { id: number; name: string }) => section.id === sectionId && section.name === 'Surfaces'))

  const copied = await curator.agent.post(`/api/collections/${sourceId}/items/bulk`).send({ action: 'copy', itemIds: [itemId], targetCollectionId: targetId }).expect(200)
  assert.equal(copied.body.items.length, 1)
  assert.notEqual(copied.body.items[0].id, itemId)
  assert.equal(copied.body.items[0].note, 'Keep this note when copied.')
  assert.equal(copied.body.items[0].section_id, null)
  await curator.agent.post(`/api/collections/${sourceId}/items/bulk`).send({ action: 'copy', itemIds: [itemId], targetCollectionId: targetId }).expect(409)

  const targetView = await curator.agent.get(`/api/collections/${targetId}`).expect(200)
  assert.ok(targetView.body.collection.items.some((item: { source_id: string }) => item.source_id === result.id))
  sourceView = await curator.agent.get(`/api/collections/${sourceId}`).expect(200)
  assert.ok(sourceView.body.collection.items.some((item: { id: number }) => item.id === itemId))

  await curator.agent.delete(`/api/collections/${sourceId}/sections/${sectionId}`).expect(204)
  sourceView = await curator.agent.get(`/api/collections/${sourceId}`).expect(200)
  assert.equal(sourceView.body.collection.items.find((item: { id: number }) => item.id === itemId).section_id, null)
})

test('direct messages stay private and unread state clears on read', async () => {
  const demo = request.agent(app)
  await demo.post('/api/auth/demo').expect(200)
  const curator = await makeCurator()
  const outsider = await makeCurator()

  const started = await demo.post(`/api/messages/with/${curator.id}`).expect(200)
  const conversationId = started.body.conversationId as number
  const repeated = await demo.post(`/api/messages/with/${curator.id}`).expect(200)
  assert.equal(repeated.body.conversationId, conversationId)

  await demo.post(`/api/messages/${conversationId}`).send({ body: 'Want to swap board ideas?' }).expect(201)
  await outsider.agent.get(`/api/messages/${conversationId}`).expect(404)

  const inbox = await curator.agent.get('/api/messages').expect(200)
  const conversation = inbox.body.conversations.find((entry: { id: number }) => entry.id === conversationId)
  assert.equal(conversation.unread_count, 1)

  const thread = await curator.agent.get(`/api/messages/${conversationId}`).expect(200)
  assert.equal(thread.body.messages.at(-1).body, 'Want to swap board ideas?')
  await curator.agent.post(`/api/messages/${conversationId}/read`).expect(204)
  const readInbox = await curator.agent.get('/api/messages').expect(200)
  assert.equal(readInbox.body.conversations.find((entry: { id: number }) => entry.id === conversationId).unread_count, 0)

  await curator.agent.post(`/api/messages/${conversationId}`).send({ body: 'Absolutely — send it over.' }).expect(201)
  const demoInbox = await demo.get('/api/messages').expect(200)
  assert.equal(demoInbox.body.conversations.find((entry: { id: number }) => entry.id === conversationId).unread_count, 1)
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
