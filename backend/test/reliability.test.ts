import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import test from 'node:test'
import request from 'supertest'

const databasePath = resolve(tmpdir(), `mosaic-reliability-${randomUUID()}.sqlite`)
process.env.DATABASE_PATH = databasePath
const { app } = await import('../src/app.js')
const { db } = await import('../src/db.js')
test.after(() => {
  db.close()
  for (const suffix of ['', '-wal', '-shm']) rmSync(databasePath + suffix, { force: true })
})
const image = { sourceId: 'reliability-image', imageUrl: 'https://example.com/image.jpg', title: 'Reference' }
async function board() {
  const owner = request.agent(app)
  await owner.post('/api/auth/demo').expect(200)
  const created = await owner.post('/api/collections').send({ name: 'Reliability board' }).expect(201)
  return { owner, id: created.body.collection.id as number }
}

test('URL schemes, malformed cookies, pagination and JSON are handled safely', async () => {
  const { owner, id } = await board()
  for (const url of ['javascript:alert(1)', 'data:text/html,hi', 'file:///tmp/a', 'http://example.com/image.jpg']) {
    await owner.post(`/api/collections/${id}/items`).send({ ...image, imageUrl: url }).expect(400)
  }
  await owner.post(`/api/collections/${id}/items`).send({ ...image, sourcePage: 'javascript:alert(1)' }).expect(400)
  await owner.patch('/api/profiles/me').send({ avatarUrl: 'javascript:alert(1)' }).expect(400)
  await request(app).get('/api/health').set('Cookie', 'mosaic_session=%E0%A4%A').expect(200)
  await request(app).get('/api/explore?page=1.5').expect(400)
  await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{').expect(400)
})

test('browser security headers block common XSS escalation paths', async () => {
  const response = await request(app).get('/api/health').expect(200)
  const csp = String(response.headers['content-security-policy'] ?? '')
  assert.match(csp, /script-src 'self'/)
  assert.match(csp, /object-src 'none'/)
  assert.match(csp, /base-uri 'none'/)
  assert.match(csp, /frame-ancestors 'none'/)
  assert.match(csp, /form-action 'self'/)
  assert.equal(response.headers['x-content-type-options'], 'nosniff')
  assert.equal(response.headers['x-frame-options'], 'DENY')
  assert.equal(response.headers['permissions-policy'], 'camera=(), microphone=(), geolocation=()')
})

test('registration rolls back if a session cannot be created', async () => {
  const email = `atomic-register-${randomUUID()}@example.test`
  db.exec(`CREATE TRIGGER fail_test_registration_session BEFORE INSERT ON sessions
    WHEN EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id AND email = '${email}')
    BEGIN SELECT RAISE(ABORT, 'test session failure'); END`)
  await request(app).post('/api/auth/register').send({ name: 'Atomic Register', email, password: 'atomic-password' }).expect(500)
  assert.equal(db.prepare('SELECT 1 FROM users WHERE email = ?').get(email), undefined)
  db.exec('DROP TRIGGER fail_test_registration_session')
  await request(app).post('/api/auth/register').send({ name: 'Atomic Register', email, password: 'atomic-password' }).expect(201)
})

test('account deletion requires reauthentication, deletes owned collections, and preserves collaborator-owned collections', async () => {
  const owner = request.agent(app)
  const editor = request.agent(app)
  const ownerEmail = `delete-owner-${randomUUID()}@example.test`
  const editorEmail = `delete-editor-${randomUUID()}@example.test`
  const password = 'delete-me-1234'
  const ownerRegistered = await owner.post('/api/auth/register').send({ name: 'Delete Owner', email: ownerEmail, password }).expect(201)
  const editorRegistered = await editor.post('/api/auth/register').send({ name: 'Delete Editor', email: editorEmail, password }).expect(201)
  const owned = await owner.post('/api/collections').send({ name: 'Delete with owner' }).expect(201)
  const kept = await editor.post('/api/collections').send({ name: 'Keep after collaborator deletion' }).expect(201)
  await editor.post(`/api/collections/${kept.body.collection.id}/collaborators`).send({ email: ownerEmail }).expect(201)

  await owner.delete('/api/auth/account').send({ password: 'wrong-password', confirmation: 'DELETE' }).expect(403)
  await owner.get('/api/auth/me').expect(200)
  await owner.delete('/api/auth/account').send({ password, confirmation: 'delete' }).expect(400)
  await owner.delete('/api/auth/account').send({ password, confirmation: 'DELETE' }).expect(204)

  await owner.get('/api/auth/me').expect(401)
  assert.equal(db.prepare('SELECT 1 FROM users WHERE id = ?').get(ownerRegistered.body.user.id), undefined)
  assert.equal(db.prepare('SELECT 1 FROM collections WHERE id = ?').get(owned.body.collection.id), undefined)
  assert.ok(db.prepare('SELECT 1 FROM collections WHERE id = ?').get(kept.body.collection.id))
  assert.ok(db.prepare('SELECT 1 FROM users WHERE id = ?').get(editorRegistered.body.user.id))

  const demo = request.agent(app)
  await demo.post('/api/auth/demo').expect(200)
  await demo.delete('/api/auth/account').send({ password: 'demo1234', confirmation: 'DELETE' }).expect(403)
  await demo.get('/api/auth/me').expect(200)
})

test('note save is atomic and publication through PATCH creates and revokes links', async () => {
  const { owner, id } = await board()
  await owner.post(`/api/collections/${id}/items`).send({ ...image, note: 'x'.repeat(501) }).expect(400)
  assert.equal((await owner.get(`/api/collections/${id}`)).body.collection.items.length, 0)
  const saved = await owner.post(`/api/collections/${id}/items`).send({ ...image, note: 'A complete save' }).expect(201)
  assert.equal(saved.body.item.note, 'A complete save')
  const published = await owner.patch(`/api/collections/${id}`).send({ visibility: 'public' }).expect(200)
  const token = published.body.collection.share_token
  assert.ok(token)
  const shared = await request(app).get(`/api/shared/${token}`).expect(200)
  assert.equal(shared.body.collection.collaborators, undefined)
  await owner.patch(`/api/collections/${id}`).send({ visibility: 'private' }).expect(200)
  await request(app).get(`/api/shared/${token}`).expect(404)
  await request(app).get(`/api/pins/${saved.body.item.id}`).expect(404)
  const republished = await owner.patch(`/api/collections/${id}`).send({ visibility: 'public' }).expect(200)
  assert.notEqual(republished.body.collection.share_token, token)
})

test('layout is atomic and rejects pins from another collection', async () => {
  const { owner, id } = await board()
  const saved = await owner.post(`/api/collections/${id}/items`).send(image).expect(201)
  const item = saved.body.item
  await owner.patch(`/api/collections/${id}/layout`).send({ positions: [
    { itemId: item.id, x: 222, y: 333, rotation: 2 }, { itemId: 999999, x: 1, y: 1, rotation: 0 },
  ] }).expect(404)
  assert.equal((await owner.get(`/api/collections/${id}`)).body.collection.items[0].canvas_x, item.canvas_x)
  await owner.patch(`/api/collections/${id}/layout`).send({ positions: [{ itemId: item.id, x: 222, y: 333, rotation: 2 }] }).expect(204)
  assert.equal((await owner.get(`/api/collections/${id}`)).body.collection.items[0].canvas_x, 222)
})

test('database constraints enforce one owner and one source per collection', async () => {
  const { owner, id } = await board()
  await owner.post(`/api/collections/${id}/items`).send(image).expect(201)
  const sam = db.prepare("SELECT id FROM users WHERE email = 'sam@mosaic.local'").get() as { id: number }
  assert.throws(() => db.prepare("INSERT INTO collection_members (collection_id, user_id, role) VALUES (?, ?, 'owner')").run(id, sam.id))
  assert.throws(() => db.prepare("INSERT INTO items (collection_id, source_id, image_url, title) VALUES (?, ?, ?, ?)").run(id, image.sourceId, image.imageUrl, 'Duplicate'))
})

test('delete/undo preserves pin identity, time, cover, likes and comments', async () => {
  const { owner, id } = await board()
  const saved = await owner.post(`/api/collections/${id}/items`).send(image).expect(201)
  const item = saved.body.item
  await owner.patch(`/api/collections/${id}`).send({ visibility: 'public', coverItemId: item.id }).expect(200)
  await owner.post(`/api/pins/${item.id}/like`).expect(204)
  const comment = await owner.post(`/api/pins/${item.id}/comments`).send({ body: 'Keep this discussion' }).expect(201)
  db.exec(`CREATE TRIGGER fail_test_remove_activity BEFORE INSERT ON activity
    WHEN NEW.message LIKE '%removed “Reference”'
    BEGIN SELECT RAISE(ABORT, 'test activity failure'); END`)
  await owner.delete(`/api/collections/${id}/items/${item.id}`).expect(500)
  assert.equal((await owner.get(`/api/collections/${id}`)).body.collection.cover_item_id, item.id)
  await owner.get(`/api/pins/${item.id}`).expect(200)
  db.exec('DROP TRIGGER fail_test_remove_activity')
  await owner.delete(`/api/collections/${id}/items/${item.id}`).expect(204)
  assert.equal((await owner.get(`/api/collections/${id}`)).body.collection.cover_item_id, null)
  await request(app).get(`/api/pins/${item.id}`).expect(404)
  db.exec(`CREATE TRIGGER fail_test_restore_activity BEFORE INSERT ON activity
    WHEN NEW.message LIKE '%restored “Reference”'
    BEGIN SELECT RAISE(ABORT, 'test restore activity failure'); END`)
  await owner.post(`/api/collections/${id}/items/restore`).send({ itemId: item.id }).expect(500)
  await request(app).get(`/api/pins/${item.id}`).expect(404)
  assert.ok(db.prepare('SELECT 1 FROM deleted_items WHERE item_id = ?').get(item.id))
  db.exec('DROP TRIGGER fail_test_restore_activity')
  const restored = await owner.post(`/api/collections/${id}/items/restore`).send({ itemId: item.id }).expect(201)
  assert.equal(restored.body.item.created_at, item.created_at)
  const pin = await owner.get(`/api/pins/${item.id}`).expect(200)
  assert.equal(pin.body.pin.like_count, 1)
  assert.equal((await owner.get(`/api/pins/${item.id}/comments`)).body.comments[0].id, comment.body.comment.id)
  assert.equal((await owner.get(`/api/collections/${id}`)).body.collection.cover_item_id, item.id)
  await owner.post(`/api/collections/${id}/items/restore`).send({ itemId: item.id }).expect(410)
})

test('saving a pin rolls back if its activity record cannot be written', async () => {
  const { owner, id } = await board()
  db.exec(`CREATE TRIGGER fail_test_save_activity BEFORE INSERT ON activity
    WHEN NEW.message LIKE '%saved “Rollback reference”'
    BEGIN SELECT RAISE(ABORT, 'test activity failure'); END`)
  await owner.post(`/api/collections/${id}/items`).send({ ...image, sourceId: 'rollback-image', title: 'Rollback reference' }).expect(500)
  assert.equal((await owner.get(`/api/collections/${id}`)).body.collection.items.length, 0)
  db.exec('DROP TRIGGER fail_test_save_activity')
})

test('private counts are not disclosed and removed collaborators lose access', async () => {
  const { owner, id } = await board()
  const me = (await owner.get('/api/auth/me')).body.user
  const before = (await request(app).get(`/api/profiles/${me.id}`)).body.profile
  await owner.post(`/api/collections/${id}/items`).send(image).expect(201)
  const after = (await request(app).get(`/api/profiles/${me.id}`)).body.profile
  assert.equal(after.pin_count, before.pin_count)
  await owner.post(`/api/collections/${id}/collaborators`).send({ email: 'sam@mosaic.local' }).expect(201)
  const editor = request.agent(app)
  const sam = await editor.post('/api/auth/login').send({ email: 'sam@mosaic.local', password: 'demo1234' }).expect(200)
  await editor.get(`/api/collections/${id}`).expect(200)
  await owner.delete(`/api/collections/${id}/collaborators/${sam.body.user.id}`).expect(204)
  await editor.get(`/api/collections/${id}`).expect(404)
  await editor.patch(`/api/collections/${id}/layout`).send({ positions: [] }).expect(404)
})

test('restarting does not reseed deleted data, revoked links, renamed boards or memberships', async () => {
  const museum = db.prepare("SELECT id FROM collections WHERE share_token = 'mosaic-demo-public'").get() as { id: number }
  db.prepare('DELETE FROM items WHERE collection_id = ?').run(museum.id)
  db.prepare("DELETE FROM collection_members WHERE collection_id = ? AND role = 'editor'").run(museum.id)
  db.prepare("UPDATE collections SET share_token = NULL, visibility = 'private', name = 'Renamed museum' WHERE id = ?").run(museum.id)
  const count = (db.prepare('SELECT COUNT(*) AS n FROM collections').get() as { n: number }).n
  execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', "const {db}=await import('./src/db.ts'); db.close()"], { cwd: process.cwd(), env: { ...process.env, DATABASE_PATH: databasePath } })
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM collections').get() as { n: number }).n, count)
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM items WHERE collection_id = ?').get(museum.id) as { n: number }).n, 0)
  assert.equal(db.prepare("SELECT 1 FROM collection_members WHERE collection_id = ? AND role = 'editor'").get(museum.id), undefined)
  assert.equal(db.prepare("SELECT 1 FROM collections WHERE share_token = 'mosaic-demo-public'").get(), undefined)
})
