import { Router } from 'express'
import { db } from '../db.js'
import { getCollection } from '../lib/collections.js'

export const sharedRouter = Router()

sharedRouter.get('/:token', (req, res) => {
  const row = db.prepare("SELECT id FROM collections WHERE share_token = ? AND visibility = 'public'").get(req.params.token) as { id: number } | undefined
  if (!row) return res.status(404).json({ error: 'Shared collection not found.' })
  const collection = getCollection(row.id) as Record<string, unknown>
  delete collection.collaborators
  delete collection.activity
  delete collection.role
  return res.json({ collection })
})
