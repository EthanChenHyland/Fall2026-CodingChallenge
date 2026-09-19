import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import request from 'supertest'

const databasePath = resolve(tmpdir(), `mosaic-auth-hardening-${randomUUID()}.sqlite`)
process.env.DATABASE_PATH = databasePath
const { app } = await import('../src/app.js')
const { db } = await import('../src/db.js')

test.after(() => {
  db.close()
  for (const suffix of ['', '-wal', '-shm']) rmSync(databasePath + suffix, { force: true })
})

test('email verification creates an account only after the correct code', async () => {
  const originalFetch = globalThis.fetch
  process.env.RESEND_API_KEY = 'test-resend-key'
  process.env.EMAIL_FROM = 'Mosaic <noreply@example.test>'
  let deliveredCode = ''
  globalThis.fetch = async (_input, init) => {
    const payload = JSON.parse(String(init?.body)) as { text?: string }
    deliveredCode = payload.text?.match(/\b\d{6}\b/)?.[0] ?? ''
    return new Response(JSON.stringify({ id: 'email-test' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  try {
    const agent = request.agent(app)
    const email = `verified-${randomUUID()}@example.test`
    await agent.post('/api/auth/register/start').send({ name: 'Verified Person', email, password: 'verified-password' }).expect(202)
    assert.match(deliveredCode, /^\d{6}$/)
    assert.equal(db.prepare('SELECT 1 FROM users WHERE email = ?').get(email), undefined)
    await agent.post('/api/auth/register').send({ name: 'Bypass', email: `bypass-${randomUUID()}@example.test`, password: 'verified-password' }).expect(400)
    await agent.post('/api/auth/register/verify').send({ email, code: '000000' }).expect(400)
    await agent.post('/api/auth/register/verify').send({ email, code: deliveredCode }).expect(201)
    await agent.get('/api/auth/me').expect(200)
    assert.ok(db.prepare('SELECT 1 FROM users WHERE email = ?').get(email))
    assert.equal(db.prepare('SELECT 1 FROM registration_verifications WHERE email = ?').get(email), undefined)
  } finally {
    globalThis.fetch = originalFetch
    delete process.env.RESEND_API_KEY
    delete process.env.EMAIL_FROM
  }
})

test('production demo accounts are closed unless a private reviewer password is configured', async () => {
  const previousNodeEnv = process.env.NODE_ENV
  const previousDemoPassword = process.env.DEMO_ACCESS_PASSWORD
  const previousTrustProxy = app.get('trust proxy')
  process.env.NODE_ENV = 'production'
  delete process.env.DEMO_ACCESS_PASSWORD
  app.set('trust proxy', 1)

  try {
    await request(app).post('/api/auth/demo').set('X-Forwarded-For', '203.0.113.10').expect(404)
    await request(app).post('/api/auth/login').set('X-Forwarded-For', '203.0.113.11').send({ email: 'demo@mosaic.local', password: 'demo1234' }).expect(401)
    process.env.DEMO_ACCESS_PASSWORD = 'private-reviewer-test'
    await request(app).post('/api/auth/login').set('X-Forwarded-For', '203.0.113.12').send({ email: 'demo@mosaic.local', password: 'private-reviewer-test' }).expect(200)
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousNodeEnv
    if (previousDemoPassword === undefined) delete process.env.DEMO_ACCESS_PASSWORD
    else process.env.DEMO_ACCESS_PASSWORD = previousDemoPassword
    app.set('trust proxy', previousTrustProxy)
  }
})

test('sign-in attempts are rate limited', async () => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await request(app).post('/api/auth/login').send({ email: 'nobody@example.test', password: 'wrong-password' }).expect(401)
  }
  const limited = await request(app).post('/api/auth/login').send({ email: 'nobody@example.test', password: 'wrong-password' }).expect(429)
  assert.match(limited.body.error, /Too many sign-in attempts/i)
})
