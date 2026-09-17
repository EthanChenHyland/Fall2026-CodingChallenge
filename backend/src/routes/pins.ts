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
  const pinMembership = req.user ? membership(Number(pin.collection_id), req.user.id) : undefined
  const canView = pin.visibility === 'public' || pinMembership
  if (!canView) return res.status(404).json({ error: 'Pin not found.' })
  return res.json({ pin: { ...pin, can_edit: Boolean(pinMembership), liked_by_me: req.user ? Boolean(db.prepare('SELECT 1 FROM item_likes WHERE item_id = ? AND user_id = ?').get(pinId, req.user.id)) : false } })
})



pinsRouter.get('/:id/related', (req, res) => {
  const pinId = Number(req.params.id)
  const current = db.prepare(`
    SELECT i.collection_id, owner.user_id AS owner_id
    FROM items i
    JOIN collections c ON c.id = i.collection_id
    JOIN collection_members owner ON owner.collection_id = c.id AND owner.role = 'owner'
    WHERE i.id = ? AND c.visibility = 'public' AND c.share_token IS NOT NULL
  `).get(pinId) as { collection_id: number; owner_id: number } | undefined
  if (!current) return res.status(404).json({ error: 'Pin not found.' })

  const pins = db.prepare(`
    SELECT i.*, c.name AS collection_name, c.share_token,
      u.id AS owner_id, u.name AS owner_name, u.avatar_url AS owner_avatar
    FROM items i
    JOIN collections c ON c.id = i.collection_id
    JOIN collection_members m ON m.collection_id = c.id AND m.role = 'owner'
    JOIN users u ON u.id = m.user_id
    WHERE i.id != ? AND c.visibility = 'public' AND c.share_token IS NOT NULL
    ORDER BY CASE WHEN i.collection_id = ? THEN 0 WHEN u.id = ? THEN 1 ELSE 2 END,
      c.updated_at DESC, i.id DESC
    LIMIT 8
  `).all(pinId, current.collection_id, current.owner_id)
  return res.json({ pins })
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


pinsRouter.get('/:id/comments', (req: AuthedRequest, res) => {
  const pinId = Number(req.params.id)
  const visible = db.prepare(`SELECT i.id, i.collection_id FROM items i JOIN collections c ON c.id = i.collection_id WHERE i.id = ? AND c.visibility = 'public'`).get(pinId) as { id: number; collection_id: number } | undefined
  if (!visible) return res.status(404).json({ error: 'Pin not found.' })
  const canModerate = req.user ? membership(visible.collection_id, req.user.id)?.role === 'owner' : false
  const comments = db.prepare(`
    SELECT c.id, c.item_id, c.body, c.created_at, u.id AS user_id, u.name AS user_name, u.avatar_url AS user_avatar
    FROM comments c JOIN users u ON u.id = c.user_id
    WHERE c.item_id = ? ORDER BY c.id ASC
  `).all(pinId) as Array<Record<string, unknown> & { user_id: number }>
  return res.json({ comments: comments.map((comment) => ({ ...comment, can_delete: canModerate || req.user?.id === comment.user_id })) })
})

const commentSchema = z.object({ body: z.string().trim().min(1).max(500) })

pinsRouter.post('/:id/comments', requireAuth, (req: AuthedRequest, res) => {
  const pinId = Number(req.params.id)
  const parsed = commentSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Write something before posting.' })
  const visible = db.prepare(`SELECT i.id FROM items i JOIN collections c ON c.id = i.collection_id WHERE i.id = ? AND c.visibility = 'public'`).get(pinId)
  if (!visible) return res.status(404).json({ error: 'Pin not found.' })
  const result = db.prepare('INSERT INTO comments (item_id, user_id, body) VALUES (?, ?, ?)').run(pinId, req.user!.id, parsed.data.body)
  const owner = db.prepare(`
    SELECT c.id AS collection_id, m.user_id AS owner_id
    FROM items i JOIN collections c ON c.id = i.collection_id
    JOIN collection_members m ON m.collection_id = c.id AND m.role = 'owner'
    WHERE i.id = ?
  `).get(pinId) as { collection_id: number; owner_id: number }
  if (owner.owner_id !== req.user!.id) {
    db.prepare('INSERT INTO notifications (user_id, collection_id, message) VALUES (?, ?, ?)').run(
      owner.owner_id,
      owner.collection_id,
      `${req.user!.name} commented on a pin`,
    )
  }
  const comment = db.prepare(`
    SELECT c.id, c.item_id, c.body, c.created_at, u.id AS user_id, u.name AS user_name, u.avatar_url AS user_avatar
    FROM comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?
  `).get(result.lastInsertRowid)
  return res.status(201).json({ comment })
})


pinsRouter.delete('/:id/comments/:commentId', requireAuth, (req: AuthedRequest, res) => {
  const pinId = Number(req.params.id)
  const commentId = Number(req.params.commentId)
  const comment = db.prepare(`
    SELECT cm.id, cm.user_id, i.collection_id
    FROM comments cm JOIN items i ON i.id = cm.item_id
    WHERE cm.id = ? AND cm.item_id = ?
  `).get(commentId, pinId) as { id: number; user_id: number; collection_id: number } | undefined
  if (!comment) return res.status(404).json({ error: 'Comment not found.' })
  const ownsCollection = membership(comment.collection_id, req.user!.id)?.role === 'owner'
  if (comment.user_id !== req.user!.id && !ownsCollection) return res.status(403).json({ error: 'You cannot remove that comment.' })
  db.prepare('DELETE FROM comments WHERE id = ?').run(commentId)
  return res.status(204).end()
})
