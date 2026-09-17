import { Router } from 'express'
import { db } from '../db.js'
import { getCollection } from '../lib/collections.js'

export const sharedRouter = Router()

sharedRouter.get('/:token', (req, res) => {
  const row = db.prepare("SELECT id FROM collections WHERE share_token = ? AND visibility = 'public'").get(req.params.token) as { id: number } | undefined
  if (!row) return res.status(404).json({ error: 'Shared collection not found.' })
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
