import { Router } from 'express'
import { db } from '../db.js'
import type { AuthedRequest } from '../middleware/auth.js'

export const exploreRouter = Router()

const recommendationStopWords = new Set(['about', 'after', 'again', 'also', 'and', 'from', 'have', 'into', 'more', 'saved', 'that', 'the', 'this', 'with', 'your'])

function recommendationTerms(value: string) {
  return value.toLowerCase().match(/[a-z0-9]{3,}/g)?.filter((term) => !recommendationStopWords.has(term)) ?? []
}

exploreRouter.get('/recommended', (req: AuthedRequest, res) => {
  const userId = req.user?.id
  if (!userId) return res.json({ pins: [], basedOn: [] })

  const saved = db.prepare(`
    SELECT i.title, i.tags, c.name AS collection_name
    FROM items i
    JOIN collections c ON c.id = i.collection_id
    JOIN collection_members m ON m.collection_id = c.id AND m.user_id = ?
    ORDER BY i.created_at DESC
    LIMIT 200
  `).all(userId) as Array<{ title: string; tags: string; collection_name: string }>
  const weights = new Map<string, number>()
  for (const item of saved) {
    for (const term of recommendationTerms(item.tags)) weights.set(term, (weights.get(term) ?? 0) + 4)
    for (const term of recommendationTerms(`${item.title} ${item.collection_name}`)) weights.set(term, (weights.get(term) ?? 0) + 1)
  }
  const interests = [...weights.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
  if (!interests.length) return res.json({ pins: [], basedOn: [] })

  const candidates = db.prepare(`
    SELECT i.*, c.name AS collection_name, c.share_token, c.updated_at,
      u.id AS owner_id, u.name AS owner_name, u.avatar_url AS owner_avatar,
      (SELECT COUNT(*) FROM item_likes likes WHERE likes.item_id = i.id) AS like_count,
      (SELECT COUNT(*) FROM comments comments WHERE comments.item_id = i.id) AS comment_count
    FROM items i
    JOIN collections c ON c.id = i.collection_id
    JOIN collection_members m ON m.collection_id = c.id AND m.role = 'owner'
    JOIN users u ON u.id = m.user_id
    WHERE c.visibility = 'public' AND c.share_token IS NOT NULL AND u.id != ?
    ORDER BY c.updated_at DESC, i.id DESC
    LIMIT 200
  `).all(userId) as Array<Record<string, unknown>>

  const ranked = candidates.map((pin) => {
    const haystack = `${String(pin.title ?? '')} ${String(pin.tags ?? '')} ${String(pin.collection_name ?? '')} ${String(pin.source_creator ?? '')}`.toLowerCase()
    const affinity = interests.reduce((score, [term, weight]) => score + (haystack.includes(term) ? weight : 0), 0)
    const social = Math.min(8, Number(pin.like_count ?? 0) * 0.5 + Number(pin.comment_count ?? 0) * 0.75)
    return { pin, score: affinity + social }
  }).filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score).slice(0, 12)

  return res.json({ pins: ranked.map((entry) => entry.pin), basedOn: interests.slice(0, 4).map(([term]) => term) })
})

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
