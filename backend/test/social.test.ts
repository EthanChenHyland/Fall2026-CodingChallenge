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

async function makeCurator(name = 'Test Curator') {
  const agent = request.agent(app)
  const email = `curator-${randomUUID()}@example.test`
  const credential = `local-${randomUUID()}`
  const registered = await agent.post('/api/auth/register').send({ name, email, password: credential, ageConfirmed: true }).expect(201)
  return { agent, id: registered.body.user.id as number, email }
}

function fixtureImage(label: string) {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + randomUUID()
  return { id: 'fixture-' + slug, imageUrl: 'https://example.com/' + slug + '.jpg', pageUrl: 'https://example.com/' + slug, creator: 'Test fixture' }
}

test('following feed is driven by the social graph', async () => {
  const demo = request.agent(app)
  await demo.post('/api/auth/demo').expect(200)
  const curator = await makeCurator()
  const created = await curator.agent.post('/api/collections').send({ name: 'Public test board', description: 'A board for social feed coverage.' }).expect(201)
  const collectionId = created.body.collection.id as number
  const result = fixtureImage("Tokyo")
  await curator.agent.post(`/api/collections/${collectionId}/items`).send({ sourceId: result.id, imageUrl: result.imageUrl, sourcePage: result.pageUrl, sourceCreator: result.creator, title: "Feed test pin" }).expect(201)
  await curator.agent.post(`/api/collections/${collectionId}/share`).expect(200)

  await demo.post(`/api/profiles/${curator.id}/follow`).expect(204)
  const following = await demo.get('/api/explore?mode=following').expect(200)
  assert.ok(following.body.pins.some((pin: { owner_id: number }) => pin.owner_id === curator.id))
})

test('public collections can be followed independently and feed Following', async () => {
  const viewer = await makeCurator('Board Follower')
  const curator = await makeCurator('Board Owner')
  const created = await curator.agent.post('/api/collections').send({ name: 'Material walks', description: 'A board worth following.' }).expect(201)
  const collectionId = created.body.collection.id as number
  const result = fixtureImage("concrete")
  await curator.agent.post(`/api/collections/${collectionId}/items`).send({ sourceId: result.id, imageUrl: result.imageUrl, sourcePage: result.pageUrl, sourceCreator: result.creator, title: 'Board-follow test pin' }).expect(201)
  await curator.agent.post(`/api/collections/${collectionId}/share`).expect(200)

  const before = await viewer.agent.get('/api/explore?mode=following').expect(200)
  assert.ok(!before.body.pins.some((pin: { collection_id: number }) => pin.collection_id === collectionId))
  await viewer.agent.post(`/api/collections/${collectionId}/follow`).expect(204)

  const profile = await viewer.agent.get(`/api/profiles/${curator.id}`).expect(200)
  const board = profile.body.collections.find((collection: { id: number }) => collection.id === collectionId)
  assert.equal(board.follower_count, 1)
  assert.equal(Boolean(board.followed_by_me), true)

  const following = await viewer.agent.get('/api/explore?mode=following').expect(200)
  assert.ok(following.body.pins.some((pin: { collection_id: number }) => pin.collection_id === collectionId))
  await viewer.agent.delete(`/api/collections/${collectionId}/follow`).expect(204)
  const after = await viewer.agent.get('/api/explore?mode=following').expect(200)
  assert.ok(!after.body.pins.some((pin: { collection_id: number }) => pin.collection_id === collectionId))
})

