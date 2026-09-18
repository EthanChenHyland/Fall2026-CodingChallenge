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

test('editor invite links require owner control and grant editor access only while active', async () => {
  const owner = request.agent(app)
  const existingEditor = request.agent(app)
  const invited = request.agent(app)
  const revokedTarget = request.agent(app)
  await owner.post('/api/auth/demo').expect(200)
  const created = await owner.post('/api/collections').send({ name: 'Invite link board' }).expect(201)
  const collectionId = created.body.collection.id as number

  await owner.post(`/api/collections/${collectionId}/collaborators`).send({ email: 'sam@mosaic.local' }).expect(201)
  await existingEditor.post('/api/auth/login').send({ email: 'sam@mosaic.local', password: 'demo1234' }).expect(200)
  await existingEditor.post(`/api/collections/${collectionId}/editor-invite`).expect(403)
  await existingEditor.delete(`/api/collections/${collectionId}/editor-invite`).expect(403)

  const generated = await owner.post(`/api/collections/${collectionId}/editor-invite`).expect(201)
  const token = generated.body.invite.token as string
  assert.ok(token.length >= 40)
  const status = await owner.get(`/api/collections/${collectionId}/editor-invite`).expect(200)
  assert.equal(status.body.invite.token, token)
  await request(app).get(`/api/collections/editor-invites/${token}`).expect(401)
  await request(app).post(`/api/collections/editor-invites/${token}/accept`).expect(401)

  const invitedEmail = `invite-${randomUUID()}@mosaic.local`
  await invited.post('/api/auth/register').send({ name: 'Invite Tester', email: invitedEmail, password: 'demo1234' }).expect(201)
  const preview = await invited.get(`/api/collections/editor-invites/${token}`).expect(200)
  assert.equal(preview.body.invite.collectionId, collectionId)
  assert.equal(preview.body.invite.collectionName, 'Invite link board')
  assert.equal(preview.body.invite.alreadyMember, false)
  const accepted = await invited.post(`/api/collections/editor-invites/${token}/accept`).expect(200)
  assert.equal(accepted.body.collection.role, 'editor')
  assert.equal(accepted.body.alreadyMember, false)
  const repeated = await invited.post(`/api/collections/editor-invites/${token}/accept`).expect(200)
  assert.equal(repeated.body.alreadyMember, true)
  assert.equal((await invited.get(`/api/collections/editor-invites/${token}`).expect(200)).body.invite.alreadyMember, true)
  await invited.delete(`/api/collections/${collectionId}/collaborators/me`).expect(204)
  await invited.get(`/api/collections/${collectionId}`).expect(404)
  await owner.delete(`/api/collections/${collectionId}/collaborators/me`).expect(400)
  const rejoined = await invited.post(`/api/collections/editor-invites/${token}/accept`).expect(200)
  assert.equal(rejoined.body.alreadyMember, false)
  const invitedId = (db.prepare('SELECT id FROM users WHERE email = ?').get(invitedEmail) as { id: number }).id
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM collection_members WHERE collection_id = ? AND user_id = ?').get(collectionId, invitedId) as { count: number }).count, 1)

  const ownerAccepted = await owner.post(`/api/collections/editor-invites/${token}/accept`).expect(200)
  assert.equal(ownerAccepted.body.collection.role, 'owner')
  assert.equal(ownerAccepted.body.alreadyMember, true)

  await owner.delete(`/api/collections/${collectionId}/editor-invite`).expect(204)
  assert.equal((await owner.get(`/api/collections/${collectionId}/editor-invite`).expect(200)).body.invite, null)
  await revokedTarget.post('/api/auth/register').send({ name: 'Revoked Tester', email: `revoked-${randomUUID()}@mosaic.local`, password: 'demo1234' }).expect(201)
  await revokedTarget.get(`/api/collections/editor-invites/${token}`).expect(404)
  await revokedTarget.post(`/api/collections/editor-invites/${token}/accept`).expect(404)
})

