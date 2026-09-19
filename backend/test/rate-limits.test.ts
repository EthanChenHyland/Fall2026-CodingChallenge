import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import request from 'supertest'

const directory = mkdtempSync(join(tmpdir(), 'mosaic-rate-limit-'))
process.env.DATABASE_PATH = join(directory, 'test.sqlite')
const { app } = await import('../src/app.js')
const { db } = await import('../src/db.js')

test.after(() => {
  db.close()
  rmSync(directory, { recursive: true, force: true })
})

test('report submissions have a tighter limiter than the global API ceiling', async () => {
  for (let index = 0; index < 20; index += 1) {
    const response = await request(app).post('/api/reports').send({})
    assert.notEqual(response.status, 429)
  }
  const limited = await request(app).post('/api/reports').send({}).expect(429)
  assert.match(limited.body.error, /Too many reports/i)
})