test('Explore surfaces public collections as a separate discovery section', async () => {
  const viewer = await makeCurator('Collection Explorer')
  const curator = await makeCurator('Featured Board Owner')
  const created = await curator.agent.post('/api/collections').send({ name: 'Featured material board', description: 'A public board for Explore.' }).expect(201)
  const collectionId = created.body.collection.id as number
  const result = fixtureImage('featured material')
  await curator.agent.post(`/api/collections/${collectionId}/items`).send({ sourceId: result.id, imageUrl: result.imageUrl, sourcePage: result.pageUrl, sourceCreator: result.creator, title: 'Featured material pin' }).expect(201)
  await curator.agent.post(`/api/collections/${collectionId}/share`).expect(200)

  const response = await viewer.agent.get('/api/explore/collections').expect(200)
  const featured = response.body.collections.find((collection: { id: number }) => collection.id === collectionId)
  assert.ok(featured)
  assert.equal(featured.owner_name, 'Featured Board Owner')
  assert.equal(featured.item_count, 1)
  assert.ok(featured.share_token)
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

  const searchRecommended = await demo.get('/api/search/recommendations').expect(200)
  assert.ok(searchRecommended.body.suggestions.length > 0)
  assert.ok(searchRecommended.body.basedOn.length > 0)
  assert.ok(searchRecommended.body.pins.every((pin: { owner_name: string }) => pin.owner_name !== 'Demo Curator'))

  const materialSearch = await demo.get('/api/search/recommendations?q=material').expect(200)
  assert.ok(materialSearch.body.pins.length > 0)
  assert.ok(materialSearch.body.pins.every((pin: { title: string; tags: string; collection_name: string }) => `${pin.title} ${pin.tags} ${pin.collection_name}`.toLowerCase().includes('material')))
})

test('recommendation feedback persists and tunes Explore and search recommendations', async () => {
  const viewer = await makeCurator('Feedback Curator')
  const source = await makeCurator('Feedback Source')
  const board = await source.agent.post('/api/collections').send({ name: 'Blue concrete studies' }).expect(201)
  const boardId = board.body.collection.id as number
  const result = fixtureImage("blue concrete")
  const saved = await source.agent.post(`/api/collections/${boardId}/items`).send({
    sourceId: `feedback-${randomUUID()}`,
    imageUrl: result.imageUrl,
    sourcePage: result.pageUrl,
    sourceCreator: result.creator,
    title: 'Blue concrete wall',
    tags: ['blue', 'concrete'],
  }).expect(201)
  const pinId = saved.body.item.id as number
  await source.agent.post(`/api/collections/${boardId}/share`).expect(200)

  const tasteBoard = await viewer.agent.post('/api/collections').send({ name: 'Concrete references' }).expect(201)
  await viewer.agent.post(`/api/collections/${tasteBoard.body.collection.id}/items`).send({
    sourceId: `taste-${randomUUID()}`,
    imageUrl: result.imageUrl,
    sourcePage: result.pageUrl,
    sourceCreator: result.creator,
    title: 'Concrete study',
    tags: ['concrete'],
  }).expect(201)

  await viewer.agent.post(`/api/pins/${pinId}/recommendation-feedback`).send({ signal: 'more' }).expect(204)
  assert.equal((db.prepare('SELECT signal FROM recommendation_feedback WHERE user_id = ? AND item_id = ?').get(viewer.id, pinId) as { signal: string }).signal, 'more')
  const tunedSearch = await viewer.agent.get('/api/search/recommendations').expect(200)
  assert.ok(tunedSearch.body.basedOn.includes('blue') || tunedSearch.body.basedOn.includes('concrete'))

  await viewer.agent.post(`/api/pins/${pinId}/recommendation-feedback`).send({ signal: 'not_interested' }).expect(204)
  const explore = await viewer.agent.get('/api/explore/recommended').expect(200)
  const searchRecommendations = await viewer.agent.get('/api/search/recommendations').expect(200)
  assert.ok(!explore.body.pins.some((pin: { id: number }) => pin.id === pinId))
  assert.ok(!searchRecommendations.body.pins.some((pin: { id: number }) => pin.id === pinId))
})

test('recommendation feedback stops contributing after access is revoked', async () => {
  const viewer = await makeCurator('Revoked Recommendation Viewer')
  const source = await makeCurator('Revoked Recommendation Source')
  const board = await source.agent.post('/api/collections').send({ name: 'Public reference board' }).expect(201)
  const boardId = board.body.collection.id as number
  const saved = await source.agent.post(`/api/collections/${boardId}/items`).send({
    sourceId: `revoked-feedback-${randomUUID()}`,
    imageUrl: 'https://example.com/revoked-feedback.jpg',
    title: 'Shared reference',
    tags: ['shared'],
  }).expect(201)
  const pinId = saved.body.item.id as number
  await source.agent.post(`/api/collections/${boardId}/share`).expect(200)
  await viewer.agent.post(`/api/pins/${pinId}/recommendation-feedback`).send({ signal: 'more' }).expect(204)

  await source.agent.patch(`/api/collections/${boardId}`).send({ visibility: 'private', name: 'confidentialmerger board' }).expect(200)
  await source.agent.patch(`/api/collections/${boardId}/items/${pinId}`).send({ title: 'confidentialmerger title', tags: 'confidentialmerger' }).expect(200)
  await viewer.agent.get(`/api/pins/${pinId}`).expect(404)

  const search = await viewer.agent.get('/api/search/recommendations').expect(200)
  const explore = await viewer.agent.get('/api/explore/recommended').expect(200)
  assert.equal(JSON.stringify(search.body).includes('confidentialmerger'), false)
  assert.equal(JSON.stringify(explore.body).includes('confidentialmerger'), false)
})

