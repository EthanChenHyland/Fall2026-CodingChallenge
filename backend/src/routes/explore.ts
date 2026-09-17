import { Router } from 'express'
import { db } from '../db.js'
import type { AuthedRequest } from '../middleware/auth.js'

export const exploreRouter = Router()

exploreRouter.get('/', (req: AuthedRequest, res) => {
  const page = Number(req.query.page ?? 1)
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000) return res.status(400).json({ error: 'Invalid page.' })
  const mode = req.query.mode === 'following' ? 'following' : req.query.mode === 'trending' ? 'trending' : 'all'
  const limit = 24
  const offset = (page - 1) * limit
  const pins = db.prepare(`
    SELECT i.*, c.name AS collection_name, c.share_token, c.updated_at,
      u.id AS owner_id, u.name AS owner_name, u.avatar_url AS owner_avatar,
      (SELECT COUNT(*) FROM item_likes likes WHERE likes.item_id = i.id) AS like_count,
      (SELECT COUNT(*) FROM comments comments WHERE comments.item_id = i.id) AS comment_count
    FROM items i
    JOIN collections c ON c.id = i.collection_id
    JOIN collection_members m ON m.collection_id = c.id AND m.role = 'owner'
    JOIN users u ON u.id = m.user_id
    WHERE c.visibility = 'public' AND c.share_token IS NOT NULL
      AND (? != 'following' OR EXISTS (
        SELECT 1 FROM follows f WHERE f.follower_id = ? AND f.following_id = u.id
      ))
    ORDER BY CASE WHEN ? = 'trending' THEN (like_count * 3 + comment_count * 2) ELSE 0 END DESC,
      c.updated_at DESC, i.id DESC
    LIMIT ? OFFSET ?
  `).all(mode, req.user?.id ?? -1, mode, limit + 1, offset)
  const hasMore = pins.length > limit
  return res.json({ pins: hasMore ? pins.slice(0, limit) : pins, nextPage: hasMore ? page + 1 : null })
})
