import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import request from 'supertest'

const databasePath = resolve(tmpdir(), `mosaic-${randomUUID()}.sqlite`)
process.env.DATABASE_PATH = databasePath

const { app } = await import('../src/app.js')
const { db } = await import('../src/db.js')

test.after(() => {
  db.close()
  for (const suffix of ['', '-shm', '-wal']) rmSync(`${databasePath}${suffix}`, { force: true })
})

test('owner can add an editor while editor permissions stay scoped', async () => {
  const owner = request.agent(app)
  const editor = request.agent(app)

  assert.equal((await owner.post('/api/auth/demo')).status, 200)
  const created = await owner.post('/api/collections').send({ name: 'Collaboration test board' }).expect(201)
  const collectionId = created.body.collection.id as number

  await owner
    .post(`/api/collections/${collectionId}/collaborators`)
    .send({ email: 'sam@mosaic.local' })
    .expect(201)

  await editor
    .post('/api/auth/login')
    .send({ email: 'sam@mosaic.local', password: 'demo1234' })
    .expect(200)

  const editorCollections = await editor.get('/api/collections').expect(200)
  const shared = editorCollections.body.collections.find((collection: { id: number }) => collection.id === collectionId)
  assert.equal(shared.role, 'editor')

  const search = await editor.get('/api/search').expect(200)
  const image = search.body.results[0]
  await editor
    .post(`/api/collections/${collectionId}/items`)
    .send({
      sourceId: image.id,
      imageUrl: image.imageUrl,
      sourcePage: image.pageUrl,
      sourceCreator: image.creator,
      title: 'Shared save',
    })
    .expect(201)

  const ownerOnlyShare = await editor.post(`/api/collections/${collectionId}/share`)
  assert.equal(ownerOnlyShare.status, 403)

  const notifications = await owner.get('/api/notifications').expect(200)
  assert.ok(notifications.body.notifications.some((notification: { message: string }) => notification.message.includes('Shared save')))
})

test('public share tokens are read-only and revocable', async () => {
  const owner = request.agent(app)
  await owner.post('/api/auth/demo').expect(200)
  const collections = await owner.get('/api/collections').expect(200)
  const collectionId = collections.body.collections[0].id as number

  const shared = await owner.post(`/api/collections/${collectionId}/share`).expect(200)
  const token = shared.body.token as string
  await request(app).get(`/api/shared/${token}`).expect(200)

  await owner.delete(`/api/collections/${collectionId}/share`).expect(204)
  await request(app).get(`/api/shared/${token}`).expect(404)
})

test('collection covers can use a saved item and custom focus', async () => {
  const owner = request.agent(app)
  await owner.post('/api/auth/demo').expect(200)
  const created = await owner.post('/api/collections').send({ name: 'Cover test board' }).expect(201)
  const collectionId = created.body.collection.id as number
  const search = await owner.get('/api/search').expect(200)
  const image = search.body.results[0]
  const saved = await owner
    .post(`/api/collections/${collectionId}/items`)
    .send({
      sourceId: image.id,
      imageUrl: image.imageUrl,
      sourcePage: image.pageUrl,
      sourceCreator: image.creator,
      title: image.title,
    })
    .expect(201)

  const itemId = saved.body.item.id as number
  const updated = await owner
    .patch(`/api/collections/${collectionId}`)
    .send({ coverItemId: itemId, coverFocusX: 35, coverFocusY: 68 })
    .expect(200)

  assert.equal(updated.body.collection.cover_item_id, itemId)
  assert.equal(updated.body.collection.cover_focus_x, 35)
  assert.equal(updated.body.collection.cover_focus_y, 68)
  assert.equal(updated.body.collection.cover_url, image.imageUrl)
  assert.deepEqual(updated.body.collection.cover_urls, [image.imageUrl])
})

test('organization tools persist tags, board style, smart views, bulk moves, and restore', async () => {
  const owner = request.agent(app)
  await owner.post('/api/auth/demo').expect(200)
  const source = await owner.post('/api/collections').send({ name: 'Organization source' }).expect(201)
  const target = await owner.post('/api/collections').send({ name: 'Organization target' }).expect(201)
  const sourceId = source.body.collection.id as number
  const targetId = target.body.collection.id as number

  const first = await owner.post(`/api/collections/${sourceId}/items`).send({
    sourceId: `org-${randomUUID()}`,
    imageUrl: 'https://example.com/one.jpg',
    sourcePage: 'https://example.com/one',
    sourceCreator: 'Test',
    title: 'Tagged reference',
    tags: ['architecture', 'blue'],
  }).expect(201)
  const second = await owner.post(`/api/collections/${sourceId}/items`).send({
    sourceId: `org-${randomUUID()}`,
    imageUrl: 'https://example.com/two.jpg',
    sourcePage: 'https://example.com/two',
    sourceCreator: 'Test',
    title: 'Loose reference',
  }).expect(201)

  const styled = await owner.patch(`/api/collections/${sourceId}`).send({ theme: 'sage', gridLayout: 'compact' }).expect(200)
  assert.equal(styled.body.collection.theme, 'sage')
  assert.equal(styled.body.collection.grid_layout, 'compact')
  assert.equal(styled.body.collection.items.find((item: { id: number }) => item.id === first.body.item.id).tags, 'architecture, blue')

  const unsorted = await owner.get('/api/collections/smart/unsorted').expect(200)
  assert.ok(unsorted.body.items.some((item: { id: number }) => item.id === second.body.item.id))

  await owner.post(`/api/collections/${sourceId}/items/bulk`).send({ action: 'move', itemIds: [first.body.item.id], targetCollectionId: targetId }).expect(200)
  const moved = await owner.get(`/api/collections/${targetId}`).expect(200)
  assert.ok(moved.body.collection.items.some((item: { id: number }) => item.id === first.body.item.id))

  const deleted = await owner.post(`/api/collections/${sourceId}/items/bulk`).send({ action: 'delete', itemIds: [second.body.item.id] }).expect(200)
  const removed = deleted.body.items[0]
  await owner.post(`/api/collections/${sourceId}/items/restore`).send({
    sourceId: removed.source_id,
    imageUrl: removed.image_url,
    sourcePage: removed.source_page,
    sourceCreator: removed.source_creator,
    title: removed.title,
    note: removed.note,
    tags: removed.tags,
    canvasX: removed.canvas_x,
    canvasY: removed.canvas_y,
    rotation: removed.rotation,
  }).expect(201)
})
