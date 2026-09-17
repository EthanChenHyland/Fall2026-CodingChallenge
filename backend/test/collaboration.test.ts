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
