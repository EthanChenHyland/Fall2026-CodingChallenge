import crypto from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { db } from '../db.js'
import { actor, collectionSelect, getCollection, logActivity } from '../lib/collections.js'
import {
  requireAuth,
  requireMembership,
  requireOwner,
  type AuthedRequest,
} from '../middleware/auth.js'

export const collectionsRouter = Router()
collectionsRouter.use(requireAuth)

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
  canvasX: z.number().finite().min(0).max(5000).optional(),
  canvasY: z.number().finite().min(0).max(5000).optional(),
  rotation: z.number().min(-12).max(12).optional(),
})

const inviteSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
})

collectionsRouter.get('/', (req: AuthedRequest, res) => {
  const collections = db.prepare(`
    SELECT c.*,
      member.role AS role,
      COUNT(DISTINCT i.id) AS item_count,
      (SELECT image_url FROM items WHERE collection_id = c.id ORDER BY id DESC LIMIT 1) AS cover_url
    FROM collections c
    LEFT JOIN items i ON i.collection_id = c.id
    JOIN collection_members member ON member.collection_id = c.id AND member.user_id = ?
    GROUP BY c.id
    ORDER BY c.updated_at DESC
  `).all(req.user!.id)
  res.json({ collections })
})

collectionsRouter.post('/', (req: AuthedRequest, res) => {
  const parsed = collectionSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Please enter a collection name.' })
  const create = db.transaction(() => {
    const result = db.prepare('INSERT INTO collections (name, description) VALUES (?, ?)').run(
      parsed.data.name,
      parsed.data.description,
    )
    const id = Number(result.lastInsertRowid)
    db.prepare('INSERT INTO collection_members (collection_id, user_id, role) VALUES (?, ?, ?)').run(id, req.user!.id, 'owner')
    logActivity(id, `${actor(req)} created this collection`, req.user!.id)
    return id
  })
  const id = create()
  res.status(201).json({ collection: getCollection(id, req.user!.id) })
})

collectionsRouter.get('/:id', requireMembership, (req: AuthedRequest, res) => {
  res.json({ collection: getCollection(Number(req.params.id), req.user!.id) })
})

