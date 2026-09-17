import { Router } from 'express'
import { db } from '../db.js'
import type { AuthedRequest } from '../middleware/auth.js'

export const profilesRouter = Router()

profilesRouter.get('/:id', (req: AuthedRequest, res) => {
  const userId = Number(req.params.id)
  if (!Number.isInteger(userId)) return res.status(400).json({ error: 'Invalid profile.' })

  const profile = db.prepare(`
    SELECT id, name, bio, avatar_url, created_at
    FROM users
    WHERE id = ?
  `).get(userId) as Record<string, unknown> | undefined
  if (!profile) return res.status(404).json({ error: 'Profile not found.' })

  const stats = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM collection_members WHERE user_id = ? AND role = 'owner') AS collection_count,
      (SELECT COUNT(*) FROM items i
        JOIN collection_members m ON m.collection_id = i.collection_id
        WHERE m.user_id = ? AND m.role = 'owner') AS pin_count
  `).get(userId, userId)

  const collections = db.prepare(`
    SELECT c.id, c.name, c.description, c.visibility, c.share_token, c.created_at, c.updated_at,
      COUNT(i.id) AS item_count,
      (SELECT image_url FROM items WHERE collection_id = c.id ORDER BY id DESC LIMIT 1) AS cover_url
    FROM collections c
    JOIN collection_members m ON m.collection_id = c.id AND m.user_id = ? AND m.role = 'owner'
    LEFT JOIN items i ON i.collection_id = c.id
    WHERE c.visibility = 'public'
    GROUP BY c.id
    ORDER BY c.updated_at DESC
  `).all(userId)

  return res.json({
    profile: { ...profile, ...stats, is_self: req.user?.id === userId },
    collections,
  })
})
