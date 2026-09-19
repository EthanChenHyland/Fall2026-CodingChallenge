import { Router } from 'express'
import { db } from '../db.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'

export const notificationsRouter = Router()
notificationsRouter.use(requireAuth)

notificationsRouter.get('/', (req: AuthedRequest, res) => {
  const notifications = db.prepare(`
    SELECT
      n.id,
      n.user_id,
      CASE WHEN c.id IS NOT NULL AND (
        c.visibility = 'public'
        OR EXISTS (
          SELECT 1 FROM collection_members viewer_member
          WHERE viewer_member.collection_id = c.id AND viewer_member.user_id = ?
        )
        OR (
          c.audience = 'followers'
          AND EXISTS (
            SELECT 1
            FROM collection_members owner_member
            JOIN follows viewer_follow ON viewer_follow.following_id = owner_member.user_id
            WHERE owner_member.collection_id = c.id
              AND owner_member.role = 'owner'
              AND viewer_follow.follower_id = ?
          )
        )
      ) THEN n.collection_id ELSE NULL END AS collection_id,
      n.message,
      n.read_at,
      n.created_at,
      CASE WHEN c.id IS NOT NULL AND (
        c.visibility = 'public'
        OR EXISTS (
          SELECT 1 FROM collection_members viewer_member
          WHERE viewer_member.collection_id = c.id AND viewer_member.user_id = ?
        )
        OR (
          c.audience = 'followers'
          AND EXISTS (
            SELECT 1
            FROM collection_members owner_member
            JOIN follows viewer_follow ON viewer_follow.following_id = owner_member.user_id
            WHERE owner_member.collection_id = c.id
              AND owner_member.role = 'owner'
              AND viewer_follow.follower_id = ?
          )
        )
      ) THEN c.name ELSE NULL END AS collection_name
    FROM notifications n
    LEFT JOIN collections c ON c.id = n.collection_id
    WHERE n.user_id = ?
    ORDER BY n.id DESC
    LIMIT 30
  `).all(req.user!.id, req.user!.id, req.user!.id, req.user!.id, req.user!.id)
  res.json({ notifications })
})

notificationsRouter.post('/read', (req: AuthedRequest, res) => {
  db.prepare('UPDATE notifications SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP) WHERE user_id = ?').run(req.user!.id)
  res.status(204).end()
})
