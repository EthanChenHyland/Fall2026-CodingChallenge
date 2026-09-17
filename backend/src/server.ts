import cors from 'cors'
import crypto from 'node:crypto'
import express from 'express'
import { z } from 'zod'
import { catalog } from './catalog.js'
import { db } from './db.js'

const app = express()
const port = Number(process.env.PORT ?? 3001)

app.use(cors({ origin: true, credentials: true }))
app.use(express.json())

const collectionSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(280).optional().default(''),
})

const itemSchema = z.object({
  sourceId: z.string().min(1),
  imageUrl: z.string().url(),
  sourcePage: z.string().url().or(z.literal('')).optional().default(''),
  sourceCreator: z.string().max(120).optional().default(''),
  title: z.string().trim().min(1).max(120),
})

const itemPatchSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  note: z.string().trim().max(500).optional(),
  canvasX: z.number().finite().optional(),
  canvasY: z.number().finite().optional(),
  rotation: z.number().min(-12).max(12).optional(),
})

const collectionSelect = `
  SELECT c.*,
    COUNT(i.id) AS item_count,
    (SELECT image_url FROM items WHERE collection_id = c.id ORDER BY id DESC LIMIT 1) AS cover_url
  FROM collections c
  LEFT JOIN items i ON i.collection_id = c.id
  GROUP BY c.id
`

function getCollection(id: number) {
  const collection = db.prepare(`${collectionSelect} HAVING c.id = ?`).get(id)
  if (!collection) return null
  const items = db
    .prepare('SELECT * FROM items WHERE collection_id = ? ORDER BY id DESC')
    .all(id)
  const activity = db
    .prepare('SELECT * FROM activity WHERE collection_id = ? ORDER BY id DESC LIMIT 12')
    .all(id)
  return { ...collection, items, activity }
}

function logActivity(collectionId: number, message: string) {
  db.prepare('INSERT INTO activity (collection_id, message) VALUES (?, ?)').run(collectionId, message)
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'mosaic-api' })
})

app.get('/api/search', (req, res) => {
  const query = String(req.query.q ?? '').trim().toLowerCase()
  const results = query
    ? catalog.filter((image) => `${image.title} ${image.tags.join(' ')}`.toLowerCase().includes(query))
    : catalog
  res.json({ results })
})

app.get('/api/collections', (_req, res) => {
  res.json({ collections: db.prepare(`${collectionSelect} ORDER BY c.updated_at DESC`).all() })
})

app.post('/api/collections', (req, res) => {
  const parsed = collectionSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Please enter a collection name.' })
  const result = db
    .prepare('INSERT INTO collections (name, description) VALUES (?, ?)')
    .run(parsed.data.name, parsed.data.description)
  logActivity(Number(result.lastInsertRowid), 'Created this collection')
  return res.status(201).json({ collection: getCollection(Number(result.lastInsertRowid)) })
})

app.get('/api/collections/:id', (req, res) => {
  const collection = getCollection(Number(req.params.id))
  if (!collection) return res.status(404).json({ error: 'Collection not found.' })
  return res.json({ collection })
})

app.patch('/api/collections/:id', (req, res) => {
  const id = Number(req.params.id)
  const existing = getCollection(id)
  if (!existing) return res.status(404).json({ error: 'Collection not found.' })
  const schema = collectionSchema.partial().extend({ visibility: z.enum(['private', 'public']).optional() })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid collection update.' })
  const next = { ...existing, ...parsed.data }
  db.prepare(
    'UPDATE collections SET name = ?, description = ?, visibility = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
  ).run(next.name, next.description, next.visibility, id)
  logActivity(id, 'Updated collection details')
  return res.json({ collection: getCollection(id) })
})

app.delete('/api/collections/:id', (req, res) => {
  const result = db.prepare('DELETE FROM collections WHERE id = ?').run(Number(req.params.id))
  if (result.changes === 0) return res.status(404).json({ error: 'Collection not found.' })
  return res.status(204).end()
})

app.post('/api/collections/:id/items', (req, res) => {
  const collectionId = Number(req.params.id)
  if (!getCollection(collectionId)) return res.status(404).json({ error: 'Collection not found.' })
  const parsed = itemSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid image.' })
  const p = parsed.data
  const offset = (db.prepare('SELECT COUNT(*) AS count FROM items WHERE collection_id = ?').get(collectionId) as { count: number }).count
  const result = db.prepare(`
    INSERT INTO items (collection_id, source_id, image_url, source_page, source_creator, title, canvas_x, canvas_y, rotation)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(collectionId, p.sourceId, p.imageUrl, p.sourcePage, p.sourceCreator, p.title, 36 + (offset % 3) * 220, 40 + Math.floor(offset / 3) * 250, (offset % 3 - 1) * 2)
  db.prepare('UPDATE collections SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(collectionId)
  logActivity(collectionId, `Saved “${p.title}”`)
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(result.lastInsertRowid)
  return res.status(201).json({ item })
})

app.patch('/api/collections/:id/items/:itemId', (req, res) => {
  const collectionId = Number(req.params.id)
  const itemId = Number(req.params.itemId)
  const current = db.prepare('SELECT * FROM items WHERE id = ? AND collection_id = ?').get(itemId, collectionId) as Record<string, unknown> | undefined
  if (!current) return res.status(404).json({ error: 'Saved image not found.' })
  const parsed = itemPatchSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid image update.' })
  const p = parsed.data
  db.prepare(`
    UPDATE items SET title = ?, note = ?, canvas_x = ?, canvas_y = ?, rotation = ?
    WHERE id = ? AND collection_id = ?
  `).run(
    p.title ?? current.title,
    p.note ?? current.note,
    p.canvasX ?? current.canvas_x,
    p.canvasY ?? current.canvas_y,
    p.rotation ?? current.rotation,
    itemId,
    collectionId,
  )
  db.prepare('UPDATE collections SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(collectionId)
  return res.json({ item: db.prepare('SELECT * FROM items WHERE id = ?').get(itemId) })
})

app.delete('/api/collections/:id/items/:itemId', (req, res) => {
  const collectionId = Number(req.params.id)
  const item = db.prepare('SELECT title FROM items WHERE id = ? AND collection_id = ?').get(Number(req.params.itemId), collectionId) as { title: string } | undefined
  if (!item) return res.status(404).json({ error: 'Saved image not found.' })
  db.prepare('DELETE FROM items WHERE id = ? AND collection_id = ?').run(Number(req.params.itemId), collectionId)
  db.prepare('UPDATE collections SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(collectionId)
  logActivity(collectionId, `Removed “${item.title}”`)
  return res.status(204).end()
})

app.post('/api/collections/:id/share', (req, res) => {
  const id = Number(req.params.id)
  if (!getCollection(id)) return res.status(404).json({ error: 'Collection not found.' })
  const token = crypto.randomBytes(10).toString('base64url')
  db.prepare("UPDATE collections SET share_token = ?, visibility = 'public', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(token, id)
  logActivity(id, 'Created a public share link')
  return res.json({ token })
})

app.get('/api/shared/:token', (req, res) => {
  const row = db.prepare("SELECT id FROM collections WHERE share_token = ? AND visibility = 'public'").get(req.params.token) as { id: number } | undefined
  if (!row) return res.status(404).json({ error: 'Shared collection not found.' })
  return res.json({ collection: getCollection(row.id) })
})

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err)
  res.status(500).json({ error: 'Something went wrong.' })
})

app.listen(port, '127.0.0.1', () => {
  console.log(`Mosaic API listening on http://127.0.0.1:${port}`)
})
