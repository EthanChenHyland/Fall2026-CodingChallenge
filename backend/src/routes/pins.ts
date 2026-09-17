import { Router } from 'express'
import { db } from '../db.js'
import { membership, type AuthedRequest } from '../middleware/auth.js'

export const pinsRouter = Router()

pinsRouter.get('/:id', (req: AuthedRequest, res) => {
  const pinId = Number(req.params.id)
  if (!Number.isInteger(pinId)) return res.status(400).json({ error: 'Invalid pin.' })
  const pin = db.prepare(`
    SELECT i.*, c.name AS collection_name, c.description AS collection_description,
      c.visibility, c.share_token,
      u.id AS owner_id, u.name AS owner_name, u.avatar_url AS owner_avatar
    FROM items i
    JOIN collections c ON c.id = i.collection_id
    JOIN collection_members m ON m.collection_id = c.id AND m.role = 'owner'
    JOIN users u ON u.id = m.user_id
    WHERE i.id = ?
  `).get(pinId) as Record<string, unknown> | undefined
  if (!pin) return res.status(404).json({ error: 'Pin not found.' })
  const canView = pin.visibility === 'public' || (req.user && membership(Number(pin.collection_id), req.user.id))
  if (!canView) return res.status(404).json({ error: 'Pin not found.' })
  return res.json({ pin })
})
