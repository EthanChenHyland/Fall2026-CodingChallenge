import { Router } from 'express'
import { z } from 'zod'
import { db } from '../db.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'

export const profilesRouter = Router()


const profileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  bio: z.string().trim().max(220).optional(),
  avatarUrl: z.string().trim().url().or(z.literal('')).optional(),
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
  const user = db.prepare('SELECT id, name, email, bio, avatar_url, created_at FROM users WHERE id = ?').get(req.user!.id)
  return res.json({ user })
})

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
        WHERE m.user_id = ? AND m.role = 'owner') AS pin_count,
      (SELECT COUNT(*) FROM follows WHERE following_id = ?) AS follower_count,
      (SELECT COUNT(*) FROM follows WHERE follower_id = ?) AS following_count
  `).get(userId, userId, userId, userId) as { collection_count: number; pin_count: number; follower_count: number; following_count: number }

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
    SELECT u.id, u.name, u.bio, u.avatar_url,
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
  const result = db.prepare('INSERT OR IGNORE INTO follows (follower_id, following_id) VALUES (?, ?)').run(req.user!.id, userId)
  if (result.changes) {
    db.prepare('INSERT INTO notifications (user_id, collection_id, message) VALUES (?, NULL, ?)').run(
      userId,
      `${req.user!.name} followed you`,
    )
  }
  return res.status(204).end()
})

profilesRouter.delete('/:id/follow', requireAuth, (req: AuthedRequest, res) => {
  const userId = Number(req.params.id)
  db.prepare('DELETE FROM follows WHERE follower_id = ? AND following_id = ?').run(req.user!.id, userId)
  return res.status(204).end()
})
