import { Router } from 'express'
import { z } from 'zod'
import { db } from '../db.js'
import { membership, requireAuth, type AuthedRequest } from '../middleware/auth.js'

export const pinsRouter = Router()

pinsRouter.get('/:id', (req: AuthedRequest, res) => {
  const pinId = Number(req.params.id)
  if (!Number.isInteger(pinId)) return res.status(400).json({ error: 'Invalid pin.' })
  const pin = db.prepare(`
    SELECT i.*, c.name AS collection_name, c.description AS collection_description,
      c.visibility, c.share_token,
      u.id AS owner_id, u.name AS owner_name, u.avatar_url AS owner_avatar,
      (SELECT COUNT(*) FROM item_likes WHERE item_id = i.id) AS like_count
    FROM items i
    JOIN collections c ON c.id = i.collection_id
    JOIN collection_members m ON m.collection_id = c.id AND m.role = 'owner'
    JOIN users u ON u.id = m.user_id
    WHERE i.id = ?
  `).get(pinId) as Record<string, unknown> | undefined
  if (!pin) return res.status(404).json({ error: 'Pin not found.' })
  const canView = pin.visibility === 'public' || (req.user && membership(Number(pin.collection_id), req.user.id))
  if (!canView) return res.status(404).json({ error: 'Pin not found.' })
  return res.json({ pin: { ...pin, liked_by_me: req.user ? Boolean(db.prepare('SELECT 1 FROM item_likes WHERE item_id = ? AND user_id = ?').get(pinId, req.user.id)) : false } })
})


pinsRouter.post('/:id/like', requireAuth, (req: AuthedRequest, res) => {
  const pinId = Number(req.params.id)
  const pin = db.prepare(`SELECT i.id FROM items i JOIN collections c ON c.id = i.collection_id WHERE i.id = ? AND c.visibility = 'public'`).get(pinId)
  if (!pin) return res.status(404).json({ error: 'Pin not found.' })
  db.prepare('INSERT OR IGNORE INTO item_likes (item_id, user_id) VALUES (?, ?)').run(pinId, req.user!.id)
  return res.status(204).end()
})

pinsRouter.delete('/:id/like', requireAuth, (req: AuthedRequest, res) => {
  const pinId = Number(req.params.id)
  db.prepare('DELETE FROM item_likes WHERE item_id = ? AND user_id = ?').run(pinId, req.user!.id)
  return res.status(204).end()
})


pinsRouter.get('/:id/comments', (req, res) => {
  const pinId = Number(req.params.id)
  const visible = db.prepare(`SELECT i.id FROM items i JOIN collections c ON c.id = i.collection_id WHERE i.id = ? AND c.visibility = 'public'`).get(pinId)
  if (!visible) return res.status(404).json({ error: 'Pin not found.' })
  const comments = db.prepare(`
    SELECT c.id, c.item_id, c.body, c.created_at, u.id AS user_id, u.name AS user_name, u.avatar_url AS user_avatar
    FROM comments c JOIN users u ON u.id = c.user_id
    WHERE c.item_id = ? ORDER BY c.id ASC
  `).all(pinId)
  return res.json({ comments })
})

const commentSchema = z.object({ body: z.string().trim().min(1).max(500) })

pinsRouter.post('/:id/comments', requireAuth, (req: AuthedRequest, res) => {
  const pinId = Number(req.params.id)
  const parsed = commentSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Write something before posting.' })
  const visible = db.prepare(`SELECT i.id FROM items i JOIN collections c ON c.id = i.collection_id WHERE i.id = ? AND c.visibility = 'public'`).get(pinId)
  if (!visible) return res.status(404).json({ error: 'Pin not found.' })
  const result = db.prepare('INSERT INTO comments (item_id, user_id, body) VALUES (?, ?, ?)').run(pinId, req.user!.id, parsed.data.body)
  const comment = db.prepare(`
    SELECT c.id, c.item_id, c.body, c.created_at, u.id AS user_id, u.name AS user_name, u.avatar_url AS user_avatar
    FROM comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?
  `).get(result.lastInsertRowid)
  return res.status(201).json({ comment })
})
