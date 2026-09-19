import { Router } from 'express'
import { z } from 'zod'
import { db } from '../db.js'
import { actor, logActivity } from '../lib/collections.js'
import { provenanceForViewer, recordRepinLineage } from '../lib/provenance.js'
import { membership, requireAuth, type AuthedRequest } from '../middleware/auth.js'

export const pinsRouter = Router()

pinsRouter.get('/:id', (req: AuthedRequest, res) => {
  const pinId = Number(req.params.id)
  if (!Number.isInteger(pinId)) return res.status(400).json({ error: 'Invalid pin.' })
  const pin = db.prepare(`
    SELECT i.*, c.name AS collection_name, c.description AS collection_description,
      c.visibility, c.audience, c.share_token,
      u.id AS owner_id, u.username AS owner_username, u.name AS owner_name, u.avatar_url AS owner_avatar,
      (SELECT COUNT(*) FROM item_likes WHERE item_id = i.id) AS like_count,
      (SELECT COUNT(*) FROM collection_follows cf WHERE cf.collection_id = c.id) AS collection_follower_count,
      CASE WHEN EXISTS (
        SELECT 1 FROM collection_follows cf WHERE cf.collection_id = c.id AND cf.follower_id = ?
      ) THEN 1 ELSE 0 END AS collection_followed_by_me
    FROM items i
    JOIN collections c ON c.id = i.collection_id
    JOIN collection_members m ON m.collection_id = c.id AND m.role = 'owner'
    JOIN users u ON u.id = m.user_id
    WHERE i.id = ?
  `).get(req.user?.id ?? -1, pinId) as Record<string, unknown> | undefined
  if (!pin) return res.status(404).json({ error: 'Pin not found.' })
  const pinMembership = req.user ? membership(Number(pin.collection_id), req.user.id) : undefined
  const canViewFollowers = Boolean(req.user && pin.audience === 'followers' && db.prepare(
    'SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?',
  ).get(req.user.id, pin.owner_id))
  const canView = pin.visibility === 'public' || pinMembership || canViewFollowers
  if (!canView) return res.status(404).json({ error: 'Pin not found.' })
  return res.json({ pin: { ...pin, can_edit: Boolean(pinMembership), liked_by_me: req.user ? Boolean(db.prepare('SELECT 1 FROM item_likes WHERE item_id = ? AND user_id = ?').get(pinId, req.user.id)) : false, provenance: provenanceForViewer(pinId, req.user?.id) } })
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
      u.id AS owner_id, u.username AS owner_username, u.name AS owner_name, u.avatar_url AS owner_avatar
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

const savePinSchema = z.object({
  collectionId: z.number().int().positive(),
  note: z.string().trim().max(500).optional().default(''),
})

const savePinsBatchSchema = z.object({
  collectionId: z.number().int().positive(),
  pinIds: z.array(z.number().int().positive()).min(1).max(30),
})

const recommendationFeedbackSchema = z.object({ signal: z.enum(['more', 'not_interested']) })

pinsRouter.post('/:id/recommendation-feedback', requireAuth, (req: AuthedRequest, res) => {
  const pinId = Number(req.params.id)
  const parsed = recommendationFeedbackSchema.safeParse(req.body)
  if (!Number.isSafeInteger(pinId) || pinId <= 0 || !parsed.success) return res.status(400).json({ error: 'Invalid recommendation feedback.' })
  const publicPin = db.prepare(`
    SELECT i.id FROM items i
    JOIN collections c ON c.id = i.collection_id
    WHERE i.id = ? AND c.visibility = 'public' AND c.share_token IS NOT NULL
  `).get(pinId)
  if (!publicPin) return res.status(404).json({ error: 'Pin not found.' })
  db.prepare(`
    INSERT INTO recommendation_feedback (user_id, item_id, signal)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, item_id) DO UPDATE SET signal = excluded.signal, created_at = CURRENT_TIMESTAMP
  `).run(req.user!.id, pinId, parsed.data.signal)
  return res.status(204).end()
})

pinsRouter.post('/save-batch', requireAuth, (req: AuthedRequest, res) => {
  const parsed = savePinsBatchSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Choose up to 30 public pins and a collection.' })
  const targetCollectionId = parsed.data.collectionId
  if (!membership(targetCollectionId, req.user!.id)) return res.status(404).json({ error: 'Collection not found.' })

  const pinIds = [...new Set(parsed.data.pinIds)]
  const placeholders = pinIds.map(() => '?').join(', ')
  const publicPins = db.prepare(`
    SELECT i.*
    FROM items i
    JOIN collections c ON c.id = i.collection_id
    WHERE i.id IN (${placeholders}) AND c.visibility = 'public'
  `).all(...pinIds) as Array<Record<string, unknown> & { id: number; source_id: string; title: string }>
  const pinsById = new Map(publicPins.map((pin) => [pin.id, pin]))
  const unavailableIds = pinIds.filter((pinId) => !pinsById.has(pinId))

  const result = db.transaction(() => {
    const items: unknown[] = []
    const skippedDuplicateIds: number[] = []
    const existingSources = new Set(
      (db.prepare('SELECT source_id FROM items WHERE collection_id = ?').all(targetCollectionId) as Array<{ source_id: string }>).map((row) => row.source_id),
    )
    let offset = (db.prepare('SELECT COUNT(*) AS count FROM items WHERE collection_id = ?').get(targetCollectionId) as { count: number }).count

    for (const pinId of pinIds) {
      const pin = pinsById.get(pinId)
      if (!pin) continue
      if (existingSources.has(pin.source_id)) {
        skippedDuplicateIds.push(pinId)
        continue
      }
      const insert = db.prepare(`
        INSERT INTO items (collection_id, source_id, image_url, source_page, source_creator, title, note, tags, canvas_x, canvas_y, rotation)
        VALUES (?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?)
      `).run(
        targetCollectionId,
        pin.source_id,
        pin.image_url,
        pin.source_page,
        pin.source_creator,
        pin.title,
        pin.tags,
        36 + (offset % 3) * 220,
        Math.min(5000, 40 + Math.floor(offset / 3) * 250),
        (offset % 3 - 1) * 2,
      )
      const itemId = Number(insert.lastInsertRowid)
      recordRepinLineage(itemId, pin.id)
      items.push(db.prepare('SELECT * FROM items WHERE id = ?').get(itemId))
      existingSources.add(pin.source_id)
      offset += 1
    }

    if (items.length) {
      db.prepare('UPDATE collections SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(targetCollectionId)
      logActivity(targetCollectionId, `${actor(req)} saved ${items.length} ${items.length === 1 ? 'pin' : 'pins'} from Mosaic`, req.user!.id)
    }
    return { items, skippedDuplicateIds }
  })()

  return res.json({
    ...result,
    savedCount: result.items.length,
    skippedCount: result.skippedDuplicateIds.length,
    unavailableIds,
  })
})

pinsRouter.get('/:id/saved-in', requireAuth, (req: AuthedRequest, res) => {
  const pinId = Number(req.params.id)
  if (!Number.isSafeInteger(pinId) || pinId <= 0) return res.status(400).json({ error: 'Invalid pin.' })
  const pin = db.prepare(`
    SELECT i.source_id
    FROM items i
    JOIN collections c ON c.id = i.collection_id
    WHERE i.id = ? AND c.visibility = 'public'
  `).get(pinId) as { source_id: string } | undefined
  if (!pin) return res.status(404).json({ error: 'Pin not found.' })
  const collections = db.prepare(`
    SELECT DISTINCT c.id, c.name
    FROM collections c
    JOIN collection_members m ON m.collection_id = c.id AND m.user_id = ?
    JOIN items i ON i.collection_id = c.id AND i.source_id = ?
    ORDER BY c.updated_at DESC, c.id DESC
  `).all(req.user!.id, pin.source_id)
  return res.json({ collections })
})

pinsRouter.post('/:id/save', requireAuth, (req: AuthedRequest, res) => {
  const pinId = Number(req.params.id)
  if (!Number.isSafeInteger(pinId) || pinId <= 0) return res.status(400).json({ error: 'Invalid pin.' })
  const parsed = savePinSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Choose a collection.' })
  const targetCollectionId = parsed.data.collectionId
  if (!membership(targetCollectionId, req.user!.id)) return res.status(404).json({ error: 'Collection not found.' })

  const pin = db.prepare(`
    SELECT i.*
    FROM items i
    JOIN collections c ON c.id = i.collection_id
    WHERE i.id = ? AND c.visibility = 'public'
  `).get(pinId) as Record<string, unknown> | undefined
  if (!pin) return res.status(404).json({ error: 'Pin not found.' })
  if (db.prepare('SELECT 1 FROM items WHERE collection_id = ? AND source_id = ?').get(targetCollectionId, pin.source_id)) {
    return res.status(409).json({ error: 'That pin is already in this collection.' })
  }

  const offset = (db.prepare('SELECT COUNT(*) AS count FROM items WHERE collection_id = ?').get(targetCollectionId) as { count: number }).count
  const item = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO items (collection_id, source_id, image_url, source_page, source_creator, title, note, tags, canvas_x, canvas_y, rotation)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      targetCollectionId,
      pin.source_id,
      pin.image_url,
      pin.source_page,
      pin.source_creator,
      pin.title,
      parsed.data.note,
      pin.tags,
      36 + (offset % 3) * 220,
      Math.min(5000, 40 + Math.floor(offset / 3) * 250),
      (offset % 3 - 1) * 2,
    )
    recordRepinLineage(Number(result.lastInsertRowid), pinId)
    db.prepare('UPDATE collections SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(targetCollectionId)
    logActivity(targetCollectionId, `${actor(req)} saved “${String(pin.title)}” from Mosaic`, req.user!.id)
    return db.prepare('SELECT * FROM items WHERE id = ?').get(result.lastInsertRowid)
  })()
  return res.status(201).json({ item })
})

pinsRouter.post('/:id/like', requireAuth, (req: AuthedRequest, res) => {
  const pinId = Number(req.params.id)
  const pin = db.prepare(`
    SELECT i.id, i.title, i.collection_id, owner.user_id AS owner_id
    FROM items i
    JOIN collections c ON c.id = i.collection_id
    JOIN collection_members owner ON owner.collection_id = c.id AND owner.role = 'owner'
    WHERE i.id = ? AND c.visibility = 'public'
  `).get(pinId) as { id: number; title: string; collection_id: number; owner_id: number } | undefined
  if (!pin) return res.status(404).json({ error: 'Pin not found.' })
  db.transaction(() => {
    const result = db.prepare('INSERT OR IGNORE INTO item_likes (item_id, user_id) VALUES (?, ?)').run(pinId, req.user!.id)
    if (result.changes && pin.owner_id !== req.user!.id) {
      db.prepare('INSERT INTO notifications (user_id, collection_id, message) VALUES (?, ?, ?)').run(
        pin.owner_id,
        pin.collection_id,
        `${req.user!.name} liked “${pin.title}”`,
      )
    }
  })()
  return res.status(204).end()
})

pinsRouter.delete('/:id/like', requireAuth, (req: AuthedRequest, res) => {
  const pinId = Number(req.params.id)
  db.prepare('DELETE FROM item_likes WHERE item_id = ? AND user_id = ?').run(pinId, req.user!.id)
  return res.status(204).end()
})

pinsRouter.get('/:id/likes', (req, res) => {
  const pinId = Number(req.params.id)
  if (!Number.isSafeInteger(pinId) || pinId <= 0) return res.status(400).json({ error: 'Invalid pin.' })
  const visible = db.prepare(`
    SELECT i.id
    FROM items i
    JOIN collections c ON c.id = i.collection_id
    WHERE i.id = ? AND c.visibility = 'public'
  `).get(pinId)
  if (!visible) return res.status(404).json({ error: 'Pin not found.' })
  const likes = db.prepare(`
    SELECT u.id, u.username, u.name, u.avatar_url, likes.created_at
    FROM item_likes likes
    JOIN users u ON u.id = likes.user_id
    WHERE likes.item_id = ?
    ORDER BY likes.created_at DESC, u.id DESC
  `).all(pinId)
  return res.json({ likes })
})


pinsRouter.get('/:id/comments', (req: AuthedRequest, res) => {
  const pinId = Number(req.params.id)
  const visible = db.prepare(`SELECT i.id, i.collection_id FROM items i JOIN collections c ON c.id = i.collection_id WHERE i.id = ? AND c.visibility = 'public'`).get(pinId) as { id: number; collection_id: number } | undefined
  if (!visible) return res.status(404).json({ error: 'Pin not found.' })
  const canModerate = req.user ? membership(visible.collection_id, req.user.id)?.role === 'owner' : false
  const comments = db.prepare(`
    SELECT c.id, c.item_id, c.body, c.parent_id, c.created_at, u.id AS user_id, u.username AS user_username, u.name AS user_name, u.avatar_url AS user_avatar
    FROM comments c JOIN users u ON u.id = c.user_id
    WHERE c.item_id = ? ORDER BY c.id ASC
  `).all(pinId) as Array<Record<string, unknown> & { user_id: number }>
  return res.json({ comments: comments.map((comment) => ({ ...comment, can_delete: canModerate || req.user?.id === comment.user_id })) })
})

const commentSchema = z.object({
  body: z.string().trim().min(1).max(500),
  parentId: z.number().int().positive().nullable().optional(),
})

pinsRouter.post('/:id/comments', requireAuth, (req: AuthedRequest, res) => {
  const pinId = Number(req.params.id)
  const parsed = commentSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Write something before posting.' })
  const visible = db.prepare(`SELECT i.id FROM items i JOIN collections c ON c.id = i.collection_id WHERE i.id = ? AND c.visibility = 'public'`).get(pinId)
  if (!visible) return res.status(404).json({ error: 'Pin not found.' })
  const requestedParent = parsed.data.parentId
    ? db.prepare('SELECT id, user_id, parent_id FROM comments WHERE id = ? AND item_id = ?').get(parsed.data.parentId, pinId) as { id: number; user_id: number; parent_id: number | null } | undefined
    : undefined
  if (parsed.data.parentId && !requestedParent) return res.status(404).json({ error: 'Reply target not found.' })
  const parentId = requestedParent ? requestedParent.parent_id ?? requestedParent.id : null
  const owner = db.prepare(`
    SELECT c.id AS collection_id, m.user_id AS owner_id
    FROM items i JOIN collections c ON c.id = i.collection_id
    JOIN collection_members m ON m.collection_id = c.id AND m.role = 'owner'
    WHERE i.id = ?
  `).get(pinId) as { collection_id: number; owner_id: number }
  const comment = db.transaction(() => {
    const result = db.prepare('INSERT INTO comments (item_id, user_id, body, parent_id) VALUES (?, ?, ?, ?)').run(pinId, req.user!.id, parsed.data.body, parentId)
    const notifications = new Map<number, string>()
    if (owner.owner_id !== req.user!.id) {
      notifications.set(owner.owner_id, `${req.user!.name} commented on a pin`)
    }
    if (requestedParent && requestedParent.user_id !== req.user!.id) {
      notifications.set(requestedParent.user_id, `${req.user!.name} replied to your comment`)
    }
    const bodyLower = parsed.data.body.toLowerCase()
    const mentionable = db.prepare('SELECT id, name FROM users WHERE id != ? ORDER BY LENGTH(name) DESC').all(req.user!.id) as Array<{ id: number; name: string }>
    for (const user of mentionable) {
      if (bodyLower.includes(`@${user.name.toLowerCase()}`) && user.id !== requestedParent?.user_id) {
        notifications.set(user.id, `${req.user!.name} mentioned you in a comment`)
      }
    }
    for (const [userId, message] of notifications) {
      db.prepare('INSERT INTO notifications (user_id, collection_id, message) VALUES (?, ?, ?)').run(userId, owner.collection_id, message)
    }
    return db.prepare(`
      SELECT c.id, c.item_id, c.body, c.parent_id, c.created_at, u.id AS user_id, u.username AS user_username, u.name AS user_name, u.avatar_url AS user_avatar
      FROM comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?
    `).get(result.lastInsertRowid)
  })()
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
  db.transaction(() => {
    db.prepare('UPDATE comments SET parent_id = NULL WHERE parent_id = ?').run(commentId)
    db.prepare('DELETE FROM comments WHERE id = ?').run(commentId)
  })()
  return res.status(204).end()
})