collectionsRouter.patch('/:id', requireMembership, (req: AuthedRequest, res) => {
  const id = Number(req.params.id)
  const existing = getCollection(id, req.user!.id) as Record<string, unknown>
  const schema = collectionSchema.partial().extend({ visibility: z.enum(['private', 'public']).optional() })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid collection update.' })
  if (parsed.data.visibility && res.locals.membership.role !== 'owner') {
    return res.status(403).json({ error: 'Only the owner can change collection visibility.' })
  }
  const next = { ...existing, ...parsed.data }
  db.prepare(`
    UPDATE collections SET name = ?, description = ?, visibility = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(next.name, next.description, next.visibility, id)
  logActivity(id, `${actor(req)} updated collection details`, req.user!.id)
  res.json({ collection: getCollection(id, req.user!.id) })
})

collectionsRouter.delete('/:id', requireMembership, requireOwner, (req, res) => {
  db.prepare('DELETE FROM collections WHERE id = ?').run(Number(req.params.id))
  res.status(204).end()
})

collectionsRouter.post('/:id/items', requireMembership, (req: AuthedRequest, res) => {
  const collectionId = Number(req.params.id)
  const parsed = itemSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid image.' })
  const p = parsed.data
  const duplicate = db.prepare('SELECT id FROM items WHERE collection_id = ? AND source_id = ?').get(collectionId, p.sourceId)
  if (duplicate) return res.status(409).json({ error: 'That pin is already in this collection.' })
  const offset = (db.prepare('SELECT COUNT(*) AS count FROM items WHERE collection_id = ?').get(collectionId) as { count: number }).count
  const result = db.prepare(`
    INSERT INTO items (collection_id, source_id, image_url, source_page, source_creator, title, canvas_x, canvas_y, rotation)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(collectionId, p.sourceId, p.imageUrl, p.sourcePage, p.sourceCreator, p.title, 36 + (offset % 3) * 220, 40 + Math.floor(offset / 3) * 250, (offset % 3 - 1) * 2)
  db.prepare('UPDATE collections SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(collectionId)
  logActivity(collectionId, `${actor(req)} saved “${p.title}”`, req.user!.id)
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(result.lastInsertRowid)
  res.status(201).json({ item })
})

collectionsRouter.patch('/:id/items/:itemId', requireMembership, (req: AuthedRequest, res) => {
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
  if (p.title !== undefined || p.note !== undefined) {
    logActivity(collectionId, `${actor(req)} edited “${String(p.title ?? current.title)}”`, req.user!.id)
  }
  res.json({ item: db.prepare('SELECT * FROM items WHERE id = ?').get(itemId) })
})

collectionsRouter.delete('/:id/items/:itemId', requireMembership, (req: AuthedRequest, res) => {
  const collectionId = Number(req.params.id)
  const item = db.prepare('SELECT title FROM items WHERE id = ? AND collection_id = ?').get(Number(req.params.itemId), collectionId) as { title: string } | undefined
  if (!item) return res.status(404).json({ error: 'Saved image not found.' })
  db.prepare('DELETE FROM items WHERE id = ? AND collection_id = ?').run(Number(req.params.itemId), collectionId)
  db.prepare('UPDATE collections SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(collectionId)
  logActivity(collectionId, `${actor(req)} removed “${item.title}”`, req.user!.id)
  res.status(204).end()
})

collectionsRouter.post('/:id/share', requireMembership, requireOwner, (req: AuthedRequest, res) => {
  const id = Number(req.params.id)
  const existing = db.prepare('SELECT share_token FROM collections WHERE id = ?').get(id) as { share_token: string | null }
  const token = existing.share_token ?? crypto.randomBytes(10).toString('base64url')
  db.prepare("UPDATE collections SET share_token = ?, visibility = 'public', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(token, id)
  logActivity(id, `${actor(req)} enabled public sharing`, req.user!.id)
  res.json({ token })
})

collectionsRouter.delete('/:id/share', requireMembership, requireOwner, (req: AuthedRequest, res) => {
  const id = Number(req.params.id)
  db.prepare("UPDATE collections SET share_token = NULL, visibility = 'private', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id)
  logActivity(id, `${actor(req)} disabled public sharing`, req.user!.id)
  res.status(204).end()
})

collectionsRouter.post('/:id/collaborators', requireMembership, requireOwner, (req: AuthedRequest, res) => {
  const collectionId = Number(req.params.id)
  const parsed = inviteSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Enter a valid account email.' })
  const user = db.prepare('SELECT id, name, email FROM users WHERE email = ?').get(parsed.data.email) as { id: number; name: string; email: string } | undefined
  if (!user) return res.status(404).json({ error: 'No Mosaic account uses that email yet.' })
  if (user.id === req.user!.id) return res.status(400).json({ error: 'You already own this collection.' })
  const result = db.prepare(`
    INSERT OR IGNORE INTO collection_members (collection_id, user_id, role) VALUES (?, ?, 'editor')
  `).run(collectionId, user.id)
  if (result.changes === 0) return res.status(409).json({ error: 'That person already collaborates on this collection.' })
  logActivity(collectionId, `${actor(req)} added ${user.name} as an editor`, req.user!.id)
  res.status(201).json({ collection: getCollection(collectionId, req.user!.id) })
})

collectionsRouter.delete('/:id/collaborators/:userId', requireMembership, requireOwner, (req: AuthedRequest, res) => {
  const collectionId = Number(req.params.id)
  const userId = Number(req.params.userId)
  const user = db.prepare(`
    SELECT u.name FROM collection_members m JOIN users u ON u.id = m.user_id
    WHERE m.collection_id = ? AND m.user_id = ? AND m.role = 'editor'
  `).get(collectionId, userId) as { name: string } | undefined
  if (!user) return res.status(404).json({ error: 'Collaborator not found.' })
  db.prepare("DELETE FROM collection_members WHERE collection_id = ? AND user_id = ? AND role = 'editor'").run(collectionId, userId)
  logActivity(collectionId, `${actor(req)} removed ${user.name} from collaborators`, req.user!.id)
  res.status(204).end()
})