test('collaborator membership changes roll back with activity failures', async () => {
  const owner = request.agent(app)
  await owner.post('/api/auth/demo').expect(200)
  const created = await owner.post('/api/collections').send({ name: 'Atomic collaboration board' }).expect(201)
  const collectionId = created.body.collection.id as number
  const sam = db.prepare("SELECT id FROM users WHERE email = 'sam@mosaic.local'").get() as { id: number }

  db.exec(`CREATE TRIGGER fail_test_collaborator_add BEFORE INSERT ON activity
    WHEN NEW.message LIKE '%added Sam Rivera as an editor'
    BEGIN SELECT RAISE(ABORT, 'test collaborator add failure'); END`)
  await owner.post(`/api/collections/${collectionId}/collaborators`).send({ email: 'sam@mosaic.local' }).expect(500)
  assert.equal(db.prepare('SELECT 1 FROM collection_members WHERE collection_id = ? AND user_id = ?').get(collectionId, sam.id), undefined)
  db.exec('DROP TRIGGER fail_test_collaborator_add')
  await owner.post(`/api/collections/${collectionId}/collaborators`).send({ email: 'sam@mosaic.local' }).expect(201)

  db.exec(`CREATE TRIGGER fail_test_collaborator_remove BEFORE INSERT ON activity
    WHEN NEW.message LIKE '%removed Sam Rivera from collaborators'
    BEGIN SELECT RAISE(ABORT, 'test collaborator remove failure'); END`)
  await owner.delete(`/api/collections/${collectionId}/collaborators/${sam.id}`).expect(500)
  assert.ok(db.prepare('SELECT 1 FROM collection_members WHERE collection_id = ? AND user_id = ?').get(collectionId, sam.id))
  db.exec('DROP TRIGGER fail_test_collaborator_remove')
  await owner.delete(`/api/collections/${collectionId}/collaborators/${sam.id}`).expect(204)
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

test('collection export and import preserve organization and layout while importing privately', async () => {
  const owner = request.agent(app)
  await owner.post('/api/auth/demo').expect(200)
  const created = await owner.post('/api/collections').send({ name: 'Portable board', description: 'Export me.' }).expect(201)
  const collectionId = created.body.collection.id as number
  const search = await owner.get('/api/search').expect(200)
  const image = search.body.results[1]
  const saved = await owner.post(`/api/collections/${collectionId}/items`).send({
    sourceId: `portable-${randomUUID()}`,
    imageUrl: image.imageUrl,
    sourcePage: image.pageUrl,
    sourceCreator: image.creator,
    title: 'Portable pin',
    note: 'Keep this note.',
    tags: ['texture', 'reference'],
  }).expect(201)
  const itemId = saved.body.item.id as number
  const section = await owner.post(`/api/collections/${collectionId}/sections`).send({ name: 'Materials' }).expect(201)
  const sectionId = section.body.section.id as number
  await owner.post(`/api/collections/${collectionId}/items/bulk`).send({ action: 'section', itemIds: [itemId], sectionId }).expect(200)
  await owner.patch(`/api/collections/${collectionId}/items/${itemId}`).send({ canvasX: 412, canvasY: 288, rotation: 4 }).expect(200)
  await owner.patch(`/api/collections/${collectionId}`).send({ coverItemId: itemId, coverFocusX: 31, coverFocusY: 72, theme: 'sage', gridLayout: 'masonry' }).expect(200)

  const exported = await owner.get(`/api/collections/${collectionId}/export`).expect(200)
  assert.equal(exported.body.format, 'mosaic.collection')
  assert.equal(exported.body.version, 1)
  assert.equal(exported.body.sections[0].name, 'Materials')
  assert.equal(exported.body.items[0].sectionKey, exported.body.sections[0].key)

  const imported = await owner.post('/api/collections/import').send(exported.body).expect(201)
  const importedCollection = imported.body.collection
  assert.notEqual(importedCollection.id, collectionId)
  assert.equal(importedCollection.name, 'Portable board')
  assert.equal(importedCollection.visibility, 'private')
  assert.equal(importedCollection.audience, 'private')
  assert.equal(importedCollection.share_token, null)
  assert.equal(importedCollection.theme, 'sage')
  assert.equal(importedCollection.grid_layout, 'masonry')
  assert.equal(importedCollection.sections[0].name, 'Materials')
  assert.equal(importedCollection.items[0].section_id, importedCollection.sections[0].id)
  assert.equal(importedCollection.items[0].note, 'Keep this note.')
  assert.equal(importedCollection.items[0].tags, 'texture, reference')
  assert.equal(importedCollection.items[0].canvas_x, 412)
  assert.equal(importedCollection.items[0].canvas_y, 288)
  assert.equal(importedCollection.items[0].rotation, 4)
  assert.equal(importedCollection.cover_item_id, importedCollection.items[0].id)
  assert.equal(importedCollection.collaborators.length, 1)
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
    itemId: removed.id,
  }).expect(201)
})