test('notifications redact current collection metadata after access is revoked', async () => {
  const owner = await makeCurator('Notification Owner')
  const formerEditor = await makeCurator('Former Editor')
  const board = await owner.agent.post('/api/collections').send({ name: 'Visible before revocation' }).expect(201)
  const boardId = board.body.collection.id as number
  await owner.agent.post(`/api/collections/${boardId}/collaborators`).send({ email: formerEditor.email }).expect(201)
  await owner.agent.patch(`/api/collections/${boardId}`).send({ description: 'Creates a notification.' }).expect(200)
  await owner.agent.delete(`/api/collections/${boardId}/collaborators/${formerEditor.id}`).expect(204)
  await owner.agent.patch(`/api/collections/${boardId}`).send({ name: 'NEW SECRET AFTER REVOCATION' }).expect(200)

  const notifications = await formerEditor.agent.get('/api/notifications').expect(200)
  const prior = notifications.body.notifications.find((entry: { message: string }) => entry.message.includes('updated collection details'))
  assert.ok(prior)
  assert.equal(prior.collection_id, null)
  assert.equal(prior.collection_name, null)
  assert.equal(JSON.stringify(notifications.body).includes('NEW SECRET AFTER REVOCATION'), false)
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
  const result = fixtureImage("private")
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

test('repin provenance preserves lineage without exposing boards that become private', async () => {
  const sam = await makeCurator('Sam Lineage')
  const middle = await makeCurator('Middle Curator')
  const final = await makeCurator('Final Curator')
  const outsider = await makeCurator('Lineage Viewer')

  const sourceBoard = await sam.agent.post('/api/collections').send({ name: 'Material walks' }).expect(201)
  const sourceBoardId = sourceBoard.body.collection.id as number
  const result = fixtureImage("material")
  const sourcePin = await sam.agent.post(`/api/collections/${sourceBoardId}/items`).send({
    sourceId: `lineage-${randomUUID()}`,
    imageUrl: result.imageUrl,
    sourcePage: result.pageUrl,
    sourceCreator: result.creator,
    title: 'Lineage source pin',
  }).expect(201)
  const sourcePinId = sourcePin.body.item.id as number
  await sam.agent.post(`/api/collections/${sourceBoardId}/share`).expect(200)

  const middleBoard = await middle.agent.post('/api/collections').send({ name: 'Collected surfaces' }).expect(201)
  const middleBoardId = middleBoard.body.collection.id as number
  const middleSave = await middle.agent.post(`/api/pins/${sourcePinId}/save`).send({ collectionId: middleBoardId }).expect(201)
  const middlePinId = middleSave.body.item.id as number
  await middle.agent.post(`/api/collections/${middleBoardId}/share`).expect(200)

  const finalBoard = await final.agent.post('/api/collections').send({ name: 'Lobby references' }).expect(201)
  const finalBoardId = finalBoard.body.collection.id as number
  const finalSave = await final.agent.post(`/api/pins/${middlePinId}/save`).send({ collectionId: finalBoardId }).expect(201)
  const finalPinId = finalSave.body.item.id as number
  await final.agent.post(`/api/collections/${finalBoardId}/share`).expect(200)

  const full = await outsider.agent.get(`/api/pins/${finalPinId}`).expect(200)
  assert.deepEqual(full.body.pin.provenance.ancestors.map((entry: { pin_id: number; depth: number }) => [entry.pin_id, entry.depth]), [[middlePinId, 1], [sourcePinId, 2]])
  assert.equal(full.body.pin.provenance.ancestors[0].owner_name, 'Middle Curator')
  assert.equal(full.body.pin.provenance.ancestors[1].collection_name, 'Material walks')
  assert.equal(full.body.pin.provenance.hidden_count, 0)

  await middle.agent.patch(`/api/collections/${middleBoardId}`).send({ audience: 'private' }).expect(200)
  const privacySafe = await outsider.agent.get(`/api/pins/${finalPinId}`).expect(200)
  assert.deepEqual(privacySafe.body.pin.provenance.ancestors.map((entry: { pin_id: number; depth: number }) => [entry.pin_id, entry.depth]), [[sourcePinId, 2]])
  assert.equal(privacySafe.body.pin.provenance.hidden_count, 1)
  assert.equal(privacySafe.body.pin.provenance.total_depth, 2)
  assert.ok(!JSON.stringify(privacySafe.body.pin.provenance).includes('Collected surfaces'))

  const copyBoard = await final.agent.post('/api/collections').send({ name: 'Lineage copy' }).expect(201)
  const copyBoardId = copyBoard.body.collection.id as number
  const copied = await final.agent.post(`/api/collections/${finalBoardId}/items/bulk`).send({ action: 'copy', itemIds: [finalPinId], targetCollectionId: copyBoardId }).expect(200)
  const copiedPinId = copied.body.items[0].id as number
  const copiedDetail = await final.agent.get(`/api/pins/${copiedPinId}`).expect(200)
  assert.equal(copiedDetail.body.pin.provenance.total_depth, 2)

  await final.agent.delete(`/api/collections/${finalBoardId}/items/${finalPinId}`).expect(204)
  await final.agent.post(`/api/collections/${finalBoardId}/items/restore`).send({ itemId: finalPinId }).expect(201)
  const restored = await final.agent.get(`/api/pins/${finalPinId}`).expect(200)
  assert.equal(restored.body.pin.provenance.total_depth, 2)
})

test('public pins can be batch saved with duplicate and privacy safeguards', async () => {
  const curator = await makeCurator('Batch Curator')
  const explore = await curator.agent.get('/api/explore').expect(200)
  const publicPins = (explore.body.pins as Array<{ id: number; source_id: string }>).filter((pin, index, pins) => pins.findIndex((candidate) => candidate.source_id === pin.source_id) === index).slice(0, 2)
  assert.equal(publicPins.length, 2)

  const target = await curator.agent.post('/api/collections').send({ name: 'Batch saves' }).expect(201)
  const targetId = target.body.collection.id as number
  const firstBatch = await curator.agent.post('/api/pins/save-batch').send({ collectionId: targetId, pinIds: publicPins.map((pin) => pin.id) }).expect(200)
  assert.equal(firstBatch.body.savedCount, 2)
  assert.equal(firstBatch.body.skippedCount, 0)
  assert.deepEqual(new Set(firstBatch.body.items.map((item: { source_id: string }) => item.source_id)), new Set(publicPins.map((pin) => pin.source_id)))
  const batchDetail = await curator.agent.get(`/api/pins/${firstBatch.body.items[0].id}`).expect(200)
  assert.ok(batchDetail.body.pin.provenance.total_depth >= 1)
  assert.equal(batchDetail.body.pin.provenance.ancestors[0].pin_id, publicPins[0].id)

  const repeated = await curator.agent.post('/api/pins/save-batch').send({ collectionId: targetId, pinIds: publicPins.map((pin) => pin.id) }).expect(200)
  assert.equal(repeated.body.savedCount, 0)
  assert.deepEqual(new Set(repeated.body.skippedDuplicateIds), new Set(publicPins.map((pin) => pin.id)))
  assert.equal((await curator.agent.get(`/api/collections/${targetId}`).expect(200)).body.collection.items.length, 2)

  const privateBoard = await curator.agent.post('/api/collections').send({ name: 'Batch private source' }).expect(201)
  const result = fixtureImage("private")
  const privatePin = await curator.agent.post(`/api/collections/${privateBoard.body.collection.id}/items`).send({
    sourceId: `batch-private-${randomUUID()}`,
    imageUrl: result.imageUrl,
    sourcePage: result.pageUrl,
    sourceCreator: result.creator,
    title: 'Private batch pin',
  }).expect(201)
  const safeTarget = await curator.agent.post('/api/collections').send({ name: 'Batch privacy target' }).expect(201)
  const mixedBatch = await curator.agent.post('/api/pins/save-batch').send({ collectionId: safeTarget.body.collection.id, pinIds: [publicPins[0].id, privatePin.body.item.id] }).expect(200)
  assert.equal(mixedBatch.body.savedCount, 1)
  assert.deepEqual(mixedBatch.body.unavailableIds, [privatePin.body.item.id])
  assert.equal(mixedBatch.body.items[0].source_id, publicPins[0].source_id)
})

test('collection sections organize pins and bulk copy preserves the source board', async () => {
  const curator = await makeCurator()
  const source = await curator.agent.post('/api/collections').send({ name: 'Section source' }).expect(201)
  const target = await curator.agent.post('/api/collections').send({ name: 'Section target' }).expect(201)
  const sourceId = source.body.collection.id as number
  const targetId = target.body.collection.id as number
  const result = fixtureImage("materials")
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

test('pin messages support optional notes while rejecting unavailable attachments', async () => {
  const demo = request.agent(app)
  await demo.post('/api/auth/demo').expect(200)
  const recipient = await makeCurator('Pin Message Recipient')
  const conversation = await demo.post(`/api/messages/with/${recipient.id}`).expect(200)
  const conversationId = conversation.body.conversationId as number

  const explore = await recipient.agent.get('/api/explore').expect(200)
  const publicPin = explore.body.pins.find((pin: { owner_name: string }) => pin.owner_name === 'Demo Curator') as { id: number; title: string }
  assert.ok(publicPin)

  const custom = await demo.post(`/api/messages/${conversationId}`).send({ body: 'This texture feels like your board.', pinId: publicPin.id }).expect(201)
  assert.equal(custom.body.message.body, 'This texture feels like your board.')
  assert.equal(custom.body.message.pin_id, publicPin.id)
  assert.equal(custom.body.message.pin_title, publicPin.title)

  const pinOnly = await demo.post(`/api/messages/${conversationId}`).send({ body: '', pinId: publicPin.id }).expect(201)
  assert.equal(pinOnly.body.message.body, '')
  assert.equal(pinOnly.body.message.pin_id, publicPin.id)
  const pinOnlyInbox = await recipient.agent.get('/api/messages').expect(200)
  assert.equal(pinOnlyInbox.body.conversations.find((entry: { id: number }) => entry.id === conversationId).last_message, 'Sent a pin')
  await demo.post(`/api/messages/${conversationId}`).send({ body: '' }).expect(400)

  const privateCollection = await demo.post('/api/collections').send({ name: 'Private DM source' }).expect(201)
  const privatePin = await demo.post(`/api/collections/${privateCollection.body.collection.id}/items`).send({
    sourceId: `private-dm-${randomUUID()}`,
    imageUrl: 'https://example.com/private-dm.jpg',
    sourcePage: 'https://example.com/private-dm',
    sourceCreator: 'Test',
    title: 'Private attachment',
  }).expect(201)
  await demo.post(`/api/messages/${conversationId}`).send({ body: 'Should fail', pinId: privatePin.body.item.id }).expect(400)
  await demo.post(`/api/messages/${conversationId}`).send({ body: 'Should fail', pinId: 999999999 }).expect(400)

  const thread = await recipient.agent.get(`/api/messages/${conversationId}`).expect(200)
  assert.ok(thread.body.messages.some((message: { body: string; pin_id: number }) => message.body === 'This texture feels like your board.' && message.pin_id === publicPin.id))
  assert.ok(thread.body.messages.some((message: { body: string; pin_id: number }) => message.body === '' && message.pin_id === publicPin.id))

  const privacyBoard = await demo.post('/api/collections').send({ name: `DM privacy ${randomUUID()}` }).expect(201)
  const privacyPin = await demo.post(`/api/collections/${privacyBoard.body.collection.id}/items`).send({
    sourceId: `dm-privacy-${randomUUID()}`,
    imageUrl: 'https://example.com/dm-privacy.jpg',
    sourcePage: 'https://example.com/dm-privacy',
    sourceCreator: 'Test',
    title: 'Temporary public attachment',
  }).expect(201)
  await demo.post(`/api/collections/${privacyBoard.body.collection.id}/share`).expect(200)
  const sent = await demo.post(`/api/messages/${conversationId}`).send({ body: 'Visible while public', pinId: privacyPin.body.item.id }).expect(201)
  assert.equal(sent.body.message.pin_title, 'Temporary public attachment')
  await demo.patch(`/api/collections/${privacyBoard.body.collection.id}`).send({ audience: 'private' }).expect(200)

  await recipient.agent.get(`/api/pins/${privacyPin.body.item.id}`).expect(404)
  const privateThread = await recipient.agent.get(`/api/messages/${conversationId}`).expect(200)
  const hiddenAttachment = privateThread.body.messages.find((message: { pin_id: number }) => message.pin_id === privacyPin.body.item.id)
  assert.ok(hiddenAttachment)
  assert.equal(hiddenAttachment.pin_title, null)
  assert.equal(hiddenAttachment.pin_image_url, null)
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

test('comment replies stay threaded and notify reply and mention targets', async () => {
  const demo = request.agent(app)
  await demo.post('/api/auth/demo').expect(200)
  const target = await makeCurator('Thread Target')
  const mentioned = await makeCurator('Mention Friend')
  const explore = await target.agent.get('/api/explore').expect(200)
  const pinId = explore.body.pins.find((pin: { owner_name: string }) => pin.owner_name === 'Demo Curator').id as number

  const root = await target.agent.post(`/api/pins/${pinId}/comments`).send({ body: 'Thread starter' }).expect(201)
  const rootId = root.body.comment.id as number
  const reply = await demo.post(`/api/pins/${pinId}/comments`).send({ body: '@Mention Friend good thought.', parentId: rootId }).expect(201)
  const replyId = reply.body.comment.id as number
  assert.equal(reply.body.comment.parent_id, rootId)

  const nested = await mentioned.agent.post(`/api/pins/${pinId}/comments`).send({ body: 'Adding one more thought.', parentId: replyId }).expect(201)
  assert.equal(nested.body.comment.parent_id, rootId)

  const thread = await demo.get(`/api/pins/${pinId}/comments`).expect(200)
  assert.equal(thread.body.comments.find((entry: { id: number }) => entry.id === replyId).parent_id, rootId)

  const targetNotifications = await target.agent.get('/api/notifications').expect(200)
  assert.ok(targetNotifications.body.notifications.some((entry: { message: string }) => entry.message === 'Demo Curator replied to your comment'))
  const mentionNotifications = await mentioned.agent.get('/api/notifications').expect(200)
  assert.ok(mentionNotifications.body.notifications.some((entry: { message: string }) => entry.message === 'Demo Curator mentioned you in a comment'))

  await demo.delete(`/api/pins/${pinId}/comments/${rootId}`).expect(204)
  const afterDelete = await demo.get(`/api/pins/${pinId}/comments`).expect(200)
  assert.equal(afterDelete.body.comments.find((entry: { id: number }) => entry.id === replyId).parent_id, null)
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

test('public content reports are stored once per reporter and target', async () => {
  const owner = await makeCurator('Report Source')
  const reporter = await makeCurator('Report Reviewer')
  const board = await owner.agent.post('/api/collections').send({ name: 'Reportable board' }).expect(201)
  const boardId = board.body.collection.id as number
  const saved = await owner.agent.post(`/api/collections/${boardId}/items`).send({
    sourceId: `report-${randomUUID()}`,
    imageUrl: 'https://example.com/reportable.jpg',
    sourcePage: 'https://example.com/reportable',
    sourceCreator: 'Test',
    title: 'Reportable public pin',
  }).expect(201)
  const pinId = saved.body.item.id as number
  await owner.agent.post(`/api/collections/${boardId}/share`).expect(200)

  const created = await reporter.agent.post('/api/reports').send({
    targetType: 'pin',
    targetId: pinId,
    reason: 'spam',
    details: 'Duplicate promotional content.',
  }).expect(201)
  assert.ok(Number.isSafeInteger(created.body.report.id))

  const row = db.prepare('SELECT reporter_id, target_type, target_id, reason, details, status FROM reports WHERE id = ?').get(created.body.report.id) as {
    reporter_id: number
    target_type: string
    target_id: number
    reason: string
    details: string
    status: string
  }
  assert.equal(row.reporter_id, reporter.id)
  assert.equal(row.target_type, 'pin')
  assert.equal(row.target_id, pinId)
  assert.equal(row.reason, 'spam')
  assert.equal(row.details, 'Duplicate promotional content.')
  assert.equal(row.status, 'open')

  await reporter.agent.post('/api/reports').send({
    targetType: 'pin',
    targetId: pinId,
    reason: 'other',
  }).expect(409)
})

test('public collection copies preserve organization, cover, and provenance while staying private', async () => {
  const owner = await makeCurator('Copy Source')
  const copier = await makeCurator('Copy Reviewer')
  const board = await owner.agent.post('/api/collections').send({ name: 'Copy source board', description: 'A public reference set.' }).expect(201)
  const boardId = board.body.collection.id as number
  const section = await owner.agent.post(`/api/collections/${boardId}/sections`).send({ name: 'Materials' }).expect(201)
  const sectionId = section.body.section.id as number
  const saved = await owner.agent.post(`/api/collections/${boardId}/items`).send({
    sourceId: `clone-${randomUUID()}`,
    imageUrl: 'https://example.com/clone-source.jpg',
    sourcePage: 'https://example.com/clone-source',
    sourceCreator: 'Test',
    title: 'Clone source pin',
    note: 'Keep the note.',
    tags: ['material', 'reference'],
  }).expect(201)
  const sourcePinId = saved.body.item.id as number
  await owner.agent.post(`/api/collections/${boardId}/items/bulk`).send({ action: 'section', itemIds: [sourcePinId], sectionId }).expect(200)
  await owner.agent.patch(`/api/collections/${boardId}/items/${sourcePinId}`).send({ canvasX: 321, canvasY: 222, rotation: 3 }).expect(200)
  await owner.agent.patch(`/api/collections/${boardId}`).send({ coverItemId: sourcePinId, coverFocusX: 37, coverFocusY: 64, theme: 'clay', gridLayout: 'compact' }).expect(200)
  await owner.agent.post(`/api/collections/${boardId}/share`).expect(200)

  const cloned = await copier.agent.post(`/api/collections/${boardId}/clone`).expect(201)
  const copy = cloned.body.collection
  assert.notEqual(copy.id, boardId)
  assert.equal(copy.name, 'Copy source board — copy')
  assert.equal(copy.description, 'A public reference set.')
  assert.equal(copy.visibility, 'private')
  assert.equal(copy.audience, 'private')
  assert.equal(copy.share_token, null)
  assert.equal(copy.theme, 'clay')
  assert.equal(copy.grid_layout, 'compact')
  assert.equal(copy.cover_focus_x, 37)
  assert.equal(copy.cover_focus_y, 64)
  assert.equal(copy.sections.length, 1)
  assert.equal(copy.sections[0].name, 'Materials')
  assert.equal(copy.items.length, 1)
  assert.equal(copy.items[0].section_id, copy.sections[0].id)
  assert.equal(copy.items[0].note, 'Keep the note.')
  assert.equal(copy.items[0].tags, 'material, reference')
  assert.equal(copy.items[0].canvas_x, 321)
  assert.equal(copy.items[0].canvas_y, 222)
  assert.equal(copy.items[0].rotation, 3)
  assert.equal(copy.cover_item_id, copy.items[0].id)

  const detail = await copier.agent.get(`/api/pins/${copy.items[0].id}`).expect(200)
  assert.equal(detail.body.pin.provenance.ancestors[0].pin_id, sourcePinId)

  const analytics = await owner.agent.get(`/api/collections/${boardId}/share-analytics`).expect(200)
  assert.equal(analytics.body.analytics.clones, 1)
})

test('share analytics count views and unique visitors without counting the owner', async () => {
  const owner = await makeCurator('Analytics Owner')
  const board = await owner.agent.post('/api/collections').send({ name: 'Analytics board' }).expect(201)
  const boardId = board.body.collection.id as number
  const shared = await owner.agent.post(`/api/collections/${boardId}/share`).expect(200)
  const token = shared.body.token as string

  const firstVisitor = request.agent(app)
  const secondVisitor = request.agent(app)
  await firstVisitor.get(`/api/shared/${token}`).expect(200)
  await firstVisitor.get(`/api/shared/${token}`).expect(200)
  await secondVisitor.get(`/api/shared/${token}`).expect(200)
  await owner.agent.get(`/api/shared/${token}`).expect(200)

  const analytics = await owner.agent.get(`/api/collections/${boardId}/share-analytics`).expect(200)
  assert.equal(analytics.body.analytics.views, 3)
  assert.equal(analytics.body.analytics.uniqueVisitors, 2)
  assert.equal(analytics.body.analytics.clones, 0)
})
