import { Router } from 'express'
import { db } from '../db.js'
import type { AuthedRequest } from '../middleware/auth.js'

export const exploreRouter = Router()

exploreRouter.get('/', (req: AuthedRequest, res) => {
  const page = Math.max(1, Number(req.query.page) || 1)
  const limit = 24
  const offset = (page - 1) * limit
  const pins = db.prepare(`
    SELECT i.*, c.name AS collection_name, c.share_token, c.updated_at,
      u.id AS owner_id, u.name AS owner_name, u.avatar_url AS owner_avatar
    FROM items i
    JOIN collections c ON c.id = i.collection_id
    JOIN collection_members m ON m.collection_id = c.id AND m.role = 'owner'
    JOIN users u ON u.id = m.user_id
    WHERE c.visibility = 'public' AND c.share_token IS NOT NULL
    ORDER BY c.updated_at DESC, i.id DESC
    LIMIT ? OFFSET ?
  `).all(limit + 1, offset)
  const hasMore = pins.length > limit
  return res.json({ pins: hasMore ? pins.slice(0, limit) : pins, nextPage: hasMore ? page + 1 : null })
})
