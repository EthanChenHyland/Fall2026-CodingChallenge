import { Router } from 'express'
import { z } from 'zod'
import { db } from '../db.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'

export const reportsRouter = Router()

const reportSchema = z.object({
  targetType: z.enum(['pin', 'profile', 'comment']),
  targetId: z.number().int().positive(),
  reason: z.enum(['spam', 'harassment', 'sexual', 'copyright', 'other']),
  details: z.string().trim().max(500).optional().default(''),
})

function targetExists(targetType: 'pin' | 'profile' | 'comment', targetId: number) {
  if (targetType === 'profile') return Boolean(db.prepare('SELECT 1 FROM users WHERE id = ?').get(targetId))
  if (targetType === 'pin') {
    return Boolean(db.prepare(`
      SELECT 1 FROM items i
      JOIN collections c ON c.id = i.collection_id
      WHERE i.id = ? AND c.visibility = 'public'
    `).get(targetId))
  }
  return Boolean(db.prepare(`
    SELECT 1 FROM comments cm
    JOIN items i ON i.id = cm.item_id
    JOIN collections c ON c.id = i.collection_id
    WHERE cm.id = ? AND c.visibility = 'public'
  `).get(targetId))
}

reportsRouter.post('/', requireAuth, (req: AuthedRequest, res) => {
  const parsed = reportSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Choose a report reason.' })
  const { targetType, targetId, reason, details } = parsed.data
  if (!targetExists(targetType, targetId)) return res.status(404).json({ error: 'That content is no longer available.' })
  try {
    const result = db.prepare(`
      INSERT INTO reports (reporter_id, target_type, target_id, reason, details)
      VALUES (?, ?, ?, ?, ?)
    `).run(req.user!.id, targetType, targetId, reason, details)
    return res.status(201).json({ report: { id: Number(result.lastInsertRowid) } })
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'You already reported this.' })
    }
    throw error
  }
})
