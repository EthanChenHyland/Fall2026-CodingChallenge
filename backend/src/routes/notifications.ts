import { Router } from 'express'
import { db } from '../db.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'

export const notificationsRouter = Router()
notificationsRouter.use(requireAuth)

notificationsRouter.get('/', (req: AuthedRequest, res) => {
  const notifications = db.prepare(`
    SELECT n.*, c.name AS collection_name
    FROM notifications n
    LEFT JOIN collections c ON c.id = n.collection_id
    WHERE n.user_id = ?
    ORDER BY n.id DESC
    LIMIT 30
  `).all(req.user!.id)
  res.json({ notifications })
})

notificationsRouter.post('/read', (req: AuthedRequest, res) => {
  db.prepare('UPDATE notifications SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP) WHERE user_id = ?').run(req.user!.id)
  res.status(204).end()
})
