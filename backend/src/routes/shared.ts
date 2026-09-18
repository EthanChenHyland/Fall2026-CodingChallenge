import { Router } from 'express'
import { db } from '../db.js'
import { getCollection } from '../lib/collections.js'
import type { AuthedRequest } from '../middleware/auth.js'

export const sharedRouter = Router()

sharedRouter.get('/:token', (req: AuthedRequest, res) => {
  const row = db.prepare(`
    SELECT c.id, c.audience, owner.user_id AS owner_id
    FROM collections c
    JOIN collection_members owner ON owner.collection_id = c.id AND owner.role = 'owner'
    WHERE c.share_token = ? AND c.audience IN ('public', 'followers')
  `).get(req.params.token) as { id: number; audience: 'public' | 'followers'; owner_id: number } | undefined
  if (!row) return res.status(404).json({ error: 'Shared collection not found.' })
  if (row.audience === 'followers') {
    const userId = req.user?.id
    const allowed = userId && (
      userId === row.owner_id
      || db.prepare('SELECT 1 FROM collection_members WHERE collection_id = ? AND user_id = ?').get(row.id, userId)
      || db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?').get(userId, row.owner_id)
    )
    if (!allowed) return res.status(404).json({ error: 'Shared collection not found.' })
  }
  const collection = getCollection(row.id) as Record<string, unknown>
  const owner = db.prepare(`
    SELECT u.id, u.name, u.avatar_url
    FROM collection_members m
    JOIN users u ON u.id = m.user_id
    WHERE m.collection_id = ? AND m.role = 'owner'
    LIMIT 1
  `).get(row.id) as { id: number; name: string; avatar_url: string } | undefined
  delete collection.collaborators
  delete collection.activity
  delete collection.role
  return res.json({ collection: { ...collection, owner_id: owner?.id, owner_name: owner?.name, owner_avatar: owner?.avatar_url } })
})
