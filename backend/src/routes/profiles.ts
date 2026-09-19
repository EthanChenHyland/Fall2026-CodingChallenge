import { Router } from 'express'
import { z } from 'zod'
import { db } from '../db.js'
import { normalizeCollectionRow } from '../lib/collections.js'
import { imageUrlSchema } from '../lib/urls.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'

export const profilesRouter = Router()


const profileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  bio: z.string().trim().max(220).optional(),
  avatarUrl: imageUrlSchema.or(z.literal('')).optional(),
})

profilesRouter.patch('/me', requireAuth, (req: AuthedRequest, res) => {
  const parsed = profileSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid profile update.' })
  const current = db.prepare('SELECT name, bio, avatar_url FROM users WHERE id = ?').get(req.user!.id) as { name: string; bio: string; avatar_url: string }
  db.prepare('UPDATE users SET name = ?, bio = ?, avatar_url = ? WHERE id = ?').run(
    parsed.data.name ?? current.name,
    parsed.data.bio ?? current.bio,
    parsed.data.avatarUrl ?? current.avatar_url,
    req.user!.id,
  )
  const user = db.prepare('SELECT id, username, name, email, bio, avatar_url, created_at FROM users WHERE id = ?').get(req.user!.id)
  return res.json({ user })
})

function resolveProfileId(identifier: string) {
  if (/^\d+$/.test(identifier)) {
    const id = Number(identifier)
    if (Number.isSafeInteger(id) && id > 0) return id
  }
  const row = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(identifier) as { id: number } | undefined
  return row?.id
}

profilesRouter.get('/:identifier', (req: AuthedRequest, res) => {
  const userId = resolveProfileId(String(req.params.identifier))
  if (!userId) return res.status(404).json({ error: 'Profile not found.' })

  const profile = db.prepare(`
    SELECT id, username, name, bio, avatar_url, created_at
    FROM users
    WHERE id = ?
  `).get(userId) as Record<string, unknown> | undefined
  if (!profile) return res.status(404).json({ error: 'Profile not found.' })

  const canViewFollowers = req.user?.id === userId || Boolean(
    req.user && db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?').get(req.user.id, userId),
  )
  const visibleAudiences = canViewFollowers ? "('public', 'followers')" : "('public')"

  const stats = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM collection_members m JOIN collections c ON c.id = m.collection_id WHERE m.user_id = ? AND m.role = 'owner' AND c.audience IN ${visibleAudiences}) AS collection_count,
      (SELECT COUNT(*) FROM items i
        JOIN collection_members m ON m.collection_id = i.collection_id
        JOIN collections c ON c.id = i.collection_id
        WHERE m.user_id = ? AND m.role = 'owner' AND c.audience IN ${visibleAudiences}) AS pin_count,
      (SELECT COUNT(*) FROM follows WHERE following_id = ?) AS follower_count,
      (SELECT COUNT(*) FROM follows WHERE follower_id = ?) AS following_count
  `).get(userId, userId, userId, userId) as { collection_count: number; pin_count: number; follower_count: number; following_count: number }

  const collectionRows = db.prepare(`
    SELECT c.id, c.name, c.description, c.visibility, c.audience, c.share_token, c.created_at, c.updated_at,
      c.cover_focus_x, c.cover_focus_y,
      COUNT(i.id) AS item_count,
      (SELECT image_url FROM items WHERE collection_id = c.id ORDER BY id DESC LIMIT 1) AS cover_url,
      (
        SELECT json_group_array(image_url)
        FROM (
          SELECT image_url
          FROM items AS cover_items
          WHERE cover_items.collection_id = c.id
          ORDER BY CASE WHEN cover_items.id = c.cover_item_id THEN 0 ELSE 1 END, cover_items.id DESC
          LIMIT 4
        )
      ) AS cover_urls_json,
      (SELECT COUNT(*) FROM collection_follows cf WHERE cf.collection_id = c.id) AS follower_count,
      CASE WHEN EXISTS (
        SELECT 1 FROM collection_follows cf WHERE cf.collection_id = c.id AND cf.follower_id = ?
      ) THEN 1 ELSE 0 END AS followed_by_me
    FROM collections c
    JOIN collection_members m ON m.collection_id = c.id AND m.user_id = ? AND m.role = 'owner'
    LEFT JOIN items i ON i.collection_id = c.id
    WHERE c.audience IN ${visibleAudiences} AND c.share_token IS NOT NULL
    GROUP BY c.id
    ORDER BY c.updated_at DESC
  `).all(req.user?.id ?? -1, userId) as Array<Record<string, unknown>>
  const collections = collectionRows.map(normalizeCollectionRow)

  return res.json({
    profile: {
      ...profile,
      ...stats,
      is_self: req.user?.id === userId,
      followed_by_me: req.user ? Boolean(db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?').get(req.user.id, userId)) : false,
    },
    collections,
  })
})



profilesRouter.get('/:id/connections', (req: AuthedRequest, res) => {
  const userId = Number(req.params.id)
  const kind = req.query.kind === 'following' ? 'following' : 'followers'
  if (!Number.isInteger(userId)) return res.status(400).json({ error: 'Invalid profile.' })
  if (!db.prepare('SELECT id FROM users WHERE id = ?').get(userId)) return res.status(404).json({ error: 'Profile not found.' })

  const join = kind === 'following'
    ? 'JOIN users u ON u.id = f.following_id WHERE f.follower_id = ?'
    : 'JOIN users u ON u.id = f.follower_id WHERE f.following_id = ?'
  const people = db.prepare(`
    SELECT u.id, u.username, u.name, u.bio, u.avatar_url,
      CASE WHEN EXISTS (
        SELECT 1 FROM follows mine WHERE mine.follower_id = ? AND mine.following_id = u.id
      ) THEN 1 ELSE 0 END AS followed_by_me
    FROM follows f
    ${join}
    ORDER BY f.created_at DESC, u.name ASC
    LIMIT 100
  `).all(req.user?.id ?? -1, userId)

  return res.json({ kind, people })
})

profilesRouter.post('/:id/follow', requireAuth, (req: AuthedRequest, res) => {
  const userId = Number(req.params.id)
  if (!Number.isInteger(userId) || userId === req.user!.id) return res.status(400).json({ error: 'You cannot follow that profile.' })
  if (!db.prepare('SELECT id FROM users WHERE id = ?').get(userId)) return res.status(404).json({ error: 'Profile not found.' })
  db.transaction(() => {
    const result = db.prepare('INSERT OR IGNORE INTO follows (follower_id, following_id) VALUES (?, ?)').run(req.user!.id, userId)
    if (result.changes) {
      db.prepare('INSERT INTO notifications (user_id, collection_id, message) VALUES (?, NULL, ?)').run(
        userId,
        `${req.user!.name} followed you`,
      )
    }
  })()
  return res.status(204).end()
})

profilesRouter.delete('/:id/follow', requireAuth, (req: AuthedRequest, res) => {
  const userId = Number(req.params.id)
  db.prepare('DELETE FROM follows WHERE follower_id = ? AND following_id = ?').run(req.user!.id, userId)
  return res.status(204).end()
})
